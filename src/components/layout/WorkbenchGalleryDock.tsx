import { useMemo } from 'react';
import { ImageIcon } from 'lucide-react';

import { useAppStore } from '@/store/appStore';
import { useShallow } from 'zustand/react/shallow';
import { ImageWithFallback } from '@/components/ui/ImageWithFallback';
import { cn } from '@/utils/cn';
import { ReviewDensityToggle } from './ReviewDensityToggle';

interface GalleryItem {
  id: string;
  label: string;
  prompt: string;
  thumbnail: string;
  createdAt: number;
  source: string;
}

export function WorkbenchGalleryDock() {
  const {
    activeViewerItemId,
    assetLibrary,
    batchResults,
    layoutPreferences,
    setActiveTab,
    setActiveViewerItemId,
    setCenterView,
    setReviewDensity,
  } = useAppStore(
    useShallow((state) => ({
      activeViewerItemId: state.activeViewerItemId,
      assetLibrary: state.assetLibrary,
      batchResults: state.batchResults,
      layoutPreferences: state.layoutPreferences,
      setActiveTab: state.setActiveTab,
      setActiveViewerItemId: state.setActiveViewerItemId,
      setCenterView: state.setCenterView,
      setReviewDensity: state.setReviewDensity,
    })),
  );

  const reviewDensity = layoutPreferences.reviewDensity;
  const isCompact = reviewDensity === 'compact';

  const items = useMemo<GalleryItem[]>(() => {
    const assetItems = assetLibrary.map((asset) => ({
      id: `asset-${asset.id}`,
      label: asset.name || 'Generated asset',
      prompt: asset.prompt || 'No prompt saved',
      thumbnail: asset.thumbnail || asset.previewUrl || asset.path,
      createdAt: new Date(asset.createdAt).getTime(),
      source: asset.type === 'video' ? 'Video asset' : 'Image asset',
    }));

    const batchItems = batchResults.map((result) => ({
      id: `batch-${result.id}`,
      label: 'Batch result',
      prompt: result.prompt,
      thumbnail: result.imagePath,
      createdAt: new Date(result.createdAt).getTime(),
      source: result.isFavorite ? 'Favorite batch' : 'Batch result',
    }));

    return [...assetItems, ...batchItems]
      .filter((item) => item.thumbnail)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, isCompact ? 36 : 24);
  }, [assetLibrary, batchResults, isCompact]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-surface">
      {items.length === 0 ? (
        <div className="flex flex-1 items-center p-4">
          <div className="w-full rounded-2xl border border-dashed border-border bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.01))] px-5 py-8 text-center shadow-cinematic">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-border bg-elevated text-text-muted">
              <ImageIcon className="h-5 w-5" />
            </div>
            <p className="mt-4 type-section">Review captures will appear here.</p>
            <p className="mx-auto mt-2 max-w-60 text-xs text-text-muted">
              Generate a result or open Assets to start a tighter review loop.
            </p>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => setActiveTab('generate')}
                className="inline-flex items-center rounded-md border border-accent-primary-border bg-accent-primary-muted px-3 py-2 type-ui text-accent-primary transition-all hover:bg-elevated"
              >
                Open Generate
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('assets')}
                className="inline-flex items-center rounded-md border border-border px-3 py-2 type-ui text-text-body transition-all hover:border-border-hover hover:bg-elevated hover:text-text-primary"
              >
                Open Assets
              </button>
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between gap-3 border-b border-border px-3 py-2">
            <div className="min-w-0">
              <p className="type-caption text-text-muted">{items.length} recent captures</p>
              <p className="truncate type-caption text-text-muted">
                Click any card to review it in the viewer.
              </p>
            </div>
            <ReviewDensityToggle
              density={reviewDensity}
              onChange={setReviewDensity}
            />
          </div>
          <div
            data-testid="gallery-grid"
            className={cn(
              'scroll-shadow-y grid flex-1 auto-rows-min overflow-y-auto p-3',
              isCompact ? 'grid-cols-3 gap-1.5' : 'grid-cols-2 gap-2',
            )}
          >
            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-label={`Review ${item.label}`}
                aria-pressed={activeViewerItemId === item.id}
                onClick={() => {
                  setActiveViewerItemId(item.id);
                  setCenterView('viewer');
                }}
                className={cn(
                  'min-w-0 overflow-hidden border bg-elevated text-left transition-all',
                  isCompact ? 'rounded-lg' : 'rounded-xl',
                  activeViewerItemId === item.id
                    ? 'border-accent-primary-border ring-1 ring-accent-primary-border'
                    : 'border-border hover:border-border-hover',
                )}
              >
                <div className="aspect-square bg-void">
                  <ImageWithFallback
                    src={item.thumbnail}
                    alt={item.label}
                    className="h-full w-full object-cover"
                    fallbackClassName="h-full w-full"
                  />
                </div>
                <div className={cn('space-y-1', isCompact ? 'p-2' : 'p-3')}>
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate type-ui text-text-primary">{item.label}</p>
                    {!isCompact ? (
                      <span className="shrink-0 rounded border border-border px-1.5 py-0.5 type-caption">
                        {item.source}
                      </span>
                    ) : null}
                  </div>
                  <p className={cn('type-caption text-text-body', isCompact ? 'line-clamp-1' : 'line-clamp-2')}>
                    {item.prompt}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
