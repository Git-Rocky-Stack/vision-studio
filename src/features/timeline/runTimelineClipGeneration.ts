import type { StoreApi, UseBoundStore } from 'zustand';

import { useAppStore } from '@/store/appStore';
import type { AppState } from '@/store/appStore.types';
import type { AssetRecord, AssetJobStatus } from '@/types/assets';
import type { JobStatus, UserAccountsSnapshot } from '@/types/electron';
import type { MediaAsset, ReferenceSet } from '@/types/media';
import type { ImageGenerationRequestPayload, PromptHistoryEntry } from '@/types/generation';
import type { ClipGenerationBinding, TimelineClip, TimelineSequence, TimelineTrack } from '@/types/timeline';
import { computeDimensions } from '@/types/resolution';
import { SVD_REFERENCE_ERROR } from '@/features/generate/validation';
import { resolveCanvasControlLayers } from '@/features/generation/resolveCanvasControlLayers';
import {
  getActiveUserAccount,
  isHostedStillImageRoute,
  isHostedVideoRoute,
  resolveStillImageRoute,
  resolveVideoRoute,
} from '@/features/accounts/providerRouting';
import {
  delay,
  getOutputAssetId,
  resolveOutputRoot,
} from '@/features/workflow/runWorkflowExecution';
import { resolveStoredAssetPath, toPreviewUrl } from '@/features/assets/assetRecords';

type TimelineStore = UseBoundStore<StoreApi<AppState>>;

/**
 * Poll budgets: max wall time before the runner gives up waiting on the
 * job. Multiplied against pollIntervalMs (default 500ms) inside the poll
 * loop, so the local-backend budget is ~60s and the hosted budget is
 * ~120s. Hosted routes (OpenRouter, HuggingFace) get the longer ceiling
 * because off-device image generation has higher tail latency than the
 * local CUDA path.
 */
const MAX_POLL_ATTEMPTS_LOCAL_BACKEND = 120;
const MAX_POLL_ATTEMPTS_HOSTED = 240;

type GenerationType = 'image' | 'video';
type TimelineGenerationOperation = 'generate' | 'regenerate' | 'variant' | 'extend' | 'retake';

interface TimelineGenerationElectronApi {
  app: {
    getPath: (name: 'userData') => Promise<string>;
  };
  settings: {
    get: () => Promise<{
      defaultOutputPath: string;
    }>;
  };
  accounts: {
    list: () => Promise<UserAccountsSnapshot>;
  };
  generation: {
    generateImage: (params: ImageGenerationRequestPayload) => Promise<{ success: boolean; jobId?: string; error?: string }>;
    generateVideo: (params: {
      prompt: string;
      image_path?: string;
      width: number;
      height: number;
      duration: number;
      fps: number;
      steps?: number;
      model?: string;
      seed?: number;
    }) => Promise<{ success: boolean; jobId?: string; error?: string }>;
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

interface TimelineGenerationInput {
  prompt?: string;
  negativePrompt?: string;
  generationType?: GenerationType;
  model?: string;
  width?: number;
  height?: number;
  steps?: number;
  cfgScale?: number;
  scheduler?: string;
  seed?: number;
  duration?: number;
  fps?: number;
  sourceMediaAssetId?: string | null;
  referenceSetIds?: string[];
}

interface TimelineGenerationStatusPatch {
  isGenerating?: boolean;
  progress?: number;
  step?: number;
  status?: 'idle' | 'generating' | 'success' | 'error';
  errorMessage?: string;
  activeJobId?: string | null;
}

interface RunTimelineClipGenerationOptions {
  operation?: TimelineGenerationOperation;
  clipId?: string;
  sequenceId?: string;
  retakeRangeId?: string;
  input?: TimelineGenerationInput;
  store?: TimelineStore;
  electron?: TimelineGenerationElectronApi;
  pollIntervalMs?: number;
  onStatusChange?: (patch: TimelineGenerationStatusPatch) => void;
  /**
   * Optional AbortSignal. Pre-aborted signals bail before any HTTP submission
   * and return cancelled. Mid-poll aborts mark job/binding cancelled and
   * return cancelled within one polling cycle of the abort.
   */
  signal?: AbortSignal;
}

interface ResolvedTimelineGenerationInput {
  prompt: string;
  negativePrompt: string;
  generationType: GenerationType;
  model: string;
  width: number;
  height: number;
  steps: number;
  cfgScale: number;
  scheduler: string;
  seed: number;
  duration: number;
  fps: number;
  sourceMediaAssetId: string | null;
  referenceSetIds: string[];
}

interface TimelineGenerationRunResult {
  cancelled: boolean;
  clipId: string | null;
  outputAssetId: string | null;
  bindingId: string | null;
  retakeTakeId: string | null;
}

export async function runTimelineClipGeneration({
  operation = 'generate',
  clipId,
  sequenceId,
  retakeRangeId,
  input,
  store = useAppStore,
  electron = window.electron,
  pollIntervalMs = 500,
  onStatusChange,
  signal,
}: RunTimelineClipGenerationOptions): Promise<TimelineGenerationRunResult> {
  // Pre-aborted signal: bail before any HTTP work or state mutation.
  if (signal?.aborted) {
    return {
      cancelled: true,
      clipId: clipId ?? null,
      outputAssetId: null,
      bindingId: null,
      retakeTakeId: null,
    };
  }

  const state = store.getState();
  const targetClip = resolveTargetClip(state, clipId);
  const targetTrack = targetClip
    ? state.timelineTracks.find((track) => track.id === targetClip.trackId) ?? null
    : null;
  const targetSequence = resolveTargetSequence(state, sequenceId, targetTrack);

  if (!targetSequence) {
    throw new Error('Select a timeline sequence before generating into the editor.');
  }
  const accountSnapshot = await electron.accounts.list().catch(() => null);
  const activeAccount = getActiveUserAccount(accountSnapshot);
  const stillImageRoute = resolveStillImageRoute(activeAccount);
  const videoRoute = resolveVideoRoute(activeAccount);

  const existingBinding = targetClip?.generationBindingId
    ? state.clipGenerationBindings.find((binding) => binding.id === targetClip.generationBindingId) ?? null
    : null;

  if (
    (operation === 'regenerate' || operation === 'variant' || operation === 'extend' || operation === 'retake') &&
    !targetClip
  ) {
    throw new Error('Select a timeline clip before using clip generation actions.');
  }

  if (
    (operation === 'regenerate' || operation === 'variant' || operation === 'extend' || operation === 'retake') &&
    !existingBinding
  ) {
    throw new Error('This clip is not AI-bound yet. Create a generated variant from Generate first.');
  }

  const targetClipMediaAsset = targetClip
    ? state.mediaAssets.find((asset) => asset.id === targetClip.mediaAssetId) ?? null
    : null;
  const targetRetakeRangeId =
    operation === 'retake'
      ? retakeRangeId ?? state.activeTimelineRetakeRangeId
      : null;
  const targetRetakeRange =
    operation === 'retake' && targetClip && targetRetakeRangeId
      ? targetClip.retakeRanges.find((range) => range.id === targetRetakeRangeId) ?? null
      : null;

  if (operation === 'retake' && targetClipMediaAsset?.type !== 'video') {
    throw new Error('Retake generation is only available for video clips.');
  }

  if (operation === 'retake' && !targetRetakeRange) {
    throw new Error('Select a retake range before generating a candidate take.');
  }

  const resolved = resolveGenerationInput({
    state,
    sequence: targetSequence,
    clip: targetClip,
    binding: existingBinding,
    input,
  });
  const effectiveResolved: ResolvedTimelineGenerationInput =
    operation === 'retake' && targetRetakeRange
      ? {
          ...resolved,
          generationType: 'video',
          duration: Math.max(0.12, (targetRetakeRange.endMs - targetRetakeRange.startMs) / 1000),
        }
      : resolved;
  // Re-resolve the request model against the active route. The runner is the
  // authoritative routing point for the timeline: hosted still-image AND hosted
  // video both override the incoming (local) model so a local checkpoint id like
  // 'svd' is never submitted to a hosted provider.
  const providerResolved = ((): ResolvedTimelineGenerationInput => {
    if (
      effectiveResolved.generationType === 'image' &&
      isHostedStillImageRoute(stillImageRoute) &&
      stillImageRoute.model
    ) {
      return { ...effectiveResolved, model: stillImageRoute.model };
    }
    if (
      effectiveResolved.generationType === 'video' &&
      isHostedVideoRoute(videoRoute) &&
      videoRoute.model
    ) {
      return { ...effectiveResolved, model: videoRoute.model };
    }
    return effectiveResolved;
  })();
  // Which route owns this generation type, and is it hosted (off-device)?
  const activeRoute = providerResolved.generationType === 'image' ? stillImageRoute : videoRoute;
  const hostedRoute =
    providerResolved.generationType === 'image'
      ? isHostedStillImageRoute(stillImageRoute)
      : isHostedVideoRoute(videoRoute);
  const targetProject = state.projects.find((item) => item.id === targetSequence.projectId) ?? null;
  const targetScene = targetClip?.sceneId
    ? targetProject?.scenes.find((item) => item.id === targetClip.sceneId) ?? null
    : state.activeSceneId
      ? targetProject?.scenes.find((item) => item.id === state.activeSceneId) ?? null
      : null;

  // A hosted route (still-image OR video) runs off-device, so a stopped local
  // backend must not block it; only local routes need the backend.
  if (!state.systemInfo.backendConnected && !hostedRoute) {
    throw new Error('The AI backend is not running.');
  }

  // A misconfigured hosted route surfaces its own config error (missing token /
  // model) rather than a misleading backend-offline error.
  if (hostedRoute && activeRoute.error) {
    throw new Error(activeRoute.error);
  }

  if (!providerResolved.prompt.trim()) {
    throw new Error('Enter a prompt before generating into the timeline.');
  }

  if (operation === 'extend' && providerResolved.generationType !== 'video') {
    throw new Error('Extend Shot is only available for motion clips.');
  }

  const sourceImagePath =
    providerResolved.generationType === 'video'
      ? resolveVideoSourcePath({
          state,
          clip: targetClip,
          binding: existingBinding,
          sourceMediaAssetId: providerResolved.sourceMediaAssetId,
          referenceSetIds: providerResolved.referenceSetIds,
        })
      : null;

  if (providerResolved.generationType === 'video' && providerResolved.model === 'svd' && !sourceImagePath) {
    throw new Error(SVD_REFERENCE_ERROR);
  }

  const canvasControlLayers =
    providerResolved.generationType === 'image'
      ? resolveCanvasControlLayers({
          scene: targetScene,
          mediaAssets: state.mediaAssets,
          referenceSets: state.referenceSets,
          generationType: 'image',
          baseImagePath: resolveImageGenerationBasePath(state, targetClip, existingBinding),
        })
      : null;

  if (canvasControlLayers?.errors.length) {
    throw new Error(canvasControlLayers.errors[0]);
  }

  const nextBindingBase =
    operation === 'regenerate' && targetClip && existingBinding
      ? {
          ...existingBinding,
          prompt: providerResolved.prompt,
          negativePrompt: providerResolved.negativePrompt,
          model: providerResolved.model,
          generationType: providerResolved.generationType,
          settings: buildBindingSettings(providerResolved, operation, targetClip.id),
          referenceSetIds: providerResolved.referenceSetIds,
          lastRunSummary: {
            status: 'queued' as const,
            outputMediaAssetId: existingBinding.lastRunSummary?.outputMediaAssetId ?? null,
            completedAt: null,
            errorMessage: null,
          },
        }
      : null;

  if (nextBindingBase) {
    state.upsertClipGenerationBinding(nextBindingBase);
  }

  const promptHistoryEntry: PromptHistoryEntry = {
    id: crypto.randomUUID(),
    prompt: providerResolved.prompt,
    negativePrompt: providerResolved.negativePrompt,
    timestamp: new Date(),
    model: providerResolved.model,
  };
  state.addToPromptHistory(promptHistoryEntry);

  const appSettings = await electron.settings.get();
  const userDataPath = await electron.app.getPath('userData');
  const outputRoot = resolveOutputRoot(appSettings.defaultOutputPath, userDataPath);

  const submitPayload =
    providerResolved.generationType === 'video'
      ? {
          prompt: providerResolved.prompt,
          image_path: sourceImagePath ?? undefined,
          width: providerResolved.width,
          height: providerResolved.height,
          duration: providerResolved.duration,
          fps: providerResolved.fps,
          steps: providerResolved.steps,
          model: providerResolved.model,
          seed: providerResolved.seed === -1 ? undefined : providerResolved.seed,
        }
      : {
          prompt: providerResolved.prompt,
          negative_prompt: providerResolved.negativePrompt,
          width: providerResolved.width,
          height: providerResolved.height,
          steps: providerResolved.steps,
          cfg_scale: providerResolved.cfgScale,
          seed: providerResolved.seed === -1 ? undefined : providerResolved.seed,
          model: providerResolved.model,
          scheduler: providerResolved.scheduler,
          ...(canvasControlLayers?.controlnet.length
            ? { controlnet: canvasControlLayers.controlnet }
            : {}),
          ...(canvasControlLayers?.referenceImages.length
            ? { reference_images: canvasControlLayers.referenceImages }
            : {}),
          ...(canvasControlLayers?.inpaint
            ? {
                image_path: canvasControlLayers.inpaint.image_path,
                mask: canvasControlLayers.inpaint.mask,
                inpaint: canvasControlLayers.inpaint,
              }
            : {}),
        };

  // submitPayload is built from the same generationType branch above, so the
  // runtime shape always matches the chosen call; assert it to the IPC param type.
  const submitResult =
    providerResolved.generationType === 'video'
      ? await electron.generation.generateVideo(
          submitPayload as Parameters<typeof electron.generation.generateVideo>[0],
        )
      : await electron.generation.generateImage(
          submitPayload as Parameters<typeof electron.generation.generateImage>[0],
        );

  if (!submitResult.success || !submitResult.jobId) {
    const message = submitResult.error || 'Timeline generation failed to start.';
    if (nextBindingBase) {
      state.upsertClipGenerationBinding({
        ...nextBindingBase,
        lastRunSummary: {
          status: 'failed',
          outputMediaAssetId: null,
          completedAt: null,
          errorMessage: message,
        },
      });
    }
    throw new Error(message);
  }

  const jobId = submitResult.jobId;
  let retakeTakeId: string | null = null;

  if (operation === 'retake' && targetClip && targetRetakeRange) {
    const retakeTake = state.createClipRetakeTake({
      clipId: targetClip.id,
      retakeRangeId: targetRetakeRange.id,
      mediaAssetId: null,
      prompt: providerResolved.prompt,
      negativePrompt: providerResolved.negativePrompt,
      model: providerResolved.model,
      settings: {
        ...buildBindingSettings(providerResolved, operation, targetClip.id),
        jobId,
        retakeRangeStartMs: targetRetakeRange.startMs,
        retakeRangeEndMs: targetRetakeRange.endMs,
        retakeRangeDurationMs: targetRetakeRange.endMs - targetRetakeRange.startMs,
      },
      referenceSetIds: providerResolved.referenceSetIds,
    });

    if (!retakeTake) {
      throw new Error('The retake job started, but Vision Studio could not create a candidate take record.');
    }

    retakeTakeId = retakeTake.id;
    state.updateClipRetakeTake(retakeTake.id, { status: 'queued' });
  }

  const jobParams = {
    ...submitPayload,
    output_root: outputRoot,
    source: 'timeline',
    timelineOperation: operation,
    timelineSequenceId: targetSequence.id,
    timelineClipId: targetClip?.id ?? null,
    timelineRetakeRangeId: targetRetakeRange?.id ?? null,
    timelineRetakeTakeId: retakeTakeId,
  };

  state.addJob({
    id: jobId,
    type: providerResolved.generationType,
    status: 'pending',
    progress: 0,
    params: jobParams,
    createdAt: new Date(),
  });

  if (nextBindingBase) {
    state.upsertClipGenerationBinding({
      ...nextBindingBase,
      lastRunSummary: {
        status: 'running',
        outputMediaAssetId: null,
        completedAt: null,
        errorMessage: null,
      },
    });
  }

  onStatusChange?.({
    isGenerating: true,
    status: 'generating',
    progress: 0,
    step: 0,
    errorMessage: '',
    activeJobId: jobId,
  });

  // Hosted routes (OpenRouter / HuggingFace, still-image or video) get the
  // longer poll ceiling because off-device generation has higher tail latency.
  const maxPollAttempts = hostedRoute ? MAX_POLL_ATTEMPTS_HOSTED : MAX_POLL_ATTEMPTS_LOCAL_BACKEND;

  let finalStatus: JobStatus | null = null;
  let signalAborted = false;
  // Capture the most recent non-terminal progress so the cancel branch
  // can record how far the job actually got instead of falling back to 0.
  let lastKnownProgress = 0;
  for (let attempt = 0; attempt < maxPollAttempts; attempt += 1) {
    if (signal?.aborted) {
      signalAborted = true;
      break;
    }
    const nextStatus = await electron.generation.getStatus(jobId);
    if (!nextStatus) {
      throw new Error('Timeline generation returned no job status.');
    }

    if (
      nextStatus.status === 'completed' ||
      nextStatus.status === 'failed' ||
      nextStatus.status === 'cancelled'
    ) {
      finalStatus = nextStatus;
      break;
    }

    // Defensive enum guard: a future-version backend could return a status
    // outside the JobStatus union. Coerce anything other than the two
    // expected non-terminal values to 'processing' so the store never holds
    // an unknown literal that downstream code does not handle.
    const safeStatus: 'pending' | 'processing' =
      nextStatus.status === 'pending' || nextStatus.status === 'processing'
        ? nextStatus.status
        : 'processing';
    lastKnownProgress = nextStatus.progress ?? lastKnownProgress;
    state.updateJob(jobId, {
      status: safeStatus,
      progress: lastKnownProgress,
    });
    const stepValue = (nextStatus as JobStatus & { step?: number }).step;
    onStatusChange?.({
      isGenerating: true,
      status: 'generating',
      progress: nextStatus.progress ?? 0,
      ...(typeof stepValue === 'number' ? { step: stepValue } : {}),
      activeJobId: jobId,
    });

    if (nextBindingBase) {
      patchBindingIfPresent(store, nextBindingBase.id, {
        lastRunSummary: {
          status: 'running',
          outputMediaAssetId: null,
          completedAt: null,
          errorMessage: null,
        },
      });
    }

    if (retakeTakeId) {
      state.updateClipRetakeTake(retakeTakeId, { status: 'rendering' });
    }

    if (pollIntervalMs > 0) {
      try {
        await delay(pollIntervalMs, signal);
      } catch {
        signalAborted = true;
        break;
      }
    }
  }

  if (signalAborted) {
    // Tell the backend to stop work when the renderer aborted mid-poll;
    // otherwise the job keeps running and consumes GPU until it completes
    // on its own. Swallow cancel errors so the abort path stays clean.
    await electron.generation.cancel(jobId).catch(() => undefined);
    state.updateJob(jobId, {
      status: 'cancelled',
      progress: lastKnownProgress,
      completedAt: new Date(),
    });
    if (nextBindingBase) {
      patchBindingIfPresent(store, nextBindingBase.id, {
        lastRunSummary: {
          status: 'failed',
          outputMediaAssetId: null,
          completedAt: new Date().toISOString(),
          errorMessage: 'Timeline generation was cancelled.',
        },
      });
    }
    if (retakeTakeId) {
      state.updateClipRetakeTake(retakeTakeId, { status: 'failed' });
    }
    onStatusChange?.({
      isGenerating: false,
      status: 'idle',
      activeJobId: null,
    });
    return {
      cancelled: true,
      clipId: targetClip?.id ?? null,
      outputAssetId: null,
      bindingId: nextBindingBase?.id ?? null,
      retakeTakeId,
    };
  }

  if (!finalStatus) {
    const timeoutMessage = 'Timeline generation timed out while waiting for the job to finish.';
    if (nextBindingBase) {
      patchBindingIfPresent(store, nextBindingBase.id, {
        lastRunSummary: {
          status: 'failed',
          outputMediaAssetId: null,
          completedAt: null,
          errorMessage: timeoutMessage,
        },
      });
    }
    if (retakeTakeId) {
      state.updateClipRetakeTake(retakeTakeId, { status: 'failed' });
    }
    throw new Error(timeoutMessage);
  }

  if (finalStatus.status === 'cancelled') {
    state.updateJob(jobId, {
      status: 'cancelled',
      progress: finalStatus.progress ?? 0,
      completedAt: finalStatus.completed_at ? new Date(finalStatus.completed_at) : new Date(),
    });
    if (nextBindingBase) {
      patchBindingIfPresent(store, nextBindingBase.id, {
        lastRunSummary: {
          status: 'failed',
          outputMediaAssetId: null,
          completedAt: finalStatus.completed_at ?? new Date().toISOString(),
          errorMessage: 'Timeline generation was cancelled.',
        },
      });
    }
    if (retakeTakeId) {
      state.updateClipRetakeTake(retakeTakeId, { status: 'failed' });
    }
    onStatusChange?.({
      isGenerating: false,
      status: 'idle',
      activeJobId: null,
      progress: finalStatus.progress ?? 0,
    });
    return {
      cancelled: true,
      clipId: targetClip?.id ?? null,
      outputAssetId: null,
      bindingId: nextBindingBase?.id ?? null,
      retakeTakeId,
    };
  }

  if (finalStatus.status === 'failed') {
    const failureMessage = finalStatus.error || 'Timeline generation failed.';
    state.updateJob(jobId, {
      status: 'failed',
      progress: finalStatus.progress ?? 0,
      error: failureMessage,
      completedAt: finalStatus.completed_at ? new Date(finalStatus.completed_at) : new Date(),
    });
    if (nextBindingBase) {
      patchBindingIfPresent(store, nextBindingBase.id, {
        lastRunSummary: {
          status: 'failed',
          outputMediaAssetId: null,
          completedAt: finalStatus.completed_at ?? new Date().toISOString(),
          errorMessage: failureMessage,
        },
      });
    }
    if (retakeTakeId) {
      state.updateClipRetakeTake(retakeTakeId, { status: 'failed' });
    }
    // Swallow notify errors so a failing toast layer cannot replace the
    // real failureMessage in the rejection that bubbles out below.
    await electron.notifications
      .notify('generation_failed', {
        title: 'Timeline Generation Failed',
        body: failureMessage,
      })
      .catch(() => undefined);
    throw new Error(failureMessage);
  }

  const completedAt = finalStatus.completed_at ? new Date(finalStatus.completed_at) : new Date();
  state.updateJob(jobId, {
    status: 'completed',
    progress: finalStatus.progress ?? 100,
    result: finalStatus.result,
    error: finalStatus.error,
    completedAt,
  });

  const finalJobStatus: AssetJobStatus = {
    ...finalStatus,
    params: {
      ...jobParams,
      output_root: outputRoot,
    },
  };
  state.syncAssetsFromJobStatus(finalJobStatus);

  const outputAssetId = getOutputAssetId(finalStatus);
  const outputRecord = outputAssetId
    ? store.getState().assetLibrary.find((asset) => asset.id === outputAssetId) ?? null
    : null;
  const outputMediaAsset = buildGeneratedMediaAsset(finalStatus, jobParams, outputRecord);

  if (outputMediaAsset) {
    state.upsertMediaAsset(outputMediaAsset);
  }

  const outputMediaAssetId = outputMediaAsset?.id ?? null;
  const targetTrackForOutput =
    operation === 'retake'
      ? null
      : ensureTargetTrack(store, targetSequence.id, providerResolved.generationType);
  const durationMs = resolveClipDurationMs({
    mediaAsset: outputMediaAsset,
    generationType: providerResolved.generationType,
    existingClip: targetClip,
    resolved: providerResolved,
  });

  let resultingClipId = targetClip?.id ?? null;
  let resultingBindingId = nextBindingBase?.id ?? null;

  if (operation === 'retake' && targetClip && targetRetakeRange && retakeTakeId && outputMediaAsset) {
    state.updateClipRetakeTake(retakeTakeId, {
      mediaAssetId: outputMediaAsset.id,
      prompt: providerResolved.prompt,
      negativePrompt: providerResolved.negativePrompt,
      model: providerResolved.model,
      status: 'candidate',
      settings: {
        ...buildBindingSettings(providerResolved, operation, targetClip.id),
        jobId,
        retakeRangeStartMs: targetRetakeRange.startMs,
        retakeRangeEndMs: targetRetakeRange.endMs,
        retakeRangeDurationMs: targetRetakeRange.endMs - targetRetakeRange.startMs,
      },
      referenceSetIds: providerResolved.referenceSetIds,
    });
    resultingClipId = targetClip.id;
    resultingBindingId = existingBinding?.id ?? null;
  } else if (operation === 'regenerate' && targetClip && outputMediaAsset) {
    state.updateTimelineClip(targetClip.id, {
      mediaAssetId: outputMediaAsset.id,
      durationMs,
      sourceInMs: 0,
      sourceOutMs: durationMs,
      posterUrl: outputMediaAsset.posterUrl,
      referenceSetIds: providerResolved.referenceSetIds,
      label: targetClip.label,
    });

    const binding: ClipGenerationBinding = {
      ...(store.getState().clipGenerationBindings.find((binding) => binding.id === nextBindingBase!.id) ??
        nextBindingBase!),
      prompt: providerResolved.prompt,
      negativePrompt: providerResolved.negativePrompt,
      model: providerResolved.model,
      generationType: providerResolved.generationType,
      settings: buildBindingSettings(providerResolved, operation, targetClip.id),
      referenceSetIds: providerResolved.referenceSetIds,
      lastRunSummary: {
        status: 'complete',
        outputMediaAssetId,
        completedAt: completedAt.toISOString(),
        errorMessage: null,
      },
    };
    state.upsertClipGenerationBinding(binding);
    resultingBindingId = binding.id;
    resultingClipId = targetClip.id;
  } else if (outputMediaAsset && targetTrackForOutput) {
    const clipStartMs = resolveGeneratedClipStartMs({
      sequence: store.getState().timelineSequences.find((item) => item.id === targetSequence.id) ?? targetSequence,
      clip: targetClip,
      operation,
    });
    const createdClip = state.createTimelineClip({
      trackId: targetTrackForOutput.id,
      mediaAssetId: outputMediaAsset.id,
      sceneId: targetClip?.sceneId ?? state.activeSceneId ?? null,
      startMs: clipStartMs,
      durationMs,
      sourceInMs: 0,
      sourceOutMs: durationMs,
      label: buildGeneratedClipLabel(operation, providerResolved.prompt, targetClip, providerResolved.generationType),
      posterUrl: outputMediaAsset.posterUrl,
      referenceSetIds: providerResolved.referenceSetIds,
    });

    if (!createdClip) {
      throw new Error('The generated media finished, but Vision Studio could not place it on the timeline.');
    }

    const bindingId = `clip-binding-${crypto.randomUUID()}`;
    const binding: ClipGenerationBinding = {
      id: bindingId,
      clipId: createdClip.id,
      prompt: providerResolved.prompt,
      negativePrompt: providerResolved.negativePrompt,
      model: providerResolved.model,
      generationType: providerResolved.generationType,
      settings: buildBindingSettings(providerResolved, operation, targetClip?.id ?? null),
      referenceSetIds: providerResolved.referenceSetIds,
      variantIds: [],
      lastRunSummary: {
        status: 'complete',
        outputMediaAssetId,
        completedAt: completedAt.toISOString(),
        errorMessage: null,
      },
    };
    state.upsertClipGenerationBinding(binding);
    resultingClipId = createdClip.id;
    resultingBindingId = binding.id;
    state.setActiveTimelineClip(createdClip.id);

    if (existingBinding && targetClip) {
      state.upsertClipGenerationBinding({
        ...existingBinding,
        variantIds: Array.from(new Set([...(existingBinding.variantIds ?? []), createdClip.id])),
      });
    }
  }

  if (outputAssetId) {
    state.setActiveViewerItemId(outputAssetId);
  }

  // Swallow notify errors so a failing toast layer cannot turn a
  // successful run into a thrown rejection at the end of the function.
  await electron.notifications
    .notify('generation_complete', {
      title: operation === 'retake' ? 'Retake Candidate Ready' : 'Timeline Clip Ready',
      body: providerResolved.prompt.slice(0, 120) || 'Timeline generation completed successfully.',
    })
    .catch(() => undefined);

  return {
    cancelled: false,
    clipId: resultingClipId,
    outputAssetId,
    bindingId: resultingBindingId,
    retakeTakeId,
  };
}

function resolveTargetClip(state: AppState, clipId?: string) {
  const resolvedClipId = clipId ?? state.activeTimelineClipId;
  return resolvedClipId
    ? state.timelineClips.find((clip) => clip.id === resolvedClipId) ?? null
    : null;
}

function resolveTargetSequence(
  state: AppState,
  sequenceId: string | undefined,
  targetTrack: TimelineTrack | null,
) {
  const resolvedSequenceId = sequenceId ?? targetTrack?.sequenceId ?? state.activeTimelineSequenceId;
  return resolvedSequenceId
    ? state.timelineSequences.find((sequence) => sequence.id === resolvedSequenceId) ?? null
    : null;
}

function resolveGenerationInput({
  state,
  sequence,
  clip,
  binding,
  input,
}: {
  state: AppState;
  sequence: TimelineSequence;
  clip: TimelineClip | null;
  binding: ClipGenerationBinding | null;
  input?: TimelineGenerationInput;
}): ResolvedTimelineGenerationInput {
  const project = state.projects.find((item) => item.id === sequence.projectId) ?? null;
  const scene = clip?.sceneId
    ? project?.scenes.find((item) => item.id === clip.sceneId) ?? null
    : state.activeSceneId
      ? project?.scenes.find((item) => item.id === state.activeSceneId) ?? null
      : null;
  const dimensions = computeDimensions(
    state.aspectRatio,
    state.resolutionTier,
    state.customWidth,
    state.customHeight,
  );
  const generationType = input?.generationType ?? binding?.generationType ?? state.advancedGeneration.generationType;
  const prompt = input?.prompt?.trim() || binding?.prompt || scene?.prompt || '';
  const negativePrompt =
    input?.negativePrompt ?? binding?.negativePrompt ?? scene?.negativePrompt ?? '';
  const model =
    input?.model ??
    binding?.model ??
    state.generationDraft?.model ??
    (generationType === 'video' ? 'ltx-video' : 'flux-dev');
  const width = input?.width ?? getNumberSetting(binding, 'width') ?? dimensions.width;
  const height = input?.height ?? getNumberSetting(binding, 'height') ?? dimensions.height;
  const steps = input?.steps ?? getNumberSetting(binding, 'steps') ?? state.advancedGeneration.steps;
  const cfgScale =
    input?.cfgScale ?? getNumberSetting(binding, 'cfgScale') ?? state.advancedGeneration.cfgScale;
  const scheduler =
    input?.scheduler ??
    getStringSetting(binding, 'scheduler') ??
    state.generationDraft?.scheduler ??
    state.advancedGeneration.scheduler;
  const seed = input?.seed ?? getNumberSetting(binding, 'seed') ?? state.advancedGeneration.seed;
  const duration =
    input?.duration ?? getNumberSetting(binding, 'duration') ?? state.advancedGeneration.duration;
  const fps = input?.fps ?? getNumberSetting(binding, 'fps') ?? state.advancedGeneration.fps;
  const referenceSetIds =
    input?.referenceSetIds ?? collectReferenceSetIds(state, project?.id ?? null, scene?.id ?? null, clip, binding);

  return {
    prompt,
    negativePrompt,
    generationType,
    model,
    width,
    height,
    steps,
    cfgScale,
    scheduler,
    seed,
    duration,
    fps,
    sourceMediaAssetId:
      input?.sourceMediaAssetId ??
      getStringSetting(binding, 'sourceMediaAssetId') ??
      resolveClipSourceMediaAssetId(state, clip),
    referenceSetIds,
  };
}

function collectReferenceSetIds(
  state: AppState,
  projectId: string | null,
  sceneId: string | null,
  clip: TimelineClip | null,
  binding: ClipGenerationBinding | null,
) {
  const scopedAdhocIds = state.referenceSets
    .filter(
      (referenceSet) =>
        referenceSet.scope === 'adhoc' &&
        referenceSet.projectId === projectId &&
        referenceSet.sceneId === sceneId,
    )
    .map((referenceSet) => referenceSet.id);

  return Array.from(
    new Set([
      ...(binding?.referenceSetIds ?? []),
      ...(clip?.referenceSetIds ?? []),
      ...scopedAdhocIds,
      ...(projectId
        ? state.referenceSets
            .filter((referenceSet) => referenceSet.scope === 'project' && referenceSet.projectId === projectId)
            .map((referenceSet) => referenceSet.id)
        : []),
      ...(sceneId
        ? state.referenceSets
            .filter((referenceSet) => referenceSet.scope === 'scene' && referenceSet.sceneId === sceneId)
            .map((referenceSet) => referenceSet.id)
        : []),
    ]),
  );
}

function resolveClipSourceMediaAssetId(state: AppState, clip: TimelineClip | null) {
  if (!clip) {
    return null;
  }

  const mediaAsset = state.mediaAssets.find((asset) => asset.id === clip.mediaAssetId) ?? null;
  return mediaAsset?.type === 'image' ? mediaAsset.id : null;
}

function resolveVideoSourcePath({
  state,
  clip,
  binding,
  sourceMediaAssetId,
  referenceSetIds,
}: {
  state: AppState;
  clip: TimelineClip | null;
  binding: ClipGenerationBinding | null;
  sourceMediaAssetId: string | null;
  referenceSetIds: string[];
}) {
  const directSource = sourceMediaAssetId
    ? state.mediaAssets.find((asset) => asset.id === sourceMediaAssetId && asset.type === 'image') ?? null
    : null;
  if (directSource) {
    return directSource.path;
  }

  const posterPath = clip?.posterUrl ?? getStringSetting(binding, 'posterUrl');
  if (posterPath && !posterPath.startsWith('data:') && !/\.(mp4|webm|mov|m4v|avi|mkv)$/i.test(posterPath)) {
    return posterPath;
  }

  return resolvePrimaryReferencePath(state.referenceSets, state.mediaAssets, referenceSetIds, 'video');
}

function resolveImageGenerationBasePath(
  state: AppState,
  clip: TimelineClip | null,
  binding: ClipGenerationBinding | null,
) {
  const directClipAsset = clip
    ? state.mediaAssets.find((asset) => asset.id === clip.mediaAssetId && asset.type === 'image') ?? null
    : null;
  if (directClipAsset) {
    return directClipAsset.path;
  }

  const sourceMediaAssetId = getStringSetting(binding, 'sourceMediaAssetId');
  if (!sourceMediaAssetId) {
    return null;
  }

  return state.mediaAssets.find((asset) => asset.id === sourceMediaAssetId && asset.type === 'image')?.path ?? null;
}

function resolvePrimaryReferencePath(
  referenceSets: ReferenceSet[],
  mediaAssets: MediaAsset[],
  referenceSetIds: string[],
  generationType: GenerationType,
) {
  const slotPriority =
    generationType === 'video'
      ? ['motion', 'composition', 'character', 'style', 'pose']
      : ['composition', 'style', 'character', 'pose', 'motion'];

  const items = referenceSets
    .filter((referenceSet) => referenceSetIds.includes(referenceSet.id))
    .flatMap((referenceSet, scopeIndex) =>
      referenceSet.items
        .map((item) => {
          const path = item.path ?? mediaAssets.find((asset) => asset.id === item.mediaAssetId)?.path ?? null;
          if (!path) {
            return null;
          }

          return {
            path,
            slot: item.slot,
            orderIndex: item.orderIndex,
            scopeIndex,
          };
        })
        .filter((item): item is { path: string; slot: ReferenceSet['items'][number]['slot']; orderIndex: number; scopeIndex: number } => Boolean(item)),
    )
    .sort((left, right) => {
      const leftSlotIndex = slotPriority.indexOf(left.slot);
      const rightSlotIndex = slotPriority.indexOf(right.slot);
      return (
        left.scopeIndex - right.scopeIndex ||
        (leftSlotIndex === -1 ? slotPriority.length : leftSlotIndex) -
          (rightSlotIndex === -1 ? slotPriority.length : rightSlotIndex) ||
        left.orderIndex - right.orderIndex
      );
    });

  return items[0]?.path ?? null;
}

function ensureTargetTrack(store: TimelineStore, sequenceId: string, generationType: GenerationType) {
  const state = store.getState();
  const kind = generationType === 'video' ? 'video' : 'image';
  const existingTrack =
    state.timelineTracks
      .filter((track) => track.sequenceId === sequenceId && track.kind === kind)
      .sort((left, right) => left.orderIndex - right.orderIndex)[0] ?? null;

  if (existingTrack) {
    return existingTrack;
  }

  return store.getState().createTimelineTrack(sequenceId, {
    kind,
    name: generationType === 'video' ? 'Generated Video' : 'Generated Images',
  });
}

function resolveClipDurationMs({
  mediaAsset,
  generationType,
  existingClip,
  resolved,
}: {
  mediaAsset: MediaAsset | null;
  generationType: GenerationType;
  existingClip: TimelineClip | null;
  resolved: ResolvedTimelineGenerationInput;
}) {
  if (mediaAsset?.type === 'video' && typeof mediaAsset.durationMs === 'number') {
    return mediaAsset.durationMs;
  }

  if (generationType === 'video') {
    return Math.max(1000, Math.round(resolved.duration * 1000));
  }

  return existingClip?.durationMs ?? 2000;
}

function resolveGeneratedClipStartMs({
  sequence,
  clip,
  operation,
}: {
  sequence: TimelineSequence;
  clip: TimelineClip | null;
  operation: TimelineGenerationOperation;
}) {
  if (clip && (operation === 'variant' || operation === 'extend' || operation === 'generate')) {
    return clip.startMs + clip.durationMs;
  }

  return Math.max(sequence.durationMs, sequence.playRange?.endMs ?? 0);
}

function buildGeneratedClipLabel(
  operation: TimelineGenerationOperation,
  prompt: string,
  clip: TimelineClip | null,
  generationType: GenerationType,
) {
  if (clip && operation === 'extend') {
    return `${clip.label} Extend`;
  }

  if (clip) {
    return `${clip.label} Variant`;
  }

  const excerpt = prompt.trim().split(/\s+/).slice(0, 4).join(' ');
  if (excerpt) {
    return excerpt;
  }

  return generationType === 'video' ? 'Generated Video Clip' : 'Generated Image Clip';
}

function buildBindingSettings(
  resolved: ResolvedTimelineGenerationInput,
  operation: TimelineGenerationOperation,
  sourceClipId: string | null,
) {
  return {
    width: resolved.width,
    height: resolved.height,
    steps: resolved.steps,
    cfgScale: resolved.cfgScale,
    scheduler: resolved.scheduler,
    seed: resolved.seed,
    duration: resolved.duration,
    fps: resolved.fps,
    sourceMediaAssetId: resolved.sourceMediaAssetId,
    sourceClipId,
    operation,
  };
}

function buildGeneratedMediaAsset(
  status: JobStatus,
  params: Record<string, unknown>,
  assetRecord: AssetRecord | null,
) {
  const outputPath = status.type === 'video' ? status.result?.video : status.result?.images?.[0];
  if (!outputPath) {
    return null;
  }

  // Edit jobs (#34) produce images; only video jobs carry a video result.
  const assetType = status.type === 'video' ? ('video' as const) : ('image' as const);
  const storedPath = resolveStoredAssetPath(outputPath, params);
  const thumbnailUrl =
    assetRecord?.thumbnail ??
    toPreviewUrl(outputPath, {
      type: assetType,
      label: assetRecord?.name ?? (assetType === 'video' ? 'Generated Video' : 'Generated Image'),
    });

  return {
    id: `media::${storedPath}`,
    legacyAssetId: getOutputAssetId(status),
    jobId: status.job_id,
    name: assetRecord?.name ?? (assetType === 'video' ? 'Generated Video' : 'Generated Image'),
    type: assetType,
    source: 'generated' as const,
    path: storedPath,
    previewUrl: status.type === 'video' ? storedPath : storedPath,
    thumbnailUrl,
    posterUrl: status.type === 'video' ? thumbnailUrl : null,
    width: assetRecord?.width,
    height: assetRecord?.height,
    durationMs: toDurationMs(assetRecord?.duration),
    fps: assetRecord?.fps,
    metadata: {
      ...(assetRecord?.params ?? {}),
      outputPath,
    },
    createdAt: assetRecord?.createdAt ?? status.created_at,
  } satisfies MediaAsset;
}

function toDurationMs(duration: number | undefined) {
  if (typeof duration !== 'number' || !Number.isFinite(duration)) {
    return undefined;
  }

  return duration > 120 ? Math.round(duration) : Math.round(duration * 1000);
}

/**
 * Apply a partial update to a binding only if it is still present in the
 * store. A parallel mutation -- typically the user deleting the parent
 * clip mid-poll -- can prune a binding while a generation is in flight.
 * No-op in that case so the runner does not crash trying to upsert into
 * a removed record.
 */
function patchBindingIfPresent(
  store: TimelineStore,
  bindingId: string,
  patch: Partial<ClipGenerationBinding>,
) {
  const current = store.getState().clipGenerationBindings.find((binding) => binding.id === bindingId);
  if (!current) {
    return;
  }
  store.getState().upsertClipGenerationBinding({ ...current, ...patch });
}

function getNumberSetting(binding: ClipGenerationBinding | null, key: string) {
  const value = binding?.settings[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function getStringSetting(binding: ClipGenerationBinding | null, key: string) {
  const value = binding?.settings[key];
  return typeof value === 'string' ? value : undefined;
}
