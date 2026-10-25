import { memo, useMemo } from 'react';
import { FolderOpen, X } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { EmptyState } from '@/components/ui/EmptyState';
import { useAppStore } from '@/store/appStore';
import type { Collection } from '@/types/collections';

interface CollectionDetailProps {
  collection: Collection;
}

/**
 * The open collection's assets. Manual collections can drop an asset here;
 * smart collections are filled by their query, so they only list.
 */
export const CollectionDetail = memo(function CollectionDetail({ collection }: CollectionDetailProps) {
  const { assetLibrary, removeAssetFromCollection, setActiveCollection } = useAppStore(
    useShallow((s) => ({
      assetLibrary: s.assetLibrary,
      removeAssetFromCollection: s.removeAssetFromCollection,
      setActiveCollection: s.setActiveCollection,
    })),
  );

  const assets = useMemo(() => {
    const byId = new Map(assetLibrary.map((asset) => [asset.id, asset]));
    return collection.assetIds
      .map((id) => byId.get(id))
      .filter((asset): asset is NonNullable<typeof asset> => Boolean(asset));
  }, [assetLibrary, collection.assetIds]);

  const isManual = collection.type === 'manual';

  return (
    <section aria-label={`${collection.name} assets`} className="border-t border-border px-6 py-4">
      <div className="mb-3 flex items-center gap-2">
        <h2 className="type-section flex-1 truncate text-text-primary">{collection.name}</h2>
        <span className="data-mono text-text-muted">
          {assets.length} {assets.length === 1 ? 'asset' : 'assets'}
        </span>
        <button
          type="button"
          onClick={() => setActiveCollection(null)}
          aria-label="Close collection"
          className="rounded-md p-1 text-text-muted transition hover:bg-elevated hover:text-text-primary"
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
              : 'No assets match this smart collection yet.'
          }
        />
      ) : (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-3">
          {assets.map((asset) => (
            <li key={asset.id} className="group relative overflow-hidden rounded-sm border border-border bg-surface">
              <img
                src={asset.thumbnail || asset.previewUrl}
                alt={asset.name}
                loading="lazy"
                className="aspect-square w-full object-cover"
              />
              <p className="truncate px-2 py-1 type-caption text-text-body">{asset.name}</p>
              {isManual && (
                <button
                  type="button"
                  onClick={() => removeAssetFromCollection(collection.id, asset.id)}
                  aria-label={`Remove ${asset.name} from ${collection.name}`}
                  className="absolute right-1 top-1 rounded-md bg-void/80 p-1 text-text-muted opacity-0 transition hover:text-status-error focus-visible:opacity-100 group-hover:opacity-100"
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
});
