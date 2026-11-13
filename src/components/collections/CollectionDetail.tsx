import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { FolderOpen, RefreshCw, X } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { EmptyState } from '@/components/ui/EmptyState';
import { useAppStore } from '@/store/appStore';
import { useAssetsById } from '@/features/assets/assetIndex';
import { resolveAssetThumbnail } from '@/features/assets/assetRecords';
import type { Collection } from '@/types/collections';

/** Minimum tile width; columns are as many of these as fit (auto-fill). */
const MIN_TILE_PX = 120;
/** Gap between tiles (gap-3). */
const GAP_PX = 12;
/** Caption row under each square thumbnail. */
const CAPTION_PX = 28;

/** Columns an auto-fill grid of MIN_TILE_PX tiles fits into `width`. */
export function columnsFor(width: number): number {
  if (width <= 0) return 1;
  return Math.max(1, Math.floor((width + GAP_PX) / (MIN_TILE_PX + GAP_PX)));
}

interface CollectionDetailProps {
  collection: Collection;
}

/**
 * The open collection's assets. Manual collections can drop an asset here;
 * smart collections are filled by their rules, so they list and refresh.
 *
 * A collection can hold the whole library (hundreds of assets), so the grid is
 * virtualised by row like ResultsGrid: only the rows in view mount an <img>.
 */
export const CollectionDetail = memo(function CollectionDetail({ collection }: CollectionDetailProps) {
  const { removeAssetFromCollection, setActiveCollection, refreshSmartCollection } = useAppStore(
    useShallow((s) => ({
      removeAssetFromCollection: s.removeAssetFromCollection,
      setActiveCollection: s.setActiveCollection,
      refreshSmartCollection: s.refreshSmartCollection,
    })),
  );
  const assetsById = useAssetsById();

  const assets = useMemo(
    () =>
      collection.assetIds
        .map((id) => assetsById.get(id))
        .filter((asset): asset is NonNullable<typeof asset> => Boolean(asset)),
    [assetsById, collection.assetIds],
  );

  const isManual = collection.type === 'manual';
  const hasAssets = assets.length > 0;

  // Track the scroll container's width so the row count follows the columns
  // the grid actually lays out.
  const scrollRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    setWidth(element.clientWidth);
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver((entries) => {
      setWidth(entries[0]?.contentRect.width ?? element.clientWidth);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [hasAssets]); // re-attach when the grid mounts or unmounts (the empty state has no scroller)

  const columns = columnsFor(width);
  const tileWidth = width > 0 ? (width - GAP_PX * (columns - 1)) / columns : MIN_TILE_PX;
  const rowCount = Math.ceil(assets.length / columns);

  const rowVirtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => tileWidth + CAPTION_PX + GAP_PX,
    overscan: 3,
  });

  // Column count or tile size changed: every row's height changed with it.
  useEffect(() => {
    rowVirtualizer.measure();
  }, [columns, tileWidth, rowVirtualizer]);

  return (
    <section aria-label={`${collection.name} assets`} className="border-t border-border px-6 py-4">
      <div className="mb-3 flex items-center gap-2">
        <h2 className="type-section flex-1 truncate text-text-primary">{collection.name}</h2>
        <span className="data-mono text-text-muted" aria-live="polite">
          {assets.length} {assets.length === 1 ? 'asset' : 'assets'}
        </span>
        {!isManual && (
          <button
            type="button"
            onClick={() => refreshSmartCollection(collection.id)}
            aria-label={`Refresh ${collection.name}`}
            title="Re-run the rules against the library"
            className="flex h-8 w-8 items-center justify-center rounded-md text-text-muted transition hover:bg-elevated hover:text-text-primary"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
        <button
          type="button"
          onClick={() => setActiveCollection(null)}
          aria-label="Close collection"
          title="Close collection"
          className="flex h-8 w-8 items-center justify-center rounded-md text-text-muted transition hover:bg-elevated hover:text-text-primary"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      {assets.length === 0 ? (
        <EmptyState
          icon={FolderOpen}
          title="This collection is empty"
          description={
            isManual
              ? 'Use Add to collection on an asset in Assets or in the image preview.'
              : 'No assets match these rules yet. Refresh after generating or analysing more.'
          }
        />
      ) : (
        <div ref={scrollRef} className="max-h-[min(60vh,640px)] overflow-y-auto">
          <div
            className="relative"
            style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
          >
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const start = virtualRow.index * columns;
              return (
                <div
                  key={virtualRow.key}
                  className="absolute left-0 top-0 grid w-full gap-3"
                  style={{
                    transform: `translateY(${virtualRow.start}px)`,
                    gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
                  }}
                >
                  {assets.slice(start, start + columns).map((asset) => (
                    <figure
                      key={asset.id}
                      className="group relative m-0 overflow-hidden rounded-sm border border-border bg-surface"
                    >
                      <img
                        src={resolveAssetThumbnail(asset)}
                        alt={asset.name}
                        loading="lazy"
                        className="aspect-square w-full object-cover"
                      />
                      <figcaption className="truncate px-2 py-1 type-caption text-text-body">
                        {asset.name}
                      </figcaption>
                      {isManual && (
                        <button
                          type="button"
                          onClick={() => removeAssetFromCollection(collection.id, asset.id)}
                          aria-label={`Remove ${asset.name} from ${collection.name}`}
                          title={`Remove from ${collection.name}`}
                          className="absolute right-1 top-1 flex h-8 w-8 items-center justify-center rounded-md bg-void/80 text-text-muted opacity-0 transition hover:text-status-error focus-visible:opacity-100 group-hover:opacity-100"
                        >
                          <X className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      )}
                    </figure>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
});
