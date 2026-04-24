import type { StoreApi, UseBoundStore } from 'zustand';

import { useAppStore } from '@/store/appStore';
import type { AppState } from '@/store/appStore.types';
import type { JobStatus, TimelineExportParams } from '@/types/electron';
import type { TimelineCompositionIssue, TimelineCompositionIssueCode, TimelineSequence } from '@/types/timeline';
import { delay } from '@/features/workflow/runWorkflowExecution';

import { resolveSequenceComposition, resolveTimelinePlayRange } from './sequenceComposition';

type TimelineStore = UseBoundStore<StoreApi<AppState>>;

const BLOCKING_EXPORT_ISSUES = new Set<TimelineCompositionIssueCode>([
  'missing-media-asset',
  'unsupported-track-kind',
  'unsupported-transition',
  'transition-target-missing',
]);

interface TimelineExportElectronApi {
  app: {
    getPath: (name: 'downloads') => Promise<string>;
  };
  dialog: {
    saveFile: (options: { defaultPath?: string; filters?: Array<{ name: string; extensions: string[] }> }) => Promise<string | null>;
  };
  settings: {
    get: () => Promise<{
      defaultOutputPath: string;
    }>;
  };
  generation: {
    exportTimelineSequence: (params: TimelineExportParams) => Promise<{ success: boolean; jobId?: string; error?: string }>;
    getStatus: (jobId: string) => Promise<JobStatus | { success?: boolean; error?: string }>;
  };
}

interface BuildTimelineExportRequestOptions {
  state: AppState;
  sequenceId?: string;
  outputPath: string;
}

interface ExportTimelineSequenceOptions {
  sequenceId?: string;
  outputPath?: string;
  store?: TimelineStore;
  electron?: TimelineExportElectronApi;
  pollIntervalMs?: number;
  onStatusChange?: (patch: TimelineExportStatusPatch) => void;
}

export interface TimelineExportStatusPatch {
  isExporting?: boolean;
  status?: 'idle' | 'exporting' | 'success' | 'error';
  progress?: number;
  activeJobId?: string | null;
  errorMessage?: string | null;
  outputPath?: string | null;
}

export interface TimelineExportSequenceResult {
  cancelled: boolean;
  jobId: string | null;
  outputPath: string | null;
}

interface TimelineExportContext {
  project: AppState['projects'][number];
  sequence: TimelineSequence;
}

export function buildTimelineExportRequest({
  state,
  sequenceId,
  outputPath,
}: BuildTimelineExportRequestOptions): TimelineExportParams {
  const { project, sequence } = resolveTimelineExportContext(state, sequenceId);
  const sequenceTracks = state.timelineTracks
    .filter((track) => track.sequenceId === sequence.id)
    .sort((left, right) => left.orderIndex - right.orderIndex);
  const trackIds = new Set(sequenceTracks.map((track) => track.id));
  const sequenceClips = state.timelineClips.filter((clip) => trackIds.has(clip.trackId));
  const playRange = resolveTimelinePlayRange(sequence);
  const fps = Math.max(1, Math.round(sequence.fps || project.fps || 24));
  const frameDurationMs = 1000 / fps;
  const frameCount = Math.max(1, Math.ceil(Math.max(playRange.durationMs, 1) / frameDurationMs));

  const frames = Array.from({ length: frameCount }, (_, frameIndex) => {
    const timeMs = playRange.startMs + frameIndex * frameDurationMs;
    const composition = resolveSequenceComposition({
      sequence,
      tracks: sequenceTracks,
      clips: sequenceClips,
      mediaAssets: state.mediaAssets,
      timeMs,
    });
    const blockingIssue = composition.issues.find((issue) => BLOCKING_EXPORT_ISSUES.has(issue.code));
    if (blockingIssue) {
      throw new Error(formatBlockingIssueMessage(blockingIssue, composition.resolvedTimeMs, fps));
    }

    return {
      time_ms: Math.round(composition.resolvedTimeMs),
      layers: composition.layers.map((layer) => ({
        source_path: layer.sourcePath,
        media_type: layer.mediaType,
        source_time_ms: Math.max(0, Math.round(layer.sourceTimeMs)),
        opacity: layer.opacity,
      })),
    };
  });

  return {
    sequence_name: sequence.name,
    width: project.dimensions?.width ?? 1920,
    height: project.dimensions?.height ?? 1080,
    fps,
    output_path: ensureMp4Extension(normalizePath(outputPath)),
    frames,
  };
}

export async function exportTimelineSequence({
  sequenceId,
  outputPath,
  store = useAppStore,
  electron = window.electron,
  pollIntervalMs = 500,
  onStatusChange,
}: ExportTimelineSequenceOptions): Promise<TimelineExportSequenceResult> {
  const initialState = store.getState();
  if (!initialState.systemInfo.backendConnected) {
    throw new Error('The AI backend is not running.');
  }

  const { sequence } = resolveTimelineExportContext(initialState, sequenceId);
  const destinationPath = await resolveTimelineExportDestinationPath({
    electron,
    sequenceName: sequence.name,
    outputPath,
  });

  if (!destinationPath) {
    return {
      cancelled: true,
      jobId: null,
      outputPath: null,
    };
  }

  onStatusChange?.({
    isExporting: true,
    status: 'exporting',
    progress: 0,
    activeJobId: null,
    errorMessage: null,
    outputPath: null,
  });

  try {
    const request = buildTimelineExportRequest({
      state: store.getState(),
      sequenceId: sequence.id,
      outputPath: destinationPath,
    });

    const submitResult = await electron.generation.exportTimelineSequence(request);
    if (!submitResult.success || !submitResult.jobId) {
      throw new Error(submitResult.error || 'Timeline export failed to start.');
    }

    const jobId = submitResult.jobId;
    onStatusChange?.({
      isExporting: true,
      status: 'exporting',
      progress: 0,
      activeJobId: jobId,
      errorMessage: null,
      outputPath: null,
    });

    let finalStatus: JobStatus | null = null;
    for (let attempt = 0; attempt < 2400; attempt += 1) {
      const nextStatus = await electron.generation.getStatus(jobId);
      if (!nextStatus || ('success' in nextStatus && nextStatus.success === false)) {
        throw new Error(nextStatus?.error || 'Timeline export returned no job status.');
      }

      if (
        nextStatus.status === 'completed' ||
        nextStatus.status === 'failed' ||
        nextStatus.status === 'cancelled'
      ) {
        finalStatus = nextStatus;
        break;
      }

      onStatusChange?.({
        isExporting: true,
        status: 'exporting',
        progress: nextStatus.progress ?? 0,
        activeJobId: jobId,
        errorMessage: null,
        outputPath: null,
      });

      if (pollIntervalMs > 0) {
        await delay(pollIntervalMs);
      }
    }

    if (!finalStatus) {
      throw new Error('Timeline export timed out while waiting for the export job.');
    }

    if (finalStatus.status === 'completed') {
      const resolvedOutputPath = normalizePath(
        (typeof finalStatus.result?.output_path === 'string' && finalStatus.result.output_path) || destinationPath,
      );

      onStatusChange?.({
        isExporting: false,
        status: 'success',
        progress: finalStatus.progress ?? 100,
        activeJobId: null,
        errorMessage: null,
        outputPath: resolvedOutputPath,
      });

      return {
        cancelled: false,
        jobId,
        outputPath: resolvedOutputPath,
      };
    }

    if (finalStatus.status === 'cancelled') {
      const message = 'Timeline export was cancelled.';
      onStatusChange?.({
        isExporting: false,
        status: 'error',
        progress: finalStatus.progress ?? 0,
        activeJobId: null,
        errorMessage: message,
        outputPath: null,
      });

      return {
        cancelled: true,
        jobId,
        outputPath: null,
      };
    }

    throw new Error(finalStatus.error || 'Timeline export failed.');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Timeline export failed.';
    onStatusChange?.({
      isExporting: false,
      status: 'error',
      activeJobId: null,
      errorMessage: message,
      outputPath: null,
    });
    throw error instanceof Error ? error : new Error(message);
  }
}

function resolveTimelineExportContext(state: AppState, requestedSequenceId?: string): TimelineExportContext {
  const activeProject = state.projects.find((project) => project.id === state.activeProjectId) ?? null;
  const sequence =
    (requestedSequenceId
      ? state.timelineSequences.find((item) => item.id === requestedSequenceId) ?? null
      : null) ??
    state.timelineSequences.find((item) => item.id === state.activeTimelineSequenceId) ??
    state.timelineSequences.find((item) => item.id === activeProject?.timelineSequenceId) ??
    null;

  if (!sequence) {
    throw new Error('Select a timeline sequence before exporting.');
  }

  const project = state.projects.find((item) => item.id === sequence.projectId) ?? activeProject;
  if (!project) {
    throw new Error('The active timeline sequence is not attached to a project.');
  }

  return { project, sequence };
}

async function resolveTimelineExportDestinationPath({
  electron,
  sequenceName,
  outputPath,
}: {
  electron: TimelineExportElectronApi;
  sequenceName: string;
  outputPath?: string;
}) {
  if (outputPath) {
    return ensureMp4Extension(normalizePath(outputPath));
  }

  const settings = await electron.settings.get();
  const downloadsPath = await electron.app.getPath('downloads');
  const baseDirectory = normalizePath((settings.defaultOutputPath || downloadsPath).trim());
  const defaultPath = joinPath(baseDirectory, `${sanitizeFilename(sequenceName)}.mp4`);
  const selectedPath = await electron.dialog.saveFile({
    defaultPath,
    filters: [{ name: 'MP4 Video', extensions: ['mp4'] }],
  });

  return selectedPath ? ensureMp4Extension(normalizePath(selectedPath)) : null;
}

function formatBlockingIssueMessage(
  issue: TimelineCompositionIssue,
  timeMs: number,
  fps: number,
) {
  return `${issue.message} (${formatTimecode(timeMs, fps)})`;
}

function formatTimecode(timeMs: number, fps: number) {
  const totalSeconds = Math.max(0, timeMs / 1000);
  const hrs = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = Math.floor(totalSeconds % 60);
  const frames = Math.floor((totalSeconds % 1) * fps);

  return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs
    .toString()
    .padStart(2, '0')}:${frames.toString().padStart(2, '0')}`;
}

function ensureMp4Extension(path: string) {
  return /\.mp4$/i.test(path) ? path : `${path}.mp4`;
}

function joinPath(directory: string, fileName: string) {
  return `${directory.replace(/[\\/]+$/, '')}/${fileName}`;
}

function normalizePath(path: string) {
  return path.replace(/\\/g, '/');
}

function sanitizeFilename(name: string) {
  const sanitized = Array.from(name)
    .map((character) => {
      const code = character.charCodeAt(0);
      if (code >= 0 && code <= 31) {
        return '-';
      }

      return /[<>:"/\\|?*]/.test(character) ? '-' : character;
    })
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/g, '');

  return sanitized || 'timeline-export';
}
