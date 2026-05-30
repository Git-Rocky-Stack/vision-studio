import { useState, useRef, useEffect, useCallback } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '@/store/appStore';
import { cn } from '@/utils/cn';
import { Button } from '@/components/ui/Button';
import { Slider } from '@/components/ui/Slider';
import { ResultsGrid } from '@/components/batch/ResultsGrid';
import { ImagePreviewModal } from '@/components/shared/ImagePreviewModal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import type { ViewMode, SortBy, FilterBy } from '@/components/batch/ResultsGrid';
import type { UserAccountSummary } from '@/types/electron';
import {
  AlertCircle,
  Cloud,
  Layers,
  Plus,
  Trash2,
  Play,
  Pause,
  Sparkles,
  CheckCircle2,
  XCircle,
  Loader2,
  Wand2,
  FileJson,
  GripVertical,
  Grid3X3,
  List,
  Maximize2,
  ArrowUpDown,
  Download,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChromeButton } from '@/components/hardware';
import { resolveStoredAssetPath } from '@/features/assets/assetRecords';

interface BatchPrompt {
  id: string;
  prompt: string;
  status: 'pending' | 'generating' | 'completed' | 'failed';
  result?: string;
  seed?: number;
}

interface BatchNoticeState {
  tone: 'error' | 'info';
  message: string;
}

const BACKEND_ASSET_BASE_URL = 'http://localhost:8000';

function resolveOutputRoot(defaultOutputPath: string, userDataPath: string) {
  return (defaultOutputPath || `${userDataPath.replace(/\\/g, '/')}/outputs`).replace(/\\/g, '/');
}

function toPreviewUrl(assetPath: string) {
  if (!assetPath) {
    return '';
  }

  if (/^https?:\/\//.test(assetPath)) {
    return assetPath;
  }

  return assetPath.startsWith('/')
    ? `${BACKEND_ASSET_BASE_URL}${assetPath}`
    : `${BACKEND_ASSET_BASE_URL}/${assetPath}`;
}

/* ───────────────────────────────────────────────────────────
   BatchPromptQueue - The right panel (400px) in batch mode
   Contains results toolbar + batch generation controls
   ─────────────────────────────────────────────────────────── */

const VIEW_MODE_OPTIONS: { value: ViewMode; icon: React.ElementType; label: string }[] = [
  { value: 'grid', icon: Grid3X3, label: 'Grid view' },
  { value: 'list', icon: List, label: 'List view' },
  { value: 'large', icon: Maximize2, label: 'Large view' },
];

const SORT_OPTIONS: { value: SortBy; label: string }[] = [
  { value: 'created', label: 'Creation Time' },
  { value: 'prompt', label: 'Prompt Order' },
  { value: 'status', label: 'Status' },
];

const FILTER_OPTIONS: { value: FilterBy; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'completed', label: 'Completed' },
  { value: 'failed', label: 'Failed' },
  { value: 'favorites', label: 'Favorites' },
];

export function BatchPromptQueue() {
  const {
    addBatchJob,
    addBatchResult,
    syncAssetsFromJobStatus,
    systemInfo,
    batchResults,
    batchViewMode,
    batchSortBy,
    batchFilterBy,
    setBatchViewMode,
    setBatchSortBy,
    setBatchFilterBy,
    removeBatchResults,
    removeAssetRecordsByPaths,
  } = useAppStore(
    useShallow((s) => ({
      addBatchJob: s.addBatchJob,
      addBatchResult: s.addBatchResult,
      syncAssetsFromJobStatus: s.syncAssetsFromJobStatus,
      systemInfo: s.systemInfo,
      batchResults: s.batchResults,
      batchViewMode: s.batchViewMode,
      batchSortBy: s.batchSortBy,
      batchFilterBy: s.batchFilterBy,
      setBatchViewMode: s.setBatchViewMode,
      setBatchSortBy: s.setBatchSortBy,
      setBatchFilterBy: s.setBatchFilterBy,
      removeBatchResults: s.removeBatchResults,
      removeAssetRecordsByPaths: s.removeAssetRecordsByPaths,
    }))
  );

  // Ref for polling interval cleanup
  const batchPollRef = useRef<ReturnType<typeof setInterval>>(null);
  useEffect(() => {
    return () => {
      if (batchPollRef.current) clearInterval(batchPollRef.current);
    };
  }, []);

  const [prompts, setPrompts] = useState<BatchPrompt[]>([
    { id: '1', prompt: '', status: 'pending' },
  ]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [activeAccount, setActiveAccount] = useState<UserAccountSummary | null>(null);
  const [batchNotice, setBatchNotice] = useState<BatchNoticeState | null>(null);

  // Generation settings
  const [width, setWidth] = useState(1024);
  const [height, setHeight] = useState(1024);
  const [steps, setSteps] = useState(25);
  const [cfgScale, setCfgScale] = useState(7.5);
  const [model, setModel] = useState('flux-dev');

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
    void syncActiveAccount();
  }, [syncActiveAccount]);

  const openRouterImageEnabled = activeAccount?.preferences.imageGenerationProvider === 'openrouter';
  const openRouterImageModel = activeAccount?.preferences.openRouterImageModel.trim() ?? '';

  const addPrompt = () => {
    setPrompts([
      ...prompts,
      { id: crypto.randomUUID(), prompt: '', status: 'pending' },
    ]);
  };

  const removePrompt = (id: string) => {
    if (prompts.length > 1) {
      setPrompts(prompts.filter((p) => p.id !== id));
    }
  };

  const updatePrompt = (id: string, value: string) => {
    setPrompts(prompts.map((p) => (p.id === id ? { ...p, prompt: value } : p)));
  };

  const generateVariations = (basePrompt: string, count: number = 4) => {
    const modifiers = [
      'highly detailed, 8k resolution',
      'cinematic lighting, dramatic atmosphere',
      'vibrant colors, bold composition',
      'minimalist, clean design, subtle tones',
      'vintage style, film grain, nostalgic',
      'futuristic, neon lights, cyberpunk aesthetic',
      'natural lighting, soft shadows, realistic',
      'abstract, artistic interpretation, painterly',
    ];

    const newPrompts = Array.from({ length: count }, (_, i) => ({
      id: crypto.randomUUID(),
      prompt: `${basePrompt}, ${modifiers[i % modifiers.length]}`,
      status: 'pending' as const,
    }));

    setPrompts([...prompts, ...newPrompts]);
  };

  const handleStartBatch = async () => {
    const validPrompts = prompts.filter((p) => p.prompt.trim());
    if (validPrompts.length === 0) return;

    const latestActiveAccount = await syncActiveAccount();
    const useOpenRouterImage =
      latestActiveAccount?.preferences.imageGenerationProvider === 'openrouter';
    const resolvedOpenRouterImageModel =
      latestActiveAccount?.preferences.openRouterImageModel.trim() ?? '';

    if (useOpenRouterImage && !latestActiveAccount?.openRouter.apiKeyStored) {
      setBatchNotice({
        tone: 'error',
        message: 'OpenRouter is selected for still images, but no API key is stored for the active account.',
      });
      return;
    }

    if (useOpenRouterImage && !resolvedOpenRouterImageModel) {
      setBatchNotice({
        tone: 'error',
        message: 'Select an OpenRouter still-image model in Settings before starting a hosted batch.',
      });
      return;
    }

    if (!systemInfo.backendConnected && !useOpenRouterImage) {
      setBatchNotice({
        tone: 'error',
        message: 'The AI backend is not running. Start the backend or switch the active account to OpenRouter for hosted still-image batches.',
      });
      return;
    }

    const submittedModel = useOpenRouterImage ? resolvedOpenRouterImageModel : model;

    setBatchNotice(
      useOpenRouterImage
        ? {
            tone: 'info',
            message: `Batch is routing through OpenRouter for ${latestActiveAccount?.name ?? 'the active account'}.`,
          }
        : null
    );
    setIsGenerating(true);
    setPrompts(prompts.map((p) => (p.prompt.trim() ? { ...p, status: 'pending' } : p)));

    const batchId = crypto.randomUUID();
    addBatchJob({
      id: batchId,
      name: `Batch ${new Date().toLocaleTimeString()}`,
      prompts: validPrompts.map((p) => p.prompt),
      currentIndex: 0,
      completedJobs: [],
      failedJobs: [],
      status: 'running',
      createdAt: new Date(),
    });

    try {
      const appSettings = await window.electron.settings.get();
      const userDataPath = await window.electron.app.getPath('userData');
      const outputRoot = resolveOutputRoot(appSettings.defaultOutputPath, userDataPath);

      const result = await window.electron.generation.batch({
        prompts: validPrompts.map((p) => p.prompt),
        width,
        height,
        steps,
        cfg_scale: cfgScale,
        model: submittedModel,
      });

      if (result.success && result.jobIds) {
        let jobIndex = 0;
        const promptsWithJobIds = prompts.map((p) => {
          if (p.prompt.trim() && jobIndex < result.jobIds!.length) {
            return { ...p, status: 'generating' as const, id: result.jobIds![jobIndex++] };
          }
          return p;
        });
        setPrompts(promptsWithJobIds);
        pollBatchProgress(batchId, result.jobIds, promptsWithJobIds, outputRoot, submittedModel);
        return;
      }

      setBatchNotice({
        tone: 'error',
        message: result.error || 'Batch generation failed.',
      });
      setIsGenerating(false);
    } catch (error) {
      console.error('Batch generation failed:', error);
      setBatchNotice({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Batch generation failed.',
      });
      setIsGenerating(false);
    }
  };

  const pollBatchProgress = async (
    batchId: string,
    jobIds: string[],
    startingPrompts: BatchPrompt[],
    outputRoot: string,
    submittedModel: string,
  ) => {
    const checkInterval = setInterval(async () => {
      batchPollRef.current = checkInterval;
      let allCompleted = true;
      const updatedPrompts = [...startingPrompts];

      for (let i = 0; i < jobIds.length; i++) {
        try {
          const status = await window.electron.generation.getStatus(jobIds[i]);
          const promptIndex = updatedPrompts.findIndex((p) => p.id === jobIds[i]);

          if (promptIndex !== -1) {
            if (status.status === 'completed') {
              updatedPrompts[promptIndex].status = 'completed';
              updatedPrompts[promptIndex].result = status.result?.images?.[0];
              syncAssetsFromJobStatus({
                ...status,
                params: {
                  prompt: updatedPrompts[promptIndex].prompt,
                  width,
                  height,
                  steps,
                  cfg_scale: cfgScale,
                  model: submittedModel,
                  output_root: outputRoot,
                },
              });
              addBatchResult({
                id: jobIds[i],
                batchId,
                promptIndex: promptIndex,
                prompt: updatedPrompts[promptIndex].prompt,
                imagePath: toPreviewUrl(status.result?.images?.[0] || ''),
                assetPath: resolveStoredAssetPath(
                  status.result?.images?.[0] || '',
                  {
                    output_root: outputRoot,
                  }
                ),
                seed: status.result?.seed || 0,
                generationTime: 0,
                params: {
                  width,
                  height,
                  steps,
                  cfgScale,
                  model: submittedModel,
                  negativePrompt: '',
                  resolution: `${width} x ${height}`,
                },
                createdAt: status.created_at ? new Date(status.created_at) : new Date(),
                isFavorite: false,
              });
            } else if (status.status === 'failed') {
              updatedPrompts[promptIndex].status = 'failed';
              if (status.error) {
                setBatchNotice({
                  tone: 'error',
                  message: status.error,
                });
              }
            } else {
              allCompleted = false;
            }
          }
        } catch (e) {
          console.error('Failed to get job status:', e);
        }
      }

      setPrompts(updatedPrompts);

      if (allCompleted) {
        clearInterval(checkInterval);
        batchPollRef.current = null;
        setIsGenerating(false);
      }
    }, 2000);
  };

  const handleCancel = () => {
    setIsGenerating(false);
    setBatchNotice({
      tone: 'info',
      message: 'Batch cancellation requested.',
    });
    prompts.forEach((p) => {
      if (p.status === 'generating') {
        window.electron.generation.cancel(p.id);
      }
    });
  };

  const handleExport = () => {
    const data = {
      prompts: prompts.map((p) => p.prompt).filter(Boolean),
      settings: {
        provider: openRouterImageEnabled ? 'openrouter' : 'local',
        width,
        height,
        steps,
        cfgScale,
        model: openRouterImageEnabled ? openRouterImageModel : model,
      },
      createdAt: new Date().toISOString(),
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `batch-prompts-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleBulkExportAll = async () => {
    const assetPaths = batchResults
      .map((result) => result.assetPath)
      .filter((assetPath): assetPath is string => Boolean(assetPath));

    if (assetPaths.length === 0) return;

    const destinationDir = await window.electron.dialog.selectFolder();
    if (!destinationDir) return;

    await window.electron.assets.exportMany(assetPaths, destinationDir);
  };

  const handleBulkDeleteAll = async () => {
    const assetPaths = batchResults
      .map((result) => result.assetPath)
      .filter((assetPath): assetPath is string => Boolean(assetPath));

    const deleteResults = await Promise.all(
      assetPaths.map((assetPath) => window.electron.assets.delete(assetPath))
    );
    const deletedPaths = assetPaths.filter((_, index) => deleteResults[index]?.success);
    const deletedIds = batchResults
      .filter((result) => result.assetPath && deletedPaths.includes(result.assetPath))
      .map((result) => result.id);

    removeBatchResults(deletedIds);
    removeAssetRecordsByPaths(deletedPaths);
    setShowDeleteConfirm(false);
  };

  const completedCount = prompts.filter((p) => p.status === 'completed').length;
  const progress =
    prompts.length > 0 ? (completedCount / prompts.length) * 100 : 0;

  return (
    <div className="h-full flex flex-col bg-surface" data-testid="batch-panel">
      {/* Results Toolbar */}
      <div className="p-3 border-b border-border space-y-3">
        {/* View / Sort row */}
        <div className="flex items-center gap-2">
          {/* View mode toggle */}
          <div className="flex items-center bg-elevated rounded-lg border border-border p-0.5">
            {VIEW_MODE_OPTIONS.map((opt) => {
              const Icon = opt.icon;
              return (
                <button
                  key={opt.value}
                  onClick={() => setBatchViewMode(opt.value)}
                  aria-label={opt.label}
                  className={cn(
                    'p-2 rounded-md transition-all',
                    batchViewMode === opt.value
                      ? 'bg-accent-primary-muted text-accent-primary border border-accent-primary-border'
                      : 'text-text-muted hover:text-text-primary'
                  )}
                >
                  <Icon className="w-3.5 h-3.5" />
                </button>
              );
            })}
          </div>

          {/* Sort dropdown */}
          <div className="flex items-center gap-2 ml-auto">
            <ArrowUpDown className="w-3.5 h-3.5 text-text-muted" />
            <select
              value={batchSortBy}
              onChange={(e) => setBatchSortBy(e.target.value as SortBy)}
              className="bg-elevated border border-border rounded-md px-2 py-1 text-xs font-display text-text-primary focus:border-accent-primary focus:ring-1 focus:ring-accent-primary/40 transition-all"
            >
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Filter pills */}
        <div className="flex flex-wrap gap-2">
          {FILTER_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setBatchFilterBy(opt.value)}
              className={cn(
                'px-2.5 py-1 rounded-lg text-xs font-display transition-all',
                batchFilterBy === opt.value
                  ? 'bg-accent-primary-muted text-accent-primary border border-accent-primary-border'
                  : 'bg-elevated text-text-body border border-border hover:border-border-hover hover:text-text-primary'
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Bulk actions */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-text-muted font-display">
            {batchResults.length} result{batchResults.length !== 1 ? 's' : ''}
          </span>
          <div className="flex-1" />
          <button
            onClick={handleBulkExportAll}
            disabled={batchResults.length === 0}
            className="flex items-center gap-2 px-2.5 py-1 rounded-lg text-xs font-display text-text-body hover:text-text-primary hover:bg-elevated transition-all disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <Download className="w-3.5 h-3.5" />
            Export All
          </button>
          <button
            onClick={() => setShowDeleteConfirm(true)}
            disabled={batchResults.length === 0}
            className="flex items-center gap-2 px-2.5 py-1 rounded-md text-xs font-display text-status-error hover:bg-status-error-muted transition-all disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Delete All
          </button>
        </div>
      </div>

      {/* Batch Generation Header */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center gap-2 mb-1">
          <div className="raised-control flex h-8 w-8 flex-shrink-0 items-center justify-center text-accent-primary">
            <Layers className="w-4 h-4" />
          </div>
          <h2 className="font-display text-lg font-semibold text-text-primary">
            Batch Generation
          </h2>
        </div>
        <p className="text-sm text-text-body">
          Generate multiple images at once with different prompts
        </p>
      </div>

      {(openRouterImageEnabled || batchNotice) && (
        <div className="space-y-3 border-b border-border px-4 py-3">
          {openRouterImageEnabled && (
            <div className="rounded-lg border border-accent-primary-border bg-accent-primary-muted/40 px-4 py-3">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md border border-accent-primary-border bg-surface text-accent-primary">
                  <Cloud className="h-4 w-4" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-display font-medium text-text-primary">
                    OpenRouter Batch Route
                  </p>
                  <p className="mt-1 text-xs text-text-body">
                    Account: {activeAccount?.name ?? 'No active account'}.
                    {' '}Model: {openRouterImageModel || 'Not set in Settings'}.
                  </p>
                  <p className="mt-1 text-xs text-text-muted">
                    Hosted still-image batches can run even when the local backend is offline.
                    Local-only controls like steps and CFG stay disabled while this route is active.
                  </p>
                </div>
              </div>
            </div>
          )}

          {batchNotice && (
            <div
              className={cn(
                'rounded-md border px-3 py-2 text-xs',
                batchNotice.tone === 'error'
                  ? 'border-status-error-border bg-status-error-muted text-status-error'
                  : 'border-border bg-elevated text-text-body',
              )}
            >
              <div className="flex items-start gap-2">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
                <span>{batchNotice.message}</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Progress Bar */}
      {isGenerating && (
        <div className="px-4 py-3 border-b border-border bg-elevated">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-text-body font-display" aria-live="polite">
              Progress: {completedCount} / {prompts.length}
            </span>
            <span className="font-mono text-sm text-accent-primary" aria-live="polite">
              {Math.round(progress)}%
            </span>
          </div>
          <div className="recessed-well h-1.5 rounded-full overflow-hidden">
            <motion.div
              className="h-full rounded-full"
              role="progressbar"
              aria-valuenow={Math.round(progress)}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Batch progress"
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.3 }}
              style={{
                background: 'linear-gradient(90deg, var(--color-gradient-progress-start), var(--color-gradient-progress-end))',
                boxShadow: '0 0 8px var(--color-accent-primary-glow)',
              }}
            />
          </div>
        </div>
      )}

      {/* Prompts List */}
      <div className="flex-1 overflow-y-auto p-4 scrollbar-hide">
        <div className="space-y-3">
          <AnimatePresence>
            {prompts.map((prompt, index) => (
              <motion.div
                key={prompt.id}
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className={cn(
                  'relative p-3 rounded-lg border transition-all',
                  prompt.status === 'generating' &&
                    'border-status-warning-border bg-status-warning-muted',
                  prompt.status === 'completed' &&
                    'border-status-success-border bg-status-success-muted',
                  prompt.status === 'failed' &&
                    'border-status-error-border bg-status-error-muted',
                  prompt.status === 'pending' && 'border-border bg-elevated'
                )}
              >
                <div className="flex items-start gap-3">
                  {/* Drag handle */}
                  <div className="flex flex-col items-center gap-1 pt-2">
                    <GripVertical className="w-3.5 h-3.5 text-text-muted cursor-grab" />
                    <span className="font-mono text-micro text-text-muted">
                      {index + 1}
                    </span>
                  </div>

                  {/* Input */}
                  <div className="flex-1">
                    <textarea
                      value={prompt.prompt}
                      onChange={(e) => updatePrompt(prompt.id, e.target.value)}
                      placeholder="Enter prompt..."
                      disabled={isGenerating}
                      rows={2}
                      className="w-full bg-surface border border-border rounded-md px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent-primary focus:ring-1 focus:ring-accent-primary/40 resize-none disabled:opacity-50"
                    />
                  </div>

                  {/* Status/Actions */}
                  <div className="flex flex-col gap-1 pt-1">
                    {prompt.status === 'generating' && (
                      <Loader2 className="w-4 h-4 text-status-warning animate-spin" />
                    )}
                    {prompt.status === 'completed' && (
                      <CheckCircle2 className="w-4 h-4 text-status-success" />
                    )}
                    {prompt.status === 'failed' && (
                      <XCircle className="w-4 h-4 text-status-error" />
                    )}

                    {!isGenerating && (
                      <button
                        onClick={() => removePrompt(prompt.id)}
                        className="p-1 rounded-md text-text-muted hover:text-status-error hover:bg-status-error-muted transition-all"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {/* Add Buttons */}
        {!isGenerating && (
          <div className="flex gap-2 mt-4">
            <Button variant="secondary" size="sm" icon={Plus} onClick={addPrompt}>
              Add Prompt
            </Button>
            <Button
              variant="ghost"
              size="sm"
              icon={Wand2}
              onClick={() => {
                const lastPrompt = prompts[prompts.length - 1]?.prompt || '';
                if (lastPrompt) generateVariations(lastPrompt);
              }}
            >
              Variations
            </Button>
          </div>
        )}
      </div>

      {/* Settings */}
      <div className="border-t border-border">
        <button
          onClick={() => setShowSettings(!showSettings)}
          aria-expanded={showSettings}
          aria-controls="batch-settings-panel"
          className="w-full flex items-center justify-between p-4 text-sm text-text-body hover:text-text-primary transition-all font-display"
        >
          <span className="flex items-center gap-2">
            <Sparkles className="w-4 h-4" />
            Generation Settings
          </span>
          <span className="font-mono text-xs text-text-muted">
            {width}x{height} - {steps} steps
          </span>
        </button>

        <AnimatePresence>
          {showSettings && (
            <motion.div
              id="batch-settings-panel"
              initial={{ height: 0 }}
              animate={{ height: 'auto' }}
              exit={{ height: 0 }}
              className="overflow-hidden"
            >
              <div className="px-4 pb-4 space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-label text-text-body mb-1 block">
                      Width
                    </label>
                    <select
                      value={width}
                      onChange={(e) => setWidth(Number(e.target.value))}
                      className="w-full bg-elevated border border-border rounded-lg px-3 py-2 text-sm text-text-primary font-mono"
                    >
                      <option value={512}>512px</option>
                      <option value={768}>768px</option>
                      <option value={1024}>1024px</option>
                      <option value={1280}>1280px</option>
                      <option value={1920}>1920px</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-label text-text-body mb-1 block">
                      Height
                    </label>
                    <select
                      value={height}
                      onChange={(e) => setHeight(Number(e.target.value))}
                      className="w-full bg-elevated border border-border rounded-lg px-3 py-2 text-sm text-text-primary font-mono"
                    >
                      <option value={512}>512px</option>
                      <option value={768}>768px</option>
                      <option value={1024}>1024px</option>
                      <option value={1280}>1280px</option>
                      <option value={1920}>1920px</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-2">
                  <div>
                    <label className="text-label text-text-body mb-1 block">
                      Model Router
                    </label>
                    <p className="text-xs text-text-muted">
                      {openRouterImageEnabled
                        ? 'This batch will use the active account\'s hosted OpenRouter still-image model.'
                        : 'Use the local still-image stack for this batch.'}
                    </p>
                  </div>

                  {openRouterImageEnabled ? (
                    <div className="rounded-lg border border-accent-primary-border bg-accent-primary-muted/40 px-4 py-3">
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md border border-accent-primary-border bg-surface text-accent-primary">
                          <Cloud className="h-4 w-4" aria-hidden="true" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-display font-medium text-text-primary">
                            OpenRouter Hosted Model
                          </p>
                          <p className="mt-1 text-xs text-text-body">
                            {openRouterImageModel || 'Select an OpenRouter still-image model in Settings.'}
                          </p>
                          <p className="mt-1 text-xs text-text-muted">
                            Switch the active account&apos;s still-image provider back to Local in
                            Settings to pick a backend model and use local sampling controls here.
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <>
                      <Slider
                        label="Steps"
                        value={steps}
                        min={10}
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

                      <div>
                        <label className="text-label text-text-body mb-1 block">
                          Model
                        </label>
                        <select
                          value={model}
                          onChange={(e) => setModel(e.target.value)}
                          className="w-full bg-elevated border border-border rounded-lg px-3 py-2 text-sm text-text-primary font-display"
                        >
                          <option value="flux-dev">FLUX.1 [dev]</option>
                          <option value="sd3.5-large">Stable Diffusion 3.5 Large</option>
                          <option value="flux-fill">FLUX.1 Fill [dev]</option>
                          <option value="sd3.5-medium">Stable Diffusion 3.5 Medium</option>
                          <option value="flux-schnell">FLUX.1 [schnell]</option>
                          <option value="sd-1-5">Stable Diffusion 1.5</option>
                        </select>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Actions */}
      <div className="p-4 border-t border-border flex gap-2">
        {isGenerating ? (
          <Button variant="danger" icon={Pause} fullWidth onClick={handleCancel}>
            Cancel Batch
          </Button>
        ) : (
          <>
            <Button variant="secondary" icon={FileJson} onClick={handleExport}>
              Export
            </Button>
            <ChromeButton
              variant="chrome"
              onClick={handleStartBatch}
              disabled={!prompts.some((p) => p.prompt.trim())}
              className="flex-1"
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
            >
              <Play className="w-4 h-4" />
              Start Batch ({prompts.filter((p) => p.prompt.trim()).length})
            </ChromeButton>
          </>
        )}
      </div>

      <ConfirmDialog
        open={showDeleteConfirm}
        title="Delete All Results"
        message={`Are you sure you want to delete all ${batchResults.length} batch results? This cannot be undone.`}
        confirmLabel="Delete All"
        variant="danger"
        onConfirm={handleBulkDeleteAll}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </div>
  );
}

/* ───────────────────────────────────────────────────────────
   BatchResultsPanel - The left main area in batch mode
   Wraps ResultsGrid and ImagePreviewModal together
   ─────────────────────────────────────────────────────────── */

export function BatchResultsPanel() {
  const { batchResults, batchViewMode, batchSortBy, batchFilterBy } = useAppStore(
    useShallow((s) => ({
      batchResults: s.batchResults,
      batchViewMode: s.batchViewMode,
      batchSortBy: s.batchSortBy,
      batchFilterBy: s.batchFilterBy,
    }))
  );
  const [previewResultId, setPreviewResultId] = useState<string | null>(null);

  const previewResult = previewResultId
    ? batchResults.find((r) => r.id === previewResultId) ?? null
    : null;

  return (
    <>
      <ResultsGrid
        onPreviewImage={(id) => setPreviewResultId(id)}
        viewMode={batchViewMode}
        sortBy={batchSortBy}
        filterBy={batchFilterBy}
      />
      <ImagePreviewModal
        result={previewResult}
        results={batchResults}
        onClose={() => setPreviewResultId(null)}
        onNavigate={(id) => setPreviewResultId(id)}
      />
    </>
  );
}

/* ───────────────────────────────────────────────────────────
   BatchPanel - Legacy export for backward compatibility.
   App.tsx now uses BatchPromptQueue + BatchResultsPanel directly.
   ─────────────────────────────────────────────────────────── */

export function BatchPanel() {
  return (
    <>
      <h1 className="sr-only">Batch Generation</h1>
      <BatchPromptQueue />
    </>
  );
}
