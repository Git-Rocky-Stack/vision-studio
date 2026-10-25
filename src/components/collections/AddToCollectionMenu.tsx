import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, FolderPlus, Plus } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { cn } from '@/utils/cn';
import { useAppStore } from '@/store/appStore';

interface AddToCollectionMenuProps {
  /** Library asset id; null when the item has no library record yet. */
  assetId: string | null;
  /** Classes for the trigger, so it matches the surrounding action row. */
  triggerClassName?: string;
  /** Render the trigger as an icon-only button (asset tiles) or with a label. */
  iconOnly?: boolean;
}

/**
 * "Add to collection": toggles the asset in any manual collection, or
 * creates a new one with it. Smart collections fill themselves from their
 * query, so they are not offered. The popover is portalled so a tile's
 * overflow-hidden cannot clip it, and its clicks never reach the tile.
 */
export function AddToCollectionMenu({ assetId, triggerClassName, iconOnly = false }: AddToCollectionMenuProps) {
  const { collections, addAssetToCollection, removeAssetFromCollection, createCollection } = useAppStore(
    useShallow((s) => ({
      collections: s.collections,
      addAssetToCollection: s.addAssetToCollection,
      removeAssetFromCollection: s.removeAssetFromCollection,
      createCollection: s.createCollection,
    })),
  );
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [position, setPosition] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const manual = collections.filter((c) => c.type === 'manual');

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const width = 224;
    setPosition({
      top: rect.bottom + 4,
      left: Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8)),
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!popoverRef.current?.contains(target) && !triggerRef.current?.contains(target)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const disabledReason = assetId ? null : 'This item is not in the asset library yet.';

  const handleCreate = () => {
    const name = newName.trim();
    if (!name || !assetId) return;
    const collection = createCollection({ name, type: 'manual' });
    addAssetToCollection(collection.id, assetId);
    setNewName('');
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label="Add to collection"
        aria-haspopup="true"
        aria-expanded={open}
        disabled={Boolean(disabledReason)}
        title={disabledReason ?? 'Add to collection'}
        onClick={(event) => {
          event.stopPropagation();
          setOpen((value) => !value);
        }}
        className={cn(
          'disabled:cursor-not-allowed disabled:opacity-40',
          iconOnly ? '' : 'inline-flex items-center gap-2',
          triggerClassName,
        )}
      >
        <FolderPlus className="h-3.5 w-3.5" aria-hidden="true" />
        {!iconOnly && <span>Add to collection</span>}
      </button>
      {open &&
        assetId &&
        createPortal(
          <div
            ref={popoverRef}
            role="dialog"
            aria-label="Add to collection"
            onClick={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
            className="fixed z-[70] w-56 rounded-overlay border border-border bg-elevated p-2 shadow-cinematic"
            style={{ top: position.top, left: position.left }}
          >
            <p className="mono-label px-2 pb-2 text-text-muted">Collections</p>
            {manual.length === 0 ? (
              <p className="px-2 pb-2 type-caption text-text-body">No collections yet. Create one below.</p>
            ) : (
              <ul className="max-h-48 space-y-0.5 overflow-y-auto pb-2">
                {manual.map((collection) => {
                  const member = collection.assetIds.includes(assetId);
                  return (
                    <li key={collection.id}>
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={member}
                        onClick={() =>
                          member
                            ? removeAssetFromCollection(collection.id, assetId)
                            : addAssetToCollection(collection.id, assetId)
                        }
                        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left type-caption text-text-primary transition hover:bg-surface"
                      >
                        <span
                          className={cn(
                            'flex h-3.5 w-3.5 items-center justify-center rounded-sm border',
                            member ? 'border-accent-primary bg-accent-primary text-void' : 'border-border-hover',
                          )}
                          aria-hidden="true"
                        >
                          {member && <Check className="h-2.5 w-2.5" />}
                        </span>
                        <span className="truncate">{collection.name}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            <form
              className="flex items-center gap-1 border-t border-border pt-2"
              onSubmit={(event) => {
                event.preventDefault();
                handleCreate();
              }}
            >
              <input
                type="text"
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
                placeholder="New collection"
                aria-label="New collection name"
                className="recessed-well min-w-0 flex-1 px-2 py-1 type-caption text-text-primary placeholder:text-text-muted"
              />
              <button
                type="submit"
                aria-label="Create collection with this asset"
                disabled={!newName.trim()}
                className="raised-control p-1.5 text-text-primary disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </form>
          </div>,
          document.body,
        )}
    </>
  );
}
