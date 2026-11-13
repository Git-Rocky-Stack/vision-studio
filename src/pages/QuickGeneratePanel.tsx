import { useState, useCallback, useRef, useEffect, useId } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '@/store/appStore';
import { toAccelerationRequestPayload } from '@/features/generation/accelerationRequest';
import {
  appJobWatcher,
  selectLatestRunningJob,
  useTrackedJob,
} from '@/features/jobs/appJobWatcher';
import { Button } from '@/components/ui/Button';
import { ModelSelector } from '@/components/generate/ModelSelector';
import { cn } from '@/utils/cn';
import type { UserAccountSummary } from '@/types/electron';
import { Wand2, Loader2, CheckCircle2, AlertCircle, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChromeButton } from '@/components/hardware';
import { RouteStatusCard } from '@/components/generate/RouteStatusCard';

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
  const modelRouterLabelId = useId();
  const aspectRatioLabelId = useId();
  const { addJob, advancedGeneration, systemInfo } = useAppStore(useShallow(s => ({
    addJob: s.addJob,
    advancedGeneration: s.advancedGeneration,
    systemInfo: s.systemInfo,
  })));

  // The app job watcher owns the run from submit to its terminal state
  // (#J1): it follows the job through the progress push with a polling
  // fallback, and syncs the asset and notifies even if this panel unmounts.
  // There is no wall-clock stop - a slow run is followed until it finishes.
  // A remount picks the in-flight run back up from the store.
  const [resumedJob] = useState(() => selectLatestRunningJob(useAppStore.getState(), 'quick'));
  const [activeJobId, setActiveJobId] = useState<string | null>(resumedJob?.id ?? null);
  const trackedJob = useTrackedJob(activeJobId);
  const isGeneratingRef = useRef(Boolean(resumedJob));

  const [prompt, setPrompt] = useState('');
  const [negativePrompt, setNegativePrompt] = useState('');
  const [selectedModel, setSelectedModel] = useState('flux-dev');
  const [selectedRatio, setSelectedRatio] = useState<(typeof ASPECT_RATIOS)[number]>(ASPECT_RATIOS[0]);
  const [activeAccount, setActiveAccount] = useState<UserAccountSummary | null>(null);
  const [genStatus, setGenStatus] = useState<GenStatus>({
    isGenerating: Boolean(resumedJob),
    progress: resumedJob?.progress ?? 0,
    status: resumedJob ? 'generating' : 'idle',
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

  useEffect(() => {
    void syncActiveAccount().catch(() => setActiveAccount(null));
  }, [syncActiveAccount]);

  // Mirror the watcher-maintained job record into the panel status.
  useEffect(() => {
    if (!trackedJob) return;
    if (trackedJob.status === 'pending' || trackedJob.status === 'processing') {
      setGenStatus((prev) =>
        prev.progress === trackedJob.progress ? prev : { ...prev, progress: trackedJob.progress },
      );
      return;
    }
    isGeneratingRef.current = false;
    setActiveJobId(null);
    if (trackedJob.status === 'completed') {
      setGenStatus({ isGenerating: false, progress: 100, status: 'success', errorMessage: '' });
    } else if (trackedJob.status === 'failed') {
      setGenStatus({
        isGenerating: false,
        progress: trackedJob.progress,
        status: 'error',
        errorMessage: trackedJob.error || 'Generation failed',
      });
    } else {
      setGenStatus({ isGenerating: false, progress: 0, status: 'idle', errorMessage: '' });
    }
  }, [trackedJob]);

  const handleCancel = () => {
    if (!activeJobId) return;
    void appJobWatcher.cancel(activeJobId).catch((error: unknown) => {
      console.error('Failed to cancel quick generation:', error);
    });
  };

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    if (isGeneratingRef.current) return;
    isGeneratingRef.current = true;

    const latestActiveAccount = await syncActiveAccount();
    const savedImageProvider = latestActiveAccount?.preferences.imageGenerationProvider;
    const useOpenRouterImage = savedImageProvider === 'openrouter';
    const useHuggingFaceImage = savedImageProvider === 'huggingface';
    const useHostedImage = useOpenRouterImage || useHuggingFaceImage;
    const openRouterImageModel = latestActiveAccount?.preferences.openRouterImageModel.trim() ?? '';
    const huggingFaceImageModel = latestActiveAccount?.preferences.huggingFaceImageModel?.trim() ?? '';
    const requestedModel = useOpenRouterImage
      ? openRouterImageModel
      : useHuggingFaceImage
        ? huggingFaceImageModel
        : selectedModel;

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

    if (useHuggingFaceImage && !latestActiveAccount?.huggingFace?.tokenStored) {
      setGenStatus({
        isGenerating: false,
        progress: 0,
        status: 'error',
        errorMessage: 'HuggingFace is selected for still images, but no token is stored for the active account.',
      });
      isGeneratingRef.current = false;
      return;
    }

    if (useHuggingFaceImage && !huggingFaceImageModel) {
      setGenStatus({
        isGenerating: false,
        progress: 0,
        status: 'error',
        errorMessage: 'Select a HuggingFace still-image model in Settings before generating.',
      });
      isGeneratingRef.current = false;
      return;
    }

    // Hosted routes do not need the local backend.
    if (!systemInfo.backendConnected && !useHostedImage) {
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
        model: requestedModel,
        scheduler: advancedGeneration.scheduler,
        acceleration_settings: toAccelerationRequestPayload(
          useAppStore.getState().accelerationSettings,
        ),
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
            model: requestedModel,
            scheduler: advancedGeneration.scheduler,
            output_root: outputRoot,
            origin: 'quick',
          },
          createdAt: new Date(),
        });
        setActiveJobId(result.jobId);
        void appJobWatcher.track({
          jobId: result.jobId,
          kind: 'image',
          origin: 'quick',
          prompt: prompt.trim(),
          outputRoot,
        });
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
  const huggingFaceImageEnabled = activeAccount?.preferences.imageGenerationProvider === 'huggingface';
  const hostedRoute = openRouterImageEnabled
    ? {
        title: 'OpenRouter Still Image Route',
        provider: 'OpenRouter',
        model: activeAccount?.preferences.openRouterImageModel.trim() ?? '',
        credentialStored: Boolean(activeAccount?.openRouter.apiKeyStored),
      }
    : huggingFaceImageEnabled
      ? {
          title: 'HuggingFace Still Image Route',
          provider: 'HuggingFace',
          model: activeAccount?.preferences.huggingFaceImageModel?.trim() ?? '',
          credentialStored: Boolean(activeAccount?.huggingFace?.tokenStored),
        }
      : null;

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
                'focus:border-accent-primary'
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
                'focus:border-accent-primary'
              )}
              disabled={genStatus.isGenerating}
            />
          </div>

          {/* Model selector */}
          <div className="space-y-2" role="group" aria-labelledby={modelRouterLabelId}>
            <div>
              <span id={modelRouterLabelId} className="block mono-label text-text-muted">
                Model Router
              </span>
              <p className="mt-1 text-xs text-text-muted">
                {hostedRoute
                  ? `The active account is routing still images through ${hostedRoute.provider}.`
                  : 'Route this quick image through a model profile.'}
              </p>
            </div>
            {hostedRoute ? (
              <RouteStatusCard
                title={hostedRoute.title}
                ready={Boolean(hostedRoute.model) && hostedRoute.credentialStored}
              >
                <p className="mt-1 text-xs text-text-body">
                  Account: {activeAccount?.name ?? 'No active account'}.
                  {' '}Model: {hostedRoute.model || 'Not set in Settings'}.
                </p>
                <p className="mt-1 text-xs text-text-muted">
                  Quick Generate uses the account&apos;s hosted still-image model until you switch the account back to Local.
                </p>
              </RouteStatusCard>
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
            {/* Names the ratio button group, not a single form field. */}
            <span id={aspectRatioLabelId} className="block mono-label text-text-muted">
              Aspect Ratio
            </span>
            <div className="grid grid-cols-4 gap-1.5" role="group" aria-labelledby={aspectRatioLabelId}>
              {ASPECT_RATIOS.map((ratio) => (
                <button
                  key={ratio.name}
                  onClick={() => setSelectedRatio(ratio)}
                  disabled={genStatus.isGenerating}
                  aria-pressed={selectedRatio.name === ratio.name}
                  className={cn(
                    'vx-pad raised-control flex flex-col items-center justify-center gap-0.5 px-2 py-2 text-xs',
                    selectedRatio.name === ratio.name
                      ? 'selected-cap text-accent-primary'
                      : 'text-text-body hover:text-text-primary'
                  )}
                  style={
                    selectedRatio.name === ratio.name ? { borderColor: 'var(--color-chrome)' } : undefined
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
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="type-caption">Generating...</span>
                <span className="flex-1" />
                <span className="type-caption">{Math.round(genStatus.progress)}%</span>
                {activeJobId ? (
                  <button
                    type="button"
                    onClick={handleCancel}
                    data-testid="quick-cancel"
                    className="flex min-h-[28px] items-center gap-1 rounded-md px-2 type-caption text-text-body transition hover:bg-elevated hover:text-text-primary"
                  >
                    <X className="h-3 w-3" aria-hidden="true" />
                    Cancel
                  </button>
                ) : null}
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
          size="lg"
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
        </ChromeButton>
      </div>
    </div>
  );
}
