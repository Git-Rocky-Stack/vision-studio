import type { StoreApi, UseBoundStore } from 'zustand';

import { useAppStore } from '@/store/appStore';
import type { AppState } from '@/store/appStore.types';
import { toPreviewUrl, resolveStoredAssetPath } from '@/features/assets/assetRecords';
import { toAccelerationRequestPayload } from '@/features/generation/accelerationRequest';
import {
  makePollErrorBudget,
  recordPollError,
  recordPollSuccess,
} from '@/features/generation/pollErrorBudget';
import { delay, resolveOutputRoot } from '@/features/workflow/runWorkflowExecution';
import type { JobStatus } from '@/types/electron';
import type { ImageGenerationRequestPayload } from '@/types/generation';
import { computeDimensions } from '@/types/resolution';

type StudioStore = UseBoundStore<StoreApi<AppState>>;

const POLL_INTERVAL_MS = 500;
const POLL_RETRY_MS = 2000;
const POLL_ERROR_CAP = 5;

export const EMPTY_PROMPT_MESSAGE = 'Enter a prompt in Prompt Studio before generating.';
export const BACKEND_DOWN_MESSAGE =
  'The AI backend is not running. Please restart the app or start the backend from Settings.';
export const POLL_LOST_MESSAGE =
  'Lost connection to the AI backend while polling for job status. Please retry.';
const CANCELLED_MESSAGE = 'Studio generation was cancelled.';

interface StudioGenerationElectronApi {
  app: { getPath: (name: 'userData') => Promise<string> };
  settings: { get: () => Promise<{ defaultOutputPath: string }> };
  generation: {
    generateImage: (
      params: ImageGenerationRequestPayload,
    ) => Promise<{ success: boolean; jobId?: string; error?: string }>;
    getStatus: (jobId: string) => Promise<JobStatus>;
    cancel: (jobId: string) => Promise<{ success: boolean; error?: string }>;
  };
  notifications: {
    notify: (
      type: 'generation_complete' | 'generation_failed',
      payload: { title: string; body: string },
    ) => Promise<{ success: boolean; skipped?: boolean }>;
  };
}

interface RunStudioGenerationOptions {
  electron?: StudioGenerationElectronApi;
  store?: StudioStore;
  pollIntervalMs?: number;
  pollRetryMs?: number;
  signal?: AbortSignal;
}

export interface StudioGenerationResult {
  ok: boolean;
  jobId?: string;
  error?: string;
}

/**
 * Studio Generate (#33): submits the GeneratePanel config - the pending
 * generationDraft when one exists (the exact object GeneratePanel would
 * consume on next mount), otherwise the store generation settings - as a
 * real local image job, and drives the progressive-preview lifecycle:
 * beginPreview on submit, poll-driven counter, handoff of the finished image
 * to the composition canvas, previewError on failure, silent clear on cancel.
 */
export async function runStudioGeneration({
  electron = window.electron,
  store = useAppStore,
  pollIntervalMs = POLL_INTERVAL_MS,
  pollRetryMs = POLL_RETRY_MS,
  signal,
}: RunStudioGenerationOptions = {}): Promise<StudioGenerationResult> {
  const state = store.getState();

  // Re-entrancy: the Generate button is a no-op while a run is tracked.
  if (state.isPreviewActive) {
    return { ok: false };
  }

  const draft = state.generationDraft;
  const dimensions = draft
    ? { width: draft.width, height: draft.height }
    : computeDimensions(state.aspectRatio, state.resolutionTier, state.customWidth, state.customHeight);
  const prompt = (draft?.prompt ?? '').trim();
  const negativePrompt = (draft?.negativePrompt ?? '').trim();
  const model = draft?.model?.trim() || state.selectedImageModelId;
  const steps = draft?.steps ?? state.advancedGeneration.steps;
  const cfgScale = draft?.cfgScale ?? state.advancedGeneration.cfgScale;
  const scheduler = draft?.scheduler ?? state.advancedGeneration.scheduler;
  const seed = draft?.seed ?? state.advancedGeneration.seed;

  if (!prompt) {
    state.setPreviewError(EMPTY_PROMPT_MESSAGE);
    return { ok: false, error: EMPTY_PROMPT_MESSAGE };
  }
  if (!state.systemInfo.backendConnected) {
    state.setPreviewError(BACKEND_DOWN_MESSAGE);
    return { ok: false, error: BACKEND_DOWN_MESSAGE };
  }

  const request: ImageGenerationRequestPayload = {
    prompt,
    negative_prompt: negativePrompt,
    width: dimensions.width,
    height: dimensions.height,
    steps,
    cfg_scale: cfgScale,
    seed: seed === -1 ? undefined : seed,
    model,
    scheduler,
    acceleration_settings: toAccelerationRequestPayload(state.accelerationSettings),
  };

  let jobId: string;
  let outputRoot: string;
  try {
    const appSettings = await electron.settings.get();
    const userDataPath = await electron.app.getPath('userData');
    outputRoot = resolveOutputRoot(appSettings.defaultOutputPath, userDataPath);

    const submitResult = await electron.generation.generateImage(request);
    if (!submitResult.success || !submitResult.jobId) {
      throw new Error(submitResult.error || 'Generation failed');
    }
    jobId = submitResult.jobId;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Generation failed';
    state.setPreviewError(message);
    return { ok: false, error: message };
  }

  state.beginPreview(jobId, steps);
  state.addJob({
    id: jobId,
    type: 'image',
    status: 'pending',
    progress: 0,
    params: { ...request, seed, output_root: outputRoot, source: 'studio' },
    createdAt: new Date(),
  });

  return pollStudioJob({
    electron,
    store,
    jobId,
    steps,
    prompt,
    outputRoot,
    pollIntervalMs,
    pollRetryMs,
    signal,
  });
}

async function pollStudioJob({
  electron,
  store,
  jobId,
  steps,
  prompt,
  outputRoot,
  pollIntervalMs,
  pollRetryMs,
  signal,
}: {
  electron: StudioGenerationElectronApi;
  store: StudioStore;
  jobId: string;
  steps: number;
  prompt: string;
  outputRoot: string;
  pollIntervalMs: number;
  pollRetryMs: number;
  signal?: AbortSignal;
}): Promise<StudioGenerationResult> {
  let budget = makePollErrorBudget(POLL_ERROR_CAP);

  // Stale-run guard: preview-slice writes stay scoped to the run the canvas
  // is tracking; job-slice bookkeeping always lands.
  const previewTracksThisRun = () => store.getState().previewJobId === jobId;

  for (;;) {
    if (signal?.aborted) {
      await electron.generation.cancel(jobId).catch(() => undefined);
      store.getState().updateJob(jobId, {
        status: 'failed',
        error: CANCELLED_MESSAGE,
        completedAt: new Date(),
      });
      if (previewTracksThisRun()) {
        store.getState().clearPreview();
      }
      return { ok: false, jobId, error: CANCELLED_MESSAGE };
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
          error: POLL_LOST_MESSAGE,
          completedAt: new Date(),
        });
        if (previewTracksThisRun()) {
          store.getState().clearPreview();
        }
        store.getState().setPreviewError(POLL_LOST_MESSAGE);
        return { ok: false, jobId, error: POLL_LOST_MESSAGE };
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
        error: status.error,
        completedAt: status.completed_at ? new Date(status.completed_at) : new Date(),
      });
      store.getState().syncAssetsFromJobStatus({
        ...status,
        params: { ...(existingJob?.params ?? {}), output_root: outputRoot },
      });

      // Handoff BEFORE teardown so the canvas swaps from the last step frame
      // straight to the finished image.
      const outputPath = status.result?.images?.[0];
      if (outputPath && previewTracksThisRun()) {
        const asset = store
          .getState()
          .assetLibrary.find((entry) => entry.id === `${jobId}::${outputPath}`);
        store.getState().setCurrentImage(
          asset?.previewUrl ?? toPreviewUrl(outputPath),
          asset?.path ?? resolveStoredAssetPath(outputPath, { output_root: outputRoot }),
        );
      }
      if (previewTracksThisRun()) {
        store.getState().clearPreview();
      }

      await electron.notifications
        .notify('generation_complete', {
          title: 'Image Ready',
          body: prompt.slice(0, 120) || 'Generation completed successfully.',
        })
        .catch(() => undefined);
      return { ok: true, jobId };
    }

    if (status.status === 'failed' || status.status === 'cancelled') {
      store.getState().updateJob(jobId, {
        status: status.status,
        progress: status.progress ?? 0,
        error: status.error,
        completedAt: status.completed_at ? new Date(status.completed_at) : new Date(),
      });
      if (previewTracksThisRun()) {
        store.getState().clearPreview();
      }
      if (status.status === 'failed') {
        const message = status.error || 'Generation failed';
        store.getState().setPreviewError(message);
        await electron.notifications
          .notify('generation_failed', { title: 'Image Failed', body: message })
          .catch(() => undefined);
        return { ok: false, jobId, error: message };
      }
      return { ok: false, jobId };
    }

    store.getState().updateJob(jobId, {
      status: status.status === 'pending' ? 'pending' : 'processing',
      progress: status.progress ?? 0,
    });
    if (previewTracksThisRun() && typeof status.progress === 'number' && steps > 0) {
      store.getState().setPreviewStep(
        Math.min(steps, Math.round((status.progress / 100) * steps)),
      );
    }

    await delay(pollIntervalMs, signal).catch(() => undefined);
  }
}
