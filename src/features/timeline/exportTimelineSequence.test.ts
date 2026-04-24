import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAppStore } from '@/store/appStore';

import { buildTimelineExportRequest, exportTimelineSequence } from './exportTimelineSequence';

describe('exportTimelineSequence', () => {
  beforeEach(() => {
    useAppStore.setState(useAppStore.getInitialState(), true);
    useAppStore.setState((state) => ({
      systemInfo: {
        ...state.systemInfo,
        backendConnected: true,
      },
    }));
  });

  it('builds an export request from the active play range', () => {
    const { sequence } = seedTimelineForExport({
      fps: 10,
      dimensions: { width: 1280, height: 720 },
      playRange: { startMs: 1000, endMs: 2000 },
      clipStartMs: 500,
      clipDurationMs: 2500,
      includeAudio: true,
    });

    const request = buildTimelineExportRequest({
      state: useAppStore.getState(),
      sequenceId: sequence.id,
      outputPath: 'D:/Exports/launch-cut.mp4',
    });

    expect(request.sequence_name).toBe(sequence.name);
    expect(request.width).toBe(1280);
    expect(request.height).toBe(720);
    expect(request.fps).toBe(10);
    expect(request.output_path).toBe('D:/Exports/launch-cut.mp4');
    expect(request.frames).toHaveLength(10);
    expect(request.frames[0]).toEqual({
      time_ms: 1000,
      layers: [
        {
          source_path: 'C:/vision-studio-output/source/frame.png',
          media_type: 'image',
          source_time_ms: 0,
          opacity: 1,
        },
      ],
    });
    expect(request.audio_layers).toEqual([
      {
        source_path: 'C:/vision-studio-output/source/bed.wav',
        source_time_ms: 500,
        timeline_offset_ms: 0,
        duration_ms: 1000,
        clip_offset_ms: 500,
        clip_duration_ms: 2500,
        gain: 0.8,
        fade_in_ms: 300,
        fade_out_ms: 400,
      },
    ]);
  });

  it('returns cancelled when the save dialog is dismissed', async () => {
    const { sequence } = seedTimelineForExport({
      sequenceName: 'Launch / Cut 01',
    });
    const electron = makeElectronExportMock({
      savePath: null,
    });

    const result = await exportTimelineSequence({
      sequenceId: sequence.id,
      electron,
      store: useAppStore,
      pollIntervalMs: 0,
    });

    expect(result).toEqual({
      cancelled: true,
      jobId: null,
      outputPath: null,
    });
    expect(electron.dialog.saveFile).toHaveBeenCalledWith(
      expect.objectContaining({
        defaultPath: 'D:/Downloads/Launch - Cut 01.mp4',
      }),
    );
    expect(electron.generation.exportTimelineSequence).not.toHaveBeenCalled();
  });

  it('rejects unsupported resolver states before submitting export', async () => {
    const { sequence } = seedTimelineForExport({
      transitionIn: { type: 'wipe-left', durationMs: 400 },
    });
    const electron = makeElectronExportMock();

    await expect(
      exportTimelineSequence({
        sequenceId: sequence.id,
        outputPath: 'D:/Exports/unsupported.mp4',
        electron,
        store: useAppStore,
        pollIntervalMs: 0,
      }),
    ).rejects.toThrow('not supported');

    expect(electron.generation.exportTimelineSequence).not.toHaveBeenCalled();
  });

  it('polls backend export progress without changing managed review state', async () => {
    const { sequence } = seedTimelineForExport();
    const initialMediaAssets = structuredClone(useAppStore.getState().mediaAssets);
    const initialViewerItemId = useAppStore.getState().activeViewerItemId;
    const statusPatches: Array<Record<string, unknown>> = [];
    const electron = makeElectronExportMock({
      submit: { success: true, jobId: 'timeline-export-job-1' },
      statuses: [
        {
          job_id: 'timeline-export-job-1',
          status: 'processing',
          type: 'video',
          created_at: '2026-04-23T22:00:00.000Z',
          progress: 55,
        },
        {
          job_id: 'timeline-export-job-1',
          status: 'completed',
          type: 'video',
          created_at: '2026-04-23T22:00:00.000Z',
          completed_at: '2026-04-23T22:00:06.000Z',
          progress: 100,
          result: {
            video: 'D:/Exports/render.mp4',
            output_path: 'D:/Exports/render.mp4',
          },
        },
      ],
    });

    const result = await exportTimelineSequence({
      sequenceId: sequence.id,
      outputPath: 'D:/Exports/render.mp4',
      electron,
      store: useAppStore,
      pollIntervalMs: 0,
      onStatusChange: (patch) => statusPatches.push(patch),
    });

    expect(result).toEqual({
      cancelled: false,
      jobId: 'timeline-export-job-1',
      outputPath: 'D:/Exports/render.mp4',
    });
    expect(electron.generation.exportTimelineSequence).toHaveBeenCalledWith(
      expect.objectContaining({
        sequence_name: sequence.name,
        output_path: 'D:/Exports/render.mp4',
      }),
    );
    expect(statusPatches).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ status: 'exporting', progress: 0 }),
        expect.objectContaining({ status: 'exporting', progress: 55 }),
        expect.objectContaining({ status: 'success', outputPath: 'D:/Exports/render.mp4' }),
      ]),
    );
    expect(useAppStore.getState().mediaAssets).toEqual(initialMediaAssets);
    expect(useAppStore.getState().activeViewerItemId).toBe(initialViewerItemId);
  });
});

function seedTimelineForExport(options?: {
  sequenceName?: string;
  fps?: number;
  dimensions?: { width: number; height: number };
  playRange?: { startMs: number; endMs: number };
  clipStartMs?: number;
  clipDurationMs?: number;
  includeAudio?: boolean;
  transitionIn?: { type: 'cut' | 'fade' | 'dissolve' | 'wipe-left' | 'wipe-right' | 'zoom'; durationMs: number } | null;
}) {
  const state = useAppStore.getState();
  const project = state.createProject('Timeline Export Project', options?.dimensions ?? { width: 1920, height: 1080 });
  state.setActiveProject(project.id);
  const sequence = state.ensureTimelineSequenceForProject(project.id, {
    name: options?.sequenceName ?? 'Launch Sequence',
    fps: options?.fps ?? 24,
  })!;
  const track = useAppStore.getState().timelineTracks.find((item) => item.sequenceId === sequence.id)!;

  state.upsertMediaAsset({
    id: 'media-export-image',
    legacyAssetId: null,
    jobId: null,
    name: 'Source Frame',
    type: 'image',
    source: 'imported',
    path: 'C:/vision-studio-output/source/frame.png',
    previewUrl: 'file:///C:/vision-studio-output/source/frame.png',
    thumbnailUrl: 'file:///C:/vision-studio-output/source/frame.png',
    posterUrl: null,
    width: options?.dimensions?.width ?? 1920,
    height: options?.dimensions?.height ?? 1080,
    metadata: {},
    createdAt: '2026-04-23T12:00:00.000Z',
  });

  const clip = state.createTimelineClip({
    trackId: track.id,
    mediaAssetId: 'media-export-image',
    startMs: options?.clipStartMs ?? 0,
    durationMs: options?.clipDurationMs ?? 2000,
    label: 'Opening Frame',
    transitionIn: options?.transitionIn ?? null,
  })!;

  if (options?.includeAudio) {
    const audioTrack = state.createTimelineTrack(sequence.id, { kind: 'audio', name: 'Audio Bed' })!;
    state.upsertMediaAsset({
      id: 'media-export-audio',
      legacyAssetId: null,
      jobId: null,
      name: 'Audio Bed',
      type: 'audio',
      source: 'imported',
      path: 'C:/vision-studio-output/source/bed.wav',
      previewUrl: 'file:///C:/vision-studio-output/source/bed.wav',
      thumbnailUrl: 'data:image/svg+xml;base64,audio',
      posterUrl: null,
      durationMs: 5000,
      metadata: {},
      createdAt: '2026-04-23T12:00:10.000Z',
    });
    state.createTimelineClip({
      trackId: audioTrack.id,
      mediaAssetId: 'media-export-audio',
      startMs: options?.clipStartMs ?? 0,
      durationMs: options?.clipDurationMs ?? 2000,
      sourceInMs: 0,
      sourceOutMs: options?.clipDurationMs ?? 2000,
      gain: 0.8,
      fadeInMs: 300,
      fadeOutMs: 400,
      label: 'Audio Bed',
    });
  }

  if (options?.playRange) {
    state.setTimelineSequencePlayRange(sequence.id, options.playRange);
  }

  return {
    project,
    sequence,
    track,
    clip,
  };
}

function makeElectronExportMock(options?: {
  savePath?: string | null;
  submit?: { success: boolean; jobId?: string; error?: string };
  statuses?: Array<Record<string, unknown>>;
  defaultOutputPath?: string;
}) {
  const statuses = [...(options?.statuses ?? [])];

  return {
    app: {
      getPath: vi.fn().mockResolvedValue('D:/Downloads'),
    },
    dialog: {
      saveFile: vi
        .fn()
        .mockResolvedValue(options && 'savePath' in options ? options.savePath : 'D:/Exports/timeline-export.mp4'),
    },
    settings: {
      get: vi.fn().mockResolvedValue({
        defaultOutputPath: options?.defaultOutputPath ?? '',
      }),
    },
    generation: {
      exportTimelineSequence: vi
        .fn()
        .mockResolvedValue(options?.submit ?? { success: true, jobId: 'timeline-export-job' }),
      getStatus: vi.fn().mockImplementation(async () => statuses.shift()),
    },
  };
}
