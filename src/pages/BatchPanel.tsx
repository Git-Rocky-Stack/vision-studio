import { useState, useRef, useEffect, useCallback, useId } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useShallow } from 'zustand/react/shallow';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useAppStore } from '@/store/appStore';
import type { BatchQueuePrompt, BatchSeedMode } from '@/store/appStore.types';
import { BATCH_SEED_MAX, resolveBatchSeeds } from '@/store/slices/batchQueueSlice';
import { cn } from '@/utils/cn';
import { Button } from '@/components/ui/Button';
import { Slider } from '@/components/ui/Slider';
import { ResultsGrid } from '@/components/batch/ResultsGrid';
import { ImagePreviewModal } from '@/components/shared/ImagePreviewModal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import type { ViewMode, SortBy, FilterBy } from '@/components/batch/ResultsGrid';
import type { BatchParams, UserAccountSummary } from '@/types/electron';
import {
  AlertCircle,
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
  Copy,
  FileUp,
  ListX,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChromeButton } from '@/components/hardware';
import { RouteStatusCard } from '@/components/generate/RouteStatusCard';
import { appJobWatcher } from '@/features/jobs/appJobWatcher';
import {
  BATCH_IMPORT_ACCEPT,
  BATCH_IMPORT_MAX_BYTES,
  BatchPromptImportError,
  parseBatchPromptFile,
} from '@/features/generation/batchPromptImport';

const PROMPT_VIRTUALIZE_THRESHOLD = 30;
const BATCH_WIDTH_HEIGHT_OPTIONS = [512, 768, 1024, 1280, 1920] as const;

const SEED_MODE_OPTIONS: { value: BatchSeedMode; label: string; hint: string }[] = [
  { value: 'random', label: 'Random', hint: 'Each prompt gets its own random seed; the seed used is recorded on every result.' },
  { value: 'fixed', label: 'Fixed', hint: 'Every prompt runs on the same seed, so prompt changes are compared like for like.' },
  { value: 'increment', label: 'Increment', hint: 'Seeds count up from the base seed, one per prompt in queue order.' },
];

function promptCardClassName(status: BatchQueuePrompt['status']) {
  return cn(
    'relative p-3 rounded-md border transition',
    status === 'generating' && 'border-status-warning-border bg-status-warning-muted',
    status === 'completed' && 'border-status-success-border bg-status-success-muted',
    status === 'failed' && 'border-status-error-border bg-status-error-muted',
    status === 'pending' && 'border-border bg-elevated',
  );
}

function resolveOutputRoot(defaultOutputPath: string, userDataPath: string) {
  return (defaultOutputPath || `${userDataPath.replace(/\\/g, '/')}/outputs`).replace(/\\/g, '/');
}

function nearestOption(value: number) {
  return BATCH_WIDTH_HEIGHT_OPTIONS.reduce((best, option) =>
    Math.abs(option - value) < Math.abs(best - value) ? option : best,
  );
}

/* -----------------------------------------------------------
   BatchPromptQueue - The right panel (400px) in batch mode
   Contains results toolbar + batch generation controls
   ----------------------------------------------------------- */

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

interface PromptCardProps {
  prompt: BatchQueuePrompt;
  index: number;
  isGenerating: boolean;
  canRemove: boolean;
  onChange: (id: string, value: string) => void;
  onRemove: (id: string) => void;
  onDuplicate: (id: string) => void;
}

/**
 * One queue card. The grip is the real drag handle (#J14): pointer drag, or
 * keyboard - focus it, Space to pick up, arrow keys to move, Space to drop -
 * with dnd-kit's screen-reader announcements. Reordering is locked while a
 * batch runs, since card order is the submission order.
 */
function SortablePromptCard({
  prompt,
  index,
  isGenerating,
  canRemove,
  onChange,
  onRemove,
  onDuplicate,
}: PromptCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: prompt.id,
    disabled: isGenerating,
  });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      data-testid="batch-prompt-card"
      className={cn(promptCardClassName(prompt.status), isDragging && 'z-10 shadow-overlay')}
    >
      <div className="flex items-start gap-3">
        <div className="flex flex-col items-center gap-1 pt-1">
          <button
            type="button"
            {...attributes}
            {...listeners}
            disabled={isGenerating}
            aria-label={`Reorder prompt ${index + 1}`}
            title={isGenerating ? 'Reordering is locked while the batch runs' : 'Drag, or press Space and use the arrow keys, to reorder'}
            className={cn(
              'icon-button flex h-7 w-7 items-center justify-center rounded-md text-text-muted transition',
              isGenerating
                ? 'cursor-not-allowed opacity-40'
                : 'cursor-grab hover:bg-surface hover:text-text-primary active:cursor-grabbing',
            )}
          >
            <GripVertical className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
          <span className="type-meta text-text-muted">{index + 1}</span>
        </div>

        <div className="flex-1">
          <textarea
            aria-label={`Prompt ${index + 1}`}
            value={prompt.prompt}
            onChange={(e) => onChange(prompt.id, e.target.value)}
            placeholder="Enter prompt..."
            disabled={isGenerating}
            rows={2}
            className="recessed-well w-full resize-none px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent-primary disabled:opacity-50"
          />
          {prompt.seed !== undefined && prompt.status !== 'pending' ? (
            <p className="mt-1 data-mono text-text-muted">Seed {prompt.seed}</p>
          ) : null}
        </div>

        <div className="flex flex-col gap-1 pt-1">
          {prompt.status === 'generating' && (
            <Loader2 className="h-4 w-4 animate-spin text-status-warning" aria-label="Generating" />
          )}
          {prompt.status === 'completed' && (
            <CheckCircle2 className="h-4 w-4 text-status-success" aria-label="Completed" />
          )}
          {prompt.status === 'failed' && (
            <XCircle className="h-4 w-4 text-status-error" aria-label="Failed" />
          )}

          {!isGenerating && (
            <>
              <button
                type="button"
                onClick={() => onDuplicate(prompt.id)}
                aria-label={`Duplicate prompt ${index + 1}`}
                title="Duplicate prompt"
                className="icon-button rounded-md p-1 text-text-muted transition hover:bg-surface hover:text-text-primary"
              >
                <Copy className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
              {canRemove ? (
                <button
                  type="button"
                  onClick={() => onRemove(prompt.id)}
                  aria-label={`Remove prompt ${index + 1}`}
                  title="Remove prompt"
                  className="icon-button rounded-md p-1 text-text-muted transition hover:bg-status-error-muted hover:text-status-error"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export function BatchPromptQueue() {
  const modelRouterLabelId = useId();
  const {
    addBatchJob,
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
    prompts,
    seedStrategy,
    activeBatchId,
    batchNotice,
    addBatchQueuePrompt,
    appendBatchQueuePrompts,
    updateBatchQueuePrompt,
    removeBatchQueuePrompt,
    duplicateBatchQueuePrompt,
    moveBatchQueuePrompt,
    clearBatchQueue,
    setBatchQueue,
    setBatchSeedStrategy,
    setActiveBatchId,
    setBatchNotice,
  } = useAppStore(
    useShallow((s) => ({
      addBatchJob: s.addBatchJob,
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
      prompts: s.batchQueue,
      seedStrategy: s.batchSeedStrategy,
      activeBatchId: s.activeBatchId,
      batchNotice: s.batchNotice,
      addBatchQueuePrompt: s.addBatchQueuePrompt,
      appendBatchQueuePrompts: s.appendBatchQueuePrompts,
      updateBatchQueuePrompt: s.updateBatchQueuePrompt,
      removeBatchQueuePrompt: s.removeBatchQueuePrompt,
      duplicateBatchQueuePrompt: s.duplicateBatchQueuePrompt,
      moveBatchQueuePrompt: s.moveBatchQueuePrompt,
      clearBatchQueue: s.clearBatchQueue,
      setBatchQueue: s.setBatchQueue,
      setBatchSeedStrategy: s.setBatchSeedStrategy,
      setActiveBatchId: s.setActiveBatchId,
      setBatchNotice: s.setBatchNotice,
    }))
  );

  // The queue, its statuses and the running batch live in the store (#J1):
  // the app job watcher records every outcome there, so leaving this panel
  // mid-batch loses nothing and the cards are current when it remounts.
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isGenerating = isSubmitting || activeBatchId !== null;

  // A long batch (pasted prompt lists, variations, imports) renders only the
  // cards in view; short lists keep their enter/exit animation.
  const promptListRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const virtualizePrompts = prompts.length > PROMPT_VIRTUALIZE_THRESHOLD;
  const promptVirtualizer = useVirtualizer({
    count: prompts.length,
    getScrollElement: () => promptListRef.current,
    estimateSize: () => 96,
    overscan: 4,
    enabled: virtualizePrompts,
  });
  const [showSettings, setShowSettings] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [activeAccount, setActiveAccount] = useState<UserAccountSummary | null>(null);

  // Generation settings
  const [width, setWidth] = useState(1024);
  const [height, setHeight] = useState(1024);
  const [steps, setSteps] = useState(25);
  const [cfgScale, setCfgScale] = useState(7.5);
  const [model, setModel] = useState('flux-dev');

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

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

  const openRouterImageEnabled = activeAccount?.preferences.imageGenerationProvider === 'openrouter';
  const openRouterImageModel = activeAccount?.preferences.openRouterImageModel.trim() ?? '';
  const openRouterRouteReady = Boolean(openRouterImageModel) && Boolean(activeAccount?.openRouter.apiKeyStored);
  const huggingFaceImageEnabled = activeAccount?.preferences.imageGenerationProvider === 'huggingface';
  const huggingFaceImageModel = activeAccount?.preferences.huggingFaceImageModel?.trim() ?? '';

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      moveBatchQueuePrompt(String(active.id), String(over.id));
    },
    [moveBatchQueuePrompt],
  );

  const updatePrompt = useCallback(
    (id: string, value: string) => updateBatchQueuePrompt(id, { prompt: value }),
    [updateBatchQueuePrompt],
  );

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

    for (let i = 0; i < count; i += 1) {
      addBatchQueuePrompt(`${basePrompt}, ${modifiers[i % modifiers.length]}`);
    }
  };

  const handleImportFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Reset so choosing the same file again still fires a change.
    event.target.value = '';
    if (!file) return;
    if (file.size > BATCH_IMPORT_MAX_BYTES) {
      setBatchNotice({ tone: 'error', message: `${file.name} is too large to be a prompt list (2 MB limit).` });
      return;
    }
    try {
      const parsed = parseBatchPromptFile(file.name, await file.text());
      const added = appendBatchQueuePrompts(parsed.prompts);
      const settings = parsed.settings;
      if (settings) {
        if (settings.width !== undefined) setWidth(nearestOption(settings.width));
        if (settings.height !== undefined) setHeight(nearestOption(settings.height));
        if (settings.steps !== undefined) setSteps(Math.min(50, Math.max(10, Math.round(settings.steps))));
        if (settings.cfgScale !== undefined) setCfgScale(Math.min(20, Math.max(1, settings.cfgScale)));
        if (settings.model !== undefined && !openRouterImageEnabled && !huggingFaceImageEnabled) {
          setModel(settings.model);
        }
      }
      setBatchNotice({
        tone: 'info',
        message: `Imported ${added} prompt${added === 1 ? '' : 's'} from ${file.name}${settings ? ', with its settings' : ''}.`,
      });
    } catch (error) {
      setBatchNotice({
        tone: 'error',
        message:
          error instanceof BatchPromptImportError
            ? error.message
            : `Could not read ${file.name}: ${error instanceof Error ? error.message : 'unknown error'}`,
      });
    }
  };

  /**
   * Submits the batch. The 'random' and 'fixed' strategies are one bridge
   * call (one seed for every prompt, or none and the backend draws per
   * prompt); 'increment' needs a seed per prompt, so it submits prompt by
   * prompt in queue order.
   */
  const submitPrompts = async (
    entries: BatchQueuePrompt[],
    baseParams: Omit<BatchParams, 'prompts'>,
  ): Promise<{ jobIds: string[]; seeds: (number | undefined)[]; error?: string }> => {
    if (seedStrategy.mode !== 'increment') {
      const seed = seedStrategy.mode === 'fixed' ? resolveBatchSeeds(seedStrategy, 1)[0] : undefined;
      // `seed` rides the existing generation:batch params, which the main
      // process spreads into every per-prompt request.
      const params: BatchParams & { seed?: number } = {
        prompts: entries.map((entry) => entry.prompt),
        ...baseParams,
        ...(seed !== undefined ? { seed } : {}),
      };
      const result = await window.electron.generation.batch(params);
      if (!result.success || !result.jobIds) {
        return { jobIds: [], seeds: [], error: result.error || 'Batch generation failed.' };
      }
      return { jobIds: result.jobIds, seeds: result.jobIds.map(() => seed) };
    }

    const seeds = resolveBatchSeeds(seedStrategy, entries.length);
    const jobIds: string[] = [];
    for (let index = 0; index < entries.length; index += 1) {
      const params: BatchParams & { seed?: number } = {
        prompts: [entries[index].prompt],
        ...baseParams,
        seed: seeds[index],
      };
      const result = await window.electron.generation.batch(params);
      const jobId = result.success ? result.jobIds?.[0] : undefined;
      if (!jobId) {
        return { jobIds, seeds, error: result.error || 'Batch generation failed.' };
      }
      jobIds.push(jobId);
    }
    return { jobIds, seeds };
  };

  const handleStartBatch = async () => {
    const validPrompts = prompts.filter((p) => p.prompt.trim());
    if (validPrompts.length === 0 || isGenerating) return;

    const latestActiveAccount = await syncActiveAccount();
    const useOpenRouterImage =
      latestActiveAccount?.preferences.imageGenerationProvider === 'openrouter';
    const useHuggingFaceImage =
      latestActiveAccount?.preferences.imageGenerationProvider === 'huggingface';
    const useHostedImage = useOpenRouterImage || useHuggingFaceImage;
    const resolvedOpenRouterImageModel =
      latestActiveAccount?.preferences.openRouterImageModel.trim() ?? '';
    const resolvedHuggingFaceImageModel =
      latestActiveAccount?.preferences.huggingFaceImageModel?.trim() ?? '';

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

    if (useHuggingFaceImage && !latestActiveAccount?.huggingFace.tokenStored) {
      setBatchNotice({
        tone: 'error',
        message: 'HuggingFace is selected for still images, but no token is stored for the active account.',
      });
      return;
    }

    if (useHuggingFaceImage && !resolvedHuggingFaceImageModel) {
      setBatchNotice({
        tone: 'error',
        message: 'Select a HuggingFace still-image model in Settings before starting a hosted batch.',
      });
      return;
    }

    if (!systemInfo.backendConnected && !useHostedImage) {
      setBatchNotice({
        tone: 'error',
        message: 'The AI backend is not running. Start the backend or switch the active account to a hosted provider for hosted still-image batches.',
      });
      return;
    }

    const submittedModel = useHuggingFaceImage
      ? resolvedHuggingFaceImageModel
      : useOpenRouterImage
        ? resolvedOpenRouterImageModel
        : model;

    setBatchNotice(
      useHostedImage
        ? {
            tone: 'info',
            message: `Batch is routing through ${useHuggingFaceImage ? 'HuggingFace' : 'OpenRouter'} for ${latestActiveAccount?.name ?? 'the active account'}.`,
          }
        : null
    );
    setIsSubmitting(true);
    // A re-run starts every filled card fresh.
    setBatchQueue(
      prompts.map((p) =>
        p.prompt.trim()
          ? { id: p.id, prompt: p.prompt, status: 'pending' as const }
          : p,
      ),
    );

    try {
      const appSettings = await window.electron.settings.get();
      const userDataPath = await window.electron.app.getPath('userData');
      const outputRoot = resolveOutputRoot(appSettings.defaultOutputPath, userDataPath);

      const submission = await submitPrompts(validPrompts, {
        width,
        height,
        steps,
        cfg_scale: cfgScale,
        model: submittedModel,
      });

      if (submission.jobIds.length === 0) {
        setBatchNotice({ tone: 'error', message: submission.error ?? 'Batch generation failed.' });
        return;
      }
      if (submission.error) {
        setBatchNotice({
          tone: 'error',
          message: `Submitted ${submission.jobIds.length} of ${validPrompts.length} prompts; the rest stopped: ${submission.error}`,
        });
      }

      const batchId = crypto.randomUUID();
      const submitted = validPrompts.slice(0, submission.jobIds.length);
      submitted.forEach((entry, index) => {
        updateBatchQueuePrompt(entry.id, {
          status: 'generating',
          jobId: submission.jobIds[index],
          ...(submission.seeds[index] !== undefined ? { seed: submission.seeds[index] } : {}),
        });
      });
      addBatchJob({
        id: batchId,
        name: `Batch ${new Date().toLocaleTimeString()}`,
        prompts: submitted.map((entry) => entry.prompt),
        jobIds: submission.jobIds,
        currentIndex: 0,
        completedJobs: [],
        failedJobs: [],
        status: 'running',
        createdAt: new Date(),
      });
      setActiveBatchId(batchId);

      submitted.forEach((entry, index) => {
        const seed = submission.seeds[index];
        void appJobWatcher.track({
          jobId: submission.jobIds[index],
          kind: 'image',
          origin: 'batch',
          prompt: entry.prompt,
          outputRoot,
          params: {
            prompt: entry.prompt,
            width,
            height,
            steps,
            cfg_scale: cfgScale,
            model: submittedModel,
            output_root: outputRoot,
            ...(seed !== undefined ? { seed } : {}),
          },
          batch: {
            batchId,
            promptIndex: prompts.findIndex((p) => p.id === entry.id),
            settings: { width, height, steps, cfgScale, model: submittedModel, seed },
          },
        });
      });
    } catch (error) {
      console.error('Batch generation failed:', error);
      setBatchNotice({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Batch generation failed.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = async () => {
    // Every submitted prompt (running or still queued on the backend) is
    // 'generating'. They go back to pending and drop their job id, so a late
    // outcome for a cancelled job no longer touches the card.
    const inFlight = useAppStore
      .getState()
      .batchQueue.filter((p) => p.status === 'generating' && p.jobId);
    setActiveBatchId(null);
    setBatchQueue(
      useAppStore
        .getState()
        .batchQueue.map((p) =>
          p.status === 'generating' ? { id: p.id, prompt: p.prompt, status: 'pending' as const } : p,
        ),
    );
    setBatchNotice({ tone: 'info', message: 'Cancelling the batch...' });
    const outcomes = await Promise.allSettled(
      inFlight.map((p) => appJobWatcher.cancel(p.jobId as string)),
    );
    const failed = outcomes.filter(
      (outcome) => outcome.status === 'rejected' || outcome.value?.success === false,
    ).length;
    setBatchNotice(
      failed > 0
        ? {
            tone: 'error',
            message: `Cancelled ${inFlight.length - failed} of ${inFlight.length} prompts; ${failed} could not be cancelled and may still finish.`,
          }
        : { tone: 'info', message: `Batch cancelled (${inFlight.length} prompt${inFlight.length === 1 ? '' : 's'}).` },
    );
  };

  const handleExport = () => {
    const data = {
      prompts: prompts.map((p) => p.prompt).filter(Boolean),
      settings: {
        provider: huggingFaceImageEnabled
          ? 'huggingface'
          : openRouterImageEnabled
            ? 'openrouter'
            : 'local',
        width,
        height,
        steps,
        cfgScale,
        model: huggingFaceImageEnabled
          ? huggingFaceImageModel
          : openRouterImageEnabled
            ? openRouterImageModel
            : model,
        seedStrategy,
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

  const renderPromptCard = (prompt: BatchQueuePrompt, index: number) => (
    <SortablePromptCard
      prompt={prompt}
      index={index}
      isGenerating={isGenerating}
      canRemove={prompts.length > 1}
      onChange={updatePrompt}
      onRemove={removeBatchQueuePrompt}
      onDuplicate={duplicateBatchQueuePrompt}
    />
  );

  const filledCount = prompts.filter((p) => p.prompt.trim()).length;
  const queueIsBlank = prompts.every((p) => !p.prompt.trim());
  const completedCount = prompts.filter((p) => p.status === 'completed').length;
  const progress =
    prompts.length > 0 ? (completedCount / prompts.length) * 100 : 0;
  const activeSeedMode = SEED_MODE_OPTIONS.find((option) => option.value === seedStrategy.mode) ?? SEED_MODE_OPTIONS[0];
  const seedSummary =
    seedStrategy.mode === 'random'
      ? 'random seeds'
      : seedStrategy.mode === 'fixed'
        ? `seed ${seedStrategy.baseSeed}`
        : `seeds from ${seedStrategy.baseSeed}`;

  return (
    <div className="h-full flex flex-col bg-surface" data-testid="batch-panel">
      {/* Results Toolbar */}
      <div className="p-3 border-b border-border space-y-3">
        {/* View / Sort row */}
        <div className="flex items-center gap-2">
          {/* View mode toggle */}
          <div className="recessed-well flex items-center p-0.5">
            {VIEW_MODE_OPTIONS.map((opt) => {
              const Icon = opt.icon;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setBatchViewMode(opt.value)}
                  aria-label={opt.label}
                  aria-pressed={batchViewMode === opt.value}
                  className={cn(
                    'p-2 rounded-md transition',
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
            <ArrowUpDown className="w-3.5 h-3.5 text-text-muted" aria-hidden="true" />
            <select
              aria-label="Sort results"
              value={batchSortBy}
              onChange={(e) => setBatchSortBy(e.target.value as SortBy)}
              className="bg-elevated border border-border rounded-md px-2 py-1 text-xs text-text-primary focus:border-accent-primary transition"
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
              type="button"
              onClick={() => setBatchFilterBy(opt.value)}
              aria-pressed={batchFilterBy === opt.value}
              className={cn(
                'px-2.5 py-1 rounded-md text-xs transition',
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
          <span className="text-xs text-text-muted">
            {batchResults.length} result{batchResults.length !== 1 ? 's' : ''}
          </span>
          <div className="flex-1" />
          <button
            onClick={handleBulkExportAll}
            disabled={batchResults.length === 0}
            className="flex items-center gap-2 px-2.5 py-1 rounded-md text-xs text-text-body hover:text-text-primary hover:bg-elevated transition disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <Download className="w-3.5 h-3.5" />
            Export All
          </button>
          <button
            onClick={() => setShowDeleteConfirm(true)}
            disabled={batchResults.length === 0}
            className="flex items-center gap-2 px-2.5 py-1 rounded-md text-xs text-status-error hover:bg-status-error-muted transition disabled:opacity-30 disabled:cursor-not-allowed"
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
          <h2 className="type-section text-text-primary">
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
            <RouteStatusCard title="OpenRouter Batch Route" ready={openRouterRouteReady}>
              <p className="mt-1 text-xs text-text-body">
                Account: {activeAccount?.name ?? 'No active account'}.
                {' '}Model: {openRouterImageModel || 'Not set in Settings'}.
              </p>
              <p className="mt-1 text-xs text-text-muted">
                Hosted still-image batches can run even when the local backend is offline.
                Local-only controls like steps and CFG stay disabled while this route is active.
              </p>
            </RouteStatusCard>
          )}

          {batchNotice && (
            <div
              role={batchNotice.tone === 'error' ? 'alert' : 'status'}
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
            <span className="text-sm text-text-body" aria-live="polite">
              Progress: {completedCount} / {prompts.length}
            </span>
            <span className="type-meta text-accent-primary" aria-live="polite">
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
      <div ref={promptListRef} className="flex-1 overflow-y-auto p-4 scrollbar-hide">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={prompts.map((p) => p.id)} strategy={verticalListSortingStrategy}>
            <div className={virtualizePrompts ? undefined : 'space-y-3'}>
              {virtualizePrompts ? (
                <div className="relative w-full" style={{ height: promptVirtualizer.getTotalSize() }}>
                  {promptVirtualizer.getVirtualItems().map((virtualRow) => {
                    const prompt = prompts[virtualRow.index];
                    return (
                      <div
                        key={prompt.id}
                        ref={promptVirtualizer.measureElement}
                        data-index={virtualRow.index}
                        className="absolute left-0 top-0 w-full pb-3"
                        style={{ transform: `translateY(${virtualRow.start}px)` }}
                      >
                        {renderPromptCard(prompt, virtualRow.index)}
                      </div>
                    );
                  })}
                </div>
              ) : (
              <AnimatePresence initial={false}>
                {prompts.map((prompt, index) => (
                  <motion.div
                    key={prompt.id}
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                  >
                    {renderPromptCard(prompt, index)}
                  </motion.div>
                ))}
              </AnimatePresence>
              )}
            </div>
          </SortableContext>
        </DndContext>

        {/* Add / import / clear */}
        {!isGenerating && (
          <div className="flex flex-wrap gap-2 mt-4">
            <Button variant="secondary" size="sm" icon={Plus} onClick={() => addBatchQueuePrompt()}>
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
            <Button
              variant="ghost"
              size="sm"
              icon={FileUp}
              onClick={() => fileInputRef.current?.click()}
              title="Import prompts: .txt (one per line), .csv (first column) or .json"
            >
              Import
            </Button>
            <Button
              variant="ghost"
              size="sm"
              icon={ListX}
              onClick={() => setShowClearConfirm(true)}
              disabled={queueIsBlank && prompts.length === 1}
            >
              Clear All
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept={BATCH_IMPORT_ACCEPT}
              onChange={(event) => void handleImportFile(event)}
              className="hidden"
              data-testid="batch-import-input"
              aria-label="Import prompts file"
            />
          </div>
        )}
      </div>

      {/* Settings */}
      <div className="border-t border-border">
        <button
          onClick={() => setShowSettings(!showSettings)}
          aria-expanded={showSettings}
          aria-controls="batch-settings-panel"
          className="w-full flex items-center justify-between p-4 text-sm text-text-body hover:text-text-primary transition"
        >
          <span className="flex items-center gap-2">
            <Sparkles className="w-4 h-4" />
            Generation Settings
          </span>
          <span className="type-meta text-text-muted">
            {width}x{height} - {steps} steps - {seedSummary}
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
                    <label htmlFor="batch-width" className="text-label text-text-body mb-1 block">
                      Width
                    </label>
                    <select
                      id="batch-width"
                      value={width}
                      onChange={(e) => setWidth(Number(e.target.value))}
                      className="w-full rounded-md border border-border bg-elevated px-3 py-2 text-sm text-text-primary"
                    >
                      {BATCH_WIDTH_HEIGHT_OPTIONS.map((option) => (
                        <option key={option} value={option}>{option}px</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="batch-height" className="text-label text-text-body mb-1 block">
                      Height
                    </label>
                    <select
                      id="batch-height"
                      value={height}
                      onChange={(e) => setHeight(Number(e.target.value))}
                      className="w-full rounded-md border border-border bg-elevated px-3 py-2 text-sm text-text-primary"
                    >
                      {BATCH_WIDTH_HEIGHT_OPTIONS.map((option) => (
                        <option key={option} value={option}>{option}px</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="space-y-2">
                  <span id="batch-seed-mode-label" className="mono-label text-text-body block">
                    Seed Strategy
                  </span>
                  <div
                    role="radiogroup"
                    aria-labelledby="batch-seed-mode-label"
                    className="recessed-well flex p-0.5"
                  >
                    {SEED_MODE_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        role="radio"
                        aria-checked={seedStrategy.mode === option.value}
                        disabled={isGenerating}
                        onClick={() => setBatchSeedStrategy({ mode: option.value })}
                        className={cn(
                          'flex-1 rounded-md px-2 py-1.5 text-xs transition disabled:cursor-not-allowed disabled:opacity-50',
                          seedStrategy.mode === option.value
                            ? 'bg-accent-primary-muted text-accent-primary border border-accent-primary-border'
                            : 'text-text-muted hover:text-text-primary',
                        )}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-text-muted">{activeSeedMode.hint}</p>
                  {seedStrategy.mode !== 'random' ? (
                    <div>
                      <label htmlFor="batch-base-seed" className="text-label text-text-body mb-1 block">
                        {seedStrategy.mode === 'fixed' ? 'Seed' : 'Base seed'}
                      </label>
                      <input
                        id="batch-base-seed"
                        type="number"
                        min={0}
                        max={BATCH_SEED_MAX}
                        step={1}
                        value={seedStrategy.baseSeed}
                        disabled={isGenerating}
                        onChange={(e) => {
                          const value = Number(e.target.value);
                          if (Number.isFinite(value)) setBatchSeedStrategy({ baseSeed: value });
                        }}
                        className="w-full rounded-md border border-border bg-elevated px-3 py-2 data-mono text-text-primary focus:border-accent-primary transition disabled:opacity-50"
                      />
                    </div>
                  ) : null}
                </div>

                {/* A titled group of route controls, not a single form field. */}
                <div className="space-y-2" role="group" aria-labelledby={modelRouterLabelId}>
                  <div>
                    <span id={modelRouterLabelId} className="text-label text-text-body mb-1 block">
                      Model Router
                    </span>
                    <p className="text-xs text-text-muted">
                      {openRouterImageEnabled
                        ? 'This batch will use the active account\'s hosted OpenRouter still-image model.'
                        : 'Use the local still-image stack for this batch.'}
                    </p>
                  </div>

                  {openRouterImageEnabled ? (
                    <RouteStatusCard title="OpenRouter Hosted Model" ready={openRouterRouteReady}>
                      <p className="mt-1 text-xs text-text-body">
                        {openRouterImageModel || 'Select an OpenRouter still-image model in Settings.'}
                      </p>
                      <p className="mt-1 text-xs text-text-muted">
                        Switch the active account&apos;s still-image provider back to Local in
                        Settings to pick a backend model and use local sampling controls here.
                      </p>
                    </RouteStatusCard>
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
                        <label htmlFor="batch-model" className="text-label text-text-body mb-1 block">
                          Model
                        </label>
                        <select
                          id="batch-model"
                          value={model}
                          onChange={(e) => setModel(e.target.value)}
                          className="w-full rounded-md border border-border bg-elevated px-3 py-2 text-sm text-text-primary"
                        >
                          <option value="flux-dev">FLUX.1 [dev]</option>
                          <option value="sd3.5-large">Stable Diffusion 3.5 Large</option>
                          <option value="flux-fill">FLUX.1 Fill [dev]</option>
                          <option value="sd3.5-medium">Stable Diffusion 3.5 Medium</option>
                          <option value="flux-schnell">FLUX.1 [schnell]</option>
                          <option value="sd-1-5">Stable Diffusion 1.5</option>
                          {![
                            'flux-dev',
                            'sd3.5-large',
                            'flux-fill',
                            'sd3.5-medium',
                            'flux-schnell',
                            'sd-1-5',
                          ].includes(model) ? (
                            <option value={model}>{model}</option>
                          ) : null}
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
          <Button
            variant="danger"
            icon={Pause}
            fullWidth
            onClick={() => void handleCancel()}
            disabled={activeBatchId === null}
          >
            Cancel Batch
          </Button>
        ) : (
          <>
            {/* Icon only: spelled out beside Start Batch, the two labels do not
                fit the dock and the primary one broke onto two lines. */}
            <Button
              variant="secondary"
              icon={FileJson}
              onClick={handleExport}
              aria-label="Export batch"
              title="Export batch"
            />
            <ChromeButton
              variant="chrome"
              onClick={() => void handleStartBatch()}
              disabled={filledCount === 0}
              size="lg"
              className="flex-1"
            >
              <Play className="w-4 h-4" />
              Start Batch ({filledCount})
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

      <ConfirmDialog
        open={showClearConfirm}
        title="Clear the Prompt Queue"
        message={`Remove all ${prompts.length} prompt${prompts.length === 1 ? '' : 's'} from the queue? Generated results are kept.`}
        confirmLabel="Clear All"
        variant="danger"
        onConfirm={() => {
          clearBatchQueue();
          setShowClearConfirm(false);
        }}
        onCancel={() => setShowClearConfirm(false)}
      />
    </div>
  );
}

/* -----------------------------------------------------------
   BatchResultsPanel - The left main area in batch mode
   Wraps ResultsGrid and ImagePreviewModal together
   ----------------------------------------------------------- */

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

/* -----------------------------------------------------------
   BatchPanel - Legacy export for backward compatibility.
   App.tsx now uses BatchPromptQueue + BatchResultsPanel directly.
   ----------------------------------------------------------- */

export function BatchPanel() {
  return (
    <>
      <h1 className="sr-only">Batch Generation</h1>
      <BatchPromptQueue />
    </>
  );
}
