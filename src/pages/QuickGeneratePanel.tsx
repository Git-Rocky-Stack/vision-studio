import { useState, useCallback } from 'react';
import { useAppStore } from '@/store/appStore';
import { Button } from '@/components/ui/Button';
import { cn } from '@/utils/cn';
import { Wand2, Loader2, CheckCircle2, AlertCircle, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { ControlNetConfig } from '@/types/generation';

const ASPECT_RATIOS = [
  { name: 'Square', width: 1024, height: 1024, icon: '1:1' },
  { name: 'Portrait', width: 768, height: 1344, icon: '9:16' },
  { name: 'Landscape', width: 1344, height: 768, icon: '16:9' },
  { name: 'Widescreen', width: 1920, height: 1080, icon: '21:9' },
] as const;

const MODELS = [
  { id: 'flux-dev', name: 'Flux Dev' },
  { id: 'flux-schnell', name: 'Flux Schnell' },
  { id: 'stable-diffusion-xl', name: 'SDXL' },
  { id: 'kolors', name: 'Kolors' },
];

interface GenStatus {
  isGenerating: boolean;
  progress: number;
  status: 'idle' | 'generating' | 'success' | 'error';
  errorMessage: string;
}

function resolveOutputRoot(defaultOutputPath: string, userDataPath: string) {
  return (defaultOutputPath || `${userDataPath.replace(/\\/g, '/')}/outputs`).replace(/\\/g, '/');
}

export function QuickGeneratePanel() {
  const { addJob, updateJob, syncAssetsFromJobStatus, advancedGeneration } = useAppStore();

  const [prompt, setPrompt] = useState('');
  const [negativePrompt, setNegativePrompt] = useState('');
  const [selectedModel, setSelectedModel] = useState('flux-dev');
  const [selectedRatio, setSelectedRatio] = useState(ASPECT_RATIOS[0]);
  const [genStatus, setGenStatus] = useState<GenStatus>({
    isGenerating: false,
    progress: 0,
    status: 'idle',
    errorMessage: '',
  });

  const pollJobStatus = useCallback(
    async (jobId: string) => {
      const checkStatus = async () => {
        try {
          const status = await window.electron.generation.getStatus(jobId);
          if (status.status === 'completed') {
            const existingJob = useAppStore.getState().activeJobs.find((j) => j.id === jobId);
            const completedAt = status.completed_at ? new Date(status.completed_at) : new Date();

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
              title: 'Image Ready',
              body: prompt.trim().slice(0, 120) || 'Generation completed successfully.',
            });

            setGenStatus({ isGenerating: false, progress: 100, status: 'success', errorMessage: '' });
          } else if (status.status === 'failed') {
            updateJob(jobId, {
              status: 'failed',
              progress: status.progress ?? 0,
              error: status.error,
              completedAt: status.completed_at ? new Date(status.completed_at) : new Date(),
            });
            await window.electron.notifications.notify('generation_failed', {
              title: 'Generation Failed',
              body: status.error || 'Generation failed.',
            });
            setGenStatus({
              isGenerating: false,
              progress: status.progress ?? 0,
              status: 'error',
              errorMessage: status.error || 'Generation failed',
            });
          } else {
            updateJob(jobId, {
              status: status.status,
              progress: status.progress ?? 0,
            });
            setGenStatus((prev) => ({
              ...prev,
              progress: status.progress ?? prev.progress,
            }));
          }
        } catch {
          // Keep polling
        }
      };

      const interval = setInterval(checkStatus, 500);
      const unwatch = window.electron.generation.onProgress((data) => {
        if (data.job_id === jobId && data.progress !== undefined) {
          setGenStatus((prev) => ({ ...prev, progress: data.progress ?? prev.progress }));
        }
      });

      // Initial check
      await checkStatus();

      // Stop after 5 minutes
      setTimeout(() => {
        clearInterval(interval);
        unwatch();
      }, 5 * 60 * 1000);
    },
    [updateJob, syncAssetsFromJobStatus, prompt]
  );

  const handleGenerate = async () => {
    if (!prompt.trim()) return;

    setGenStatus({ isGenerating: true, progress: 0, status: 'generating', errorMessage: '' });

    try {
      const appSettings = await window.electron.settings.get();
      const userDataPath = await window.electron.app.getPath('userData');
      const outputRoot = resolveOutputRoot(appSettings.defaultOutputPath, userDataPath);

      const result = await window.electron.generation.generateImage({
        prompt: prompt.trim(),
        negative_prompt: negativePrompt.trim(),
        width: selectedRatio.width,
        height: selectedRatio.height,
        steps: advancedGeneration.steps,
        cfg_scale: advancedGeneration.cfgScale,
        seed: advancedGeneration.seed === -1 ? undefined : advancedGeneration.seed,
        model: selectedModel,
        scheduler: advancedGeneration.scheduler,
      });

      if (result.success && result.jobId) {
        addJob({
          id: result.jobId,
          type: 'image',
          status: 'pending',
          progress: 0,
          params: {
            prompt: prompt.trim(),
            negative_prompt: negativePrompt.trim(),
            width: selectedRatio.width,
            height: selectedRatio.height,
            steps: advancedGeneration.steps,
            cfg_scale: advancedGeneration.cfgScale,
            seed: advancedGeneration.seed,
            model: selectedModel,
            scheduler: advancedGeneration.scheduler,
            output_root: outputRoot,
          },
          createdAt: new Date(),
        });
        pollJobStatus(result.jobId);
      } else {
        throw new Error(result.error || 'Generation failed');
      }
    } catch (error: any) {
      console.error('Quick generate error:', error);
      setGenStatus({
        isGenerating: false,
        progress: 0,
        status: 'error',
        errorMessage: error.message || 'Generation failed',
      });
    }
  };

  const handleClear = () => {
    setPrompt('');
    setNegativePrompt('');
    setGenStatus({ isGenerating: false, progress: 0, status: 'idle', errorMessage: '' });
  };

  return (
    <div className="flex flex-col h-full bg-surface">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2">
          <Wand2 className="w-4 h-4 text-red-primary" aria-hidden="true" />
          <h2 className="font-display font-semibold text-sm text-text-primary">Quick Generate</h2>
        </div>
        {genStatus.status === 'success' && (
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="flex items-center gap-1.5 text-status-success text-xs font-display font-medium"
          >
            <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
            Done
          </motion.div>
        )}
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto min-h-0">
        <div className="p-4 space-y-4">
          {/* Prompt */}
          <div className="space-y-1.5">
            <label htmlFor="quick-prompt" className="text-micro font-display font-medium text-text-muted uppercase tracking-wider">
              Prompt
            </label>
            <textarea
              id="quick-prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe what you want to generate..."
              rows={4}
              className={cn(
                'w-full resize-none rounded-lg bg-elevated border border-border',
                'px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted/50',
                'focus:outline-none focus:ring-2 focus:ring-red-primary/50 focus:border-red-primary',
                'font-display'
              )}
              disabled={genStatus.isGenerating}
            />
          </div>

          {/* Negative Prompt */}
          <div className="space-y-1.5">
            <label htmlFor="quick-neg-prompt" className="text-micro font-display font-medium text-text-muted uppercase tracking-wider">
              Negative Prompt
            </label>
            <textarea
              id="quick-neg-prompt"
              value={negativePrompt}
              onChange={(e) => setNegativePrompt(e.target.value)}
              placeholder="What to avoid..."
              rows={2}
              className={cn(
                'w-full resize-none rounded-lg bg-elevated border border-border',
                'px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted/50',
                'focus:outline-none focus:ring-2 focus:ring-red-primary/50 focus:border-red-primary',
                'font-display'
              )}
              disabled={genStatus.isGenerating}
            />
          </div>

          {/* Model selector */}
          <div className="space-y-1.5">
            <label className="text-micro font-display font-medium text-text-muted uppercase tracking-wider">
              Model
            </label>
            <div className="grid grid-cols-2 gap-1.5">
              {MODELS.map((model) => (
                <button
                  key={model.id}
                  onClick={() => setSelectedModel(model.id)}
                  disabled={genStatus.isGenerating}
                  className={cn(
                    'px-3 py-2 rounded-lg border text-xs font-display font-medium transition-all duration-150',
                    selectedModel === model.id
                      ? 'bg-red-aura text-red-primary border-red-primary/60 shadow-red-glow'
                      : 'bg-elevated text-text-body border-border hover:border-red-primary/40 hover:text-text-primary'
                  )}
                >
                  {model.name}
                </button>
              ))}
            </div>
          </div>

          {/* Aspect ratio */}
          <div className="space-y-1.5">
            <label className="text-micro font-display font-medium text-text-muted uppercase tracking-wider">
              Aspect Ratio
            </label>
            <div className="grid grid-cols-4 gap-1.5">
              {ASPECT_RATIOS.map((ratio) => (
                <button
                  key={ratio.name}
                  onClick={() => setSelectedRatio(ratio)}
                  disabled={genStatus.isGenerating}
                  className={cn(
                    'flex flex-col items-center justify-center gap-0.5 px-2 py-2 rounded-lg border text-xs transition-all duration-150',
                    selectedRatio.name === ratio.name
                      ? 'bg-red-aura text-red-primary border-red-primary/60 shadow-red-glow'
                      : 'bg-elevated text-text-body border-border hover:border-red-primary/40 hover:text-text-primary'
                  )}
                >
                  <span className="font-display font-bold">{ratio.icon}</span>
                  <span className="text-micro font-display">{ratio.name}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Error message */}
      <AnimatePresence>
        {genStatus.status === 'error' && genStatus.errorMessage && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="px-4 overflow-hidden"
          >
            <div className="flex items-start gap-2 py-2 px-3 rounded-lg bg-red-aura/20 border border-red-primary/40 text-red-primary">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" aria-hidden="true" />
              <p className="text-xs font-display">{genStatus.errorMessage}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Progress bar */}
      <AnimatePresence>
        {genStatus.isGenerating && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: 'auto' }}
            exit={{ height: 0 }}
            className="overflow-hidden"
          >
            <div className="px-4 pt-2 pb-1">
              <div className="flex items-center justify-between mb-1">
                <span className="text-micro font-display text-text-muted">Generating...</span>
                <span className="text-micro font-display text-text-muted">{genStatus.progress}%</span>
              </div>
              <div className="h-1 bg-void rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-gradient-to-r from-red-primary to-red-highlight rounded-full"
                  initial={{ width: 0 }}
                  animate={{ width: `${genStatus.progress}%` }}
                  transition={{ duration: 0.3 }}
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Action buttons */}
      <div className="px-4 py-3 border-t border-border flex gap-2 flex-shrink-0">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleClear}
          disabled={genStatus.isGenerating || (!prompt && !negativePrompt)}
          aria-label="Clear prompts"
          className="text-text-muted"
        >
          <X className="w-4 h-4" aria-hidden="true" />
        </Button>
        <Button
          variant="primary"
          size="sm"
          onClick={handleGenerate}
          disabled={genStatus.isGenerating || !prompt.trim()}
          className="flex-1"
        >
          {genStatus.isGenerating ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
              Generating...
            </>
          ) : (
            <>
              <Wand2 className="w-4 h-4" aria-hidden="true" />
              Generate
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
