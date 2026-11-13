import { memo, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { FolderOpen, Pencil, RefreshCw, Trash2 } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { cn } from '@/utils/cn';
import { useAppStore } from '@/store/appStore';
import { useAssetsById } from '@/features/assets/assetIndex';
import { resolveAssetThumbnail } from '@/features/assets/assetRecords';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useFocusWhen } from '@/hooks/useFocusWhen';
import { TagBadge } from './TagBadge';
import type { Collection, SmartQuery } from '@/types/collections';

/** Thumbnails shown in the card's preview mosaic. */
const PREVIEW_SLOTS = 4;
/** Query tags surfaced on a smart card before collapsing into a "+n" chip. */
const VISIBLE_QUERY_TAGS = 3;

/** The non-tag rules of a smart query, as short readable phrases. */
export function describeSmartRules(query: SmartQuery | undefined): string[] {
  if (!query) return [];
  const rules: string[] = [];
  if (query.promptText) rules.push(`prompt: "${query.promptText}"`);
  if (query.model) rules.push(`model: ${query.model}`);
  if (query.dateRange) {
    const { from, to } = query.dateRange;
    const fmt = (ms: number) => new Date(ms).toLocaleDateString();
    if (from > 0 && to < Number.MAX_SAFE_INTEGER) rules.push(`${fmt(from)} to ${fmt(to)}`);
    else if (from > 0) rules.push(`since ${fmt(from)}`);
    else rules.push(`until ${fmt(to)}`);
  }
  return rules;
}

interface CollectionCardProps {
  collection: Collection;
  onClick?: (id: string) => void;
  className?: string;
}

/**
 * One collection tile. The open action is a full-bleed button behind the
 * content (not a role="button" wrapper), so the rename / refresh / delete
 * buttons are siblings of it rather than illegally nested inside it.
 */
export const CollectionCard = memo(function CollectionCard({
  collection,
  onClick,
  className,
}: CollectionCardProps) {
  const [isRenaming, setIsRenaming] = useState(false);
  const renameInputRef = useRef<HTMLInputElement>(null);
  // The Rename action unmounts the name it replaces: focus follows into the field.
  useFocusWhen(renameInputRef, isRenaming);
  const [draftName, setDraftName] = useState(collection.name);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { deleteCollection, renameCollection, refreshSmartCollection, setActiveCollection, activeCollectionId } =
    useAppStore(
      useShallow((s) => ({
        deleteCollection: s.deleteCollection,
        renameCollection: s.renameCollection,
        refreshSmartCollection: s.refreshSmartCollection,
        setActiveCollection: s.setActiveCollection,
        activeCollectionId: s.activeCollectionId,
      })),
    );
  // One shared index per library snapshot - not a new Map per card.
  const assetsById = useAssetsById();

  const commitRename = () => {
    const name = draftName.trim();
    if (name && name !== collection.name) renameCollection(collection.id, name);
    else setDraftName(collection.name);
    setIsRenaming(false);
  };

  const isSmart = collection.type === 'smart';
  const isActive = activeCollectionId === collection.id;

  // Real preview art: the cover asset first (if one is set), then the
  // collection's own assets in order. Only assets that actually resolve to a
  // library record with an image contribute a tile.
  const previews = useMemo(() => {
    const ordered = collection.coverAssetId
      ? [collection.coverAssetId, ...collection.assetIds.filter((id) => id !== collection.coverAssetId)]
      : collection.assetIds;

    const tiles = [];
    for (const id of ordered) {
      const asset = assetsById.get(id);
      // Video/audio records preview as their placeholder, even in persisted form.
      if (asset && resolveAssetThumbnail(asset)) tiles.push(asset);
      if (tiles.length === PREVIEW_SLOTS) break;
    }
    return tiles;
  }, [assetsById, collection.assetIds, collection.coverAssetId]);

  const queryTags = isSmart ? (collection.smartQuery?.tags ?? []) : [];
  const ruleSummary = isSmart ? describeSmartRules(collection.smartQuery) : [];
  const assetCount = collection.assetIds.length;

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
      className={cn(
        'group relative flex flex-col gap-2 rounded-sm border bg-surface p-3',
        'transition-shadow hover:border-border-hover hover:shadow-accent-subtle',
        isActive ? 'border-accent-primary-border' : 'border-border',
        className,
      )}
    >
      {/* The card's primary action, stretched under the content. */}
      <button
        type="button"
        onClick={activate}
        aria-pressed={isActive}
        aria-label={`${collection.name} collection, ${assetCount} ${assetCount === 1 ? 'asset' : 'assets'}`}
        className="absolute inset-0 z-0 cursor-pointer rounded-sm"
      />

      {/* Preview mosaic */}
      <div
        className={cn(
          'pointer-events-none grid gap-1 rounded-sm overflow-hidden bg-void aspect-square',
          previews.length > 1 ? 'grid-cols-2' : 'grid-cols-1',
        )}
      >
        {previews.length > 0 ? (
          previews.map((asset) => (
            <img
              key={asset.id}
              src={resolveAssetThumbnail(asset)}
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
      <div className="pointer-events-none flex items-center gap-2">
        {isRenaming ? (
          <input
            ref={renameInputRef}
            type="text"
            value={draftName}
            aria-label={`Rename ${collection.name}`}
            onChange={(e) => setDraftName(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter') commitRename();
              if (e.key === 'Escape') {
                setDraftName(collection.name);
                setIsRenaming(false);
              }
            }}
            className="pointer-events-auto relative z-10 recessed-well min-w-0 flex-1 px-2 py-0.5 type-body-sm text-text-primary"
          />
        ) : (
          <span className="type-body-sm font-medium text-text-primary truncate flex-1">
            {collection.name}
          </span>
        )}
        {isSmart && (
          <span className="type-micro px-1.5 py-0.5 rounded-full bg-accent-primary-muted text-accent-primary border border-accent-primary-border">
            Smart
          </span>
        )}
      </div>
      <span className="pointer-events-none type-micro text-text-muted">
        {assetCount} {assetCount === 1 ? 'asset' : 'assets'}
      </span>

      {/* The rule a smart collection matches on, so it is legible without
          opening it. */}
      {ruleSummary.length > 0 && (
        <p className="pointer-events-none data-mono truncate text-text-muted" title={ruleSummary.join(', ')}>
          {ruleSummary.join(', ')}
        </p>
      )}
      {queryTags.length > 0 && (
        <div className="pointer-events-none flex flex-wrap gap-1">
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

      {/* Actions: shown on hover, while keyboard focus is inside the card,
          and on the open collection. */}
      <div
        className={cn(
          'absolute top-2 right-2 z-10 flex gap-1 transition-opacity focus-within:opacity-100 group-hover:opacity-100',
          isActive ? 'opacity-100' : 'opacity-0',
        )}
      >
        {isSmart ? (
          <button
            type="button"
            onClick={() => refreshSmartCollection(collection.id)}
            className="icon-button flex h-8 w-8 items-center justify-center rounded-md bg-void/80 text-text-muted hover:text-text-primary hover:bg-void"
            aria-label={`Refresh ${collection.name}`}
            title="Re-run the rules against the library"
          >
            <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => {
              setDraftName(collection.name);
              setIsRenaming(true);
            }}
            className="icon-button flex h-8 w-8 items-center justify-center rounded-md bg-void/80 text-text-muted hover:text-text-primary hover:bg-void"
            aria-label={`Rename ${collection.name}`}
          >
            <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        )}
        <button
          type="button"
          onClick={() => setConfirmDelete(true)}
          className="icon-button flex h-8 w-8 items-center justify-center rounded-md bg-void/80 text-text-muted hover:text-status-error hover:bg-void"
          aria-label={`Delete ${collection.name}`}
        >
          <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
        </button>
      </div>

      {/* Portalled: the card's hover transform would otherwise become the
          containing block of the dialog's fixed overlay. */}
      {confirmDelete && createPortal(
        <ConfirmDialog
          open={confirmDelete}
          title={`Delete "${collection.name}"?`}
          message={
            isSmart
              ? 'The smart collection and its rules are removed. Its assets stay in your library.'
              : 'The collection is removed. Its assets stay in your library.'
          }
          confirmLabel="Delete collection"
          variant="danger"
          onConfirm={() => {
            setConfirmDelete(false);
            deleteCollection(collection.id);
          }}
          onCancel={() => setConfirmDelete(false)}
        />,
        document.body,
      )}
    </motion.div>
  );
});
