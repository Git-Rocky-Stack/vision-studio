import type { StoreApi, UseBoundStore } from 'zustand';

import type { AppState } from '@/store/appStore.types';
import { toPreviewUrl, resolveStoredAssetPath } from '@/features/assets/assetRecords';
import {
  makePollErrorBudget,
  recordPollError,
  recordPollSuccess,
} from '@/features/generation/pollErrorBudget';
import { delay } from '@/features/workflow/runWorkflowExecution';
import type { JobStatus } from '@/types/electron';

export type EditStore = UseBoundStore<StoreApi<AppState>>;

const POLL_ERROR_CAP = 5;

export const EDIT_POLL_LOST_MESSAGE =
  'Lost connection to the AI backend while processing. Please retry.';

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
}

export interface EditJobPollResult {
  ok: boolean;
  jobId: string;
  error?: string;
  result?: JobStatus['result'];
}

/**
 * Shared poll-and-land loop for Edit-page jobs (#34): budgeted status
 * polling, job bookkeeping, and the Studio-style landing (asset sync +
 * setCurrentImage) on completion. Failures surface the backend's message
 * verbatim; cancels are silent.
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
}: PollEditJobOptions): Promise<EditJobPollResult> {
  let budget = makePollErrorBudget(POLL_ERROR_CAP);
  for (;;) {
    if (signal?.aborted) {
      await electron.cancel(jobId).catch(() => undefined);
      store.getState().updateJob(jobId, { status: 'cancelled', completedAt: new Date() });
      return { ok: false, jobId };
    }

    let status: JobStatus;
    try {
      status = await electron.getStatus(jobId);
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
      return { ok: true, jobId, result: status.result };
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

    store.getState().updateJob(jobId, {
      status: status.status === 'pending' ? 'pending' : 'processing',
      progress: status.progress ?? 0,
    });
    onProgress?.(status.progress ?? 0);
    await delay(pollIntervalMs, signal).catch(() => undefined);
  }
}
