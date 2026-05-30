import { useState, useCallback, useRef, useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '@/store/appStore';
import { Button } from '@/components/ui/Button';
import { ModelSelector } from '@/components/generate/ModelSelector';
import { cn } from '@/utils/cn';
import type { UserAccountSummary } from '@/types/electron';
import { Wand2, Loader2, CheckCircle2, AlertCircle, Cloud, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChromeButton } from '@/components/hardware';

const ASPECT_RATIOS = [
  { name: 'Square', width: 1024, height: 1024, icon: '1:1' },
  { name: 'Portrait', width: 768, height: 1344, icon: '9:16' },
  { name: 'Landscape', width: 1344, height: 768, icon: '16:9' },
  { name: 'Widescreen', width: 1920, height: 1080, icon: '21:9' },
] as const;

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
  const { addJob, updateJob, syncAssetsFromJobStatus, advancedGeneration, systemInfo } = useAppStore(useShallow(s => ({
    addJob: s.addJob,
    updateJob: s.updateJob,
    syncAssetsFromJobStatus: s.syncAssetsFromJobStatus,
    advancedGeneration: s.advancedGeneration,
    systemInfo: s.systemInfo,
  })));

  // Refs for cleanup
  const intervalRef = useRef<ReturnType<typeof setInterval>>(null);
  const safetyTimeoutRef = useRef<ReturnType<typeof setTimeout>>(null);
  const unwatchRef = useRef<(() => void) | null>(null);
  const isGeneratingRef = useRef(false);

  const [prompt, setPrompt] = useState('');
  const [negativePrompt, setNegativePrompt] = useState('');
  const [selectedModel, setSelectedModel] = useState('flux-dev');
  const [selectedRatio, setSelectedRatio] = useState(ASPECT_RATIOS[0]);
  const [activeAccount, setActiveAccount] = useState<UserAccountSummary | null>(null);
  const [genStatus, setGenStatus] = useState<GenStatus>({
    isGenerating: false,
    progress: 0,
    status: 'idle',
    errorMessage: '',
  });

  const syncActiveAccount = useCallback(async () => {
    const snapshot = await window.electron.accounts.list();
    const nextActiveAccount =
      snapshot.accounts.find((account) => account.id === snapshot.activeAccountId) ??
      snapshot.accounts[0] ??
      null;
    setActiveAccount(nextActiveAccount);
    return nextActiveAccount;
  }, []);

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
            isGeneratingRef.current = false;
            // Clear refs on completion
            if (intervalRef.current) clearInterval(intervalRef.current);
            if (unwatchRef.current) unwatchRef.current();
            if (safetyTimeoutRef.current) clearTimeout(safetyTimeoutRef.current);
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
            isGeneratingRef.current = false;
            if (intervalRef.current) clearInterval(intervalRef.current);
            if (unwatchRef.current) unwatchRef.current();
            if (safetyTimeoutRef.current) clearTimeout(safetyTimeoutRef.current);
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
      intervalRef.current = interval;
      const unwatch = window.electron.generation.onProgress((data) => {
        if (data.job_id === jobId && data.progress !== undefined) {
          setGenStatus((prev) => ({ ...prev, progress: data.progress ?? prev.progress }));
        }
      });
      unwatchRef.current = unwatch;

      // Initial check
      await checkStatus();

      // Stop after 5 minutes
      safetyTimeoutRef.current = setTimeout(() => {
        clearInterval(intervalRef.current!);
        unwatchRef.current?.();
      }, 5 * 60 * 1000);
    },
    [updateJob, syncAssetsFromJobStatus, prompt]
  );

  // Cleanup on unmount
  useEffect(() => {
    void syncActiveAccount();
  }, [syncActiveAccount]);

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (unwatchRef.current) unwatchRef.current();
      if (safetyTimeoutRef.current) clearTimeout(safetyTimeoutRef.current);
    };
  }, []);

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    if (isGeneratingRef.current) return;
    isGeneratingRef.current = true;

    const latestActiveAccount = await syncActiveAccount();
    const useOpenRouterImage =
      latestActiveAccount?.preferences.imageGenerationProvider === 'openrouter';
    const openRouterImageModel = latestActiveAccount?.preferences.openRouterImageModel.trim() ?? '';

    if (useOpenRouterImage && !latestActiveAccount?.openRouter.apiKeyStored) {
      setGenStatus({
        isGenerating: false,
        progress: 0,
        status: 'error',
        errorMessage: 'OpenRouter is selected for still images, but no API key is stored for the active account.',
      });
      isGeneratingRef.current = false;
      return;
    }

    if (useOpenRouterImage && !openRouterImageModel) {
      setGenStatus({
        isGenerating: false,
        progress: 0,
        status: 'error',
        errorMessage: 'Select an OpenRouter still-image model in Settings before generating.',
      });
      isGeneratingRef.current = false;
      return;
    }

    if (!systemInfo.backendConnected && !useOpenRouterImage) {
      setGenStatus({
        isGenerating: false,
        progress: 0,
        status: 'error',
        errorMessage: 'The AI backend is not running. Please restart the app or start the backend from Settings.',
      });
      isGeneratingRef.current = false;
      return;
    }

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
        model: useOpenRouterImage ? openRouterImageModel : selectedModel,
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
            model: useOpenRouterImage ? openRouterImageModel : selectedModel,
            scheduler: advancedGeneration.scheduler,
            output_root: outputRoot,
          },
          createdAt: new Date(),
        });
        pollJobStatus(result.jobId);
      } else {
        throw new Error(result.error || 'Generation failed');
      }
    } catch (error: unknown) {
      console.error('Quick generate error:', error);
      const message = error instanceof Error ? error.message : 'Generation failed';
      setGenStatus({
        isGenerating: false,
        progress: 0,
        status: 'error',
        errorMessage: message,
      });
      isGeneratingRef.current = false;
    }
  };

  const handleClear = () => {
    setPrompt('');
    setNegativePrompt('');
    setGenStatus({ isGenerating: false, progress: 0, status: 'idle', errorMessage: '' });
  };

  const openRouterImageEnabled = activeAccount?.preferences.imageGenerationProvider === 'openrouter';
  const openRouterImageModel = activeAccount?.preferences.openRouterImageModel.trim() ?? '';

  return (
    <div className="flex flex-col h-full bg-panel">
      <h1 className="sr-only">Quick Generate</h1>
      {/* Header */}
      <div className="px-4 py-3 border-b border-border flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2">
          <Wand2 className="w-4 h-4 text-accent-primary" aria-hidden="true" />
          <h2 className="type-section">Quick Generate</h2>
        </div>
        {genStatus.status === 'success' && (
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="flex items-center gap-1.5 type-ui text-status-success"
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
            <label htmlFor="quick-prompt" className="type-ui text-text-muted">
              Prompt
            </label>
            <textarea
              id="quick-prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe what you want to generate..."
              rows={4}
              className={cn(
                'recessed-well w-full resize-none',
                'px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted/50',
                'focus:outline-none focus:ring-2 focus:ring-accent-primary/40 focus:border-accent-primary'
              )}
              disabled={genStatus.isGenerating}
            />
          </div>

          {/* Negative Prompt */}
          <div className="space-y-1.5">
            <label htmlFor="quick-neg-prompt" className="type-ui text-text-muted">
              Negative Prompt
            </label>
            <textarea
              id="quick-neg-prompt"
              value={negativePrompt}
              onChange={(e) => setNegativePrompt(e.target.value)}
              placeholder="What to avoid..."
              rows={2}
              className={cn(
                'recessed-well w-full resize-none',
                'px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted/50',
                'focus:outline-none focus:ring-2 focus:ring-accent-primary/40 focus:border-accent-primary'
              )}
              disabled={genStatus.isGenerating}
            />
          </div>

          {/* Model selector */}
          <div className="space-y-2">
            <div>
              <label className="mono-label text-text-muted">
                Model Router
              </label>
              <p className="mt-1 text-xs text-text-muted">
                {openRouterImageEnabled
                  ? 'The active account is routing still images through OpenRouter.'
                  : 'Route this quick image through a model profile.'}
              </p>
            </div>
            {openRouterImageEnabled ? (
              <div className="rounded-lg border border-accent-primary-border bg-accent-primary-muted/40 px-4 py-3">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md border border-accent-primary-border bg-surface text-accent-primary">
                    <Cloud className="h-4 w-4" aria-hidden="true" />
                  </div>
                  <div className="min-w-0">
                    <p className="type-section text-text-primary">
                      OpenRouter Still Image Route
                    </p>
                    <p className="mt-1 text-xs text-text-body">
                      Account: {activeAccount?.name ?? 'No active account'}.
                      {' '}Model: {openRouterImageModel || 'Not set in Settings'}.
                    </p>
                    <p className="mt-1 text-xs text-text-muted">
                      Quick Generate uses the account&apos;s hosted still-image model until you switch the account back to Local.
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <ModelSelector
                value={selectedModel}
                onChange={setSelectedModel}
                generationType="image"
              />
            )}
          </div>

          {/* Aspect ratio */}
          <div className="space-y-1.5">
            <label className="mono-label text-text-muted">
              Aspect Ratio
            </label>
            <div className="grid grid-cols-4 gap-1.5">
              {ASPECT_RATIOS.map((ratio) => (
                <button
                  key={ratio.name}
                  onClick={() => setSelectedRatio(ratio)}
                  disabled={genStatus.isGenerating}
                  aria-pressed={selectedRatio.name === ratio.name}
                  className={cn(
                    'vx-pad raised-control flex flex-col items-center justify-center gap-0.5 px-2 py-2 text-xs',
                    selectedRatio.name === ratio.name
                      ? 'text-accent-primary'
                      : 'text-text-body hover:text-text-primary'
                  )}
                  style={
                    selectedRatio.name === ratio.name
                      ? {
                          borderColor: 'var(--color-chrome)',
                          boxShadow:
                            'inset 0 1px 0 rgba(255,255,255,0.12), 0 0 0 1px var(--color-chrome-edge), 0 4px 8px rgba(0,0,0,0.5)',
                        }
                      : undefined
                  }
                >
                  <span className="type-ui">{ratio.icon}</span>
                  <span className="type-caption">{ratio.name}</span>
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
            <div className="flex items-start gap-2 py-2 px-3 rounded-md bg-status-error-muted border border-status-error-border text-status-error">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" aria-hidden="true" />
              <p className="type-ui">{genStatus.errorMessage}</p>
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
                <span className="type-caption">Generating...</span>
                <span className="type-caption">{genStatus.progress}%</span>
              </div>
              <div className="h-1 bg-void rounded-full overflow-hidden">
                <motion.div
                  className="h-full rounded-full bg-[linear-gradient(90deg,var(--color-gradient-progress-start),var(--color-gradient-progress-end))]"
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
        <ChromeButton
          variant="chrome"
          onClick={handleGenerate}
          disabled={genStatus.isGenerating || !prompt.trim()}
          className="flex-1"
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
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
        </ChromeButton>
      </div>
    </div>
  );
}
