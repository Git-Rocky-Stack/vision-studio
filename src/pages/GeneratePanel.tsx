import { useState, useEffect, useRef, useCallback } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { cn } from '@/utils/cn';
import { useAppStore } from '@/store/appStore';
import { PromptArea } from '@/components/generate/PromptArea';
import { StylePresetsBar } from '@/components/generate/StylePresetsBar';
import { ModelSelector } from '@/components/generate/ModelSelector';
import { AdvancedGenerationSettings } from '@/components/generate/AdvancedGenerationSettings';
import { ImageDropZone } from '@/components/generate/ImageDropZone';
import { ControlNetPanel } from '@/components/generate/ControlNetPanel';
import { LoRAMixer } from '@/components/generate/LoRAMixer';
import { PromptHistory } from '@/components/generate/PromptHistory';
import { AspectRatioPicker } from '@/components/generate/AspectRatioPicker';
import { CompactImageDropZone } from '@/components/generate/CompactImageDropZone';
import { VideoControls } from '@/components/generate/VideoControls';
import { computeDimensions } from '@/types/resolution';
import {
  clearResolvedGenerationError,
  SVD_REFERENCE_ERROR,
} from '@/features/generate/validation';
import type { ControlNetConfig, LoRAConfig } from '@/types/generation';
import {
  Wand2,
  Image as ImageIcon,
  Film,
  Zap,
  Clock,
  Loader2,
  AlertCircle,
  Check,
  X,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
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

export function GeneratePanel() {
  const {
    addJob,
    updateJob,
    syncAssetsFromJobStatus,
    systemInfo,
    currentProject,
    addToPromptHistory,
    favoritePrompts,
    toggleFavoritePrompt,
    generationDraft,
    setGenerationDraft,
    advancedGeneration,
    updateAdvancedGeneration,
  } = useAppStore(useShallow(s => ({
    addJob: s.addJob,
    updateJob: s.updateJob,
    syncAssetsFromJobStatus: s.syncAssetsFromJobStatus,
    systemInfo: s.systemInfo,
    currentProject: s.currentProject,
    addToPromptHistory: s.addToPromptHistory,
    favoritePrompts: s.favoritePrompts,
    toggleFavoritePrompt: s.toggleFavoritePrompt,
    generationDraft: s.generationDraft,
    setGenerationDraft: s.setGenerationDraft,
    advancedGeneration: s.advancedGeneration,
    updateAdvancedGeneration: s.updateAdvancedGeneration,
  })));

  const { reduced, transition, scaleIn, fadeIn } = useMotionConfig();

  // Polling cleanup ref
  const pollingTimeoutRef = useRef<ReturnType<typeof setTimeout>>(null);
  const isGeneratingRef = useRef(false);

  // UI toggles
  const [showHistory, setShowHistory] = useState(false);

  // Generation status state (consolidated)
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

  // Image generation config (basic settings - advanced settings are in store)
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
    // Sync generationType to the store so the sidebar Advanced Settings knows
    if (patch.generationType) {
      updateAdvancedGeneration({ generationType: patch.generationType });
    }
  };

  // Resolution dimensions from store
  const { aspectRatio, resolutionTier, customWidth, customHeight } = useAppStore(useShallow(s => ({
    aspectRatio: s.aspectRatio,
    resolutionTier: s.resolutionTier,
    customWidth: s.customWidth,
    customHeight: s.customHeight,
  })));
  const dimensions = computeDimensions(aspectRatio, resolutionTier, customWidth, customHeight);

  // Video generation state
  const {
    generationMode,
    setGenerationMode,
    startFrameImage,
    endFrameImage,
    setStartFrameImage,
    setEndFrameImage,
  } = useAppStore(useShallow(s => ({
    generationMode: s.generationMode,
    setGenerationMode: s.setGenerationMode,
    startFrameImage: s.startFrameImage,
    endFrameImage: s.endFrameImage,
    setStartFrameImage: s.setStartFrameImage,
    setEndFrameImage: s.setEndFrameImage,
  })));

  // Reference image / ControlNet / LoRA config (consolidated)
  const [refConfig, setRefConfig] = useState({
    referenceImage: null as string | null,
    denoisingStrength: 0.75,
    referenceMode: 'img2img' as 'img2img' | 'inpaint' | 'controlnet',
    controlNetConfig: DEFAULT_CONTROLNET as ControlNetConfig,
    loraConfigs: [] as LoRAConfig[],
  });
  const updateRefConfig = (patch: Partial<typeof refConfig>) =>
    setRefConfig((prev) => ({ ...prev, ...patch }));

  // Load template settings if project has one
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
  }, [currentProject]);

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
  }, [generationDraft, setGenerationDraft]);

  useEffect(() => {
    if (genStatus.status !== 'error' || !genStatus.errorMessage) {
      return;
    }

    const nextErrorMessage = clearResolvedGenerationError(genStatus.errorMessage, {
      generationType: imageConfig.generationType,
      videoModel: imageConfig.videoModel,
      referenceImage: refConfig.referenceImage,
    });
    if (nextErrorMessage !== genStatus.errorMessage) {
      updateGenStatus({ errorMessage: nextErrorMessage, status: 'idle' });
    }
  }, [genStatus.errorMessage, genStatus.status, imageConfig.generationType, refConfig.referenceImage, imageConfig.videoModel]);

  const handleGenerate = async () => {
    if (!imageConfig.prompt.trim()) return;
    if (isGeneratingRef.current) return;
    isGeneratingRef.current = true;

    // Guard: backend must be connected to generate
    if (!systemInfo.backendConnected) {
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

    // Save to history
    addToPromptHistory({
      id: crypto.randomUUID(),
      prompt: imageConfig.prompt.trim(),
      negativePrompt: imageConfig.negativePrompt.trim(),
      timestamp: new Date(),
      model: imageConfig.generationType === 'image' ? imageConfig.model : imageConfig.videoModel,
    });

    try {
      const appSettings = await window.electron.settings.get();
      const userDataPath = await window.electron.app.getPath('userData');
      const outputRoot = resolveOutputRoot(appSettings.defaultOutputPath, userDataPath);

      if (imageConfig.generationType === 'image') {
        const result = await window.electron.generation.generateImage({
          prompt: imageConfig.prompt.trim(),
          negative_prompt: imageConfig.negativePrompt.trim(),
          width: dimensions.width,
          height: dimensions.height,
          steps: advancedGeneration.steps,
          cfg_scale: advancedGeneration.cfgScale,
          seed: advancedGeneration.seed === -1 ? undefined : advancedGeneration.seed,
          model: imageConfig.model,
          scheduler: advancedGeneration.scheduler,
        });

        if (result.success && result.jobId) {
          updateGenStatus({ activeJobId: result.jobId });
          addJob({
            id: result.jobId,
            type: 'image',
            status: 'pending',
            progress: 0,
            params: {
              prompt: imageConfig.prompt.trim(),
              negative_prompt: imageConfig.negativePrompt.trim(),
              width: dimensions.width,
              height: dimensions.height,
              steps: advancedGeneration.steps,
              cfg_scale: advancedGeneration.cfgScale,
              seed: advancedGeneration.seed,
              model: imageConfig.model,
              scheduler: advancedGeneration.scheduler,
              output_root: outputRoot,
            },
            createdAt: new Date(),
          });
          pollJobStatus(result.jobId);
        } else {
          throw new Error(result.error || 'Generation failed');
        }
      } else {
        if (imageConfig.videoModel === 'svd' && !refConfig.referenceImage) {
          throw new Error(SVD_REFERENCE_ERROR);
        }

        const result = await window.electron.generation.generateVideo({
          prompt: imageConfig.prompt.trim(),
          image_path: refConfig.referenceImage ?? undefined,
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
      } catch (e) {
        console.error('Failed to get job status:', e);
        pollingTimeoutRef.current = setTimeout(checkStatus, 2000);
      }
    };
    checkStatus();
  }, [updateJob, syncAssetsFromJobStatus, imageConfig.generationType, imageConfig.prompt]);

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

  // Cleanup polling timeout on unmount
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
  const currentModel = imageConfig.generationType === 'image' ? imageConfig.model : imageConfig.videoModel;
  const videoModelRequiresReference = imageConfig.generationType === 'video' && imageConfig.videoModel === 'svd';

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-panel" data-testid="generate-panel">
      <h1 className="sr-only">Generate</h1>
      {/* Mode Toggle */}
      <div className="p-3 border-b border-border bg-panel">
        <p className="mb-2 type-caption">Workflow</p>
        <div className="relative flex bg-canvas rounded-md p-1 border border-border">
          <motion.div
            layoutId="modeGlow"
            className="absolute top-1 bottom-1 rounded-md bg-accent-primary-muted border border-accent-primary-border"
            style={{ width: 'calc(50% - 4px)' }}
            animate={{
              x: imageConfig.generationType === 'image' ? 0 : 'calc(100% + 4px)',
            }}
            transition={reduced ? { duration: 0 } : { type: 'spring', stiffness: 400, damping: 30 }}
          />
          <button
            onClick={() => updateImageConfig({ generationType: 'image' })}
            className={cn(
              'relative z-10 flex-1 flex items-center justify-center gap-2 py-2 rounded-md transition-colors',
              imageConfig.generationType === 'image'
                ? 'text-accent-primary'
                : 'text-text-muted hover:text-text-body'
            )}
          >
            <ImageIcon className="w-4 h-4" />
            <span className="type-section">Image</span>
          </button>
          <button
            onClick={() => updateImageConfig({ generationType: 'video' })}
            className={cn(
              'relative z-10 flex-1 flex items-center justify-center gap-2 py-2 rounded-md transition-colors',
              imageConfig.generationType === 'video'
                ? 'text-accent-primary'
                : 'text-text-muted hover:text-text-body'
            )}
          >
            <Film className="w-4 h-4" />
            <span className="type-section">Video</span>
          </button>
        </div>
      </div>

      {/* GPU Warning */}
      {!isGpuAvailable && (
        <div className="mx-4 mt-4 p-3 rounded-lg bg-status-warning-muted border border-status-warning-border flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-status-warning flex-shrink-0 mt-0.5" />
          <div>
            <p className="type-ui text-status-warning">
              GPU Not Detected
            </p>
            <p className="type-caption text-status-warning opacity-60">
              Generation will be very slow on CPU. Consider using a CUDA-capable GPU.
            </p>
          </div>
        </div>
      )}

      {/* Scrollable Content */}
      <div className="h-0 flex-1 overflow-y-scroll p-4 space-y-5">
        {/* Prompt Area */}
        <div className="relative">
          <PromptArea
            prompt={imageConfig.prompt}
            onPromptChange={(v) => updateImageConfig({ prompt: v })}
            negativePrompt={imageConfig.negativePrompt}
            onNegativePromptChange={(v) => updateImageConfig({ negativePrompt: v })}
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
            onSelectPrompt={(p, np) => {
              updateImageConfig({ prompt: p, negativePrompt: np });
              setShowHistory(false);
            }}
          />
        </div>

        {/* Style Presets */}
        <StylePresetsBar
          activePresets={imageConfig.activeStylePresets}
          onTogglePreset={handleToggleStylePreset}
        />

        {/* Model Routing */}
        <div className="space-y-3">
          <div>
            <label className="text-label text-text-body">Model Router</label>
            <p className="mt-1 text-xs text-text-muted">
              Pick the capability, runtime, and hardware profile for this generation.
            </p>
          </div>
          <ModelSelector
            value={currentModel}
            onChange={(id) => {
              if (imageConfig.generationType === 'image') updateImageConfig({ model: id });
              else updateImageConfig({ videoModel: id });
            }}
            generationType={imageConfig.generationType}
          />
        </div>

        {/* Reference Image (img2img / image-to-video) */}
        {(imageConfig.generationType === 'image' || videoModelRequiresReference) && (
          <>
            <ImageDropZone
              referenceImage={refConfig.referenceImage}
              onImageChange={(v) => updateRefConfig({ referenceImage: v })}
              denoisingStrength={refConfig.denoisingStrength}
              onDenoisingStrengthChange={(v) => updateRefConfig({ denoisingStrength: v })}
              mode={refConfig.referenceMode}
              onModeChange={(v) => updateRefConfig({ referenceMode: v })}
            />
            {videoModelRequiresReference && !refConfig.referenceImage && (
              <div className="px-3 py-2 rounded-lg border border-amber-500/30 bg-amber-500/10 text-xs text-amber-200">
                Stable Video Diffusion requires a reference image.
              </div>
            )}
          </>
        )}

        {/* Start Frame (video only) */}
        {imageConfig.generationType === 'video' && (
          <CompactImageDropZone
            label="Start Frame"
            image={startFrameImage}
            onImageChange={setStartFrameImage}
          />
        )}

        {/* End Frame (video only) */}
        {imageConfig.generationType === 'video' && (
          <CompactImageDropZone
            label="End Frame"
            image={endFrameImage}
            onImageChange={setEndFrameImage}
          />
        )}

        {/* Video Controls (video only) */}
        {imageConfig.generationType === 'video' && (
          <VideoControls />
        )}

        {/* ControlNet */}
        {imageConfig.generationType === 'image' && (
          <ControlNetPanel
            config={refConfig.controlNetConfig}
            onChange={(v) => updateRefConfig({ controlNetConfig: v })}
          />
        )}

        {/* LoRA Mixer */}
        {imageConfig.generationType === 'image' && (
          <LoRAMixer configs={refConfig.loraConfigs} onChange={(v) => updateRefConfig({ loraConfigs: v })} />
        )}

        {/* Aspect Ratio */}
        <AspectRatioPicker />

        {/* Advanced Controls */}
        <div className="rounded-md border border-border bg-surface p-3">
          <AdvancedGenerationSettings />
        </div>

        {/* Estimated Info */}
        <div className="p-3 rounded-md bg-elevated border border-border">
          <div className="flex items-center gap-4 type-ui text-text-body">
            <div className="flex items-center gap-2">
              <Clock className="w-3.5 h-3.5" />
              <span>~{imageConfig.generationType === 'image' ? '15-30s' : '2-5min'}</span>
            </div>
            <div className="flex items-center gap-2">
              <Zap className="w-3.5 h-3.5" />
              <span>{isGpuAvailable ? 'GPU Accelerated' : 'CPU Mode'}</span>
            </div>
          </div>
        </div>

        {/* Error Message */}
        {genStatus.status === 'error' && (
          <motion.div
            initial={reduced ? {} : { opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={transition}
            className="p-3 rounded-lg bg-status-error-muted border border-status-error-border flex items-start gap-2"
          >
            <AlertCircle className="w-4 h-4 text-status-error flex-shrink-0 mt-0.5" />
            <p className="text-xs text-status-error">{genStatus.errorMessage}</p>
          </motion.div>
        )}

        {/* Success Message */}
        {genStatus.status === 'success' && (
          <motion.div
            initial={reduced ? {} : { opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={transition}
            className="p-3 rounded-lg bg-status-success-muted border border-status-success-border flex items-start gap-2"
          >
            <Check className="w-4 h-4 text-status-success flex-shrink-0 mt-0.5" />
            <p className="text-xs text-status-success">
              Generation completed! Check the Assets panel.
            </p>
          </motion.div>
        )}
      </div>

      {/* Generate Button / Progress Bar - Sticky bottom */}
      <div className="p-4 border-t border-border bg-panel">
        <AnimatePresence mode="wait">
          {genStatus.isGenerating ? (
            <motion.div
              key="progress"
              data-testid="generation-progress"
              initial={reduced ? {} : { opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={reduced ? {} : { opacity: 0, scale: 0.98 }}
              transition={transition}
              className="relative overflow-hidden rounded-md bg-elevated border border-border"
            >
              {/* Progress fill */}
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

              {/* Content overlay */}
              <div className="relative flex items-center justify-between px-4 py-3.5">
                <div className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 text-text-primary animate-spin" />
                  <span className="type-section">
                    Step {genStatus.step}/{advancedGeneration.steps}
                  </span>
                </div>

                <button
                  onClick={handleCancel}
                  disabled={!genStatus.isGenerating}
                  className="flex items-center gap-2 px-3 py-1 rounded-md bg-void/40 type-ui text-text-body hover:text-text-primary hover:bg-void/60 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <X className="w-3 h-3" />
                  Cancel
                </button>

                <span className="type-section">
                  {Math.round(genStatus.progress)}%
                </span>
              </div>
            </motion.div>
          ) : (
            <motion.button
              key="generate"
              data-testid="generate-button"
              initial={reduced ? {} : { opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={reduced ? {} : { opacity: 0, scale: 0.98 }}
              transition={transition}
              onClick={handleGenerate}
              disabled={!imageConfig.prompt.trim()}
              className={cn(
                'w-full flex items-center justify-center gap-2.5 py-3.5 rounded-md type-section transition-all',
                imageConfig.prompt.trim()
                  ? 'bg-accent-primary text-void shadow-accent hover:bg-accent-primary-hover active:bg-accent-primary-pressed hover:scale-[1.005] active:scale-[0.995]'
                  : 'bg-elevated text-text-muted opacity-40 cursor-not-allowed'
              )}
            >
              <Wand2 className="w-4.5 h-4.5" />
              Generate {imageConfig.generationType === 'image' ? 'Image' : 'Video'}
            </motion.button>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
