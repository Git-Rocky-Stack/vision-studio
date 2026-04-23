import type { StoreApi, UseBoundStore } from 'zustand';

import { useAppStore } from '@/store/appStore';
import type { AppState } from '@/store/appStore.types';
import type { AssetRecord, AssetJobStatus } from '@/types/assets';
import type { JobStatus } from '@/types/electron';
import type { MediaAsset, ReferenceSet } from '@/types/media';
import type { ImageGenerationRequestPayload, PromptHistoryEntry } from '@/types/generation';
import type { ClipGenerationBinding, TimelineClip, TimelineSequence, TimelineTrack } from '@/types/timeline';
import { computeDimensions } from '@/types/resolution';
import { SVD_REFERENCE_ERROR } from '@/features/generate/validation';
import { resolveCanvasControlLayers } from '@/features/generation/resolveCanvasControlLayers';
import {
  buildCompletionSummary,
  delay,
  getOutputAssetId,
  resolveOutputRoot,
} from '@/features/workflow/runWorkflowExecution';
import { resolveStoredAssetPath, toPreviewUrl } from '@/features/assets/assetRecords';

type TimelineStore = UseBoundStore<StoreApi<AppState>>;

type GenerationType = 'image' | 'video';
type TimelineGenerationOperation = 'generate' | 'regenerate' | 'variant' | 'extend';

interface TimelineGenerationElectronApi {
  app: {
    getPath: (name: 'userData') => Promise<string>;
  };
  settings: {
    get: () => Promise<{
      defaultOutputPath: string;
    }>;
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
  input?: TimelineGenerationInput;
  store?: TimelineStore;
  electron?: TimelineGenerationElectronApi;
  pollIntervalMs?: number;
  onStatusChange?: (patch: TimelineGenerationStatusPatch) => void;
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
}

export async function runTimelineClipGeneration({
  operation = 'generate',
  clipId,
  sequenceId,
  input,
  store = useAppStore,
  electron = window.electron,
  pollIntervalMs = 500,
  onStatusChange,
}: RunTimelineClipGenerationOptions): Promise<TimelineGenerationRunResult> {
  const state = store.getState();
  const targetClip = resolveTargetClip(state, clipId);
  const targetTrack = targetClip
    ? state.timelineTracks.find((track) => track.id === targetClip.trackId) ?? null
    : null;
  const targetSequence = resolveTargetSequence(state, sequenceId, targetTrack);

  if (!targetSequence) {
    throw new Error('Select a timeline sequence before generating into the editor.');
  }

  if (!state.systemInfo.backendConnected) {
    throw new Error('The AI backend is not running.');
  }

  const existingBinding = targetClip?.generationBindingId
    ? state.clipGenerationBindings.find((binding) => binding.id === targetClip.generationBindingId) ?? null
    : null;

  if ((operation === 'regenerate' || operation === 'variant' || operation === 'extend') && !targetClip) {
    throw new Error('Select a timeline clip before using clip generation actions.');
  }

  if ((operation === 'regenerate' || operation === 'variant' || operation === 'extend') && !existingBinding) {
    throw new Error('This clip is not AI-bound yet. Create a generated variant from Generate first.');
  }

  const resolved = resolveGenerationInput({
    state,
    sequence: targetSequence,
    clip: targetClip,
    binding: existingBinding,
    input,
  });
  const targetProject = state.projects.find((item) => item.id === targetSequence.projectId) ?? null;
  const targetScene = targetClip?.sceneId
    ? targetProject?.scenes.find((item) => item.id === targetClip.sceneId) ?? null
    : state.activeSceneId
      ? targetProject?.scenes.find((item) => item.id === state.activeSceneId) ?? null
      : null;

  if (!resolved.prompt.trim()) {
    throw new Error('Enter a prompt before generating into the timeline.');
  }

  if (operation === 'extend' && resolved.generationType !== 'video') {
    throw new Error('Extend Shot is only available for motion clips.');
  }

  const sourceImagePath =
    resolved.generationType === 'video'
      ? resolveVideoSourcePath({
          state,
          clip: targetClip,
          binding: existingBinding,
          sourceMediaAssetId: resolved.sourceMediaAssetId,
          referenceSetIds: resolved.referenceSetIds,
        })
      : null;

  if (resolved.generationType === 'video' && resolved.model === 'svd' && !sourceImagePath) {
    throw new Error(SVD_REFERENCE_ERROR);
  }

  const canvasControlLayers =
    resolved.generationType === 'image'
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
          prompt: resolved.prompt,
          negativePrompt: resolved.negativePrompt,
          model: resolved.model,
          generationType: resolved.generationType,
          settings: buildBindingSettings(resolved, operation, targetClip.id),
          referenceSetIds: resolved.referenceSetIds,
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
    prompt: resolved.prompt,
    negativePrompt: resolved.negativePrompt,
    timestamp: new Date(),
    model: resolved.model,
  };
  state.addToPromptHistory(promptHistoryEntry);

  const appSettings = await electron.settings.get();
  const userDataPath = await electron.app.getPath('userData');
  const outputRoot = resolveOutputRoot(appSettings.defaultOutputPath, userDataPath);

  const submitPayload =
    resolved.generationType === 'video'
      ? {
          prompt: resolved.prompt,
          image_path: sourceImagePath ?? undefined,
          width: resolved.width,
          height: resolved.height,
          duration: resolved.duration,
          fps: resolved.fps,
          steps: resolved.steps,
          model: resolved.model,
          seed: resolved.seed === -1 ? undefined : resolved.seed,
        }
      : {
          prompt: resolved.prompt,
          negative_prompt: resolved.negativePrompt,
          width: resolved.width,
          height: resolved.height,
          steps: resolved.steps,
          cfg_scale: resolved.cfgScale,
          seed: resolved.seed === -1 ? undefined : resolved.seed,
          model: resolved.model,
          scheduler: resolved.scheduler,
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

  const submitResult =
    resolved.generationType === 'video'
      ? await electron.generation.generateVideo(submitPayload)
      : await electron.generation.generateImage(submitPayload);

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
  const jobParams = {
    ...submitPayload,
    output_root: outputRoot,
    source: 'timeline',
    timelineOperation: operation,
    timelineSequenceId: targetSequence.id,
    timelineClipId: targetClip?.id ?? null,
  };

  state.addJob({
    id: jobId,
    type: resolved.generationType,
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

  let finalStatus: JobStatus | null = null;
  for (let attempt = 0; attempt < 120; attempt += 1) {
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

    state.updateJob(jobId, {
      status: nextStatus.status,
      progress: nextStatus.progress ?? 0,
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
      state.upsertClipGenerationBinding({
        ...store.getState().clipGenerationBindings.find((binding) => binding.id === nextBindingBase.id)!,
        lastRunSummary: {
          status: 'running',
          outputMediaAssetId: null,
          completedAt: null,
          errorMessage: null,
        },
      });
    }

    if (pollIntervalMs > 0) {
      await delay(pollIntervalMs);
    }
  }

  if (!finalStatus) {
    const timeoutMessage = 'Timeline generation timed out while waiting for the job to finish.';
    if (nextBindingBase) {
      state.upsertClipGenerationBinding({
        ...store.getState().clipGenerationBindings.find((binding) => binding.id === nextBindingBase.id)!,
        lastRunSummary: {
          status: 'failed',
          outputMediaAssetId: null,
          completedAt: null,
          errorMessage: timeoutMessage,
        },
      });
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
      state.upsertClipGenerationBinding({
        ...store.getState().clipGenerationBindings.find((binding) => binding.id === nextBindingBase.id)!,
        lastRunSummary: {
          status: 'failed',
          outputMediaAssetId: null,
          completedAt: finalStatus.completed_at ?? new Date().toISOString(),
          errorMessage: 'Timeline generation was cancelled.',
        },
      });
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
      state.upsertClipGenerationBinding({
        ...store.getState().clipGenerationBindings.find((binding) => binding.id === nextBindingBase.id)!,
        lastRunSummary: {
          status: 'failed',
          outputMediaAssetId: null,
          completedAt: finalStatus.completed_at ?? new Date().toISOString(),
          errorMessage: failureMessage,
        },
      });
    }
    await electron.notifications.notify('generation_failed', {
      title: 'Timeline Generation Failed',
      body: failureMessage,
    });
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
  const targetTrackForOutput = ensureTargetTrack(store, targetSequence.id, resolved.generationType);
  const durationMs = resolveClipDurationMs({
    mediaAsset: outputMediaAsset,
    generationType: resolved.generationType,
    existingClip: targetClip,
    resolved,
  });

  let resultingClipId = targetClip?.id ?? null;
  let resultingBindingId = nextBindingBase?.id ?? null;

  if (operation === 'regenerate' && targetClip && outputMediaAsset) {
    state.updateTimelineClip(targetClip.id, {
      mediaAssetId: outputMediaAsset.id,
      durationMs,
      sourceInMs: 0,
      sourceOutMs: durationMs,
      posterUrl: outputMediaAsset.posterUrl,
      referenceSetIds: resolved.referenceSetIds,
      label: targetClip.label,
    });

    const binding: ClipGenerationBinding = {
      ...(store.getState().clipGenerationBindings.find((binding) => binding.id === nextBindingBase!.id) ??
        nextBindingBase!),
      prompt: resolved.prompt,
      negativePrompt: resolved.negativePrompt,
      model: resolved.model,
      generationType: resolved.generationType,
      settings: buildBindingSettings(resolved, operation, targetClip.id),
      referenceSetIds: resolved.referenceSetIds,
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
      label: buildGeneratedClipLabel(operation, resolved.prompt, targetClip, resolved.generationType),
      posterUrl: outputMediaAsset.posterUrl,
      referenceSetIds: resolved.referenceSetIds,
    });

    if (!createdClip) {
      throw new Error('The generated media finished, but Vision Studio could not place it on the timeline.');
    }

    const bindingId = `clip-binding-${crypto.randomUUID()}`;
    const binding: ClipGenerationBinding = {
      id: bindingId,
      clipId: createdClip.id,
      prompt: resolved.prompt,
      negativePrompt: resolved.negativePrompt,
      model: resolved.model,
      generationType: resolved.generationType,
      settings: buildBindingSettings(resolved, operation, targetClip?.id ?? null),
      referenceSetIds: resolved.referenceSetIds,
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

  await electron.notifications.notify('generation_complete', {
    title: 'Timeline Clip Ready',
    body: resolved.prompt.slice(0, 120) || 'Timeline generation completed successfully.',
  });

  return {
    cancelled: false,
    clipId: resultingClipId,
    outputAssetId,
    bindingId: resultingBindingId,
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

  const storedPath = resolveStoredAssetPath(outputPath, params);
  const thumbnailUrl =
    assetRecord?.thumbnail ??
    toPreviewUrl(outputPath, {
      type: status.type,
      label: assetRecord?.name ?? (status.type === 'video' ? 'Generated Video' : 'Generated Image'),
    });

  return {
    id: `media::${storedPath}`,
    legacyAssetId: getOutputAssetId(status),
    jobId: status.job_id,
    name: assetRecord?.name ?? (status.type === 'video' ? 'Generated Video' : 'Generated Image'),
    type: status.type,
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

function getNumberSetting(binding: ClipGenerationBinding | null, key: string) {
  const value = binding?.settings[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function getStringSetting(binding: ClipGenerationBinding | null, key: string) {
  const value = binding?.settings[key];
  return typeof value === 'string' ? value : undefined;
}
