import type { StoreApi, UseBoundStore } from 'zustand';

import { useAppStore } from '@/store/appStore';
import type { AppState } from '@/store/appStore.types';
import { toPreviewUrl, resolveStoredAssetPath } from '@/features/assets/assetRecords';
import {
  makePollErrorBudget,
  recordPollError,
  recordPollSuccess,
} from '@/features/generation/pollErrorBudget';
import { delay, resolveOutputRoot } from '@/features/workflow/runWorkflowExecution';
import type { JobStatus } from '@/types/electron';

type EditStore = UseBoundStore<StoreApi<AppState>>;

export type EditOperation = 'remove-background' | 'upscale' | 'restore-faces';

export interface EditToolParams {
  source_path: string;
  edge_refinement?: number;
  scale?: 2 | 4;
  model?: 'general' | 'anime';
  face_enhance?: boolean;
  strength?: number;
}

const POLL_INTERVAL_MS = 500;
const POLL_RETRY_MS = 2000;
const POLL_ERROR_CAP = 5;

export const EDIT_BACKEND_DOWN_MESSAGE =
  'The AI backend is not running. Please restart the app or start the backend from Settings.';
export const EDIT_POLL_LOST_MESSAGE =
  'Lost connection to the AI backend while processing. Please retry.';
export const NO_FACES_NOTICE = 'No faces detected - the image is unchanged.';

interface EditToolElectronApi {
  app: { getPath: (name: 'userData') => Promise<string> };
  settings: { get: () => Promise<{ defaultOutputPath: string }> };
  generation: {
    editImage: (
      params: { operation: EditOperation } & EditToolParams,
    ) => Promise<{ success: boolean; jobId?: string; error?: string }>;
    getStatus: (jobId: string) => Promise<JobStatus>;
    cancel: (jobId: string) => Promise<{ success: boolean; error?: string }>;
  };
}

export interface RunEditToolOptions {
  electron?: EditToolElectronApi;
  store?: EditStore;
  pollIntervalMs?: number;
  pollRetryMs?: number;
  signal?: AbortSignal;
  onProgress?: (progress: number) => void;
}

export interface EditToolResult {
  ok: boolean;
  jobId?: string;
  error?: string;
  notice?: string;
}

/**
 * Real edit-tool run (#34): submits one /api/v1/edit job through the preload
 * bridge, polls it like a generation job, and lands the finished frame on
 * the Edit canvas (asset sync + setCurrentImage - the Studio handoff).
 * Failures surface the backend's honest message verbatim, including the
 * "install '<record>' from the Foundry first." pointers; cancels are silent.
 */
export async function runEditTool(
  operation: EditOperation,
  params: EditToolParams,
  {
    electron = window.electron as unknown as EditToolElectronApi,
    store = useAppStore,
    pollIntervalMs = POLL_INTERVAL_MS,
    pollRetryMs = POLL_RETRY_MS,
    signal,
    onProgress,
  }: RunEditToolOptions = {},
): Promise<EditToolResult> {
  const state = store.getState();
  if (!state.systemInfo.backendConnected) {
    return { ok: false, error: EDIT_BACKEND_DOWN_MESSAGE };
  }

  let jobId: string;
  let outputRoot: string;
  try {
    const appSettings = await electron.settings.get();
    const userDataPath = await electron.app.getPath('userData');
    outputRoot = resolveOutputRoot(appSettings.defaultOutputPath, userDataPath);

    const submitted = await electron.generation.editImage({ operation, ...params });
    if (!submitted.success || !submitted.jobId) {
      throw new Error(submitted.error || 'Edit operation failed');
    }
    jobId = submitted.jobId;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Edit operation failed';
    return { ok: false, error: message };
  }

  store.getState().addJob({
    id: jobId,
    type: 'edit',
    status: 'pending',
    progress: 0,
    params: { operation, ...params, output_root: outputRoot, source: 'edit-tool' },
    createdAt: new Date(),
  });

  let budget = makePollErrorBudget(POLL_ERROR_CAP);
  for (;;) {
    if (signal?.aborted) {
      await electron.generation.cancel(jobId).catch(() => undefined);
      store.getState().updateJob(jobId, { status: 'cancelled', completedAt: new Date() });
      return { ok: false, jobId };
    }

    let status: JobStatus;
    try {
      status = await electron.generation.getStatus(jobId);
      if (typeof status?.status !== 'string') {
        throw new Error('Job status unavailable');
      }
      budget = recordPollSuccess(budget);
    } catch {
      const outcome = recordPollError(budget);
      budget = outcome.budget;
      if (outcome.exhausted) {
        store.getState().updateJob(jobId, {
          status: 'failed',
          error: EDIT_POLL_LOST_MESSAGE,
          completedAt: new Date(),
        });
        return { ok: false, jobId, error: EDIT_POLL_LOST_MESSAGE };
      }
      await delay(pollRetryMs, signal).catch(() => undefined);
      continue;
    }

    if (status.status === 'completed') {
      const existingJob = store.getState().activeJobs.find((job) => job.id === jobId);
      store.getState().updateJob(jobId, {
        status: 'completed',
        progress: status.progress ?? 100,
        result: status.result,
        completedAt: status.completed_at ? new Date(status.completed_at) : new Date(),
      });
      store.getState().syncAssetsFromJobStatus({
        ...status,
        params: { ...(existingJob?.params ?? {}), output_root: outputRoot },
      });
      const outputPath = status.result?.images?.[0];
      if (outputPath) {
        const asset = store
          .getState()
          .assetLibrary.find((entry) => entry.id === `${jobId}::${outputPath}`);
        store.getState().setCurrentImage(
          asset?.previewUrl ?? toPreviewUrl(outputPath),
          asset?.path ?? resolveStoredAssetPath(outputPath, { output_root: outputRoot }),
        );
      }
      const facesDetected = status.result?.faces_detected;
      const notice =
        operation === 'restore-faces' && facesDetected === 0 ? NO_FACES_NOTICE : undefined;
      return { ok: true, jobId, notice };
    }

    if (status.status === 'failed' || status.status === 'cancelled') {
      store.getState().updateJob(jobId, {
        status: status.status,
        progress: status.progress ?? 0,
        error: status.error,
        completedAt: status.completed_at ? new Date(status.completed_at) : new Date(),
      });
      if (status.status === 'failed') {
        return { ok: false, jobId, error: status.error || 'Edit operation failed' };
      }
      return { ok: false, jobId };
    }

    store.getState().updateJob(jobId, {
      status: status.status === 'pending' ? 'pending' : 'processing',
      progress: status.progress ?? 0,
    });
    onProgress?.(status.progress ?? 0);
    await delay(pollIntervalMs, signal).catch(() => undefined);
  }
}
