import { useState, useEffect } from 'react';
import { cn } from '@/utils/cn';
import { useAppStore } from '@/store/appStore';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Textarea';
import { Slider } from '@/components/ui/Slider';
import { 
  Wand2, 
  Image as ImageIcon, 
  Film, 
  Sparkles,
  Dice5,
  RefreshCw,
  Settings2,
  ChevronDown,
  ChevronUp,
  Zap,
  Clock,
  Loader2,
  AlertCircle,
  Check
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

type GenerationType = 'image' | 'video';
type ImageModel = 'flux-dev' | 'flux-schnell' | 'sdxl' | 'sd-15';
type VideoModel = 'svd' | 'animate-diff' | 'ltx-video';

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

export function GeneratePanel() {
  const { addJob, systemInfo, availableModels, currentProject } = useAppStore();
  const [generationType, setGenerationType] = useState<GenerationType>('image');
  const [prompt, setPrompt] = useState('');
  const [negativePrompt, setNegativePrompt] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationStatus, setGenerationStatus] = useState<'idle' | 'generating' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  
  // Image settings
  const [selectedRatio, setSelectedRatio] = useState(aspectRatios[0]);
  const [imageModel, setImageModel] = useState<ImageModel>('flux-dev');
  const [steps, setSteps] = useState(25);
  const [cfgScale, setCfgScale] = useState(7.5);
  const [seed, setSeed] = useState(-1);
  
  // Video settings
  const [videoModel, setVideoModel] = useState<VideoModel>('ltx-video');
  const [duration, setDuration] = useState(5);
  const [fps, setFps] = useState(24);

  // Load template settings if project has one
  useEffect(() => {
    if (currentProject?.template) {
      const settings = currentProject.template.settings;
      setSelectedRatio(aspectRatios.find(r => 
        r.width === settings.width && r.height === settings.height
      ) || aspectRatios[0]);
      setImageModel(settings.model as ImageModel);
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
    setErrorMessage('');
    
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
          model: imageModel
        });

        if (result.success && result.jobId) {
          // Add to jobs
          addJob({
            id: result.jobId,
            type: 'image',
            status: 'pending',
            progress: 0,
            params: {
              prompt,
              width: selectedRatio.width,
              height: selectedRatio.height
            },
            createdAt: new Date()
          });

          // Poll for completion
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
          seed: seed === -1 ? undefined : seed
        });

        if (result.success && result.jobId) {
          addJob({
            id: result.jobId,
            type: 'video',
            status: 'pending',
            progress: 0,
            params: { prompt, duration, fps },
            createdAt: new Date()
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
    }
  };

  const pollJobStatus = async (jobId: string) => {
    const checkStatus = async () => {
      try {
        const status = await window.electron.generation.getStatus(jobId);
        
        if (status.status === 'completed') {
          setGenerationStatus('success');
          setIsGenerating(false);
        } else if (status.status === 'failed') {
          setGenerationStatus('error');
          setErrorMessage(status.error || 'Generation failed');
          setIsGenerating(false);
        } else {
          // Still processing, poll again
          setTimeout(checkStatus, 1000);
        }
      } catch (e) {
        console.error('Failed to get job status:', e);
        setTimeout(checkStatus, 2000);
      }
    };
    
    checkStatus();
  };

  const randomizeSeed = () => setSeed(Math.floor(Math.random() * 2147483647));

  const isGpuAvailable = systemInfo.gpuAvailable;

  return (
    <div className="h-full flex flex-col">
      {/* Type Selector */}
      <div className="p-4 border-b border-border">
        <div className="flex bg-charcoal-lighter rounded-lg p-1">
          <button
            onClick={() => setGenerationType('image')}
            className={cn(
              'flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-md transition-all',
              generationType === 'image'
                ? 'bg-charcoal text-white shadow-sm'
                : 'text-silver hover:text-white'
            )}
          >
            <ImageIcon className="w-4 h-4" />
            <span className="text-sm font-medium">Image</span>
          </button>
          <button
            onClick={() => setGenerationType('video')}
            className={cn(
              'flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-md transition-all',
              generationType === 'video'
                ? 'bg-charcoal text-white shadow-sm'
                : 'text-silver hover:text-white'
            )}
          >
            <Film className="w-4 h-4" />
            <span className="text-sm font-medium">Video</span>
          </button>
        </div>
      </div>

      {/* GPU Warning */}
      {!isGpuAvailable && (
        <div className="mx-4 mt-4 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/30 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-yellow-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-xs text-yellow-500 font-medium">GPU Not Detected</p>
            <p className="text-[10px] text-yellow-500/70">
              Generation will be very slow on CPU. Consider using a CUDA-capable GPU.
            </p>
          </div>
        </div>
      )}

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Prompt */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-light-grey flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-red" />
              Prompt
            </label>
            <span className="text-xs text-silver">{prompt.length} chars</span>
          </div>
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={generationType === 'image' 
              ? "Describe the image you want to generate..." 
              : "Describe the video you want to generate..."}
            rows={4}
            className="resize-none"
          />
        </div>

        {/* Negative Prompt */}
        <div className="space-y-3">
          <label className="text-sm font-medium text-light-grey">
            Negative Prompt (optional)
          </label>
          <Textarea
            value={negativePrompt}
            onChange={(e) => setNegativePrompt(e.target.value)}
            placeholder="Things to avoid in the generation..."
            rows={2}
            className="resize-none"
          />
        </div>

        {/* Aspect Ratio - Image Only */}
        {generationType === 'image' && (
          <div className="space-y-3">
            <label className="text-sm font-medium text-light-grey">Aspect Ratio</label>
            <div className="grid grid-cols-5 gap-2">
              {aspectRatios.map((ratio) => (
                <button
                  key={ratio.name}
                  onClick={() => setSelectedRatio(ratio)}
                  className={cn(
                    'p-3 rounded-lg border transition-all text-center',
                    selectedRatio.name === ratio.name
                      ? 'border-red bg-red/10'
                      : 'border-border hover:border-border-hover bg-charcoal-lighter'
                  )}
                >
                  <div className={cn(
                    'mx-auto mb-2 border-2 rounded',
                    selectedRatio.name === ratio.name ? 'border-red' : 'border-silver'
                  )}
                  style={{ 
                    width: ratio.width > ratio.height ? '24px' : '16px',
                    height: ratio.width > ratio.height ? '16px' : '24px'
                  }}
                  />
                  <span className={cn(
                    'text-xs block',
                    selectedRatio.name === ratio.name ? 'text-red' : 'text-silver'
                  )}>
                    {ratio.name}
                  </span>
                  <span className="text-[10px] text-silver/60">{ratio.icon}</span>
                </button>
              ))}
            </div>
            <p className="text-xs text-silver">
              {selectedRatio.width} × {selectedRatio.height}px
            </p>
          </div>
        )}

        {/* Model Selection */}
        <div className="space-y-3">
          <label className="text-sm font-medium text-light-grey">Model</label>
          {generationType === 'image' ? (
            <select
              value={imageModel}
              onChange={(e) => setImageModel(e.target.value as ImageModel)}
              className="w-full bg-charcoal border border-border rounded-lg px-3 py-2 text-white text-sm focus:border-red focus:ring-1 focus:ring-red"
            >
              <option value="flux-dev">FLUX.1 [dev] - Best Quality</option>
              <option value="flux-schnell">FLUX.1 [schnell] - Fast</option>
              <option value="sdxl">Stable Diffusion XL</option>
              <option value="sd-15">Stable Diffusion 1.5</option>
            </select>
          ) : (
            <select
              value={videoModel}
              onChange={(e) => setVideoModel(e.target.value as VideoModel)}
              className="w-full bg-charcoal border border-border rounded-lg px-3 py-2 text-white text-sm focus:border-red focus:ring-1 focus:ring-red"
            >
              <option value="ltx-video">LTX Video - High Quality</option>
              <option value="svd">Stable Video Diffusion</option>
              <option value="animate-diff">AnimateDiff</option>
            </select>
          )}
        </div>

        {/* Advanced Settings */}
        <div>
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center gap-2 text-sm text-silver hover:text-white transition-all"
          >
            <Settings2 className="w-4 h-4" />
            Advanced Settings
            {showAdvanced ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
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
                <div className="pt-4 space-y-6">
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
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <label className="text-sm font-medium text-light-grey">Seed</label>
                          <button
                            onClick={randomizeSeed}
                            className="p-1 rounded text-silver hover:text-red transition-all"
                            title="Randomize"
                          >
                            <Dice5 className="w-4 h-4" />
                          </button>
                        </div>
                        <input
                          type="number"
                          value={seed}
                          onChange={(e) => setSeed(Number(e.target.value))}
                          className="w-full bg-charcoal border border-border rounded-lg px-3 py-2 text-white text-sm focus:border-red focus:ring-1 focus:ring-red"
                        />
                        <p className="text-xs text-silver">
                          Use -1 for random seed
                        </p>
                      </div>
                    </>
                  ) : (
                    <>
                      <Slider
                        label="Duration (seconds)"
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
        <div className="p-3 rounded-lg bg-charcoal-lighter border border-border">
          <div className="flex items-center gap-4 text-xs text-silver">
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
            className="p-3 rounded-lg bg-red/10 border border-red/30 flex items-start gap-2"
          >
            <AlertCircle className="w-4 h-4 text-red flex-shrink-0 mt-0.5" />
            <p className="text-xs text-red">{errorMessage}</p>
          </motion.div>
        )}

        {/* Success Message */}
        {generationStatus === 'success' && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-3 rounded-lg bg-green-500/10 border border-green-500/30 flex items-start gap-2"
          >
            <Check className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-green-500">Generation completed! Check the Assets panel.</p>
          </motion.div>
        )}
      </div>

      {/* Generate Button */}
      <div className="p-4 border-t border-border">
        <Button
          onClick={handleGenerate}
          isLoading={isGenerating}
          disabled={!prompt.trim() || isGenerating}
          icon={isGenerating ? Loader2 : Wand2}
          fullWidth
          size="lg"
        >
          {isGenerating 
            ? 'Generating...' 
            : `Generate ${generationType === 'image' ? 'Image' : 'Video'}`
          }
        </Button>
      </div>
    </div>
  );
}
