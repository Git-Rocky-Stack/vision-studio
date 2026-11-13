import { useState, useCallback, useEffect, useId, useMemo, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { cn } from '@/utils/cn';
import { ResultCard } from './ResultCard';
import { RESULT_GRID_GAP_PX, resultGridColumns, useContentWidth } from './resultGridLayout';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '@/store/appStore';
import {
  Download,
  Trash2,
  Pencil,
  Heart,
  Layers,
} from 'lucide-react';
import { AnimatePresence } from 'framer-motion';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { pushNotice, reportActionError, runExport } from '@/features/notices';
import { useVirtualGridNavigation } from '@/hooks/useVirtualGridNavigation';

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
    setActiveTab,
    removeBatchResults,
    removeAssetRecordsByPaths,
  } = useAppStore(
    useShallow((s) => ({
      batchResults: s.batchResults,
      toggleBatchResultFavorite: s.toggleBatchResultFavorite,
      setCurrentImage: s.setCurrentImage,
      setActiveTab: s.setActiveTab,
      removeBatchResults: s.removeBatchResults,
      removeAssetRecordsByPaths: s.removeAssetRecordsByPaths,
    }))
  );

  const [viewModeLocal] = useState<ViewMode>('grid');
  const [sortByLocal] = useState<SortBy>('created');
  const [filterByLocal] = useState<FilterBy>('all');

  const viewMode = viewModeProp ?? viewModeLocal;
  const sortBy = sortByProp ?? sortByLocal;
  const filterBy = filterByProp ?? filterByLocal;

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [lastSelectedId, setLastSelectedId] = useState<string | null>(null);

  // Filter + sort once per input change: the order feeds memoized cards and
  // the keyboard navigation, which must not churn on unrelated re-renders.
  const sortedResults = useMemo(() => {
    const filteredResults = batchResults.filter((r) => {
      if (filterBy === 'all') return true;
      if (filterBy === 'completed') return !!r.imagePath;
      if (filterBy === 'failed') return !r.imagePath;
      if (filterBy === 'favorites') return r.isFavorite;
      return true;
    });
    return filteredResults.sort((a, b) => {
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
  }, [batchResults, filterBy, sortBy]);

  // Multi-select handler (Shift+click for range, Ctrl+click for toggle)
  const handleSelect = useCallback(
    (id: string, e: React.MouseEvent | React.KeyboardEvent) => {
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

  // The card's explicit select control: a checkbox-style toggle, so keyboard
  // users can build a multi-selection one result at a time. Shift still
  // extends a range from the last selected result.
  const handleToggleSelect = useCallback(
    (id: string, e: React.MouseEvent | React.KeyboardEvent) => {
      if (e.shiftKey && lastSelectedId) {
        handleSelect(id, e);
        return;
      }
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
      setLastSelectedId(id);
    },
    [handleSelect, lastSelectedId]
  );

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
      setActiveTab('canvas');
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

    await runExport(() => window.electron.assets.export(result.assetPath!, destinationPath));
  };

  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);

  const handleBulkDelete = async () => {
    setConfirmBulkDelete(false);
    const selectedResults = batchResults.filter((result) => selectedIds.has(result.id));
    const assetPaths = selectedResults
      .map((result) => result.assetPath)
      .filter((assetPath): assetPath is string => Boolean(assetPath));

    const deleteResults = await Promise.all(
      assetPaths.map((assetPath) =>
        window.electron.assets
          .delete(assetPath)
          .catch((error: unknown) => ({
            success: false,
            error: error instanceof Error ? error.message : 'delete failed',
          })),
      )
    );
    const deletedPaths = assetPaths.filter((_, index) => deleteResults[index]?.success);
    // Results with no file behind them (failed generations) are just records.
    const deletedIds = selectedResults
      .filter((result) => !result.assetPath || deletedPaths.includes(result.assetPath))
      .map((result) => result.id);

    removeBatchResults(deletedIds);
    removeAssetRecordsByPaths(deletedPaths);

    const failed = assetPaths.length - deletedPaths.length;
    if (failed > 0) {
      const firstError = deleteResults.find((r) => !r?.success)?.error;
      reportActionError(
        `${failed} of ${assetPaths.length} files could not be deleted${firstError ? `: ${firstError}` : ''}. They are still selected.`,
      );
      // Keep only the failures selected so the user can retry them.
      setSelectedIds(new Set(selectedResults.filter((r) => !deletedIds.includes(r.id)).map((r) => r.id)));
      return;
    }
    if (deletedIds.length > 0) {
      pushNotice('success', `Deleted ${deletedIds.length} ${deletedIds.length === 1 ? 'result' : 'results'}.`);
    }
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

    await runExport(() => window.electron.assets.exportMany(assetPaths, destinationDir), {
      successMessage: `Exported ${assetPaths.length} ${assetPaths.length === 1 ? 'file' : 'files'}.`,
    });
  };

  const parentRef = useRef<HTMLDivElement>(null);
  // One measured column count drives the virtual rows, the CSS grid tracks
  // and Up/Down navigation, so they always agree (resultGridLayout.ts).
  const gridWidth = useContentWidth(parentRef, sortedResults.length === 0);
  const COLS = resultGridColumns(viewMode, gridWidth);
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

  // A new column count changes every row's contents and height.
  useEffect(() => {
    rowVirtualizer.measure();
  }, [COLS, viewMode, rowVirtualizer]);

  // Keyboard: one roving tab stop across the virtualized cards.
  const orderedIds = useMemo(() => sortedResults.map((result) => result.id), [sortedResults]);
  const scrollToRow = useCallback(
    (rowIndex: number) => rowVirtualizer.scrollToIndex(rowIndex, { align: 'auto' }),
    [rowVirtualizer],
  );
  const { activeId, activate, handleNavigationKey } = useVirtualGridNavigation({
    ids: orderedIds,
    columns: COLS,
    containerRef: parentRef,
    scrollToRow,
  });
  const keyboardHintId = useId();

  // Rows remount when the column count changes (see the row key), which drops
  // focus to <body>. If the keyboard was in the grid, put it back on the card.
  const gridHadFocusRef = useRef(false);
  // The latest active card, read (not watched) by the remount effect below.
  const activeIdRef = useRef(activeId);
  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);
  useEffect(() => {
    const container = parentRef.current;
    const focusId = activeIdRef.current;
    if (!gridHadFocusRef.current || !container || !focusId) return;
    if (document.activeElement && document.activeElement !== document.body) return;
    for (const element of container.querySelectorAll<HTMLElement>('[data-nav-id]')) {
      if (element.dataset.navId === focusId) {
        element.focus({ preventScroll: true });
        break;
      }
    }
    // Only the column count remounts rows.
  }, [COLS]);

  return (
    <div className="flex flex-col h-full">
      {/* Grid Area */}
      <div
        ref={parentRef}
        className="flex-1 overflow-y-auto p-4 scrollbar-hide"
        onFocus={() => {
          gridHadFocusRef.current = true;
        }}
        onBlur={(event) => {
          // Focus moved to something else on purpose: stop restoring it.
          const next = event.relatedTarget as Node | null;
          if (next && !event.currentTarget.contains(next)) gridHadFocusRef.current = false;
        }}
      >
        {sortedResults.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <EmptyState
              icon={Layers}
              title="No results yet"
              description="Generate a batch to see results here. Results will appear as each image completes."
            />
          </div>
        ) : (
          <div style={{ height: `${rowVirtualizer.getTotalSize()}px`, position: 'relative' }}>
            <p id={keyboardHintId} className="sr-only">
              Enter opens the preview. Space selects; Ctrl+Space toggles and Shift+Space extends the
              selection. Arrow keys, Home and End move between results.
            </p>
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const startIdx = virtualRow.index * COLS;
              const rowResults = sortedResults.slice(startIdx, startIdx + COLS);
              return (
                <div
                  // Keyed by the column count too: when the columns change,
                  // rows remount rather than animating cards out of one row
                  // and into the next (AnimatePresence would leave ghosts).
                  key={`${COLS}:${virtualRow.key}`}
                  // Rows are measured, not assumed: card height follows the
                  // track width, which follows the column count.
                  ref={rowVirtualizer.measureElement}
                  data-index={virtualRow.index}
                  data-testid="results-grid-row"
                  data-columns={COLS}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${virtualRow.start}px)`,
                    ...(viewMode === 'list'
                      ? {}
                      : {
                          gridTemplateColumns: `repeat(${COLS}, minmax(0, 1fr))`,
                          columnGap: RESULT_GRID_GAP_PX[viewMode],
                          paddingBottom: RESULT_GRID_GAP_PX[viewMode],
                        }),
                  }}
                  className={cn(viewMode === 'list' ? 'flex flex-col pb-2' : 'grid')}
                >
                  <AnimatePresence mode="popLayout">
                    {rowResults.map((result) => (
                      <ResultCard
                        key={result.id}
                        result={result}
                        isSelected={selectedIds.has(result.id)}
                        onSelect={handleSelect}
                        onToggleSelect={handleToggleSelect}
                        onPreview={onPreviewImage}
                        onToggleFavorite={toggleBatchResultFavorite}
                        onDownload={handleDownload}
                        onSendToEdit={handleSendToEdit}
                        viewMode={viewMode}
                        isTabStop={result.id === activeId}
                        onFocusCard={activate}
                        onNavigateKey={handleNavigationKey}
                        describedBy={keyboardHintId}
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
            <span className="text-xs text-text-primary font-medium">
              {selectedIds.size} selected
            </span>
            <div className="flex-1" />
            <button
              onClick={handleBulkFavorite}
              className="flex items-center gap-2 px-3 py-2 rounded-md text-xs text-text-body hover:text-status-warning hover:bg-status-warning-muted transition"
            >
              <Heart className="w-3.5 h-3.5" />
              Favorite
            </button>
            <button
              onClick={handleExportAll}
              className="flex items-center gap-2 px-3 py-2 rounded-md text-xs text-text-body hover:text-text-primary hover:bg-surface transition"
            >
              <Download className="w-3.5 h-3.5" />
              Export
            </button>
            <button
              onClick={() => {
                selectedIds.forEach((id) => handleSendToEdit(id));
              }}
              className="flex items-center gap-2 px-3 py-2 rounded-md text-xs text-text-body hover:text-text-primary hover:bg-surface transition"
            >
              <Pencil className="w-3.5 h-3.5" />
              Edit
            </button>
            <button
              onClick={() => setConfirmBulkDelete(true)}
              className="flex items-center gap-2 px-3 py-2 rounded-md text-xs text-status-error hover:bg-status-error-muted transition"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete
            </button>
          </div>
        )}
      </AnimatePresence>

      <ConfirmDialog
        open={confirmBulkDelete}
        title={`Delete ${selectedIds.size} ${selectedIds.size === 1 ? 'result' : 'results'}?`}
        message="The files are removed from disk and from Assets. This cannot be undone."
        confirmLabel="Delete"
        variant="danger"
        onConfirm={() => void handleBulkDelete()}
        onCancel={() => setConfirmBulkDelete(false)}
      />
    </div>
  );
}
