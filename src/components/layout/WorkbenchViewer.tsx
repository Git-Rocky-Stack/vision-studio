import { useMemo, useState } from 'react';
import { Columns2, GitCompare, ImageIcon, Pencil, X } from 'lucide-react';

import { useAppStore } from '@/store/appStore';
import { ImageWithFallback } from '@/components/ui/ImageWithFallback';
import { cn } from '@/utils/cn';

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
  runtime: string | null;
  createdAt: number;
}

export function WorkbenchViewer() {
  const {
    assetLibrary,
    batchResults,
    comparisonImages,
    comparisonMode,
    setComparisonImages,
    setComparisonMode,
    setCurrentImage,
    setActivePanel,
  } = useAppStore();
  const [activeItemId, setActiveItemId] = useState<string | null>(null);

  const items = useMemo<ViewerItem[]>(() => {
    const assets = assetLibrary.map((asset) => ({
      id: `asset-${asset.id}`,
      label: asset.name || 'Generated asset',
      source: asset.type === 'video' ? 'Video asset' : 'Image asset',
      imagePath: asset.previewUrl || asset.path,
      assetPath: asset.path,
      thumbnail: asset.thumbnail || asset.previewUrl || asset.path,
      prompt: asset.prompt || 'No prompt saved',
      model: asset.model ?? null,
      seed: asset.seed ?? null,
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
      runtime: `${result.generationTime.toFixed(1)}s`,
      createdAt: new Date(result.createdAt).getTime(),
    }));

    return [...assets, ...results]
      .filter((item) => item.imagePath)
      .sort((a, b) => b.createdAt - a.createdAt);
  }, [assetLibrary, batchResults]);

  const activeItem = items.find((item) => item.id === activeItemId) ?? items[0] ?? null;
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

  const startSideBySideCompare = () => {
    if (comparisonImages.length >= 2) {
      setComparisonMode('side-by-side');
    }
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
            onClear={clearCompare}
            onRemove={removeCompareImage}
            onStartSideBySide={startSideBySideCompare}
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
                  onClick={() => setActiveItemId(item.id)}
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
  onClear,
  onRemove,
  onStartSideBySide,
}: {
  items: ViewerItem[];
  onClear: () => void;
  onRemove: (imagePath: string) => void;
  onStartSideBySide: () => void;
}) {
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
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onStartSideBySide}
            className="inline-flex items-center gap-2 rounded-md border border-accent-primary-border bg-accent-primary-muted px-3 py-2 text-xs font-display text-accent-primary transition-all hover:bg-elevated"
          >
            <Columns2 className="h-3.5 w-3.5" />
            Side by Side
          </button>
          <button
            type="button"
            onClick={onClear}
            className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-xs font-display text-text-body transition-all hover:border-border-hover hover:bg-elevated hover:text-text-primary"
          >
            Clear Compare
          </button>
        </div>
      </div>

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
              <div className="min-w-0 rounded-md border border-border bg-void/70 px-2 py-1 backdrop-blur-sm">
                <p className="truncate font-display text-xs font-semibold text-text-primary">{item.label}</p>
                <p className="mt-0.5 font-mono text-micro text-text-muted">{item.source}</p>
              </div>
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
    </section>
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
