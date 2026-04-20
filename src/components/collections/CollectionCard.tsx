import { memo, useState } from 'react';
import { motion } from 'framer-motion';
import { FolderOpen, Star, Trash2, MoreHorizontal } from 'lucide-react';
import { cn } from '@/utils/cn';
import { useAppStore } from '@/store/appStore';
import type { Collection } from '@/types/collections';

interface CollectionCardProps {
  collection: Collection;
  onClick?: (id: string) => void;
  className?: string;
}

export const CollectionCard = memo(function CollectionCard({ collection, onClick, className }: CollectionCardProps) {
  const [showActions, setShowActions] = useState(false);
  const deleteCollection = useAppStore((s) => s.deleteCollection);

  const isSmart = collection.type === 'smart';

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      whileHover={{ scale: 1.02 }}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
      onClick={() => onClick?.(collection.id)}
      className={cn(
        'group relative flex flex-col gap-2 rounded-lg border border-border bg-surface p-3',
        'cursor-pointer transition-shadow hover:border-border-hover hover:shadow-accent-subtle',
        className,
      )}
      role="button"
      tabIndex={0}
      aria-label={`${collection.name} collection, ${collection.assetIds.length} assets`}
      onKeyDown={(e) => { if (e.key === 'Enter') onClick?.(collection.id); }}
    >
      {/* Thumbnail grid */}
      <div className="grid grid-cols-2 gap-1 rounded-md overflow-hidden bg-void aspect-square">
        {collection.assetIds.length > 0 ? (
          Array.from({ length: Math.min(4, collection.assetIds.length) }).map((_, i) => (
            <div
              key={i}
              className="flex items-center justify-center bg-elevated/50 text-text-muted"
            >
              <FolderOpen className="w-6 h-6 opacity-40" />
            </div>
          ))
        ) : (
          <div className="col-span-2 flex items-center justify-center text-text-muted">
            <FolderOpen className="w-8 h-8 opacity-30" />
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

      {/* Hover actions */}
      {showActions && (
        <div className="absolute top-2 right-2 flex gap-1">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); deleteCollection(collection.id); }}
            className="p-1 rounded-md bg-void/80 text-text-muted hover:text-red-primary hover:bg-void"
            aria-label={`Delete ${collection.name}`}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </motion.div>
  );
});