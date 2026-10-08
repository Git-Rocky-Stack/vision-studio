import { memo, useState, useMemo } from 'react';
import { Search, Plus, FolderOpen, Layers } from 'lucide-react';
import { AnimatePresence } from 'framer-motion';
import { cn } from '@/utils/cn';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { useAppStore } from '@/store/appStore';
import { CollectionCard } from '@/components/collections/CollectionCard';
import { AnalyzeButton } from '@/components/collections/AnalyzeButton';

type CategoryFilter = 'all' | 'smart' | 'manual' | 'tagged' | 'untagged';

export const CollectionsPage = memo(function CollectionsPage() {
  const collections = useAppStore((s) => s.collections);
  const assetMetadata = useAppStore((s) => s.assetMetadata);
  const createCollection = useAppStore((s) => s.createCollection);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<CategoryFilter>('all');

  const filtered = useMemo(() => {
    let result = collections;

    if (category === 'smart') result = result.filter((c) => c.type === 'smart');
    else if (category === 'manual') result = result.filter((c) => c.type === 'manual');
    else if (category === 'tagged') {
      // Fully analysed: holds assets, and every one of them has metadata.
      result = result.filter(
        (c) => c.assetIds.length > 0 && c.assetIds.every((id) => assetMetadata.has(id)),
      );
    } else if (category === 'untagged') {
      // Still has analysis outstanding on at least one member asset.
      result = result.filter((c) => c.assetIds.some((id) => !assetMetadata.has(id)));
    }

    if (search) {
      const q = search.toLowerCase();
      result = result.filter((c) => c.name.toLowerCase().includes(q));
    }

    return result;
  }, [collections, category, search, assetMetadata]);

  const categories: { id: CategoryFilter; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'smart', label: 'Smart' },
    { id: 'manual', label: 'Manual' },
    { id: 'tagged', label: 'Tagged' },
    { id: 'untagged', label: 'Untagged' },
  ];

  return (
    <div className="flex h-full flex-col bg-void">
      {/* Header */}
      <header className="flex items-center gap-4 border-b border-border px-6 py-4">
        <Layers className="w-5 h-5 text-accent-primary" aria-hidden="true" />
        <h1 className="type-title flex-1">Collections</h1>
        <AnalyzeButton />
        <Button
          variant="primary"
          size="sm"
          icon={Plus}
          onClick={() => createCollection({ name: 'New Collection', type: 'manual' })}
        >
          New Collection
        </Button>
      </header>

      {/* Search & Filters */}
      <div className="flex items-center gap-3 border-b border-border px-6 py-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search collections..."
            className="recessed-well w-full pl-9 pr-3 py-2 type-body-sm text-text-primary placeholder:text-text-muted focus:border-accent-primary"
            aria-label="Search collections"
          />
        </div>
        <nav className="flex gap-1" role="tablist" aria-label="Collection categories">
          {categories.map((cat) => (
            <button
              key={cat.id}
              type="button"
              role="tab"
              aria-selected={category === cat.id}
              onClick={() => setCategory(cat.id)}
              className={cn(
                'rounded-md px-3 py-1.5 type-body-sm transition-colors',
                category === cat.id
                  ? 'bg-accent-primary-muted text-accent-primary border border-accent-primary-border'
                  : 'text-text-muted hover:text-text-body hover:bg-elevated border border-transparent',
              )}
            >
              {cat.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Collection grid */}
      <div className="flex-1 overflow-y-auto p-6">
        {filtered.length === 0 ? (
          // No action here: New Collection is in the header directly above.
          <EmptyState
            icon={FolderOpen}
            title="No collections yet"
            description="Create a collection to organize your assets."
          />
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-4">
            <AnimatePresence mode="popLayout">
              {filtered.map((collection) => (
                <CollectionCard key={collection.id} collection={collection} />
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
});
