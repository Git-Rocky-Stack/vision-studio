import { useState, useCallback, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { cn } from '@/utils/cn';
import { ResultCard } from './ResultCard';
import { useAppStore } from '@/store/appStore';
import {
  Download,
  Trash2,
  Pencil,
  Heart,
  Layers,
} from 'lucide-react';
import { AnimatePresence } from 'framer-motion';

export type ViewMode = 'grid' | 'list' | 'large';
export type SortBy = 'created' | 'prompt' | 'status';
export type FilterBy = 'all' | 'completed' | 'failed' | 'favorites';

interface ResultsGridProps {
  onPreviewImage: (resultId: string) => void;
  viewMode?: ViewMode;
  sortBy?: SortBy;
  filterBy?: FilterBy;
}

export function ResultsGrid({
  onPreviewImage,
  viewMode: viewModeProp,
  sortBy: sortByProp,
  filterBy: filterByProp,
}: ResultsGridProps) {
  const {
    batchResults,
    toggleBatchResultFavorite,
    setCurrentImage,
    setActivePanel,
    removeBatchResults,
    removeAssetRecordsByPaths,
  } = useAppStore();

  const [viewModeLocal, setViewModeLocal] = useState<ViewMode>('grid');
  const [sortByLocal, setSortByLocal] = useState<SortBy>('created');
  const [filterByLocal, setFilterByLocal] = useState<FilterBy>('all');

  const viewMode = viewModeProp ?? viewModeLocal;
  const sortBy = sortByProp ?? sortByLocal;
  const filterBy = filterByProp ?? filterByLocal;

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
      setCurrentImage(result.imagePath, result.assetPath);
      setActivePanel('edit');
    }
  };

  const handleDownload = async (id: string) => {
    const result = batchResults.find((entry) => entry.id === id);
    if (!result?.assetPath) {
      return;
    }

    const destinationPath = await window.electron.dialog.saveFile({
      defaultPath: result.assetPath.split('/').pop(),
      filters: [{ name: 'Media', extensions: ['png', 'jpg', 'jpeg', 'webp', 'mp4'] }],
    });

    if (!destinationPath) {
      return;
    }

    await window.electron.assets.export(result.assetPath, destinationPath);
  };

  const handleBulkDelete = async () => {
    const selectedResults = batchResults.filter((result) => selectedIds.has(result.id));
    const assetPaths = selectedResults
      .map((result) => result.assetPath)
      .filter((assetPath): assetPath is string => Boolean(assetPath));

    const deleteResults = await Promise.all(
      assetPaths.map((assetPath) => window.electron.assets.delete(assetPath))
    );
    const deletedPaths = assetPaths.filter((_, index) => deleteResults[index]?.success);
    const deletedIds = selectedResults
      .filter((result) => result.assetPath && deletedPaths.includes(result.assetPath))
      .map((result) => result.id);

    removeBatchResults(deletedIds);
    removeAssetRecordsByPaths(deletedPaths);
    deselectAll();
  };

  const handleExportAll = async () => {
    const selectedResults = batchResults.filter((result) =>
      selectedIds.size > 0 ? selectedIds.has(result.id) : Boolean(result.assetPath)
    );
    const assetPaths = selectedResults
      .map((result) => result.assetPath)
      .filter((assetPath): assetPath is string => Boolean(assetPath));

    if (assetPaths.length === 0) {
      return;
    }

    const destinationDir = await window.electron.dialog.selectFolder();
    if (!destinationDir) {
      return;
    }

    await window.electron.assets.exportMany(assetPaths, destinationDir);
  };

  const parentRef = useRef<HTMLDivElement>(null);
  const COLS = viewMode === 'grid' ? 3 : viewMode === 'large' ? 2 : 1;
  const rowCount = Math.ceil(sortedResults.length / COLS);

  const rowVirtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => {
      if (viewMode === 'list') return 72;
      if (viewMode === 'large') return 320;
      return 220;
    },
    overscan: 5,
  });

  return (
    <div className="flex flex-col h-full">
      {/* Grid Area */}
      <div ref={parentRef} className="flex-1 overflow-y-auto p-4 scrollbar-hide">
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
          <div style={{ height: `${rowVirtualizer.getTotalSize()}px`, position: 'relative' }}>
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const startIdx = virtualRow.index * COLS;
              const rowResults = sortedResults.slice(startIdx, startIdx + COLS);
              return (
                <div
                  key={virtualRow.key}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                  className={cn(
                    viewMode === 'grid' && 'grid grid-cols-2 xl:grid-cols-3 gap-3',
                    viewMode === 'large' && 'grid grid-cols-1 xl:grid-cols-2 gap-4',
                    viewMode === 'list' && 'flex flex-col gap-2'
                  )}
                >
                  <AnimatePresence mode="popLayout">
                    {rowResults.map((result) => (
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
              );
            })}
          </div>
        )}
      </div>

      {/* Bulk Actions Bar */}
      <AnimatePresence>
        {selectedIds.size > 0 && (
          <div aria-live="polite" className="px-4 py-3 border-t border-border bg-elevated flex items-center gap-3">
            <span className="text-xs font-display text-text-primary font-medium">
              {selectedIds.size} selected
            </span>
            <div className="flex-1" />
            <button
              onClick={handleBulkFavorite}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-display text-text-body hover:text-red-primary hover:bg-red-aura transition-all"
            >
              <Heart className="w-3.5 h-3.5" />
              Favorite
            </button>
            <button
              onClick={handleExportAll}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-display text-text-body hover:text-text-primary hover:bg-surface transition-all"
            >
              <Download className="w-3.5 h-3.5" />
              Export
            </button>
            <button
              onClick={() => {
                selectedIds.forEach((id) => handleSendToEdit(id));
              }}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-display text-text-body hover:text-text-primary hover:bg-surface transition-all"
            >
              <Pencil className="w-3.5 h-3.5" />
              Edit
            </button>
            <button
              onClick={handleBulkDelete}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-display text-red-primary hover:bg-red-aura transition-all"
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
