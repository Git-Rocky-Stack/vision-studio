import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { cn } from '@/utils/cn';
import { useAppStore } from '@/store/appStore';
import { PromptArea } from '@/components/generate/PromptArea';
import { StylePresetsBar } from '@/components/generate/StylePresetsBar';
import { ModelSelector } from '@/components/generate/ModelSelector';
import { AdvancedGenerationSettings } from '@/components/generate/AdvancedGenerationSettings';
import { ControlNetPanel } from '@/components/generate/ControlNetPanel';
import { LoRAMixer } from '@/components/generate/LoRAMixer';
import { PromptHistory } from '@/components/generate/PromptHistory';
import { AspectRatioPicker } from '@/components/generate/AspectRatioPicker';
import { CompactImageDropZone } from '@/components/generate/CompactImageDropZone';
import { VideoControls } from '@/components/generate/VideoControls';
import { ReferenceMediaPanel } from '@/components/reference/ReferenceMediaPanel';
import { computeDimensions } from '@/types/resolution';
import {
  clearResolvedGenerationError,
  SVD_REFERENCE_ERROR,
} from '@/features/generate/validation';
import { resolveCanvasControlLayers } from '@/features/generation/resolveCanvasControlLayers';
import { getActiveUserAccount } from '@/features/accounts/providerRouting';
import { runTimelineClipGeneration } from '@/features/timeline/runTimelineClipGeneration';
import type { ControlNetConfig, ImageGenerationRequestPayload, LoRAConfig } from '@/types/generation';
import type { GenerateCollapsibleSectionId } from '@/store/layoutPreferences';
import type { UserAccountSummary } from '@/types/electron';
import type { MediaAsset, ReferenceSet } from '@/types/media';
import {
  AlertCircle,
  Check,
  ChevronDown,
  Clapperboard,
  Cloud,
  Clock,
  Film,
  Frame,
  Image as ImageIcon,
  ImagePlus,
  Layers3,
  Loader2,
  Settings2,
  SlidersHorizontal,
  Wand2,
  X,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { useMotionConfig } from '@/utils/animation';

type GenerationType = 'image' | 'video';

const RANDOM_PROMPTS = [
  'A mystical forest at twilight with bioluminescent mushrooms and fireflies',
  'Cyberpunk cityscape with neon-lit skyscrapers and flying cars in the rain',
  'An astronaut sitting on the edge of a cliff overlooking a nebula',
  'A cozy cabin in the snowy mountains with warm light spilling from windows',
  'Ancient temple ruins reclaimed by jungle with shafts of golden light',
  'Underwater palace with coral architecture and schools of glowing fish',
  'A grand library with floating books and magical glowing orbs',
  'Dragon perched atop a mountain at sunrise, scales reflecting light',
];

const DEFAULT_CONTROLNET: ControlNetConfig = {
  enabled: false,
  preprocessor: 'canny',
  strength: 1.0,
  startStep: 0,
  endStep: 1,
};

function resolveOutputRoot(defaultOutputPath: string, userDataPath: string) {
  return (defaultOutputPath || `${userDataPath.replace(/\\/g, '/')}/outputs`).replace(/\\/g, '/');
}

interface GenerateSectionCardProps {
  sectionId: string;
  title: string;
  description: string;
  icon: LucideIcon;
  summary?: string;
  badge?: string;
  collapsible?: boolean;
  collapsed?: boolean;
  onToggle?: () => void;
  children: ReactNode;
}

function GenerateSectionCard({
  sectionId,
  title,
  description,
  icon: Icon,
  summary,
  badge,
  collapsible = false,
  collapsed = false,
  onToggle,
  children,
}: GenerateSectionCardProps) {
  return (
    <section
      data-testid={`generate-section-${sectionId}`}
      className="rounded-xl border border-border bg-surface shadow-cinematic"
    >
      <div className="flex items-start gap-3 px-4 py-3">
        <div className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg border border-border bg-elevated text-text-body">
          <Icon className="h-4 w-4" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="type-section">{title}</h2>
            {badge ? (
              <span className="rounded-full border border-border bg-elevated px-2 py-0.5 type-caption text-text-body">
                {badge}
              </span>
            ) : null}
          </div>
          <p className="mt-1 type-caption">
            {collapsible && collapsed && summary ? summary : description}
          </p>
        </div>

        {collapsible && onToggle ? (
          <button
            type="button"
            aria-expanded={!collapsed}
            aria-controls={`generate-section-body-${sectionId}`}
            data-testid={`toggle-generate-section-${sectionId}`}
            onClick={onToggle}
            className="rounded-md border border-border bg-elevated p-2 text-text-body transition-all hover:border-border-hover hover:text-text-primary"
          >
            <ChevronDown className={cn('h-4 w-4 transition-transform', collapsed ? '' : 'rotate-180')} />
          </button>
        ) : null}
      </div>

      {(!collapsible || !collapsed) && (
        <div id={`generate-section-body-${sectionId}`} className="border-t border-border/80 px-4 py-4">
          {children}
        </div>
      )}
    </section>
  );
}

function findScopedReferenceSet(
  referenceSets: ReferenceSet[],
  scope: ReferenceSet['scope'],
  projectId: string | null,
  sceneId: string | null,
  clipId: string | null,
) {
  return (
    referenceSets.find(
      (referenceSet) =>
        referenceSet.scope === scope &&
        referenceSet.projectId === projectId &&
        referenceSet.sceneId === sceneId &&
        referenceSet.clipId === clipId,
    ) ?? null
  );
}

function resolveReferenceItemPath(
  item: ReferenceSet['items'][number],
  mediaAssets: MediaAsset[],
) {
  if (item.path) {
    return item.path;
  }

  if (!item.mediaAssetId) {
    return null;
  }

  return mediaAssets.find((asset) => asset.id === item.mediaAssetId)?.path ?? null;
}

function resolveReferenceContext(
  generationType: GenerationType,
  referenceSets: Array<ReferenceSet | null>,
  mediaAssets: MediaAsset[],
) {
  type ResolvedReferenceItem = {
    path: string;
    label: string;
    slot: ReferenceSet['items'][number]['slot'];
    orderIndex: number;
    scopeIndex: number;
  };
  const slotPriority =
    generationType === 'video'
      ? ['motion', 'composition', 'character', 'style', 'pose']
      : ['composition', 'style', 'character', 'pose', 'motion'];

  const resolvedItems = referenceSets.flatMap<ResolvedReferenceItem>((referenceSet, scopeIndex) =>
    (referenceSet?.items ?? [])
      .map((item) => {
        const path = resolveReferenceItemPath(item, mediaAssets);
        if (!path) {
          return null;
        }

        return {
          path,
          label: item.label ?? 'Reference image',
          slot: item.slot,
          orderIndex: item.orderIndex,
          scopeIndex,
        };
      })
      .filter((item): item is ResolvedReferenceItem => Boolean(item)),
  );

  const prioritizedItems = [...resolvedItems].sort((left, right) => {
    const leftSlotIndex = slotPriority.indexOf(left.slot);
    const rightSlotIndex = slotPriority.indexOf(right.slot);

    return (
      left.scopeIndex - right.scopeIndex ||
      (leftSlotIndex === -1 ? slotPriority.length : leftSlotIndex) -
        (rightSlotIndex === -1 ? slotPriority.length : rightSlotIndex) ||
      left.orderIndex - right.orderIndex
    );
  });

  return {
    primaryReferenceImage: prioritizedItems[0]?.path ?? null,
    primaryReferenceLabel: prioritizedItems[0]?.label ?? null,
    totalReferenceItems: resolvedItems.length,
    activeReferenceSetCount: referenceSets.filter((referenceSet) => (referenceSet?.items.length ?? 0) > 0).length,
  };
}

export function GeneratePanel() {
  const {
    addJob,
    updateJob,
    syncAssetsFromJobStatus,
    systemInfo,
    currentProject,
    currentImageAssetPath,
    projects,
    activeProjectId,
    activeSceneId,
    activeTimelineSequenceId,
    activeTimelineClipId,
    referenceSets,
    mediaAssets,
    timelineSequences,
    timelineTracks,
    timelineClips,
    clipGenerationBindings,
    addToPromptHistory,
    favoritePrompts,
    toggleFavoritePrompt,
    generationDraft,
    layoutPreferences,
    setGenerationDraft,
    setGenerateSectionCollapsed,
    advancedGeneration,
    updateAdvancedGeneration,
  } = useAppStore(useShallow(s => ({
    addJob: s.addJob,
    updateJob: s.updateJob,
    syncAssetsFromJobStatus: s.syncAssetsFromJobStatus,
    systemInfo: s.systemInfo,
    currentProject: s.currentProject,
    currentImageAssetPath: s.currentImageAssetPath,
    projects: s.projects,
    activeProjectId: s.activeProjectId,
    activeSceneId: s.activeSceneId,
    activeTimelineSequenceId: s.activeTimelineSequenceId,
    activeTimelineClipId: s.activeTimelineClipId,
    referenceSets: s.referenceSets,
    mediaAssets: s.mediaAssets,
    timelineSequences: s.timelineSequences,
    timelineTracks: s.timelineTracks,
    timelineClips: s.timelineClips,
    clipGenerationBindings: s.clipGenerationBindings,
    addToPromptHistory: s.addToPromptHistory,
    favoritePrompts: s.favoritePrompts,
    toggleFavoritePrompt: s.toggleFavoritePrompt,
    generationDraft: s.generationDraft,
    layoutPreferences: s.layoutPreferences,
    setGenerationDraft: s.setGenerationDraft,
    setGenerateSectionCollapsed: s.setGenerateSectionCollapsed,
    advancedGeneration: s.advancedGeneration,
    updateAdvancedGeneration: s.updateAdvancedGeneration,
  })));

  const { reduced, transition } = useMotionConfig();

  const pollingTimeoutRef = useRef<ReturnType<typeof setTimeout>>(null);
  const isGeneratingRef = useRef(false);

  const [showHistory, setShowHistory] = useState(false);
  const [activeAccount, setActiveAccount] = useState<UserAccountSummary | null>(null);
  const [genStatus, setGenStatus] = useState({
    isGenerating: false,
    progress: 0,
    step: 0,
    status: 'idle' as 'idle' | 'generating' | 'success' | 'error',
    errorMessage: '',
    activeJobId: null as string | null,
  });
  const updateGenStatus = (patch: Partial<typeof genStatus>) =>
    setGenStatus((prev) => ({ ...prev, ...patch }));

  const [imageConfig, setImageConfig] = useState({
    generationType: 'image' as GenerationType,
    prompt: '',
    negativePrompt: '',
    model: 'flux-dev',
    activeStylePresets: [] as string[],
    videoModel: 'ltx-video',
  });
  const updateImageConfig = (patch: Partial<typeof imageConfig>) => {
    setImageConfig((prev) => ({ ...prev, ...patch }));
    if (patch.generationType) {
      updateAdvancedGeneration({ generationType: patch.generationType });
    }
  };

  const { aspectRatio, resolutionTier, customWidth, customHeight } = useAppStore(useShallow(s => ({
    aspectRatio: s.aspectRatio,
    resolutionTier: s.resolutionTier,
    customWidth: s.customWidth,
    customHeight: s.customHeight,
  })));
  const dimensions = computeDimensions(aspectRatio, resolutionTier, customWidth, customHeight);

  const { startFrameImage, endFrameImage, setStartFrameImage, setEndFrameImage } = useAppStore(
    useShallow(s => ({
      startFrameImage: s.startFrameImage,
      endFrameImage: s.endFrameImage,
      setStartFrameImage: s.setStartFrameImage,
      setEndFrameImage: s.setEndFrameImage,
    }))
  );

  const [refConfig, setRefConfig] = useState({
    denoisingStrength: 0.75,
    referenceMode: 'img2img' as 'img2img' | 'inpaint' | 'controlnet',
    controlNetConfig: DEFAULT_CONTROLNET as ControlNetConfig,
    loraConfigs: [] as LoRAConfig[],
  });
  const updateRefConfig = (patch: Partial<typeof refConfig>) =>
    setRefConfig((prev) => ({ ...prev, ...patch }));

  const activeProject = useMemo(
    () => projects.find((project) => project.id === activeProjectId) ?? null,
    [activeProjectId, projects],
  );
  const activeScene = useMemo(
    () => activeProject?.scenes.find((scene) => scene.id === activeSceneId) ?? null,
    [activeProject, activeSceneId],
  );
  const resolvedCanvasControlLayers = useMemo(
    () =>
      resolveCanvasControlLayers({
        scene: activeScene,
        mediaAssets,
        referenceSets,
        generationType: imageConfig.generationType,
        baseImagePath: currentImageAssetPath,
      }),
    [activeScene, currentImageAssetPath, imageConfig.generationType, mediaAssets, referenceSets],
  );
  const activeTimelineClip = useMemo(
    () => timelineClips.find((clip) => clip.id === activeTimelineClipId) ?? null,
    [activeTimelineClipId, timelineClips],
  );
  const activeTimelineTrack = useMemo(
    () =>
      activeTimelineClip
        ? timelineTracks.find((track) => track.id === activeTimelineClip.trackId) ?? null
        : null,
    [activeTimelineClip, timelineTracks],
  );
  const activeTimelineSequence = useMemo(
    () =>
      activeTimelineTrack
        ? timelineSequences.find((sequence) => sequence.id === activeTimelineTrack.sequenceId) ?? null
        : activeTimelineSequenceId
          ? timelineSequences.find((sequence) => sequence.id === activeTimelineSequenceId) ?? null
          : null,
    [activeTimelineSequenceId, activeTimelineTrack, timelineSequences],
  );
  const activeTimelineBinding = useMemo(
    () =>
      activeTimelineClip?.generationBindingId
        ? clipGenerationBindings.find((binding) => binding.id === activeTimelineClip.generationBindingId) ?? null
        : null,
    [activeTimelineClip, clipGenerationBindings],
  );
  const activeTimelineMediaAsset = useMemo(
    () =>
      activeTimelineClip
        ? mediaAssets.find((asset) => asset.id === activeTimelineClip.mediaAssetId) ?? null
        : null,
    [activeTimelineClip, mediaAssets],
  );
  const activeTimelineBindingSourceMedia = useMemo(() => {
    const sourceMediaAssetId = activeTimelineBinding?.settings.sourceMediaAssetId;
    if (typeof sourceMediaAssetId !== 'string') {
      return null;
    }

    return mediaAssets.find((asset) => asset.id === sourceMediaAssetId) ?? null;
  }, [activeTimelineBinding, mediaAssets]);
  const isTimelineTargetActive = Boolean(activeTimelineSequence);
  const adhocReferenceSet = useMemo(
    () => findScopedReferenceSet(referenceSets, 'adhoc', activeProjectId, activeSceneId, null),
    [activeProjectId, activeSceneId, referenceSets],
  );
  const sceneReferenceSet = useMemo(
    () =>
      activeScene
        ? findScopedReferenceSet(referenceSets, 'scene', activeProjectId, activeScene.id, null)
        : null,
    [activeProjectId, activeScene, referenceSets],
  );
  const projectReferenceSet = useMemo(
    () =>
      activeProject
        ? findScopedReferenceSet(referenceSets, 'project', activeProject.id, null, null)
        : null,
    [activeProject, referenceSets],
  );
  const {
    primaryReferenceImage,
    primaryReferenceLabel,
    totalReferenceItems,
    activeReferenceSetCount,
  } = useMemo(
    () =>
      resolveReferenceContext(
        imageConfig.generationType,
        [adhocReferenceSet, sceneReferenceSet, projectReferenceSet],
        mediaAssets,
      ),
    [
      adhocReferenceSet,
      imageConfig.generationType,
      mediaAssets,
      projectReferenceSet,
      sceneReferenceSet,
    ],
  );
  const selectedTimelineSourceImage = activeTimelineMediaAsset?.type === 'image'
    ? activeTimelineMediaAsset.path
    : activeTimelineBindingSourceMedia?.type === 'image'
      ? activeTimelineBindingSourceMedia.path
      : null;
  const selectedTimelineSourceLabel = activeTimelineMediaAsset?.type === 'image'
    ? activeTimelineMediaAsset.name
    : activeTimelineBindingSourceMedia?.type === 'image'
      ? activeTimelineBindingSourceMedia.name
      : null;
  const motionReferenceImage = selectedTimelineSourceImage ?? primaryReferenceImage;
  const motionReferenceLabel = selectedTimelineSourceLabel ?? primaryReferenceLabel;

  useEffect(() => {
    if (currentProject?.template) {
      const settings = currentProject.template.settings;
      updateImageConfig({
        model: settings.model,
        prompt: settings.prompt,
        negativePrompt: settings.negativePrompt,
      });
      updateAdvancedGeneration({
        steps: settings.steps,
        cfgScale: settings.cfgScale,
      });
    }
  }, [currentProject, updateAdvancedGeneration]);

  const syncActiveAccount = useCallback(async () => {
    if (!window.electron?.accounts?.list) {
      setActiveAccount(null);
      return null;
    }

    const snapshot = await window.electron.accounts.list();
    const nextActiveAccount = getActiveUserAccount(snapshot);
    setActiveAccount(nextActiveAccount);
    return nextActiveAccount;
  }, []);

  useEffect(() => {
    void syncActiveAccount().catch(() => {
      setActiveAccount(null);
    });
  }, [syncActiveAccount]);

  useEffect(() => {
    if (!generationDraft) {
      return;
    }

    updateImageConfig({
      generationType: generationDraft.generationType,
      prompt: generationDraft.prompt,
      negativePrompt: generationDraft.negativePrompt,
      ...(generationDraft.generationType === 'image'
        ? { model: generationDraft.model }
        : { videoModel: generationDraft.model }),
    });
    updateAdvancedGeneration({
      generationType: generationDraft.generationType,
      steps: generationDraft.steps,
      cfgScale: generationDraft.cfgScale,
      scheduler: generationDraft.scheduler,
      seed: generationDraft.seed,
    });

    setGenerationDraft(null);
  }, [generationDraft, setGenerationDraft, updateAdvancedGeneration]);

  useEffect(() => {
    if (genStatus.status !== 'error' || !genStatus.errorMessage) {
      return;
    }

    const nextErrorMessage = clearResolvedGenerationError(genStatus.errorMessage, {
      generationType: imageConfig.generationType,
      videoModel: imageConfig.videoModel,
      referenceImage: motionReferenceImage,
    });
    if (nextErrorMessage !== genStatus.errorMessage) {
      updateGenStatus({ errorMessage: nextErrorMessage, status: 'idle' });
    }
  }, [genStatus.errorMessage, genStatus.status, imageConfig.generationType, imageConfig.videoModel, motionReferenceImage]);

  const handleGenerate = async () => {
    if (!imageConfig.prompt.trim()) return;
    if (isGeneratingRef.current) return;
    isGeneratingRef.current = true;

    const latestActiveAccount =
      imageConfig.generationType === 'image' ? await syncActiveAccount() : activeAccount;
    const useOpenRouterImage =
      imageConfig.generationType === 'image' &&
      latestActiveAccount?.preferences.imageGenerationProvider === 'openrouter';
    const openRouterImageModel = latestActiveAccount?.preferences.openRouterImageModel.trim() ?? '';
    const requestedModelId =
      imageConfig.generationType === 'image'
        ? useOpenRouterImage
          ? openRouterImageModel
          : imageConfig.model
        : imageConfig.videoModel;
    const openRouterUnsupportedInputs =
      imageConfig.generationType === 'image' &&
      (resolvedCanvasControlLayers.visibleLayerCount > 0 ||
        resolvedCanvasControlLayers.controlnet.length > 0 ||
        resolvedCanvasControlLayers.referenceImages.length > 0 ||
        Boolean(resolvedCanvasControlLayers.inpaint) ||
        resolvedCanvasControlLayers.errors.length > 0);

    if (useOpenRouterImage && !latestActiveAccount?.openRouter.apiKeyStored) {
      updateGenStatus({
        status: 'error',
        errorMessage: 'OpenRouter is selected for still images, but no API key is stored for the active account.',
        isGenerating: false,
      });
      isGeneratingRef.current = false;
      return;
    }

    if (useOpenRouterImage && !openRouterImageModel) {
      updateGenStatus({
        status: 'error',
        errorMessage: 'Select an OpenRouter still-image model in Settings before generating.',
        isGenerating: false,
      });
      isGeneratingRef.current = false;
      return;
    }

    if (useOpenRouterImage && openRouterUnsupportedInputs) {
      updateGenStatus({
        status: 'error',
        errorMessage:
          'OpenRouter still-image routing currently supports prompt-only generations. Switch the active account back to Local for ControlNet, inpaint, or reference-image passes.',
        isGenerating: false,
      });
      isGeneratingRef.current = false;
      return;
    }

    if (!systemInfo.backendConnected && !useOpenRouterImage) {
      updateGenStatus({
        status: 'error',
        errorMessage: 'The AI backend is not running. Please restart the app or start the backend from Settings.',
        isGenerating: false,
      });
      isGeneratingRef.current = false;
      return;
    }

    updateGenStatus({
      isGenerating: true,
      status: 'generating',
      progress: 0,
      step: 0,
      errorMessage: '',
    });

    addToPromptHistory({
      id: crypto.randomUUID(),
      prompt: imageConfig.prompt.trim(),
      negativePrompt: imageConfig.negativePrompt.trim(),
      timestamp: new Date(),
      model: requestedModelId,
    });

    try {
      if (isTimelineTargetActive && activeTimelineSequence) {
        const result = await runTimelineClipGeneration({
          operation: 'generate',
          clipId: activeTimelineClip?.id ?? undefined,
          sequenceId: activeTimelineSequence.id,
          input: {
            prompt: imageConfig.prompt.trim(),
            negativePrompt: imageConfig.negativePrompt.trim(),
            generationType: imageConfig.generationType,
            model: requestedModelId,
            width: dimensions.width,
            height: dimensions.height,
            steps: advancedGeneration.steps,
            cfgScale: advancedGeneration.cfgScale,
            scheduler: advancedGeneration.scheduler,
            seed: advancedGeneration.seed,
            ...(imageConfig.generationType === 'video'
              ? {
                  duration: advancedGeneration.duration,
                  fps: advancedGeneration.fps,
                }
              : {}),
          },
          onStatusChange: updateGenStatus,
        });

        updateGenStatus({
          status: result.cancelled ? 'idle' : 'success',
          progress: result.cancelled ? genStatus.progress : 100,
          isGenerating: false,
          activeJobId: null,
        });
        isGeneratingRef.current = false;
        return;
      }

      const appSettings = await window.electron.settings.get();
      const userDataPath = await window.electron.app.getPath('userData');
      const outputRoot = resolveOutputRoot(appSettings.defaultOutputPath, userDataPath);

      if (imageConfig.generationType === 'image') {
        if (resolvedCanvasControlLayers.errors.length > 0) {
          throw new Error(resolvedCanvasControlLayers.errors[0]);
        }

        const imageRequest: ImageGenerationRequestPayload = {
          prompt: imageConfig.prompt.trim(),
          negative_prompt: imageConfig.negativePrompt.trim(),
          width: dimensions.width,
          height: dimensions.height,
          steps: advancedGeneration.steps,
          cfg_scale: advancedGeneration.cfgScale,
          seed: advancedGeneration.seed === -1 ? undefined : advancedGeneration.seed,
          model: useOpenRouterImage ? openRouterImageModel : imageConfig.model,
          scheduler: advancedGeneration.scheduler,
          ...(resolvedCanvasControlLayers.controlnet.length > 0
            ? { controlnet: resolvedCanvasControlLayers.controlnet }
            : {}),
          ...(resolvedCanvasControlLayers.referenceImages.length > 0
            ? { reference_images: resolvedCanvasControlLayers.referenceImages }
            : {}),
          ...(resolvedCanvasControlLayers.inpaint
            ? {
                image_path: resolvedCanvasControlLayers.inpaint.image_path,
                mask: resolvedCanvasControlLayers.inpaint.mask,
                inpaint: resolvedCanvasControlLayers.inpaint,
              }
            : {}),
        };

        const result = await window.electron.generation.generateImage(imageRequest);

        if (result.success && result.jobId) {
          updateGenStatus({ activeJobId: result.jobId });
          addJob({
            id: result.jobId,
            type: 'image',
            status: 'pending',
            progress: 0,
            params: {
              ...imageRequest,
              seed: advancedGeneration.seed,
              output_root: outputRoot,
            },
            createdAt: new Date(),
          });
          pollJobStatus(result.jobId);
        } else {
          throw new Error(result.error || 'Generation failed');
        }
      } else {
        if (imageConfig.videoModel === 'svd' && !motionReferenceImage) {
          throw new Error(SVD_REFERENCE_ERROR);
        }

        const result = await window.electron.generation.generateVideo({
          prompt: imageConfig.prompt.trim(),
          image_path: motionReferenceImage ?? undefined,
          width: dimensions.width,
          height: dimensions.height,
          duration: advancedGeneration.duration,
          fps: advancedGeneration.fps,
          steps: advancedGeneration.steps,
          model: imageConfig.videoModel,
          seed: advancedGeneration.seed === -1 ? undefined : advancedGeneration.seed,
        });

        if (result.success && result.jobId) {
          updateGenStatus({ activeJobId: result.jobId });
          addJob({
            id: result.jobId,
            type: 'video',
            status: 'pending',
            progress: 0,
            params: {
              prompt: imageConfig.prompt.trim(),
              width: dimensions.width,
              height: dimensions.height,
              duration: advancedGeneration.duration,
              fps: advancedGeneration.fps,
              steps: advancedGeneration.steps,
              model: imageConfig.videoModel,
              seed: advancedGeneration.seed,
              output_root: outputRoot,
            },
            createdAt: new Date(),
          });
          pollJobStatus(result.jobId);
        } else {
          throw new Error(result.error || 'Generation failed');
        }
      }
    } catch (error: unknown) {
      console.error('Generation error:', error);
      const message = error instanceof Error ? error.message : 'Generation failed';
      updateGenStatus({
        status: 'error',
        errorMessage: message,
        isGenerating: false,
        activeJobId: null,
      });
      isGeneratingRef.current = false;
    }
  };

  const pollJobStatus = useCallback(async (jobId: string) => {
    const checkStatus = async () => {
      try {
        const status = await window.electron.generation.getStatus(jobId);
        if (status.status === 'completed') {
          const existingJob = useAppStore.getState().activeJobs.find((job) => job.id === jobId);
          const completedAt = status.completed_at
            ? new Date(status.completed_at)
            : new Date();

          updateJob(jobId, {
            status: 'completed',
            progress: status.progress ?? 100,
            result: status.result,
            error: status.error,
            completedAt,
          });

          syncAssetsFromJobStatus({
            ...status,
            params: {
              ...(existingJob?.params ?? {}),
              output_root:
                typeof existingJob?.params?.output_root === 'string'
                  ? existingJob.params.output_root
                  : resolveOutputRoot(
                      (await window.electron.settings.get()).defaultOutputPath,
                      await window.electron.app.getPath('userData')
                    ),
            },
          });
          await window.electron.notifications.notify('generation_complete', {
            title: `${imageConfig.generationType === 'image' ? 'Image' : 'Video'} Ready`,
            body: imageConfig.prompt.trim().slice(0, 120) || 'Generation completed successfully.',
          });
          updateGenStatus({
            status: 'success',
            progress: 100,
            isGenerating: false,
            activeJobId: null,
          });
          isGeneratingRef.current = false;
        } else if (status.status === 'failed') {
          updateJob(jobId, {
            status: 'failed',
            progress: status.progress ?? 0,
            error: status.error,
            completedAt: status.completed_at ? new Date(status.completed_at) : new Date(),
          });
          await window.electron.notifications.notify('generation_failed', {
            title: `${imageConfig.generationType === 'image' ? 'Image' : 'Video'} Failed`,
            body: status.error || 'Generation failed.',
          });
          updateGenStatus({
            status: 'error',
            errorMessage: status.error || 'Generation failed',
            isGenerating: false,
            activeJobId: null,
          });
          isGeneratingRef.current = false;
        } else {
          updateJob(jobId, {
            status: status.status,
            progress: status.progress ?? 0,
          });
          const progressPatch: Partial<typeof genStatus> = {};
          if (status.progress !== undefined) {
            progressPatch.progress = status.progress;
          }
          if (status.step !== undefined) {
            progressPatch.step = status.step;
          }
          if (Object.keys(progressPatch).length > 0) {
            updateGenStatus(progressPatch);
          }
          pollingTimeoutRef.current = setTimeout(checkStatus, 1000);
        }
      } catch (error) {
        console.error('Failed to get job status:', error);
        pollingTimeoutRef.current = setTimeout(checkStatus, 2000);
      }
    };

    checkStatus();
  }, [imageConfig.generationType, imageConfig.prompt, syncAssetsFromJobStatus, updateJob]);

  const handleCancel = () => {
    if (genStatus.activeJobId) {
      window.electron.generation.cancel(genStatus.activeJobId);
    }
    if (pollingTimeoutRef.current) {
      clearTimeout(pollingTimeoutRef.current);
      pollingTimeoutRef.current = null;
    }
    updateGenStatus({
      isGenerating: false,
      status: 'idle',
      activeJobId: null,
    });
    isGeneratingRef.current = false;
  };

  useEffect(() => {
    return () => {
      if (pollingTimeoutRef.current) {
        clearTimeout(pollingTimeoutRef.current);
      }
    };
  }, []);

  const handleRandomPrompt = () => {
    const idx = Math.floor(Math.random() * RANDOM_PROMPTS.length);
    updateImageConfig({ prompt: RANDOM_PROMPTS[idx] });
  };

  const handleEnhancePrompt = async () => {
    if (!imageConfig.prompt.trim()) {
      return;
    }

    const result = await window.electron.generation.enhancePrompt({
      prompt: imageConfig.prompt.trim(),
      mode: 'clarify',
    });

    if (result.error) {
      updateGenStatus({
        status: 'error',
        errorMessage: result.error,
      });
      return;
    }

    if (result.prompt) {
      updateImageConfig({ prompt: result.prompt });
    } else if (result.variations?.length) {
      updateImageConfig({ prompt: result.variations[0] });
    }
  };

  const handleToggleStylePreset = (presetId: string, modifier: string) => {
    if (imageConfig.activeStylePresets.includes(presetId)) {
      updateImageConfig({
        activeStylePresets: imageConfig.activeStylePresets.filter((id) => id !== presetId),
        prompt: imageConfig.prompt.replace(`, ${modifier}`, '').replace(modifier, '').trim(),
      });
    } else {
      updateImageConfig({
        activeStylePresets: [...imageConfig.activeStylePresets, presetId],
        prompt: imageConfig.prompt ? `${imageConfig.prompt}, ${modifier}` : modifier,
      });
    }
  };

  const isGpuAvailable = systemInfo.gpuAvailable;
  const isFavorited = favoritePrompts.includes(imageConfig.prompt.trim());
  const openRouterImageEnabled =
    imageConfig.generationType === 'image' &&
    activeAccount?.preferences.imageGenerationProvider === 'openrouter';
  const openRouterImageModel = activeAccount?.preferences.openRouterImageModel.trim() ?? '';
  const openRouterImageWarning = openRouterImageEnabled
    ? !activeAccount?.openRouter.apiKeyStored
      ? 'OpenRouter is selected for still images, but no API key is stored for the active account.'
      : !openRouterImageModel
        ? 'Select an OpenRouter still-image model in Settings before generating.'
        : resolvedCanvasControlLayers.visibleLayerCount > 0 ||
            resolvedCanvasControlLayers.controlnet.length > 0 ||
            resolvedCanvasControlLayers.referenceImages.length > 0 ||
            Boolean(resolvedCanvasControlLayers.inpaint) ||
            resolvedCanvasControlLayers.errors.length > 0
          ? 'OpenRouter still-image routing currently supports prompt-only generations. Switch the active account back to Local for ControlNet, inpaint, or reference-image passes.'
          : null
    : null;
  const currentModel = imageConfig.generationType === 'image'
    ? openRouterImageEnabled
      ? openRouterImageModel || 'OpenRouter model not set'
      : imageConfig.model
    : imageConfig.videoModel;
  const videoModelRequiresReference = imageConfig.generationType === 'video' && imageConfig.videoModel === 'svd';
  const estimatedDuration = imageConfig.generationType === 'image'
    ? openRouterImageEnabled
      ? '30-90s'
      : '15-30s'
    : '2-5min';
  const collapsedGenerateSections = layoutPreferences.collapsedGenerateSections;

  const isGenerateSectionCollapsed = useCallback(
    (sectionId: GenerateCollapsibleSectionId) => collapsedGenerateSections.includes(sectionId),
    [collapsedGenerateSections],
  );

  const toggleGenerateSection = useCallback(
    (sectionId: GenerateCollapsibleSectionId) => {
      setGenerateSectionCollapsed(sectionId, !collapsedGenerateSections.includes(sectionId));
    },
    [collapsedGenerateSections, setGenerateSectionCollapsed],
  );

  const referenceSummary = totalReferenceItems > 0
    ? `${totalReferenceItems} reference image${totalReferenceItems === 1 ? '' : 's'} across ${activeReferenceSetCount} set${activeReferenceSetCount === 1 ? '' : 's'}${motionReferenceLabel ? `, primary ${motionReferenceLabel}` : ''}`
    : selectedTimelineSourceImage
      ? `Timeline source ready${selectedTimelineSourceLabel ? `: ${selectedTimelineSourceLabel}` : ''}`
      : videoModelRequiresReference
        ? 'Reference image required for Stable Video Diffusion'
        : 'No reference media attached';
  const controlLayersSummary = resolvedCanvasControlLayers.visibleLayerCount > 0
    ? `${resolvedCanvasControlLayers.visibleLayerCount} canvas layer${resolvedCanvasControlLayers.visibleLayerCount === 1 ? '' : 's'}, ${resolvedCanvasControlLayers.controlnet.length} ControlNet, ${resolvedCanvasControlLayers.referenceImages.length} reference${resolvedCanvasControlLayers.referenceImages.length === 1 ? '' : 's'}${resolvedCanvasControlLayers.inpaint ? ', inpaint ready' : ''}${resolvedCanvasControlLayers.errors.length > 0 ? ', action needed' : ''}, ${refConfig.loraConfigs.length} LoRA${refConfig.loraConfigs.length === 1 ? '' : 's'}`
    : `${refConfig.controlNetConfig.enabled ? 'ControlNet on' : 'ControlNet off'}, ${refConfig.loraConfigs.length} LoRA${refConfig.loraConfigs.length === 1 ? '' : 's'}`;
  const advancedSummary = imageConfig.generationType === 'image'
    ? `${advancedGeneration.steps} steps, CFG ${advancedGeneration.cfgScale}, ${advancedGeneration.scheduler}`
    : `${advancedGeneration.duration}s duration, ${advancedGeneration.fps} fps`;
  const timelineTargetSummary = activeTimelineClip
    ? `${activeTimelineClip.label} on ${activeTimelineTrack?.name ?? 'timeline'}${activeTimelineBinding ? ', AI-bound clip' : ', new variant target'}`
    : activeTimelineSequence
      ? `Append to ${activeTimelineSequence.name}`
      : null;
  const footerWarning = !systemInfo.backendConnected
    ? openRouterImageEnabled
      ? openRouterImageWarning
      : 'Backend offline. Start it from Settings before generating.'
    : openRouterImageEnabled
      ? openRouterImageWarning
      : imageConfig.generationType === 'image' && resolvedCanvasControlLayers.errors.length > 0
        ? resolvedCanvasControlLayers.errors[0]
        : videoModelRequiresReference && !motionReferenceImage
          ? 'Stable Video Diffusion requires a reference image.'
          : null;
  const footerStatusLabel = genStatus.isGenerating
    ? `Generating ${imageConfig.generationType}`
    : activeTimelineClip
      ? `Ready to generate a timeline ${imageConfig.generationType} variant`
      : activeTimelineSequence
        ? `Ready to generate ${imageConfig.generationType} to the timeline`
        : openRouterImageEnabled
          ? 'Ready to generate image with OpenRouter'
        : `Ready to generate ${imageConfig.generationType}`;
  const footerMeta = `${currentModel} / ${dimensions.width} x ${dimensions.height}`;
  const footerSupportMeta = [
    openRouterImageEnabled ? 'OpenRouter BYOK' : `${isGpuAvailable ? 'GPU' : 'CPU'} mode`,
    `~${estimatedDuration}`,
    genStatus.isGenerating && !openRouterImageEnabled
      ? `Step ${Math.max(genStatus.step, 1)}/${advancedGeneration.steps}`
      : null,
  ].filter(Boolean).join(' / ');
  const generateActionLabel = activeTimelineClip
    ? 'Generate Clip Variant'
    : activeTimelineSequence
      ? 'Generate To Timeline'
      : `Generate ${imageConfig.generationType === 'image' ? 'Image' : 'Video'}`;
  const successMessage = activeTimelineSequence
    ? 'Generation completed and the result is attached to the timeline.'
    : 'Generation completed. Review the result in the gallery or assets panel.';

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-panel" data-testid="generate-panel">
      <h1 className="sr-only">Generate</h1>

      <div className="border-b border-border bg-panel px-3 py-3">
        <div className="rounded-xl border border-border bg-surface px-3 py-3 shadow-cinematic">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div>
              <p className="type-section text-text-primary">Workflow</p>
              <p className="mt-1 type-caption">Choose the generation lane before you tune the rest of the pass.</p>
            </div>
            <span className="rounded-full border border-border bg-elevated px-2 py-0.5 type-caption text-text-body">
              {imageConfig.generationType === 'image' ? 'Still' : 'Motion'}
            </span>
          </div>

          <div className="relative flex rounded-md border border-border bg-canvas p-1">
            <motion.div
              layoutId="modeGlow"
              className="absolute top-1 bottom-1 rounded-md border border-accent-primary-border bg-accent-primary-muted"
              style={{ width: 'calc(50% - 4px)' }}
              animate={{
                x: imageConfig.generationType === 'image' ? 0 : 'calc(100% + 4px)',
              }}
              transition={reduced ? { duration: 0 } : { type: 'spring', stiffness: 400, damping: 30 }}
            />
            <button
              type="button"
              onClick={() => updateImageConfig({ generationType: 'image' })}
              className={cn(
                'relative z-10 flex flex-1 items-center justify-center gap-2 rounded-md py-2 transition-colors',
                imageConfig.generationType === 'image'
                  ? 'text-accent-primary'
                  : 'text-text-muted hover:text-text-body'
              )}
            >
              <ImageIcon className="h-4 w-4" />
              <span className="type-section">Image</span>
            </button>
            <button
              type="button"
              onClick={() => updateImageConfig({ generationType: 'video' })}
              className={cn(
                'relative z-10 flex flex-1 items-center justify-center gap-2 rounded-md py-2 transition-colors',
                imageConfig.generationType === 'video'
                  ? 'text-accent-primary'
                  : 'text-text-muted hover:text-text-body'
              )}
            >
              <Film className="h-4 w-4" />
              <span className="type-section">Video</span>
            </button>
          </div>
        </div>
      </div>

      <div className="h-0 flex-1 overflow-y-scroll p-4 space-y-4">
        <GenerateSectionCard
          sectionId="prompt"
          title="Prompt"
          description="Set the creative direction first, then keep your negative prompt close for cleanup passes."
          icon={Wand2}
          badge={imageConfig.generationType === 'image' ? 'Image' : 'Video'}
        >
          <div className="relative">
            <PromptArea
              prompt={imageConfig.prompt}
              onPromptChange={(value) => updateImageConfig({ prompt: value })}
              negativePrompt={imageConfig.negativePrompt}
              onNegativePromptChange={(value) => updateImageConfig({ negativePrompt: value })}
              generationType={imageConfig.generationType}
              isFavorited={isFavorited}
              onRandomize={handleRandomPrompt}
              onEnhance={handleEnhancePrompt}
              onShowHistory={() => setShowHistory(!showHistory)}
              onToggleFavorite={() => toggleFavoritePrompt(imageConfig.prompt.trim())}
            />
            <PromptHistory
              isOpen={showHistory}
              onClose={() => setShowHistory(false)}
              onSelectPrompt={(prompt, negativePrompt) => {
                updateImageConfig({ prompt, negativePrompt });
                setShowHistory(false);
              }}
            />
          </div>
        </GenerateSectionCard>

        <GenerateSectionCard
          sectionId="style-model"
          title="Style + Model"
          description="Pick the visual treatment and runtime profile for this pass before you add heavier control layers."
          icon={SlidersHorizontal}
        >
          <div className="space-y-4">
            <StylePresetsBar
              activePresets={imageConfig.activeStylePresets}
              onTogglePreset={handleToggleStylePreset}
            />

            <div className="space-y-3">
              <div>
                <label className="text-label text-text-body">Model Router</label>
                <p className="mt-1 text-xs text-text-muted">
                  {openRouterImageEnabled
                    ? 'The active account is routing still images through OpenRouter. Local advanced canvas controls stay on the Local provider.'
                    : 'Pick the capability, runtime, and hardware profile for this generation.'}
                </p>
              </div>
              {openRouterImageEnabled ? (
                <div className="rounded-lg border border-accent-primary-border bg-accent-primary-muted/40 px-4 py-4">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg border border-accent-primary-border bg-surface text-accent-primary">
                      <Cloud className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 space-y-2">
                      <div>
                        <p className="type-section text-text-primary">OpenRouter Still Image Route</p>
                        <p className="mt-1 text-xs text-text-body">
                          Account: {activeAccount?.name ?? 'No active account'}.
                          {' '}Model: {openRouterImageModel || 'Not set in Settings'}.
                        </p>
                      </div>
                      <p className="text-xs text-text-muted">
                        Prompt, negative prompt, aspect ratio, and seed flow through OpenRouter.
                        ControlNet, inpaint, and canvas-guided passes remain local-only for now.
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <ModelSelector
                  value={currentModel}
                  onChange={(id) => {
                    if (imageConfig.generationType === 'image') updateImageConfig({ model: id });
                    else updateImageConfig({ videoModel: id });
                  }}
                  generationType={imageConfig.generationType}
                />
              )}
            </div>
          </div>
        </GenerateSectionCard>

        <GenerateSectionCard
          sectionId="reference-inputs"
          title="Reference Inputs"
          description="Attach reusable guide media for the current pass, the active scene, and the broader board."
          summary={referenceSummary}
          icon={ImagePlus}
          collapsible
          collapsed={isGenerateSectionCollapsed('reference-inputs')}
          onToggle={() => toggleGenerateSection('reference-inputs')}
        >
          <div className="space-y-4">
            <ReferenceMediaPanel
              testId="generate-run-reference-panel"
              title="Current Run"
              description="Prompt-specific references that travel with this generation pass."
              scope="adhoc"
              projectId={activeProjectId}
              sceneId={activeSceneId}
              preferredSlots={
                imageConfig.generationType === 'video'
                  ? ['motion', 'composition', 'character', 'style', 'pose']
                  : ['composition', 'style', 'character', 'pose', 'motion']
              }
            />

            {activeScene ? (
              <ReferenceMediaPanel
                testId="generate-scene-reference-panel"
                title={`${activeScene.name} Scene References`}
                description="Shot-specific references that should stay attached to the selected scene."
                scope="scene"
                projectId={activeProjectId}
                sceneId={activeScene.id}
              />
            ) : null}

            {activeProject ? (
              <ReferenceMediaPanel
                testId="generate-project-reference-panel"
                title={`${activeProject.name} Board References`}
                description="Board-level references that set shared style, character, and composition language."
                scope="project"
                projectId={activeProject.id}
              />
            ) : null}

            {imageConfig.generationType === 'image' ? (
              <div className="grid gap-3 rounded-lg border border-border bg-elevated px-3 py-3 md:grid-cols-2">
                <label className="space-y-1.5">
                  <span className="type-caption text-text-muted">Reference routing</span>
                  <select
                    value={refConfig.referenceMode}
                    onChange={(event) =>
                      updateRefConfig({
                        referenceMode: event.target.value as 'img2img' | 'inpaint' | 'controlnet',
                      })
                    }
                    className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary"
                  >
                    <option value="img2img">Img2Img</option>
                    <option value="inpaint">Inpaint</option>
                    <option value="controlnet">ControlNet</option>
                  </select>
                </label>

                <label className="space-y-1.5">
                  <span className="type-caption text-text-muted">
                    Denoising strength {refConfig.denoisingStrength.toFixed(2)}
                  </span>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={refConfig.denoisingStrength}
                    onChange={(event) =>
                      updateRefConfig({ denoisingStrength: Number(event.target.value) })
                    }
                    className="w-full accent-accent-primary"
                  />
                </label>
              </div>
            ) : (
              <div className="rounded-lg border border-border bg-elevated px-3 py-3 text-sm text-text-body">
                {motionReferenceImage
                  ? `Primary motion reference ready${motionReferenceLabel ? `: ${motionReferenceLabel}` : ''}.`
                  : 'Attach at least one reference image when you need shot continuity or motion steering.'}
              </div>
            )}

            {videoModelRequiresReference && !motionReferenceImage && (
              <div className="rounded-lg border border-status-warning-border bg-status-warning-muted px-3 py-2 text-xs text-status-warning">
                Stable Video Diffusion requires a reference image before launch.
              </div>
            )}
          </div>
        </GenerateSectionCard>

        {imageConfig.generationType === 'video' && (
          <GenerateSectionCard
            sectionId="motion"
            title="Motion"
            description="Set the timing and frame anchors for motion generation so the run stays bounded."
            icon={Clapperboard}
          >
            <div className="space-y-4">
              <CompactImageDropZone
                label="Start Frame"
                image={startFrameImage}
                onImageChange={setStartFrameImage}
              />
              <CompactImageDropZone
                label="End Frame"
                image={endFrameImage}
                onImageChange={setEndFrameImage}
              />
              <VideoControls />
            </div>
          </GenerateSectionCard>
        )}

        {imageConfig.generationType === 'image' && (
          <GenerateSectionCard
            sectionId="control-layers"
            title="Control Layers"
            description="Layer structural guidance and LoRAs only when the base prompt is already close."
            summary={controlLayersSummary}
            icon={Layers3}
            collapsible
            collapsed={isGenerateSectionCollapsed('control-layers')}
            onToggle={() => toggleGenerateSection('control-layers')}
          >
            <div className="space-y-4">
              <ControlNetPanel
                config={refConfig.controlNetConfig}
                onChange={(value) => updateRefConfig({ controlNetConfig: value })}
              />
              <LoRAMixer
                configs={refConfig.loraConfigs}
                onChange={(value) => updateRefConfig({ loraConfigs: value })}
              />
            </div>
          </GenerateSectionCard>
        )}

        <GenerateSectionCard
          sectionId="output"
          title="Output"
          description="Dial the frame and expected runtime before you send the job."
          summary={`${dimensions.width} x ${dimensions.height}, ${estimatedDuration}, ${isGpuAvailable ? 'GPU' : 'CPU'} mode`}
          icon={Frame}
        >
          <div className="space-y-4">
            <AspectRatioPicker />

            <div className="rounded-lg border border-border bg-elevated px-3 py-3">
              <div className="flex flex-wrap items-center gap-4 type-ui text-text-body">
                <div className="flex items-center gap-2">
                  <Frame className="h-3.5 w-3.5" />
                  <span>{dimensions.width} x {dimensions.height}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="h-3.5 w-3.5" />
                  <span>~{estimatedDuration}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Zap className="h-3.5 w-3.5" />
                  <span>{isGpuAvailable ? 'GPU Accelerated' : 'CPU Mode'}</span>
                </div>
              </div>
            </div>
          </div>
        </GenerateSectionCard>

        <GenerateSectionCard
          sectionId="advanced"
          title="Advanced"
          description="Tune sampler behavior, seed, and video timing only when the default pass is not enough."
          summary={advancedSummary}
          icon={Settings2}
          collapsible
          collapsed={isGenerateSectionCollapsed('advanced')}
          onToggle={() => toggleGenerateSection('advanced')}
        >
          <AdvancedGenerationSettings />
        </GenerateSectionCard>

        {genStatus.status === 'error' && (
          <motion.div
            initial={reduced ? {} : { opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={transition}
            className="flex items-start gap-2 rounded-lg border border-status-error-border bg-status-error-muted p-3"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-status-error" />
            <p className="text-xs text-status-error">{genStatus.errorMessage}</p>
          </motion.div>
        )}

        {genStatus.status === 'success' && (
          <motion.div
            initial={reduced ? {} : { opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={transition}
            className="flex items-start gap-2 rounded-lg border border-status-success-border bg-status-success-muted p-3"
          >
            <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-status-success" />
            <p className="text-xs text-status-success">
              {successMessage}
            </p>
          </motion.div>
        )}
      </div>

      <div className="border-t border-border bg-panel p-4">
        <div
          data-testid="generate-preflight-summary"
          className="mb-3 rounded-lg border border-border bg-surface px-3 py-3"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="type-caption">{footerStatusLabel}</p>
              <p className="truncate type-section text-text-primary">{footerMeta}</p>
            </div>
            <span className="rounded-full border border-border bg-elevated px-2 py-0.5 type-caption text-text-body">
              {imageConfig.generationType === 'image' ? 'Image' : 'Video'}
            </span>
          </div>
          <p className="mt-2 type-caption text-text-body">{footerSupportMeta}</p>
          {timelineTargetSummary ? (
            <p data-testid="generate-target-summary" className="mt-2 text-xs text-text-body">
              Target: {timelineTargetSummary}
            </p>
          ) : null}
          {footerWarning && (
            <p data-testid="generate-preflight-warning" className="mt-2 text-xs text-status-warning">
              {footerWarning}
            </p>
          )}
        </div>

        <AnimatePresence mode="wait">
          {genStatus.isGenerating ? (
            <motion.div
              key="progress"
              data-testid="generation-progress"
              initial={reduced ? {} : { opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={reduced ? {} : { opacity: 0, scale: 0.98 }}
              transition={transition}
              className="relative overflow-hidden rounded-md border border-border bg-elevated"
            >
              <motion.div
                className="absolute inset-y-0 left-0 rounded-md"
                role="progressbar"
                aria-valuenow={Math.round(genStatus.progress)}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Generation progress"
                initial={{ width: 0 }}
                animate={{ width: `${genStatus.progress}%` }}
                transition={{ duration: 0.3, ease: 'easeOut' }}
                style={{
                  background: 'linear-gradient(90deg, var(--color-gradient-progress-start), var(--color-gradient-progress-end))',
                  boxShadow:
                    '0 0 12px var(--color-accent-primary-glow), inset 0 1px 0 var(--color-border-hover)',
                }}
              />

              <div className="relative flex items-center justify-between px-4 py-3.5">
                <div className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin text-text-primary" />
                  <span className="type-section">
                    Step {genStatus.step}/{advancedGeneration.steps}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={handleCancel}
                  disabled={!genStatus.isGenerating}
                  className="flex items-center gap-2 rounded-md bg-void/40 px-3 py-1 type-ui text-text-body transition-all hover:bg-void/60 hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-30"
                >
                  <X className="h-3 w-3" />
                  Cancel
                </button>

                <span className="type-section">{Math.round(genStatus.progress)}%</span>
              </div>
            </motion.div>
          ) : (
            <motion.button
              key="generate"
              type="button"
              data-testid="generate-button"
              initial={reduced ? {} : { opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={reduced ? {} : { opacity: 0, scale: 0.98 }}
              transition={transition}
              onClick={handleGenerate}
              disabled={!imageConfig.prompt.trim()}
              className={cn(
                'flex w-full items-center justify-center gap-2.5 rounded-md py-3.5 type-section transition-all',
                imageConfig.prompt.trim()
                  ? 'bg-accent-primary text-void shadow-accent hover:bg-accent-primary-hover active:scale-[0.995] active:bg-accent-primary-pressed hover:scale-[1.005]'
                  : 'cursor-not-allowed bg-elevated text-text-muted opacity-40'
              )}
            >
              <Wand2 className="h-4.5 w-4.5" />
              {generateActionLabel}
            </motion.button>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
