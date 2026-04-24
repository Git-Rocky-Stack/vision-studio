import { memo, useState } from 'react';
import { Search, Plus, FolderOpen } from 'lucide-react';
import { AnimatePresence } from 'framer-motion';
import { cn } from '@/utils/cn';
import { Button } from '@/components/ui/Button';
import { useAppStore } from '@/store/appStore';
import { CollectionCard } from './CollectionCard';

type CollectionFilter = 'all' | 'smart' | 'manual';

interface CollectionsPanelProps {
  className?: string;
}

export const CollectionsPanel = memo(function CollectionsPanel({ className }: CollectionsPanelProps) {
  const collections = useAppStore((s) => s.collections);
  const createCollection = useAppStore((s) => s.createCollection);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<CollectionFilter>('all');

  const filtered = collections.filter((c) => {
    if (filter === 'smart') return c.type === 'smart';
    if (filter === 'manual') return c.type === 'manual';
    return true;
  }).filter((c) =>
    search ? c.name.toLowerCase().includes(search.toLowerCase()) : true
  );

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
        <h2 className="type-body-sm font-semibold text-text-primary flex-1">Collections</h2>
        <Button
          variant="ghost"
          size="sm"
          icon={Plus}
          onClick={() => createCollection({ name: 'New Collection', type: 'manual' })}
          aria-label="Create collection"
        >
          <span className="hidden sm:inline">New</span>
        </Button>
      </div>

      {/* Search */}
      <div className="px-3 py-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search collections..."
            className="w-full rounded-md border border-border bg-void pl-8 pr-3 py-1.5 type-body-sm text-text-primary placeholder:text-text-muted focus:border-accent-primary focus:outline-none focus:ring-1 focus:ring-accent-primary"
            aria-label="Search collections"
          />
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 px-3 py-1">
        {(['all', 'smart', 'manual'] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={cn(
              'rounded-md px-2 py-1 type-micro capitalize transition-colors',
              filter === f
                ? 'bg-accent-primary-muted text-accent-primary'
                : 'text-text-muted hover:text-text-body hover:bg-elevated',
            )}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Collection list */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
        <AnimatePresence mode="popLayout">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-text-muted type-body-sm">
              <FolderOpen className="w-8 h-8 mb-2 opacity-40" />
              No collections yet
            </div>
          ) : (
            filtered.map((collection) => (
              <CollectionCard key={collection.id} collection={collection} />
            ))
          )}
        </AnimatePresence>
      </div>
    </div>
  );
});
