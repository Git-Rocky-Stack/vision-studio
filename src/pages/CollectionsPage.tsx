import { memo, useState, useMemo } from 'react';
import { Search, Plus, Sparkles, FolderOpen, Layers } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/utils/cn';
import { Button } from '@/components/ui/Button';
import { useAppStore } from '@/store/appStore';
import { CollectionCard } from '@/components/collections/CollectionCard';
import { AnalyzeButton } from '@/components/collections/AnalyzeButton';
import type { Collection } from '@/types/collections';

type CategoryFilter = 'all' | 'smart' | 'manual' | 'tagged' | 'untagged';

export const CollectionsPage = memo(function CollectionsPage() {
  const collections = useAppStore((s) => s.collections);
  const createCollection = useAppStore((s) => s.createCollection);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<CategoryFilter>('all');

  const filtered = useMemo(() => {
    let result = collections;

    if (category === 'smart') result = result.filter((c) => c.type === 'smart');
    else if (category === 'manual') result = result.filter((c) => c.type === 'manual');

    if (search) {
      const q = search.toLowerCase();
      result = result.filter((c) => c.name.toLowerCase().includes(q));
    }

    return result;
  }, [collections, category, search]);

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
        <h1 className="type-heading-3 text-text-primary flex-1">Collections</h1>
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
            className="w-full rounded-md border border-border bg-surface pl-9 pr-3 py-2 type-body-sm text-text-primary placeholder:text-text-muted focus:border-accent-primary focus:outline-none focus:ring-1 focus:ring-accent-primary"
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
          <div className="flex flex-col items-center justify-center h-full text-text-muted">
            <FolderOpen className="w-12 h-12 mb-3 opacity-30" />
            <p className="type-body">No collections yet</p>
            <p className="type-body-sm mt-1">Create a collection to organize your assets</p>
          </div>
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