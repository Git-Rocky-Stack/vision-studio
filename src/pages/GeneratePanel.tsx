import { useState, useEffect } from 'react';
import { cn } from '@/utils/cn';
import { useAppStore } from '@/store/appStore';
import { Button } from '@/components/ui/Button';
import { Slider } from '@/components/ui/Slider';
import { PromptArea } from '@/components/generate/PromptArea';
import { StylePresetsBar } from '@/components/generate/StylePresetsBar';
import { ModelSelector } from '@/components/generate/ModelSelector';
import { ImageDropZone } from '@/components/generate/ImageDropZone';
import { ControlNetPanel } from '@/components/generate/ControlNetPanel';
import { LoRAMixer } from '@/components/generate/LoRAMixer';
import type { ControlNetConfig, LoRAConfig } from '@/types/generation';
import {
  Wand2,
  Image as ImageIcon,
  Film,
  Dice5,
  Settings2,
  ChevronDown,
  ChevronUp,
  Zap,
  Clock,
  Loader2,
  AlertCircle,
  Check,
  X,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

type GenerationType = 'image' | 'video';

interface AspectRatio {
  name: string;
  width: number;
  height: number;
  icon: string;
}

const aspectRatios: AspectRatio[] = [
  { name: 'Square', width: 1024, height: 1024, icon: '1:1' },
  { name: 'Portrait', width: 768, height: 1344, icon: '9:16' },
  { name: 'Landscape', width: 1344, height: 768, icon: '16:9' },
  { name: 'Widescreen', width: 1920, height: 1080, icon: '16:9' },
  { name: 'Mobile', width: 720, height: 1280, icon: '9:16' },
];

const SCHEDULERS = [
  'Euler',
  'Euler a',
  'DPM++ 2M',
  'DPM++ 2M Karras',
  'DPM++ SDE',
  'DPM++ SDE Karras',
  'DDIM',
  'UniPC',
];

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

export function GeneratePanel() {
  const {
    addJob,
    updateJob,
    systemInfo,
    currentProject,
    addToPromptHistory,
    favoritePrompts,
    toggleFavoritePrompt,
  } = useAppStore();

  const [generationType, setGenerationType] = useState<GenerationType>('image');
  const [prompt, setPrompt] = useState('');
  const [negativePrompt, setNegativePrompt] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState(0);
  const [generationStep, setGenerationStep] = useState(0);
  const [generationStatus, setGenerationStatus] = useState<
    'idle' | 'generating' | 'success' | 'error'
  >('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [activeStylePresets, setActiveStylePresets] = useState<string[]>([]);

  // Image settings
  const [selectedRatio, setSelectedRatio] = useState(aspectRatios[0]);
  const [imageModel, setImageModel] = useState('flux-dev');
  const [steps, setSteps] = useState(25);
  const [cfgScale, setCfgScale] = useState(7.5);
  const [seed, setSeed] = useState(-1);
  const [scheduler, setScheduler] = useState('Euler a');
  const [clipSkip, setClipSkip] = useState(1);

  // Video settings
  const [videoModel, setVideoModel] = useState('ltx-video');
  const [duration, setDuration] = useState(5);
  const [fps, setFps] = useState(24);

  // Reference image (img2img)
  const [referenceImage, setReferenceImage] = useState<string | null>(null);
  const [denoisingStrength, setDenoisingStrength] = useState(0.75);
  const [referenceMode, setReferenceMode] = useState<'img2img' | 'inpaint' | 'controlnet'>('img2img');

  // ControlNet
  const [controlNetConfig, setControlNetConfig] = useState<ControlNetConfig>(DEFAULT_CONTROLNET);

  // LoRA
  const [loraConfigs, setLoraConfigs] = useState<LoRAConfig[]>([]);

  // Active job ID for progress tracking
  const [activeJobId, setActiveJobId] = useState<string | null>(null);

  // Load template settings if project has one
  useEffect(() => {
    if (currentProject?.template) {
      const settings = (currentProject as any).template.settings;
      setSelectedRatio(
        aspectRatios.find(
          (r) => r.width === settings.width && r.height === settings.height
        ) || aspectRatios[0]
      );
      setImageModel(settings.model);
      setSteps(settings.steps);
      setCfgScale(settings.cfgScale);
      setPrompt(settings.prompt);
      setNegativePrompt(settings.negativePrompt);
    }
  }, [currentProject]);

  const handleGenerate = async () => {
    if (!prompt.trim()) return;

    setIsGenerating(true);
    setGenerationStatus('generating');
    setGenerationProgress(0);
    setGenerationStep(0);
    setErrorMessage('');

    // Save to history
    addToPromptHistory({
      id: crypto.randomUUID(),
      prompt: prompt.trim(),
      negativePrompt: negativePrompt.trim(),
      timestamp: new Date(),
      model: generationType === 'image' ? imageModel : videoModel,
    });

    try {
      if (generationType === 'image') {
        const result = await window.electron.generation.generateImage({
          prompt: prompt.trim(),
          negative_prompt: negativePrompt.trim(),
          width: selectedRatio.width,
          height: selectedRatio.height,
          steps,
          cfg_scale: cfgScale,
          seed: seed === -1 ? undefined : seed,
          model: imageModel,
        });

        if (result.success && result.jobId) {
          setActiveJobId(result.jobId);
          addJob({
            id: result.jobId,
            type: 'image',
            status: 'pending',
            progress: 0,
            params: {
              prompt,
              width: selectedRatio.width,
              height: selectedRatio.height,
            },
            createdAt: new Date(),
          });
          pollJobStatus(result.jobId);
        } else {
          throw new Error(result.error || 'Generation failed');
        }
      } else {
        const result = await window.electron.generation.generateVideo({
          prompt: prompt.trim(),
          width: selectedRatio.width,
          height: selectedRatio.height,
          duration,
          fps,
          steps,
          model: videoModel,
          seed: seed === -1 ? undefined : seed,
        });

        if (result.success && result.jobId) {
          setActiveJobId(result.jobId);
          addJob({
            id: result.jobId,
            type: 'video',
            status: 'pending',
            progress: 0,
            params: { prompt, duration, fps },
            createdAt: new Date(),
          });
          pollJobStatus(result.jobId);
        } else {
          throw new Error(result.error || 'Generation failed');
        }
      }
    } catch (error: any) {
      console.error('Generation error:', error);
      setGenerationStatus('error');
      setErrorMessage(error.message || 'Generation failed');
      setIsGenerating(false);
      setActiveJobId(null);
    }
  };

  const pollJobStatus = async (jobId: string) => {
    const checkStatus = async () => {
      try {
        const status = await window.electron.generation.getStatus(jobId);
        if (status.status === 'completed') {
          setGenerationStatus('success');
          setGenerationProgress(100);
          setIsGenerating(false);
          setActiveJobId(null);
        } else if (status.status === 'failed') {
          setGenerationStatus('error');
          setErrorMessage(status.error || 'Generation failed');
          setIsGenerating(false);
          setActiveJobId(null);
        } else {
          if (status.progress !== undefined) {
            setGenerationProgress(status.progress);
          }
          if (status.step !== undefined) {
            setGenerationStep(status.step);
          }
          setTimeout(checkStatus, 1000);
        }
      } catch (e) {
        console.error('Failed to get job status:', e);
        setTimeout(checkStatus, 2000);
      }
    };
    checkStatus();
  };

  const handleCancel = () => {
    if (activeJobId) {
      window.electron.generation.cancel(activeJobId);
    }
    setIsGenerating(false);
    setGenerationStatus('idle');
    setActiveJobId(null);
  };

  const randomizeSeed = () => setSeed(Math.floor(Math.random() * 2147483647));

  const handleRandomPrompt = () => {
    const idx = Math.floor(Math.random() * RANDOM_PROMPTS.length);
    setPrompt(RANDOM_PROMPTS[idx]);
  };

  const handleToggleStylePreset = (presetId: string, modifier: string) => {
    if (activeStylePresets.includes(presetId)) {
      setActiveStylePresets(activeStylePresets.filter((id) => id !== presetId));
      setPrompt(prompt.replace(`, ${modifier}`, '').replace(modifier, '').trim());
    } else {
      setActiveStylePresets([...activeStylePresets, presetId]);
      setPrompt(prompt ? `${prompt}, ${modifier}` : modifier);
    }
  };

  const isGpuAvailable = systemInfo.gpuAvailable;
  const isFavorited = favoritePrompts.includes(prompt.trim());
  const currentModel = generationType === 'image' ? imageModel : videoModel;

  return (
    <div className="h-full flex flex-col bg-surface">
      {/* Mode Toggle */}
      <div className="p-4 border-b border-border">
        <div className="relative flex bg-elevated rounded-lg p-1">
          <motion.div
            layoutId="modeGlow"
            className="absolute top-1 bottom-1 rounded-md bg-surface glow-red-subtle"
            style={{ width: 'calc(50% - 4px)' }}
            animate={{
              x: generationType === 'image' ? 0 : 'calc(100% + 4px)',
            }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
          />
          <button
            onClick={() => setGenerationType('image')}
            className={cn(
              'relative z-10 flex-1 flex items-center justify-center gap-2 py-2 rounded-md transition-colors',
              generationType === 'image'
                ? 'text-red-primary'
                : 'text-text-muted hover:text-text-body'
            )}
          >
            <ImageIcon className="w-4 h-4" />
            <span className="font-display text-sm font-medium">Image</span>
          </button>
          <button
            onClick={() => setGenerationType('video')}
            className={cn(
              'relative z-10 flex-1 flex items-center justify-center gap-2 py-2 rounded-md transition-colors',
              generationType === 'video'
                ? 'text-red-primary'
                : 'text-text-muted hover:text-text-body'
            )}
          >
            <Film className="w-4 h-4" />
            <span className="font-display text-sm font-medium">Video</span>
          </button>
        </div>
      </div>

      {/* GPU Warning */}
      {!isGpuAvailable && (
        <div className="mx-4 mt-4 p-3 rounded-lg bg-yellow-500/8 border border-yellow-500/20 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-yellow-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-xs text-yellow-400 font-display font-medium">
              GPU Not Detected
            </p>
            <p className="text-[10px] text-yellow-400/60">
              Generation will be very slow on CPU. Consider using a CUDA-capable GPU.
            </p>
          </div>
        </div>
      )}

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Prompt Area */}
        <PromptArea
          prompt={prompt}
          onPromptChange={setPrompt}
          negativePrompt={negativePrompt}
          onNegativePromptChange={setNegativePrompt}
          generationType={generationType}
          isFavorited={isFavorited}
          onRandomize={handleRandomPrompt}
          onEnhance={() => {}}
          onShowHistory={() => {}}
          onToggleFavorite={() => toggleFavoritePrompt(prompt.trim())}
        />

        {/* Style Presets */}
        <StylePresetsBar
          activePresets={activeStylePresets}
          onTogglePreset={handleToggleStylePreset}
        />

        {/* Reference Image (img2img) */}
        {generationType === 'image' && (
          <ImageDropZone
            referenceImage={referenceImage}
            onImageChange={setReferenceImage}
            denoisingStrength={denoisingStrength}
            onDenoisingStrengthChange={setDenoisingStrength}
            mode={referenceMode}
            onModeChange={setReferenceMode}
          />
        )}

        {/* ControlNet */}
        {generationType === 'image' && (
          <ControlNetPanel
            config={controlNetConfig}
            onChange={setControlNetConfig}
          />
        )}

        {/* LoRA Mixer */}
        {generationType === 'image' && (
          <LoRAMixer configs={loraConfigs} onChange={setLoraConfigs} />
        )}

        {/* Aspect Ratio */}
        {generationType === 'image' && (
          <div className="space-y-3">
            <label className="text-label text-text-body">Aspect Ratio</label>
            <div className="grid grid-cols-5 gap-2">
              {aspectRatios.map((ratio) => {
                const isSelected = selectedRatio.name === ratio.name;
                return (
                  <button
                    key={ratio.name}
                    onClick={() => setSelectedRatio(ratio)}
                    className={cn(
                      'p-2.5 rounded-lg border transition-all text-center',
                      isSelected
                        ? 'border-red-primary bg-red-aura glow-red-subtle'
                        : 'border-border hover:border-border-hover bg-elevated'
                    )}
                  >
                    <div
                      className={cn(
                        'mx-auto mb-1.5 rounded-sm',
                        isSelected ? 'bg-red-primary' : 'bg-text-muted'
                      )}
                      style={{
                        width: ratio.width > ratio.height ? '22px' : '14px',
                        height: ratio.width > ratio.height ? '14px' : '22px',
                      }}
                    />
                    <span
                      className={cn(
                        'font-display text-[10px] block',
                        isSelected ? 'text-red-primary' : 'text-text-body'
                      )}
                    >
                      {ratio.name}
                    </span>
                    <span className="font-mono text-[9px] text-text-muted block">
                      {ratio.icon}
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="font-mono text-xs text-text-muted">
              {selectedRatio.width} &times; {selectedRatio.height}px
            </p>
          </div>
        )}

        {/* Model Selection */}
        <div className="space-y-3">
          <label className="text-label text-text-body">Model</label>
          <ModelSelector
            value={currentModel}
            onChange={(id) => {
              if (generationType === 'image') setImageModel(id);
              else setVideoModel(id);
            }}
            generationType={generationType}
          />
        </div>

        {/* Advanced Settings */}
        <div>
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center gap-2 text-sm text-text-body hover:text-text-primary transition-all font-display"
          >
            <Settings2 className="w-4 h-4" />
            Advanced Settings
            {showAdvanced ? (
              <ChevronUp className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
          </button>

          <AnimatePresence>
            {showAdvanced && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="pt-4 space-y-4">
                  {generationType === 'image' ? (
                    <>
                      <Slider
                        label="Sampling Steps"
                        value={steps}
                        min={1}
                        max={50}
                        onChange={setSteps}
                      />
                      <Slider
                        label="CFG Scale"
                        value={cfgScale}
                        min={1}
                        max={20}
                        step={0.5}
                        onChange={setCfgScale}
                      />

                      {/* Scheduler */}
                      <div className="space-y-1.5">
                        <label className="text-label text-text-body">Scheduler</label>
                        <select
                          value={scheduler}
                          onChange={(e) => setScheduler(e.target.value)}
                          className="w-full bg-elevated border border-border rounded-lg px-3 py-2 text-sm font-display text-text-primary focus:border-red-primary focus:ring-1 focus:ring-red-primary/40 transition-all"
                        >
                          {SCHEDULERS.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Clip Skip */}
                      <div className="space-y-1.5">
                        <label className="text-label text-text-body">CLIP Skip</label>
                        <div className="flex gap-2">
                          {[1, 2].map((v) => (
                            <button
                              key={v}
                              onClick={() => setClipSkip(v)}
                              className={cn(
                                'flex-1 py-2 rounded-lg text-sm font-mono font-medium transition-all',
                                clipSkip === v
                                  ? 'bg-red-primary text-text-primary glow-red-subtle'
                                  : 'bg-elevated text-text-body border border-border hover:border-border-hover'
                              )}
                            >
                              {v}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Seed */}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <label className="text-label text-text-body">Seed</label>
                          <button
                            onClick={randomizeSeed}
                            className="p-1 rounded text-text-muted hover:text-red-primary transition-all"
                            title="Randomize"
                          >
                            <Dice5 className="w-4 h-4" />
                          </button>
                        </div>
                        <input
                          type="number"
                          value={seed}
                          onChange={(e) => setSeed(Number(e.target.value))}
                          className="w-full bg-elevated border border-border rounded-lg px-3 py-2 text-text-primary font-mono text-sm focus:border-red-primary focus:ring-1 focus:ring-red-primary/40 transition-all"
                        />
                        <p className="text-xs text-text-muted font-mono">
                          Use -1 for random seed
                        </p>
                      </div>
                    </>
                  ) : (
                    <>
                      <Slider
                        label="Duration"
                        value={duration}
                        min={1}
                        max={10}
                        onChange={setDuration}
                        valueFormatter={(v) => `${v}s`}
                      />
                      <Slider
                        label="Frame Rate"
                        value={fps}
                        min={12}
                        max={60}
                        onChange={setFps}
                        valueFormatter={(v) => `${v}fps`}
                      />
                    </>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Estimated Info */}
        <div className="p-3 rounded-lg bg-elevated border border-border">
          <div className="flex items-center gap-4 text-xs text-text-body font-display">
            <div className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" />
              <span>~{generationType === 'image' ? '15-30s' : '2-5min'}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5" />
              <span>{isGpuAvailable ? 'GPU Accelerated' : 'CPU Mode'}</span>
            </div>
          </div>
        </div>

        {/* Error Message */}
        {generationStatus === 'error' && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-3 rounded-lg bg-red-primary/10 border border-red-primary/30 flex items-start gap-2"
          >
            <AlertCircle className="w-4 h-4 text-red-primary flex-shrink-0 mt-0.5" />
            <p className="text-xs text-red-primary">{errorMessage}</p>
          </motion.div>
        )}

        {/* Success Message */}
        {generationStatus === 'success' && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-3 rounded-lg bg-green-500/10 border border-green-500/30 flex items-start gap-2"
          >
            <Check className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-green-400">
              Generation completed! Check the Assets panel.
            </p>
          </motion.div>
        )}
      </div>

      {/* Generate Button / Progress Bar - Sticky bottom */}
      <div className="p-4 border-t border-border bg-surface">
        <AnimatePresence mode="wait">
          {isGenerating ? (
            <motion.div
              key="progress"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              className="relative overflow-hidden rounded-xl bg-elevated border border-border"
            >
              {/* Progress fill */}
              <motion.div
                className="absolute inset-y-0 left-0 rounded-xl"
                initial={{ width: 0 }}
                animate={{ width: `${generationProgress}%` }}
                transition={{ duration: 0.3, ease: 'easeOut' }}
                style={{
                  background: 'linear-gradient(90deg, #c1121f, #e63946)',
                  boxShadow:
                    '0 0 12px rgba(230, 57, 70, 0.3), inset 0 1px 0 rgba(255,255,255,0.1)',
                }}
              />

              {/* Content overlay */}
              <div className="relative flex items-center justify-between px-4 py-3.5">
                <div className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 text-text-primary animate-spin" />
                  <span className="font-display text-sm text-text-primary font-medium">
                    Step {generationStep}/{steps}
                  </span>
                </div>

                <button
                  onClick={handleCancel}
                  className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-void/40 text-text-body hover:text-text-primary hover:bg-void/60 transition-all font-display text-xs"
                >
                  <X className="w-3 h-3" />
                  Cancel
                </button>

                <span className="font-mono text-sm text-text-primary font-medium">
                  {Math.round(generationProgress)}%
                </span>
              </div>
            </motion.div>
          ) : (
            <motion.button
              key="generate"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              onClick={handleGenerate}
              disabled={!prompt.trim()}
              className={cn(
                'w-full flex items-center justify-center gap-2.5 py-3.5 rounded-xl font-display text-sm font-semibold transition-all',
                prompt.trim()
                  ? 'bg-red-primary text-text-primary glow-red hover:bg-red-highlight active:bg-red-pressed hover:scale-[1.01] active:scale-[0.99]'
                  : 'bg-elevated text-text-muted opacity-40 cursor-not-allowed'
              )}
            >
              <Wand2 className="w-4.5 h-4.5" />
              Generate {generationType === 'image' ? 'Image' : 'Video'}
            </motion.button>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
