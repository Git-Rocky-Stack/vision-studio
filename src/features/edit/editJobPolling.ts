import type { StoreApi, UseBoundStore } from 'zustand';

import type { AppState } from '@/store/appStore.types';
import { toPreviewUrl, resolveStoredAssetPath } from '@/features/assets/assetRecords';
import { watchJob } from '@/features/jobs/watchJob';
import type { JobStatus } from '@/types/electron';

export type EditStore = UseBoundStore<StoreApi<AppState>>;

const POLL_ERROR_CAP = 5;

export const EDIT_POLL_LOST_MESSAGE =
  'Lost connection to the AI backend while processing. Please retry.';
export const EDIT_POLL_STALLED_MESSAGE =
  'The edit job stopped reporting progress and was given up on. Please retry.';

export interface EditJobPollApi {
  getStatus: (jobId: string) => Promise<JobStatus>;
  cancel: (jobId: string) => Promise<{ success: boolean; error?: string }>;
}

export interface PollEditJobOptions {
  electron: EditJobPollApi;
  store: EditStore;
  jobId: string;
  outputRoot: string;
  fallbackErrorMessage: string;
  pollIntervalMs: number;
  pollRetryMs: number;
  signal?: AbortSignal;
  onProgress?: (progress: number) => void;
  /**
   * Land the finished output (register it in the library and make it the
   * current image). Default true. A caller that post-processes the frame
   * before it becomes the result (Blend Edges) passes false and lands either
   * its own result or, on failure, the raw output via landEditJobOutput.
   */
  landAssets?: boolean;
}

export interface EditJobPollResult {
  ok: boolean;
  jobId: string;
  error?: string;
  result?: JobStatus['result'];
  /** The terminal backend status of a completed job (for a deferred landing). */
  status?: JobStatus;
}

/**
 * The Studio-style landing of a finished edit job: registers its output in
 * the asset library and makes the first image the current canvas image.
 * Returns the landed image's preview URL and library path (null when the job
 * produced no image).
 */
export function landEditJobOutput(
  store: EditStore,
  status: JobStatus,
  outputRoot: string,
): { previewUrl: string; assetPath: string } | null {
  const state = store.getState();
  const job =
    state.activeJobs.find((entry) => entry.id === status.job_id) ??
    state.completedJobs.find((entry) => entry.id === status.job_id);
  state.syncAssetsFromJobStatus({
    ...status,
    params: { ...(job?.params ?? {}), output_root: outputRoot },
  });
  const outputPath = status.result?.images?.[0];
  if (!outputPath) return null;
  const asset = store
    .getState()
    .assetLibrary.find((entry) => entry.id === `${status.job_id}::${outputPath}`);
  const landed = {
    previewUrl: asset?.previewUrl ?? toPreviewUrl(outputPath),
    assetPath: asset?.path ?? resolveStoredAssetPath(outputPath, { output_root: outputRoot }),
  };
  store.getState().setCurrentImage(landed.previewUrl, landed.assetPath);
  return landed;
}

/**
 * Shared poll-and-land loop for Edit-page jobs (#34): budgeted status
 * polling, job bookkeeping, and (unless `landAssets` is false) the
 * Studio-style landing (asset sync + setCurrentImage) on completion. Failures
 * surface the backend's message verbatim; cancels are silent.
 */
export async function pollEditJob({
  electron,
  store,
  jobId,
  outputRoot,
  fallbackErrorMessage,
  pollIntervalMs,
  pollRetryMs,
  signal,
  onProgress,
  landAssets = true,
}: PollEditJobOptions): Promise<EditJobPollResult> {
  // The shared job watch (#J1): push first, polling as the fallback, the
  // status error budget, and a stall guard rather than a wall-clock limit.
  const watch = await watchJob({
    jobId,
    getStatus: (id) => electron.getStatus(id),
    signal,
    pollIntervalMs,
    maxPollIntervalMs: pollIntervalMs,
    retryIntervalMs: pollRetryMs,
    errorCap: POLL_ERROR_CAP,
    onUpdate: (update) => {
      store.getState().updateJob(jobId, { status: update.status, progress: update.progress });
      onProgress?.(update.progress);
    },
  });

  if (watch.kind === 'aborted') {
    await electron.cancel(jobId).catch(() => undefined);
    store.getState().updateJob(jobId, { status: 'cancelled', completedAt: new Date() });
    return { ok: false, jobId };
  }

  if (watch.kind === 'lost' || watch.kind === 'stalled') {
    const message = watch.kind === 'lost' ? EDIT_POLL_LOST_MESSAGE : EDIT_POLL_STALLED_MESSAGE;
    store.getState().updateJob(jobId, {
      status: 'failed',
      error: message,
      completedAt: new Date(),
    });
    return { ok: false, jobId, error: message };
  }

  const status: JobStatus = watch.status;
  if (status.status === 'completed') {
    store.getState().updateJob(jobId, {
      status: 'completed',
      progress: status.progress ?? 100,
      result: status.result,
      completedAt: status.completed_at ? new Date(status.completed_at) : new Date(),
    });
    if (landAssets) landEditJobOutput(store, status, outputRoot);
    return { ok: true, jobId, result: status.result, status };
  }

  if (status.status === 'failed' || status.status === 'cancelled') {
    store.getState().updateJob(jobId, {
      status: status.status,
      progress: status.progress ?? 0,
      error: status.error,
      completedAt: status.completed_at ? new Date(status.completed_at) : new Date(),
    });
    if (status.status === 'failed') {
      return { ok: false, jobId, error: status.error || fallbackErrorMessage };
    }
    return { ok: false, jobId };
  }

  // The watch only resolves on a terminal status; every branch returned above.
  return { ok: false, jobId };
}
