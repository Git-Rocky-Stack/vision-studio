import { memo, useMemo } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ImageWithFallback } from '@/components/ui/ImageWithFallback';
import { TagBadge } from './TagBadge';
import { cn } from '@/utils/cn';
import { useAppStore } from '@/store/appStore';
import type { AssetMetadata } from '@/types/collections';

interface CollectionGridProps {
  assetIds: string[];
  onAssetClick?: (assetId: string) => void;
  className?: string;
}

export const CollectionGrid = memo(function CollectionGrid({ assetIds, onAssetClick, className }: CollectionGridProps) {
  const assetMetadata = useAppStore((s) => s.assetMetadata);

  const parentRef = useMemo(() => ({ current: null as HTMLDivElement | null }), []);

  const COLUMN_COUNT = 3;
  const ROW_HEIGHT = 180;
  const rowCount = Math.ceil(assetIds.length / COLUMN_COUNT);

  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 3,
  });

  return (
    <div
      ref={parentRef}
      className={cn('overflow-y-auto min-h-0 flex-1', className)}
    >
      <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const rowStart = virtualRow.index * COLUMN_COUNT;
          const rowAssets = assetIds.slice(rowStart, rowStart + COLUMN_COUNT);

          return (
            <div
              key={virtualRow.index}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: virtualRow.size,
                transform: `translateY(${virtualRow.start}px)`,
              }}
              className="grid grid-cols-3 gap-2 px-2"
            >
              {rowAssets.map((assetId) => {
                const meta = assetMetadata.get(assetId);
                return (
                  <button
                    key={assetId}
                    type="button"
                    onClick={() => onAssetClick?.(assetId)}
                    className="group relative flex flex-col gap-1 rounded-md border border-border hover:border-border-hover overflow-hidden bg-elevated/30"
                    aria-label={`Asset ${assetId}`}
                  >
                    <div className="aspect-square bg-void flex items-center justify-center">
                      <ImageWithFallback
                        src=""
                        alt={assetId}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    {meta && meta.tags.length > 0 && (
                      <div className="flex flex-wrap gap-0.5 px-1 pb-1">
                        {meta.tags.slice(0, 3).map((tag) => (
                          <TagBadge key={tag.id} tag={tag} />
                        ))}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
});