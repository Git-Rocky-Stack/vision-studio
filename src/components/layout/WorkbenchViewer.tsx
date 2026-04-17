import { useMemo, useState } from 'react';
import {
  Columns2,
  GitBranch,
  GitCompare,
  Grid3X3,
  ImageIcon,
  Layers,
  Pencil,
  SplitSquareHorizontal,
  X,
  type LucideIcon,
} from 'lucide-react';

import { useAppStore, type AppState } from '@/store/appStore';
import { ImageWithFallback } from '@/components/ui/ImageWithFallback';
import type { GenerationDraft } from '@/types/generation';
import { cn } from '@/utils/cn';

type CompareMode = Exclude<AppState['comparisonMode'], 'off'>;

const compareModes: { id: CompareMode; label: string; icon: LucideIcon }[] = [
  { id: 'side-by-side', label: 'Side by Side', icon: Columns2 },
  { id: 'slider', label: 'Slider', icon: SplitSquareHorizontal },
  { id: 'onion', label: 'Onion Skin', icon: Layers },
  { id: 'grid', label: 'Grid', icon: Grid3X3 },
];

interface ViewerItem {
  id: string;
  label: string;
  source: string;
  imagePath: string;
  assetPath: string | null;
  thumbnail: string;
  prompt: string;
  model: string | null;
  seed: number | null;
  negativePrompt: string;
  generationType: 'image' | 'video';
  width: number | null;
  height: number | null;
  steps: number | null;
  cfgScale: number | null;
  scheduler: string | null;
  runtime: string | null;
  createdAt: number;
}

export function WorkbenchViewer() {
  const {
    assetLibrary,
    activeViewerItemId,
    batchResults,
    comparisonImages,
    comparisonMode,
    setActiveViewerItemId,
    setComparisonImages,
    setComparisonMode,
    setGenerationDraft,
    setCurrentImage,
    setActivePanel,
    setActiveWorkbenchView,
  } = useAppStore();

  const items = useMemo<ViewerItem[]>(() => {
    const assets = assetLibrary.map((asset) => ({
      id: `asset-${asset.id}`,
      label: asset.name || 'Generated asset',
      source: asset.type === 'video' ? 'Video asset' : 'Image asset',
      imagePath: asset.previewUrl || asset.path,
      assetPath: asset.path,
      thumbnail: asset.thumbnail || asset.previewUrl || asset.path,
      prompt: asset.prompt || 'No prompt saved',
      model: asset.model ?? getStringParam(asset.params, 'model'),
      seed: asset.seed ?? null,
      negativePrompt: asset.negativePrompt || getStringParam(asset.params, 'negativePrompt', 'negative_prompt') || '',
      generationType: asset.type,
      width: asset.width ?? getNumberParam(asset.params, 'width'),
      height: asset.height ?? getNumberParam(asset.params, 'height'),
      steps: getNumberParam(asset.params, 'steps'),
      cfgScale: getNumberParam(asset.params, 'cfgScale', 'cfg_scale'),
      scheduler: getStringParam(asset.params, 'scheduler'),
      runtime: null,
      createdAt: new Date(asset.createdAt).getTime(),
    }));

    const results = batchResults.map((result) => ({
      id: `batch-${result.id}`,
      label: 'Batch result',
      source: result.isFavorite ? 'Favorite batch' : 'Batch result',
      imagePath: result.imagePath,
      assetPath: result.assetPath ?? null,
      thumbnail: result.imagePath,
      prompt: result.prompt,
      model: typeof result.params.model === 'string' ? result.params.model : null,
      seed: result.seed,
      negativePrompt: getStringParam(result.params, 'negativePrompt', 'negative_prompt') || '',
      generationType: 'image' as const,
      width: getNumberParam(result.params, 'width'),
      height: getNumberParam(result.params, 'height'),
      steps: getNumberParam(result.params, 'steps'),
      cfgScale: getNumberParam(result.params, 'cfgScale', 'cfg_scale'),
      scheduler: getStringParam(result.params, 'scheduler'),
      runtime: `${result.generationTime.toFixed(1)}s`,
      createdAt: new Date(result.createdAt).getTime(),
    }));

    return [...assets, ...results]
      .filter((item) => item.imagePath)
      .sort((a, b) => b.createdAt - a.createdAt);
  }, [assetLibrary, batchResults]);

  const activeItem = items.find((item) => item.id === activeViewerItemId) ?? items[0] ?? null;
  const isPinned = activeItem ? comparisonImages.includes(activeItem.imagePath) : false;
  const pinnedItems = useMemo<ViewerItem[]>(() => {
    const itemsByPath = new Map(items.map((item) => [item.imagePath, item]));

    return comparisonImages.slice(0, 4).map((imagePath, index) => {
      const item = itemsByPath.get(imagePath);
      if (item) return item;

      return {
        id: `pinned-${index}-${imagePath}`,
        label: `Pinned output ${index + 1}`,
        source: 'Pinned output',
        imagePath,
        assetPath: null,
        thumbnail: imagePath,
        prompt: 'Pinned output',
        model: null,
        seed: null,
        negativePrompt: '',
        generationType: 'image',
        width: null,
        height: null,
        steps: null,
        cfgScale: null,
        scheduler: null,
        runtime: null,
        createdAt: 0,
      };
    });
  }, [comparisonImages, items]);
  const showCompareReview = pinnedItems.length >= 2;

  const updateComparisonImages = (nextImages: string[]) => {
    setComparisonImages(nextImages);

    if (nextImages.length >= 2 && comparisonMode === 'off') {
      setComparisonMode('side-by-side');
    }

    if (nextImages.length < 2) {
      setComparisonMode('off');
    }
  };

  const sendToEdit = () => {
    if (!activeItem) return;

    setCurrentImage(activeItem.imagePath, activeItem.assetPath);
    setActivePanel('edit');
  };

  const branchVariant = () => {
    if (!activeItem) return;

    setGenerationDraft(toGenerationDraft(activeItem));
    setActiveWorkbenchView('canvas');
    setActivePanel('generate');
  };

  const toggleComparePin = () => {
    if (!activeItem) return;

    if (isPinned) {
      updateComparisonImages(comparisonImages.filter((image) => image !== activeItem.imagePath));
      return;
    }

    updateComparisonImages([...comparisonImages, activeItem.imagePath].slice(-4));
  };

  const clearCompare = () => {
    updateComparisonImages([]);
  };

  const removeCompareImage = (imagePath: string) => {
    updateComparisonImages(comparisonImages.filter((image) => image !== imagePath));
  };

  if (!activeItem) {
    return (
      <div className="flex h-full flex-col items-center justify-center bg-void px-6 text-center">
        <ImageIcon className="h-9 w-9 text-text-muted opacity-40" />
        <h2 className="mt-4 font-display text-lg font-semibold text-text-primary">
          Outputs will appear here.
        </h2>
        <p className="mt-2 max-w-sm text-sm text-text-body">
          Generate or import an image to review it beside Canvas and Workflow.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-void">
      <div className="flex min-h-0 flex-1 items-center justify-center p-4">
        {showCompareReview ? (
          <CompareReview
            items={pinnedItems}
            mode={comparisonMode === 'off' ? 'side-by-side' : comparisonMode}
            onClear={clearCompare}
            onModeChange={setComparisonMode}
            onRemove={removeCompareImage}
          />
        ) : (
          <ImageWithFallback
            src={activeItem.imagePath}
            alt={activeItem.label}
            className="max-h-full max-w-full object-contain"
            fallbackClassName="h-full w-full"
          />
        )}
      </div>

      <div className="flex flex-shrink-0 border-t border-border bg-surface">
        <section className="min-w-0 flex-1 border-r border-border p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="truncate font-display text-sm font-semibold text-text-primary">
                  {activeItem.label}
                </h2>
                <span className="rounded border border-border px-2 py-0.5 text-micro text-text-muted">
                  {activeItem.source}
                </span>
              </div>
              <p className="mt-2 line-clamp-2 text-sm text-text-body">{activeItem.prompt}</p>
            </div>

            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                onClick={branchVariant}
                className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-xs font-display text-text-body transition-all hover:border-border-hover hover:bg-elevated hover:text-text-primary"
              >
                <GitBranch className="h-3.5 w-3.5" />
                Branch Variant
              </button>
              <button
                type="button"
                onClick={toggleComparePin}
                className={cn(
                  'inline-flex items-center gap-2 rounded-md border px-3 py-2 text-xs font-display transition-all',
                  isPinned
                    ? 'border-accent-primary-border bg-accent-primary-muted text-accent-primary'
                    : 'border-border text-text-body hover:border-border-hover hover:bg-elevated hover:text-text-primary'
                )}
              >
                <GitCompare className="h-3.5 w-3.5" />
                {isPinned ? 'Pinned' : 'Pin Compare'}
              </button>
              <button
                type="button"
                onClick={sendToEdit}
                className="inline-flex items-center gap-2 rounded-md border border-accent-primary-border bg-accent-primary-muted px-3 py-2 text-xs font-display text-accent-primary transition-all hover:bg-elevated"
              >
                <Pencil className="h-3.5 w-3.5" />
                Send to Edit
              </button>
            </div>
          </div>

          <dl className="mt-3 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
            <Metadata label="Model" value={activeItem.model ?? 'Unknown'} />
            <Metadata label="Seed" value={activeItem.seed === null ? 'Random' : String(activeItem.seed)} />
            <Metadata label="Runtime" value={activeItem.runtime ?? 'Recorded'} />
            <Metadata label="Compare" value={`${comparisonImages.length} pinned`} />
          </dl>
        </section>

        <aside className="w-[280px] shrink-0 overflow-x-auto p-3">
          <div className="flex gap-2">
            {items.slice(0, 12).map((item) => {
              const isActive = item.id === activeItem.id;

              return (
                <button
                  key={item.id}
                  type="button"
                  aria-label={`Review ${item.label}`}
                  onClick={() => setActiveViewerItemId(item.id)}
                  className={cn(
                    'h-20 w-20 shrink-0 overflow-hidden rounded-md border bg-void transition-all',
                    isActive
                      ? 'border-accent-primary-border ring-1 ring-accent-primary-border'
                      : 'border-border hover:border-border-hover'
                  )}
                >
                  <ImageWithFallback
                    src={item.thumbnail}
                    alt=""
                    className="h-full w-full object-cover"
                    fallbackClassName="h-full w-full"
                  />
                </button>
              );
            })}
          </div>
        </aside>
      </div>
    </div>
  );
}

function CompareReview({
  items,
  mode,
  onClear,
  onModeChange,
  onRemove,
}: {
  items: ViewerItem[];
  mode: CompareMode;
  onClear: () => void;
  onModeChange: (mode: CompareMode) => void;
  onRemove: (imagePath: string) => void;
}) {
  const [sliderPosition, setSliderPosition] = useState(50);
  const [onionOpacity, setOnionOpacity] = useState(50);
  const [firstItem, secondItem] = items;

  return (
    <section
      aria-label="Compare review"
      className="flex h-full w-full min-h-0 flex-col rounded-md border border-border bg-canvas"
    >
      <div className="flex flex-shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div>
          <h2 className="font-display text-sm font-semibold text-text-primary">Compare review</h2>
          <p className="mt-1 font-mono text-micro text-text-muted">{items.length} pinned</p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <div className="flex rounded-md border border-border bg-void p-1">
            {compareModes.map((compareMode) => {
              const Icon = compareMode.icon;
              const isActive = mode === compareMode.id;

              return (
                <button
                  key={compareMode.id}
                  type="button"
                  aria-pressed={isActive}
                  onClick={() => onModeChange(compareMode.id)}
                  className={cn(
                    'inline-flex items-center gap-2 rounded px-2.5 py-1.5 text-xs font-display transition-all',
                    isActive
                      ? 'bg-accent-primary-muted text-accent-primary'
                      : 'text-text-body hover:bg-elevated hover:text-text-primary'
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {compareMode.label}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={onClear}
            className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-xs font-display text-text-body transition-all hover:border-border-hover hover:bg-elevated hover:text-text-primary"
          >
            Clear Compare
          </button>
        </div>
      </div>

      {mode === 'side-by-side' && <SideBySideCompare items={items} onRemove={onRemove} />}

      {mode === 'slider' && firstItem && secondItem && (
        <div className="relative min-h-0 flex-1 overflow-hidden bg-void">
          <ImageWithFallback
            src={secondItem.imagePath}
            alt={`Slider after ${secondItem.label}`}
            className="h-full w-full object-contain"
            fallbackClassName="absolute inset-0 h-full w-full"
          />
          <div
            className="absolute inset-0 overflow-hidden"
            style={{ clipPath: `inset(0 ${100 - sliderPosition}% 0 0)` }}
          >
            <ImageWithFallback
              src={firstItem.imagePath}
              alt={`Slider before ${firstItem.label}`}
              className="h-full w-full object-contain"
              fallbackClassName="h-full w-full"
            />
          </div>
          <CompareLabel item={firstItem} className="absolute left-3 top-3" />
          <CompareLabel item={secondItem} className="absolute right-3 top-3" />
          <div className="absolute bottom-4 left-4 right-4 flex items-center gap-3 rounded-md border border-border bg-void/80 px-3 py-2 backdrop-blur-sm">
            <span className="font-display text-xs text-text-muted">Before</span>
            <input
              type="range"
              aria-label="Comparison split"
              min={0}
              max={100}
              value={sliderPosition}
              onChange={(event) => setSliderPosition(Number(event.target.value))}
              className="min-w-0 flex-1 accent-accent-primary"
            />
            <span className="font-display text-xs text-text-muted">After</span>
          </div>
        </div>
      )}

      {mode === 'onion' && firstItem && secondItem && (
        <div className="relative min-h-0 flex-1 overflow-hidden bg-void">
          <ImageWithFallback
            src={firstItem.imagePath}
            alt={`Onion base ${firstItem.label}`}
            className="h-full w-full object-contain"
            fallbackClassName="absolute inset-0 h-full w-full"
          />
          <ImageWithFallback
            src={secondItem.imagePath}
            alt={`Onion overlay ${secondItem.label}`}
            className="h-full w-full object-contain"
            fallbackClassName="absolute inset-0 h-full w-full"
            style={{ opacity: onionOpacity / 100 }}
          />
          <CompareLabel item={firstItem} className="absolute left-3 top-3" />
          <CompareLabel item={secondItem} className="absolute right-3 top-3" />
          <label className="absolute bottom-4 left-1/2 flex w-72 max-w-[calc(100%-2rem)] -translate-x-1/2 items-center gap-3 rounded-md border border-border bg-void/80 px-3 py-2 backdrop-blur-sm">
            <span className="font-display text-xs text-text-body">Overlay</span>
            <input
              type="range"
              aria-label="Overlay opacity"
              min={0}
              max={100}
              value={onionOpacity}
              onChange={(event) => setOnionOpacity(Number(event.target.value))}
              className="min-w-0 flex-1 accent-accent-primary"
            />
            <span className="w-8 text-right font-mono text-micro text-text-muted">{onionOpacity}%</span>
          </label>
        </div>
      )}

      {mode === 'grid' && (
        <ul
          aria-label="Pinned comparison outputs"
          className="grid min-h-0 flex-1 list-none grid-cols-2 gap-3 overflow-auto p-3 lg:grid-cols-4"
        >
          {items.map((item, index) => (
            <li
              key={`${item.id}-${index}`}
              className="relative min-h-[220px] overflow-hidden rounded-md border border-border bg-void"
            >
              <ImageWithFallback
                src={item.imagePath}
                alt={`Grid compare ${item.label}`}
                className="h-full w-full object-contain"
                fallbackClassName="h-full w-full"
              />
              <CompareLabel item={item} className="absolute left-3 right-3 top-3" />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function getNumberParam(params: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = params[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
  }

  return null;
}

function getStringParam(params: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = params[key];
    if (typeof value === 'string' && value.trim()) {
      return value;
    }
  }

  return null;
}

function toGenerationDraft(item: ViewerItem): GenerationDraft {
  return {
    generationType: item.generationType,
    prompt: item.prompt === 'No prompt saved' ? '' : item.prompt,
    negativePrompt: item.negativePrompt,
    width: item.width ?? 1024,
    height: item.height ?? 1024,
    steps: item.steps ?? 25,
    cfgScale: item.cfgScale ?? 7.5,
    model: item.model ?? 'flux-dev',
    scheduler: item.scheduler ?? 'Euler a',
    seed: item.seed ?? -1,
  };
}

function SideBySideCompare({
  items,
  onRemove,
}: {
  items: ViewerItem[];
  onRemove: (imagePath: string) => void;
}) {
  return (
    <div className="grid min-h-0 flex-1 grid-cols-2 gap-3 p-3">
      {items.map((item, index) => (
        <article key={`${item.id}-${index}`} className="relative min-h-0 overflow-hidden rounded-md border border-border bg-void">
          <ImageWithFallback
            src={item.imagePath}
            alt={`Compare ${item.label}`}
            className="h-full w-full object-contain"
            fallbackClassName="h-full w-full"
          />
          <div className="absolute left-3 right-3 top-3 flex items-start justify-between gap-2">
            <CompareLabel item={item} />
            <button
              type="button"
              aria-label={`Remove ${item.label} from compare`}
              onClick={() => onRemove(item.imagePath)}
              className="rounded-md border border-border bg-void/70 p-1.5 text-text-muted transition-all hover:border-border-hover hover:text-text-primary"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}

function CompareLabel({ item, className }: { item: ViewerItem; className?: string }) {
  return (
    <div className={cn('min-w-0 rounded-md border border-border bg-void/70 px-2 py-1 backdrop-blur-sm', className)}>
      <p className="truncate font-display text-xs font-semibold text-text-primary">{item.label}</p>
      <p className="mt-0.5 font-mono text-micro text-text-muted">{item.source}</p>
    </div>
  );
}

function Metadata({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-micro uppercase text-text-muted">{label}</dt>
      <dd className="mt-1 truncate font-mono text-text-primary">{value}</dd>
    </div>
  );
}
