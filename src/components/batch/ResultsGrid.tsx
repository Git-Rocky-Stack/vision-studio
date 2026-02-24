import { useState, useCallback } from 'react';
import { cn } from '@/utils/cn';
import { Button } from '@/components/ui/Button';
import { ResultCard } from './ResultCard';
import { useAppStore } from '@/store/appStore';
import {
  Grid3X3,
  List,
  Maximize2,
  ArrowUpDown,
  Download,
  Trash2,
  Pencil,
  Heart,
  Layers,
  CheckSquare,
  XSquare,
} from 'lucide-react';
import { AnimatePresence } from 'framer-motion';

type ViewMode = 'grid' | 'list' | 'large';
type SortBy = 'created' | 'prompt' | 'status';
type FilterBy = 'all' | 'completed' | 'failed' | 'favorites';

interface ResultsGridProps {
  onPreviewImage: (resultId: string) => void;
}

export function ResultsGrid({ onPreviewImage }: ResultsGridProps) {
  const {
    batchResults,
    toggleBatchResultFavorite,
    setCurrentImage,
    setActivePanel,
  } = useAppStore();

  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [sortBy, setSortBy] = useState<SortBy>('created');
  const [filterBy, setFilterBy] = useState<FilterBy>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [lastSelectedId, setLastSelectedId] = useState<string | null>(null);

  // Filter results
  const filteredResults = batchResults.filter((r) => {
    if (filterBy === 'all') return true;
    if (filterBy === 'completed') return !!r.imagePath;
    if (filterBy === 'failed') return !r.imagePath;
    if (filterBy === 'favorites') return r.isFavorite;
    return true;
  });

  // Sort results
  const sortedResults = [...filteredResults].sort((a, b) => {
    if (sortBy === 'created') {
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    }
    if (sortBy === 'prompt') {
      return a.promptIndex - b.promptIndex;
    }
    if (sortBy === 'status') {
      const statusOrder = (r: typeof a) => (r.imagePath ? 0 : 1);
      return statusOrder(a) - statusOrder(b);
    }
    return 0;
  });

  // Multi-select handler (Shift+click for range, Ctrl+click for toggle)
  const handleSelect = useCallback(
    (id: string, e: React.MouseEvent) => {
      if (e.shiftKey && lastSelectedId) {
        // Range select
        const allIds = sortedResults.map((r) => r.id);
        const startIdx = allIds.indexOf(lastSelectedId);
        const endIdx = allIds.indexOf(id);
        if (startIdx !== -1 && endIdx !== -1) {
          const rangeStart = Math.min(startIdx, endIdx);
          const rangeEnd = Math.max(startIdx, endIdx);
          const rangeIds = allIds.slice(rangeStart, rangeEnd + 1);
          setSelectedIds((prev) => {
            const next = new Set(prev);
            rangeIds.forEach((rid) => next.add(rid));
            return next;
          });
        }
      } else if (e.ctrlKey || e.metaKey) {
        // Toggle individual
        setSelectedIds((prev) => {
          const next = new Set(prev);
          if (next.has(id)) {
            next.delete(id);
          } else {
            next.add(id);
          }
          return next;
        });
      } else {
        // Single select
        setSelectedIds(new Set([id]));
      }
      setLastSelectedId(id);
    },
    [lastSelectedId, sortedResults]
  );

  const selectAll = () => {
    setSelectedIds(new Set(sortedResults.map((r) => r.id)));
  };

  const deselectAll = () => {
    setSelectedIds(new Set());
  };

  const handleBulkFavorite = () => {
    selectedIds.forEach((id) => toggleBatchResultFavorite(id));
  };

  const handleSendToEdit = (id: string) => {
    const result = batchResults.find((r) => r.id === id);
    if (result?.imagePath) {
      setCurrentImage(result.imagePath);
      setActivePanel('edit');
    }
  };

  const handleDownload = (_id: string) => {
    // Placeholder — would trigger Electron save dialog
  };

  const handleBulkDelete = () => {
    // Placeholder — would remove selected from store
    deselectAll();
  };

  const handleExportAll = () => {
    // Placeholder — would trigger ZIP export
  };

  const VIEW_MODES: { id: ViewMode; icon: React.ElementType; label: string }[] = [
    { id: 'grid', icon: Grid3X3, label: 'Grid' },
    { id: 'list', icon: List, label: 'List' },
    { id: 'large', icon: Maximize2, label: 'Large' },
  ];

  const FILTERS: { id: FilterBy; label: string; count: number }[] = [
    { id: 'all', label: 'All', count: batchResults.length },
    { id: 'completed', label: 'Completed', count: batchResults.filter((r) => r.imagePath).length },
    { id: 'failed', label: 'Failed', count: batchResults.filter((r) => !r.imagePath).length },
    { id: 'favorites', label: 'Favorites', count: batchResults.filter((r) => r.isFavorite).length },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Controls Bar */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-elevated/50">
        {/* View Toggle */}
        <div className="flex items-center bg-surface rounded-lg p-0.5">
          {VIEW_MODES.map(({ id, icon: Icon, label }) => (
            <button
              key={id}
              onClick={() => setViewMode(id)}
              title={label}
              className={cn(
                'p-1.5 rounded-md transition-all',
                viewMode === id
                  ? 'bg-red-primary text-text-primary'
                  : 'text-text-muted hover:text-text-primary'
              )}
            >
              <Icon className="w-3.5 h-3.5" />
            </button>
          ))}
        </div>

        {/* Sort Dropdown */}
        <div className="relative">
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortBy)}
            className="appearance-none bg-surface border border-border rounded-lg pl-3 pr-8 py-1.5 text-xs font-display text-text-primary focus:border-red-primary transition-all cursor-pointer"
          >
            <option value="created">Creation Time</option>
            <option value="prompt">Prompt Order</option>
            <option value="status">Status</option>
          </select>
          <ArrowUpDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-text-muted pointer-events-none" />
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 flex-1">
          {FILTERS.map(({ id, label, count }) => (
            <button
              key={id}
              onClick={() => setFilterBy(id)}
              className={cn(
                'px-2.5 py-1 rounded-full text-[10px] font-display font-medium transition-all',
                filterBy === id
                  ? 'bg-red-primary text-text-primary'
                  : 'bg-surface text-text-body hover:text-text-primary'
              )}
            >
              {label}
              {count > 0 && (
                <span className="ml-1 opacity-60">{count}</span>
              )}
            </button>
          ))}
        </div>

        {/* Bulk Actions */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={selectAll}
            title="Select All"
            className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface transition-all"
          >
            <CheckSquare className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={deselectAll}
            title="Deselect All"
            className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface transition-all"
          >
            <XSquare className="w-3.5 h-3.5" />
          </button>
          <Button
            variant="ghost"
            size="sm"
            icon={Download}
            onClick={handleExportAll}
          >
            Export All
          </Button>
        </div>
      </div>

      {/* Grid Area */}
      <div className="flex-1 overflow-y-auto p-4 scrollbar-hide">
        {sortedResults.length === 0 ? (
          /* Empty State */
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="w-16 h-16 rounded-2xl bg-elevated flex items-center justify-center mb-4">
              <Layers className="w-8 h-8 text-text-muted" />
            </div>
            <p className="font-display text-sm text-text-primary mb-1">
              No results yet
            </p>
            <p className="font-display text-xs text-text-muted max-w-[240px]">
              Generate a batch to see results here. Results will appear as each image completes.
            </p>
          </div>
        ) : (
          <div
            className={cn(
              viewMode === 'grid' && 'grid grid-cols-3 gap-3',
              viewMode === 'large' && 'grid grid-cols-2 gap-4',
              viewMode === 'list' && 'flex flex-col gap-2'
            )}
          >
            <AnimatePresence mode="popLayout">
              {sortedResults.map((result) => (
                <ResultCard
                  key={result.id}
                  result={result}
                  isSelected={selectedIds.has(result.id)}
                  onSelect={handleSelect}
                  onPreview={onPreviewImage}
                  onToggleFavorite={toggleBatchResultFavorite}
                  onDownload={handleDownload}
                  onSendToEdit={handleSendToEdit}
                  viewMode={viewMode}
                />
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Bulk Actions Bar */}
      <AnimatePresence>
        {selectedIds.size > 0 && (
          <div className="px-4 py-3 border-t border-border bg-elevated flex items-center gap-3">
            <span className="text-xs font-display text-text-primary font-medium">
              {selectedIds.size} selected
            </span>
            <div className="flex-1" />
            <button
              onClick={handleBulkFavorite}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-display text-text-body hover:text-red-primary hover:bg-red-aura transition-all"
            >
              <Heart className="w-3.5 h-3.5" />
              Favorite
            </button>
            <button
              onClick={handleExportAll}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-display text-text-body hover:text-text-primary hover:bg-surface transition-all"
            >
              <Download className="w-3.5 h-3.5" />
              Export
            </button>
            <button
              onClick={() => {
                selectedIds.forEach((id) => handleSendToEdit(id));
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-display text-text-body hover:text-text-primary hover:bg-surface transition-all"
            >
              <Pencil className="w-3.5 h-3.5" />
              Edit
            </button>
            <button
              onClick={handleBulkDelete}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-display text-red-primary hover:bg-red-aura transition-all"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete
            </button>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
