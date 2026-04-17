import { useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { cn } from '@/utils/cn';
import { Button } from '@/components/ui/Button';
import { useAppStore } from '@/store/appStore';
import type { AssetRecord } from '@/types/assets';
import { ImageWithFallback } from '@/components/ui/ImageWithFallback';
import { SkeletonCard } from '@/components/ui/Skeleton';
import {
  Search,
  Grid,
  List,
  Image as ImageIcon,
  Film,
  FolderPlus,
  Trash2,
  Download,
  Star,
  Check,
  X,
  ExternalLink,
  RefreshCw,
  Play,
} from 'lucide-react';
import { motion } from 'framer-motion';

type ViewMode = 'grid' | 'list';
type AssetType = 'all' | 'image' | 'video';

function formatAssetMeta(asset: AssetRecord) {
  if (asset.width && asset.height) {
    return `${asset.width}x${asset.height}`;
  }

  return asset.type === 'image' ? 'Image' : 'Video';
}

export function AssetsPanel() {
  const {
    assetLibrary,
    deleteAssetRecord,
    toggleAssetFavorite,
  } = useAppStore();
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [filter, setFilter] = useState<AssetType>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedAssets, setSelectedAssets] = useState<Set<string>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<AssetRecord | null>(null);

  const filteredAssets = useMemo(() => {
    return assetLibrary.filter((asset) => {
      if (filter !== 'all' && asset.type !== filter) {
        return false;
      }

      if (!searchQuery) {
        return true;
      }

      const query = searchQuery.toLowerCase();
      return (
        asset.name.toLowerCase().includes(query) ||
        asset.prompt.toLowerCase().includes(query) ||
        asset.model?.toLowerCase().includes(query)
      );
    });
  }, [assetLibrary, filter, searchQuery]);

  const selectedAssetRecords = filteredAssets.filter((asset) => selectedAssets.has(asset.id));

  const toggleSelection = (id: string) => {
    setSelectedAssets((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const selectAll = () => {
    if (selectedAssets.size === filteredAssets.length) {
      setSelectedAssets(new Set());
      return;
    }

    setSelectedAssets(new Set(filteredAssets.map((asset) => asset.id)));
  };

  const handlePreview = async (asset: AssetRecord) => {
    await window.electron.app.openPath(asset.path);
  };

  const handleExport = async (asset: AssetRecord) => {
    const destinationPath = await window.electron.dialog.saveFile({
      defaultPath: asset.path.split('/').pop() || asset.name,
      filters:
        asset.type === 'image'
          ? [
              { name: 'Image Files', extensions: ['png', 'jpg', 'jpeg', 'webp'] },
            ]
          : [
              { name: 'Video Files', extensions: ['mp4', 'webm', 'gif'] },
            ],
    });

    if (!destinationPath) {
      return;
    }

    await window.electron.assets.export(asset.path, destinationPath);
  };

  const handleExportMultiple = async () => {
    if (selectedAssetRecords.length === 0) {
      return;
    }

    const destinationDir = await window.electron.dialog.selectFolder();
    if (!destinationDir) {
      return;
    }

    await window.electron.assets.exportMany(
      selectedAssetRecords.map((asset) => asset.path),
      destinationDir
    );
  };

  const handleDelete = (asset: AssetRecord) => {
    setDeleteTarget(asset);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) {
      return;
    }

    const result = await window.electron.assets.delete(deleteTarget.path);
    if (!result.success) {
      setDeleteTarget(null);
      return;
    }

    deleteAssetRecord(deleteTarget.id);
    setSelectedAssets((current) => {
      const next = new Set(current);
      next.delete(deleteTarget.id);
      return next;
    });
    setDeleteTarget(null);
  };

  const completedCount = assetLibrary.length;

  const parentRef = useRef<HTMLDivElement>(null);
  const COLS = viewMode === 'grid' ? 2 : 1;
  const rowCount = Math.ceil(filteredAssets.length / COLS);

  const rowVirtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => (viewMode === 'grid' ? 180 : 64),
    overscan: 5,
  });

  return (
    <div className="h-full flex flex-col bg-surface">
      <div className="p-4 border-b border-border space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search assets..."
            className="w-full bg-elevated border border-border rounded-md pl-10 pr-4 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent-primary focus:ring-1 focus:ring-accent-primary/40 transition-all"
          />
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1 bg-elevated rounded-lg p-1">
            {(['all', 'image', 'video'] as AssetType[]).map((type) => (
              <button
                key={type}
                onClick={() => setFilter(type)}
                className={cn(
                  'px-3 py-1 rounded text-sm font-display font-medium transition-all capitalize',
                  filter === type
                    ? 'bg-surface text-text-primary'
                    : 'text-text-body hover:text-text-primary'
                )}
              >
                {type}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setViewMode('grid')}
              className={cn(
                'p-2 rounded-lg transition-all',
                viewMode === 'grid'
                  ? 'bg-elevated text-text-primary'
                  : 'text-text-body hover:text-text-primary'
              )}
            >
              <Grid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={cn(
                'p-2 rounded-lg transition-all',
                viewMode === 'list'
                  ? 'bg-elevated text-text-primary'
                  : 'text-text-body hover:text-text-primary'
              )}
            >
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>

        {selectedAssets.size > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-2 p-2 bg-accent-primary-muted border border-accent-primary-border rounded-md"
          >
            <span className="text-sm text-accent-primary font-display font-medium" aria-live="polite">
              {selectedAssets.size} selected
            </span>
            <div className="flex-1" />
            <Button variant="ghost" size="sm" icon={Download} onClick={handleExportMultiple}>
              Export
            </Button>
            <button
              onClick={() => setSelectedAssets(new Set())}
              className="p-2 rounded-md text-accent-primary hover:bg-accent-primary-muted"
            >
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}
      </div>

      <div ref={parentRef} className="flex-1 overflow-y-auto p-4">
        {filteredAssets.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-text-muted">
            <div className="w-16 h-16 rounded-2xl bg-elevated border border-border flex items-center justify-center mb-4">
              <FolderPlus className="w-8 h-8" />
            </div>
            <p className="text-sm font-display">No assets yet</p>
            <p className="text-xs text-text-muted mt-1">
              Generate some content to see it here
            </p>
          </div>
        ) : (
          <div style={{ height: `${rowVirtualizer.getTotalSize()}px`, position: 'relative' }}>
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const startIdx = virtualRow.index * COLS;
              const rowAssets = filteredAssets.slice(startIdx, startIdx + COLS);
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
                  className={cn(viewMode === 'grid' ? 'grid grid-cols-2 gap-3' : 'space-y-2')}
                >
                  {rowAssets.map((asset, colIdx) => (
                    <motion.div
                      key={asset.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: (startIdx + colIdx) * 0.03 }}
                      onClick={() => toggleSelection(asset.id)}
                      className={cn(
                        'group relative rounded-lg border cursor-pointer transition-all overflow-hidden',
                        viewMode === 'grid' ? 'aspect-square' : 'flex items-center gap-3 p-2',
                        selectedAssets.has(asset.id)
                          ? 'border-accent-primary-border bg-accent-primary-muted'
                          : 'border-border hover:border-border-hover bg-elevated'
                      )}
                    >
                      <div
                        className={cn(
                          'bg-surface flex items-center justify-center relative',
                          viewMode === 'grid' ? 'absolute inset-0' : 'w-12 h-12 rounded overflow-hidden'
                        )}
                      >
                        {asset.type === 'image' ? (
                          <ImageWithFallback
                            src={asset.thumbnail || asset.previewUrl}
                            alt={asset.name}
                            className="w-full h-full object-cover"
                            fallbackClassName="w-full h-full"
                            loading="lazy"
                          />
                        ) : (
                          <div className="relative">
                            <Film
                              className={cn(
                                'text-text-muted',
                                viewMode === 'grid' ? 'w-12 h-12' : 'w-6 h-6'
                              )}
                            />
                            {viewMode === 'grid' && (
                              <div className="absolute inset-0 flex items-center justify-center">
                                <Play className="w-6 h-6 text-text-primary fill-text-primary" />
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      <div
                        className={cn(
                          'flex-1 min-w-0',
                          viewMode === 'grid' &&
                            'absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-void/80 to-transparent'
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-display font-medium text-text-primary truncate">
                            {asset.name}
                          </span>
                          {asset.favorite && (
                            <Star className="w-3.5 h-3.5 text-[var(--color-status-warning)] fill-[var(--color-status-warning)]" />
                          )}
                        </div>
                        <div
                          className={cn(
                            'flex items-center gap-2 font-mono text-xs',
                            viewMode === 'grid' ? 'text-text-body' : 'text-text-muted'
                          )}
                        >
                          <span>{formatAssetMeta(asset)}</span>
                          <span className="h-3 w-px bg-border" aria-hidden="true" />
                          <span>{new Date(asset.createdAt).toLocaleDateString()}</span>
                        </div>
                      </div>

                      <div
                        className={cn(
                          'flex items-center gap-1',
                          viewMode === 'grid'
                            ? 'absolute top-2 right-2 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity'
                            : ''
                        )}
                      >
                        <button
                          aria-label="Toggle favorite"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleAssetFavorite(asset.id);
                          }}
                          className="p-2 rounded bg-surface/80 text-text-body hover:text-[var(--color-status-warning)] hover:bg-surface transition-all focus-visible:opacity-100"
                        >
                          <Star className={cn('w-3.5 h-3.5', asset.favorite && 'fill-[var(--color-status-warning)] text-[var(--color-status-warning)]')} />
                        </button>
                        <button
                          aria-label="Open in viewer"
                          onClick={(e) => {
                            e.stopPropagation();
                            handlePreview(asset);
                          }}
                          className="p-2 rounded bg-surface/80 text-text-body hover:text-text-primary hover:bg-surface transition-all focus-visible:opacity-100"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </button>
                        <button
                          aria-label="Export asset"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleExport(asset);
                          }}
                          className="p-2 rounded bg-surface/80 text-text-body hover:text-text-primary hover:bg-surface transition-all focus-visible:opacity-100"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </button>
                        <button
                          aria-label="Delete asset"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(asset);
                          }}
                          className="p-2 rounded bg-surface/80 text-text-body hover:text-status-error hover:bg-status-error-muted transition-all focus-visible:opacity-100"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {selectedAssets.has(asset.id) && (
                        <div className="absolute top-2 left-2 w-5 h-5 rounded-full bg-accent-primary flex items-center justify-center">
                          <Check className="w-3 h-3 text-void" />
                        </div>
                      )}
                    </motion.div>
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="px-4 py-3 border-t border-border bg-elevated">
        <div className="flex items-center justify-between text-xs text-text-muted">
          <div className="flex items-center gap-3">
            <span className="font-mono" aria-live="polite">{completedCount} items</span>
            {filteredAssets.length > 0 && (
              <button
                onClick={selectAll}
                className="text-accent-primary hover:underline font-display"
              >
                {selectedAssets.size === filteredAssets.length ? 'Deselect all' : 'Select all'}
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <RefreshCw className="w-3 h-3" />
            <span className="font-display">Persisted Library</span>
          </div>
        </div>
      </div>
      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete Asset"
        message={`Are you sure you want to delete "${deleteTarget?.name}"? This cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
