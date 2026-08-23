import { memo, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { FolderOpen, Trash2 } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { cn } from '@/utils/cn';
import { useAppStore } from '@/store/appStore';
import { TagBadge } from './TagBadge';
import type { Collection } from '@/types/collections';

/** Thumbnails shown in the card's preview mosaic. */
const PREVIEW_SLOTS = 4;
/** Query tags surfaced on a smart card before collapsing into a "+n" chip. */
const VISIBLE_QUERY_TAGS = 3;

interface CollectionCardProps {
  collection: Collection;
  onClick?: (id: string) => void;
  className?: string;
}

export const CollectionCard = memo(function CollectionCard({
  collection,
  onClick,
  className,
}: CollectionCardProps) {
  const [showActions, setShowActions] = useState(false);
  const { assetLibrary, deleteCollection, setActiveCollection, activeCollectionId } = useAppStore(
    useShallow((s) => ({
      assetLibrary: s.assetLibrary,
      deleteCollection: s.deleteCollection,
      setActiveCollection: s.setActiveCollection,
      activeCollectionId: s.activeCollectionId,
    })),
  );

  const isSmart = collection.type === 'smart';
  const isActive = activeCollectionId === collection.id;

  // Real preview art: the cover asset first (if one is set), then the
  // collection's own assets in order. Only assets that actually resolve to a
  // library record with an image contribute a tile.
  const previews = useMemo(() => {
    const byId = new Map(assetLibrary.map((asset) => [asset.id, asset]));
    const ordered = collection.coverAssetId
      ? [collection.coverAssetId, ...collection.assetIds.filter((id) => id !== collection.coverAssetId)]
      : collection.assetIds;

    return ordered
      .map((id) => byId.get(id))
      .filter((asset): asset is NonNullable<typeof asset> =>
        Boolean(asset && (asset.thumbnail || asset.previewUrl)),
      )
      .slice(0, PREVIEW_SLOTS);
  }, [assetLibrary, collection.assetIds, collection.coverAssetId]);

  const queryTags = isSmart ? (collection.smartQuery?.tags ?? []) : [];

  const activate = () => {
    setActiveCollection(collection.id);
    onClick?.(collection.id);
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      whileHover={{ scale: 1.02 }}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
      onClick={activate}
      className={cn(
        'group relative flex flex-col gap-2 rounded-md border bg-surface p-3',
        'cursor-pointer transition-shadow hover:border-border-hover hover:shadow-accent-subtle',
        isActive ? 'border-accent-primary-border' : 'border-border',
        className,
      )}
      role="button"
      tabIndex={0}
      aria-pressed={isActive}
      aria-label={`${collection.name} collection, ${collection.assetIds.length} assets`}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          activate();
        }
      }}
    >
      {/* Preview mosaic */}
      <div
        className={cn(
          'grid gap-1 rounded-md overflow-hidden bg-void aspect-square',
          previews.length > 1 ? 'grid-cols-2' : 'grid-cols-1',
        )}
      >
        {previews.length > 0 ? (
          previews.map((asset) => (
            <img
              key={asset.id}
              src={asset.thumbnail || asset.previewUrl}
              alt={asset.name}
              loading="lazy"
              className="h-full w-full object-cover"
            />
          ))
        ) : (
          <div className="flex items-center justify-center text-text-muted">
            <FolderOpen className="w-8 h-8 opacity-30" aria-hidden="true" />
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex items-center gap-2">
        <span className="type-body-sm font-medium text-text-primary truncate flex-1">
          {collection.name}
        </span>
        {isSmart && (
          <span className="type-micro px-1.5 py-0.5 rounded-full bg-accent-primary-muted text-accent-primary border border-accent-primary-border">
            Smart
          </span>
        )}
      </div>
      <span className="type-micro text-text-muted">
        {collection.assetIds.length} {collection.assetIds.length === 1 ? 'asset' : 'assets'}
      </span>

      {/* The terms a smart collection actually matches on, so its rule is
          legible without opening it. */}
      {queryTags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {queryTags.slice(0, VISIBLE_QUERY_TAGS).map((tag) => (
            <TagBadge
              key={tag}
              tag={{ id: `query:${tag}`, name: tag, category: 'custom', source: 'user', confidence: 1 }}
            />
          ))}
          {queryTags.length > VISIBLE_QUERY_TAGS && (
            <span className="type-micro text-text-muted self-center">
              +{queryTags.length - VISIBLE_QUERY_TAGS}
            </span>
          )}
        </div>
      )}

      {/* Hover actions */}
      {showActions && (
        <div className="absolute top-2 right-2 flex gap-1">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              deleteCollection(collection.id);
            }}
            className="p-1 rounded-md bg-void/80 text-text-muted hover:text-status-error hover:bg-void"
            aria-label={`Delete ${collection.name}`}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </motion.div>
  );
});
