import type { StoreApi, UseBoundStore } from 'zustand';

import type { AppState, GenerationJob } from '@/store/appStore.types';
import type { JobStatus } from '@/types/electron';
import type { BatchResult } from '@/types/generation';
import { fromAccelerationResult } from '@/features/generation/accelerationRequest';
import { resolveStoredAssetPath, toPreviewUrl } from '@/features/assets/assetRecords';
import { previewUrlForAssetPath, replacementAssetPath } from './jobOutput';
import { watchJob, type JobWatchOutcome, type WatchJobOptions } from './watchJob';
import type { JobProgressSubscribe } from './progressBus';

/**
 * Store-level job watcher (#J1/#J2).
 *
 * Generate, Quick Generate and Batch used to poll inside the panel, and the
 * unmount cleanup cleared the timer: leave the panel and the job's assets were
 * never synced, no completion notice fired, and the job sat in activeJobs as
 * 'processing' for the rest of the session. This module owns every job those
 * panels submit, for its whole life, independent of any mounted UI. Panels
 * only submit (track) and read job state back from the store.
 *
 * Completion side effects run exactly once per job: the outcome is claimed
 * before any side effect starts, every effect is isolated (a throwing settings
 * read or notification cannot skip the asset sync, or run it twice), and a
 * job id that is already tracked is never tracked again.
 */

export type JobOrigin = 'generate' | 'quick' | 'batch';

export interface BatchJobContext {
  batchId: string;
  promptIndex: number;
  /** Generation settings recorded on the batch result. */
  settings: {
    width: number;
    height: number;
    steps: number;
    cfgScale: number;
    model: string;
    seed?: number;
  };
}

export interface TrackJobSpec {
  jobId: string;
  kind: 'image' | 'video';
  origin: JobOrigin;
  prompt: string;
  /** Resolved output root at submit time; asset paths are stored under it. */
  outputRoot: string;
  /** Request params for the asset record when the job is not in activeJobs (batch). */
  params?: Record<string, unknown>;
  batch?: BatchJobContext;
}

export interface JobWatcherElectronApi {
  generation: {
    getStatus: (jobId: string) => Promise<JobStatus>;
    cancel: (jobId: string) => Promise<{ success: boolean; error?: string }>;
  };
  notifications: {
    notify: (
      type: 'generation_complete' | 'generation_failed' | 'model_download',
      payload: { title: string; body: string },
    ) => Promise<{ success: boolean; skipped?: boolean }>;
  };
}

export type AppStoreApi = UseBoundStore<StoreApi<AppState>>;

export interface JobWatcherDeps {
  store: AppStoreApi;
  electron: () => JobWatcherElectronApi | null | undefined;
  progressEvents?: JobProgressSubscribe | null;
  /** Watch tuning (tests shorten the intervals). */
  watchOptions?: Pick<
    WatchJobOptions,
    'pollIntervalMs' | 'maxPollIntervalMs' | 'retryIntervalMs' | 'errorCap' | 'stallTimeoutMs'
  >;
}

export const JOB_LOST_MESSAGE =
  'Lost connection to the AI backend while waiting for this job. Check the backend and retry.';
export const JOB_STALLED_MESSAGE =
  'The job stopped reporting progress and was given up on. Check the backend and retry.';

/** Settled job ids remembered to reject a duplicate settle. */
const SETTLED_HISTORY_CAP = 500;

/** Batch status polling is spread wider than a single interactive job's. */
const BATCH_WATCH_OPTIONS = { pollIntervalMs: 2000, maxPollIntervalMs: 10000 } as const;

interface TrackedJob {
  spec: TrackJobSpec;
  controller: AbortController;
  done: Promise<JobWatchOutcome>;
}

function kindLabel(kind: TrackJobSpec['kind']) {
  return kind === 'video' ? 'Video' : 'Image';
}

function toBackendPreviewUrl(assetPath: string) {
  if (!assetPath) return '';
  if (/^https?:\/\//.test(assetPath)) return assetPath;
  return toPreviewUrl(assetPath, { type: 'image' });
}

/** Runs one side effect; a failure is logged and never stops the next one. */
async function isolate(label: string, effect: () => unknown | Promise<unknown>) {
  try {
    await effect();
  } catch (error) {
    console.error(`[jobs] ${label} failed`, error);
  }
}

export function createJobWatcher({ store, electron, progressEvents, watchOptions }: JobWatcherDeps) {
  const tracked = new Map<string, TrackedJob>();
  /** Outcomes already applied; guards against any second settle of a job. */
  const settled = new Set<string>();
  const notifiedBatches = new Set<string>();
  /** Batches the user cancelled: their remaining outcomes notify nobody. */
  const silencedBatches = new Set<string>();
  /** Bumped by reset(); a watch from an earlier epoch never applies its outcome. */
  let epoch = 0;

  const markSettled = (jobId: string) => {
    settled.add(jobId);
    // Bounded: a long session settles thousands of jobs, and only recent ids
    // can still receive a late duplicate settle.
    if (settled.size > SETTLED_HISTORY_CAP) {
      const oldest = settled.values().next().value;
      if (oldest !== undefined) settled.delete(oldest);
    }
  };

  const bridge = () => {
    const api = electron();
    if (!api?.generation?.getStatus) throw new Error('The desktop bridge is unavailable.');
    return api;
  };

  const notify = (type: 'generation_complete' | 'generation_failed', title: string, body: string) =>
    isolate('notification', async () => {
      await electron()?.notifications?.notify(type, { title, body });
    });

  const findJob = (jobId: string): GenerationJob | undefined =>
    store.getState().activeJobs.find((job) => job.id === jobId);

  const applyLiveUpdate = (spec: TrackJobSpec, update: { status: 'pending' | 'processing'; progress: number; step?: number }) => {
    const state = store.getState();
    state.updateJob(spec.jobId, {
      status: update.status,
      progress: update.progress,
      ...(update.step !== undefined ? { step: update.step } : {}),
    });
    if (spec.origin !== 'batch') {
      state.updateGenerationQueueItem(spec.jobId, { status: 'processing' });
    }
  };

  const settleBatchJob = async (spec: TrackJobSpec, outcome: 'completed' | 'failed') => {
    if (!spec.batch) return;
    const { batchId } = spec.batch;
    store.getState().recordBatchJobOutcome(batchId, spec.jobId, outcome);
    const batch = store.getState().batchJobs.find((entry) => entry.id === batchId);
    if (!batch || batch.status === 'running' || notifiedBatches.has(batchId)) return;
    notifiedBatches.add(batchId);
    if (silencedBatches.has(batchId)) return;
    const total = batch.jobIds.length;
    const done = batch.completedJobs.length;
    if (done > 0) {
      await notify(
        'generation_complete',
        'Batch Complete',
        `${done} of ${total} image${total === 1 ? '' : 's'} generated.`,
      );
    } else {
      await notify('generation_failed', 'Batch Failed', `None of the ${total} prompts produced an image.`);
    }
  };

  const onCompleted = async (spec: TrackJobSpec, status: JobStatus) => {
    const existing = findJob(spec.jobId);
    const assetParams = {
      ...(spec.params ?? {}),
      ...(existing?.params ?? {}),
      output_root:
        typeof existing?.params?.output_root === 'string' ? existing.params.output_root : spec.outputRoot,
    };
    const outputPath = status.result?.images?.[0] ?? status.result?.video ?? '';
    // A job whose raw output was superseded (suppressAssetSync, honoured by
    // syncAssetsFromJobStatus) shows its replacement everywhere it surfaces.
    const replacement = replacementAssetPath(assetParams);

    await isolate('job record', () =>
      store.getState().updateJob(spec.jobId, {
        status: 'completed',
        progress: typeof status.progress === 'number' ? status.progress : 100,
        result: status.result,
        error: status.error,
        completedAt: status.completed_at ? new Date(status.completed_at) : new Date(),
      }),
    );
    await isolate('asset sync', () =>
      store.getState().syncAssetsFromJobStatus({ ...status, params: assetParams }),
    );

    if (spec.origin !== 'batch') {
      await isolate('acceleration report', () =>
        store.getState().setLastAppliedAcceleration(fromAccelerationResult(status.result?.acceleration)),
      );
    }
    if (spec.origin === 'generate') {
      await isolate('guided notices', () => {
        const notices = (status.result?.guided as { notices?: unknown } | undefined)?.notices;
        store
          .getState()
          .setLastGuidedNotices(Array.isArray(notices) ? notices.filter((n): n is string => typeof n === 'string') : []);
      });
    }

    if (spec.origin !== 'batch') {
      await isolate('generation queue', () => {
        const state = store.getState();
        const imagePath = status.result?.images?.[0];
        if (spec.kind === 'image' && replacement) {
          state.updateGenerationQueueItem(spec.jobId, {
            status: 'completed',
            thumbnail: previewUrlForAssetPath(replacement, state.assetLibrary),
            assetPath: replacement,
          });
        } else if (spec.kind === 'image' && imagePath) {
          const asset = state.assetLibrary.find((entry) => entry.id === `${spec.jobId}::${imagePath}`);
          state.updateGenerationQueueItem(spec.jobId, {
            status: 'completed',
            thumbnail: asset?.previewUrl ?? toBackendPreviewUrl(imagePath),
            // The library path, so a tile loaded onto the canvas is editable.
            assetPath: asset?.path ?? resolveStoredAssetPath(imagePath, assetParams),
          });
        } else {
          state.removeFromGenerationQueue(spec.jobId);
        }
      });
    }

    if (spec.batch) {
      const batch = spec.batch;
      const imagePath = replacement ?? status.result?.images?.[0] ?? '';
      const seed = typeof status.result?.seed === 'number' ? status.result.seed : batch.settings.seed;
      await isolate('batch result', () => {
        const result: BatchResult = {
          id: spec.jobId,
          batchId: batch.batchId,
          promptIndex: batch.promptIndex,
          prompt: spec.prompt,
          imagePath: replacement
            ? previewUrlForAssetPath(replacement, store.getState().assetLibrary)
            : toBackendPreviewUrl(imagePath),
          assetPath: replacement ?? resolveStoredAssetPath(imagePath, { output_root: spec.outputRoot }),
          seed: seed ?? 0,
          generationTime: status.completed_at && status.created_at
            ? Math.max(0, new Date(status.completed_at).getTime() - new Date(status.created_at).getTime())
            : 0,
          params: {
            width: batch.settings.width,
            height: batch.settings.height,
            steps: batch.settings.steps,
            cfgScale: batch.settings.cfgScale,
            model: batch.settings.model,
            negativePrompt: '',
            resolution: `${batch.settings.width} x ${batch.settings.height}`,
          },
          createdAt: status.created_at ? new Date(status.created_at) : new Date(),
          isFavorite: false,
        };
        store.getState().addBatchResult(result);
      });
      await isolate('batch queue', () =>
        store.getState().updateBatchQueuePromptByJob(spec.jobId, {
          status: 'completed',
          result: imagePath || undefined,
          ...(seed !== undefined ? { seed } : {}),
        }),
      );
      await settleBatchJob(spec, 'completed');
      return;
    }

    await notify(
      'generation_complete',
      `${kindLabel(spec.kind)} Ready`,
      spec.prompt.trim().slice(0, 120) || outputPath || 'Generation completed successfully.',
    );
  };

  const onFailed = async (
    spec: TrackJobSpec,
    {
      status,
      error,
      jobStatus,
      notifyUser,
    }: {
      status: 'failed' | 'cancelled';
      error?: string;
      jobStatus?: JobStatus | null;
      notifyUser: boolean;
    },
  ) => {
    await isolate('job record', () =>
      store.getState().updateJob(spec.jobId, {
        status,
        progress: typeof jobStatus?.progress === 'number' ? jobStatus.progress : (findJob(spec.jobId)?.progress ?? 0),
        error,
        completedAt: jobStatus?.completed_at ? new Date(jobStatus.completed_at) : new Date(),
      }),
    );
    if (spec.origin !== 'batch') {
      await isolate('generation queue', () => store.getState().removeFromGenerationQueue(spec.jobId));
    }
    if (spec.batch) {
      await isolate('batch queue', () =>
        store.getState().updateBatchQueuePromptByJob(spec.jobId, { status: 'failed' }),
      );
      if (status === 'failed' && error) {
        await isolate('batch notice', () => store.getState().setBatchNotice({ tone: 'error', message: error }));
      }
      await settleBatchJob(spec, 'failed');
      return;
    }
    if (notifyUser) {
      await notify('generation_failed', `${kindLabel(spec.kind)} Failed`, error || 'Generation failed.');
    }
  };

  const settle = async (spec: TrackJobSpec, outcome: JobWatchOutcome) => {
    if (settled.has(spec.jobId)) return;
    markSettled(spec.jobId);
    switch (outcome.kind) {
      case 'completed':
        await onCompleted(spec, outcome.status);
        return;
      case 'failed':
        await onFailed(spec, {
          status: 'failed',
          error: outcome.status.error || 'Generation failed',
          jobStatus: outcome.status,
          notifyUser: true,
        });
        return;
      case 'cancelled':
        await onFailed(spec, { status: 'cancelled', jobStatus: outcome.status, notifyUser: false });
        return;
      case 'aborted':
        // A user cancel through cancelJob; the backend cancel was already sent.
        await onFailed(spec, { status: 'cancelled', notifyUser: false });
        return;
      case 'lost':
        await onFailed(spec, { status: 'failed', error: JOB_LOST_MESSAGE, notifyUser: true });
        return;
      case 'stalled':
        await onFailed(spec, {
          status: 'failed',
          error: JOB_STALLED_MESSAGE,
          jobStatus: outcome.lastStatus,
          notifyUser: true,
        });
        return;
    }
  };

  /**
   * Starts watching a submitted job. Idempotent: a job id already tracked (or
   * already settled) is ignored. Resolves when the job's outcome has been
   * applied to the store.
   */
  const track = (spec: TrackJobSpec): Promise<JobWatchOutcome> => {
    const existing = tracked.get(spec.jobId);
    if (existing) return existing.done;
    if (settled.has(spec.jobId)) return Promise.resolve({ kind: 'aborted' });

    if (spec.origin !== 'batch' && spec.kind === 'image') {
      store.getState().addToGenerationQueue({
        id: spec.jobId,
        prompt: spec.prompt,
        params: { ...(spec.params ?? {}), origin: spec.origin },
        status: 'pending',
        createdAt: new Date(),
      });
    }

    const controller = new AbortController();
    const trackedEpoch = epoch;
    const done = (async (): Promise<JobWatchOutcome> => {
      let outcome: JobWatchOutcome;
      try {
        const api = bridge();
        outcome = await watchJob({
          jobId: spec.jobId,
          getStatus: (jobId) => api.generation.getStatus(jobId),
          ...(progressEvents !== undefined ? { progressEvents } : {}),
          signal: controller.signal,
          ...(spec.origin === 'batch' ? BATCH_WATCH_OPTIONS : {}),
          ...(watchOptions ?? {}),
          onUpdate: (update) => applyLiveUpdate(spec, update),
        });
      } catch (error) {
        outcome = { kind: 'lost', error };
      }
      if (trackedEpoch !== epoch) return outcome;
      try {
        await settle(spec, outcome);
      } finally {
        tracked.delete(spec.jobId);
      }
      return outcome;
    })();

    tracked.set(spec.jobId, { spec, controller, done });
    return done;
  };

  /**
   * User cancel: stops the watch, asks the backend to stop the job, and
   * records it as cancelled. Resolves with the backend's answer.
   */
  const cancel = async (jobId: string): Promise<{ success: boolean; error?: string }> => {
    const entry = tracked.get(jobId);
    // A user-cancelled batch ends without a "Batch Complete" notification.
    if (entry?.spec.batch) silencedBatches.add(entry.spec.batch.batchId);
    entry?.controller.abort();
    let result: { success: boolean; error?: string };
    try {
      result = (await electron()?.generation.cancel(jobId)) ?? { success: false, error: 'The desktop bridge is unavailable.' };
    } catch (error) {
      result = { success: false, error: error instanceof Error ? error.message : 'Cancel failed' };
    }
    if (entry) await entry.done;
    return result;
  };

  return {
    track,
    cancel,
    isTracking: (jobId: string) => tracked.has(jobId),
    /** Job ids currently being watched. */
    trackedJobIds: () => Array.from(tracked.keys()),
    /** Stops every watch without applying its outcome (teardown). */
    stopAll: () => {
      for (const entry of tracked.values()) {
        markSettled(entry.spec.jobId);
        entry.controller.abort();
      }
    },
    /** Test seam: stops every watch and forgets all history. */
    reset: () => {
      epoch += 1;
      for (const entry of tracked.values()) entry.controller.abort();
      tracked.clear();
      settled.clear();
      notifiedBatches.clear();
      silencedBatches.clear();
    },
  };
}

export type JobWatcher = ReturnType<typeof createJobWatcher>;
