import { useMemo } from 'react';
import { ImageIcon } from 'lucide-react';

import { useAppStore } from '@/store/appStore';
import { useShallow } from 'zustand/react/shallow';
import { ImageWithFallback } from '@/components/ui/ImageWithFallback';
import { cn } from '@/utils/cn';

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
    setActiveViewerItemId,
    setCenterView,
  } = useAppStore(useShallow(s => ({
    activeViewerItemId: s.activeViewerItemId,
    assetLibrary: s.assetLibrary,
    batchResults: s.batchResults,
    setActiveViewerItemId: s.setActiveViewerItemId,
    setCenterView: s.setCenterView,
  })));

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
      .slice(0, 24);
  }, [assetLibrary, batchResults]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-surface">
      {items.length === 0 ? (
        <div className="flex flex-1 items-center p-4">
          <div className="w-full rounded-xl border border-dashed border-border bg-[linear-gradient(180deg,rgba(255,255,255,0.035),rgba(255,255,255,0.01))] px-5 py-8 text-center shadow-cinematic">
            <ImageIcon className="mx-auto h-8 w-8 text-text-muted opacity-40" />
            <p className="mt-3 type-section">Generated outputs will appear here.</p>
            <p className="mx-auto mt-1 max-w-56 text-xs text-text-muted">
              Create or import an image to review it beside the active workbench.
            </p>
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <p className="type-caption text-text-muted">{items.length} recent captures</p>
            <p className="hidden type-caption text-text-muted sm:block">Click any card to review</p>
          </div>
          <div className="grid flex-1 auto-rows-min grid-cols-2 gap-2 overflow-y-auto p-3">
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
                  'min-w-0 overflow-hidden rounded-md border bg-elevated text-left transition-all',
                  activeViewerItemId === item.id
                    ? 'border-accent-primary-border ring-1 ring-accent-primary-border'
                    : 'border-border hover:border-border-hover'
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
                <div className="space-y-1 p-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate type-ui text-text-primary">{item.label}</p>
                    <span className="shrink-0 rounded border border-border px-1.5 py-0.5 type-caption">
                      {item.source}
                    </span>
                  </div>
                  <p className="line-clamp-2 type-caption text-text-body">{item.prompt}</p>
                </div>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
