import { useState, useEffect } from 'react';
import { cn } from '@/utils/cn';
import { Button } from '@/components/ui/Button';
import { useAppStore } from '@/store/appStore';
import { 
  Search, 
  Filter, 
  Grid, 
  List, 
  Image as ImageIcon, 
  Film,
  MoreVertical,
  FolderPlus,
  Trash2,
  Download,
  Clock,
  Star,
  Check,
  X,
  ExternalLink,
  Share2,
  Copy,
  FileVideo,
  RefreshCw,
  Play
} from 'lucide-react';
import { motion } from 'framer-motion';

type ViewMode = 'grid' | 'list';
type AssetType = 'all' | 'image' | 'video';

interface Asset {
  id: string;
  name: string;
  type: 'image' | 'video';
  thumbnail: string;
  createdAt: Date;
  size: string;
  duration?: string;
  favorite: boolean;
  path?: string;
  jobId?: string;
}

export function AssetsPanel() {
  const { activeJobs, completedJobs } = useAppStore();
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [filter, setFilter] = useState<AssetType>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedAssets, setSelectedAssets] = useState<Set<string>>(new Set());
  const [assets, setAssets] = useState<Asset[]>([]);

  // Convert jobs to assets
  useEffect(() => {
    const jobAssets: Asset[] = [];
    
    [...completedJobs, ...activeJobs].forEach(job => {
      if (job.result) {
        const isVideo = job.type === 'video';
        const asset: Asset = {
          id: job.id,
          name: `${job.type === 'image' ? 'Image' : 'Video'} ${job.id.slice(0, 8)}`,
          type: job.type,
          thumbnail: job.result.images?.[0] || '',
          createdAt: job.createdAt,
          size: 'Unknown',
          duration: isVideo ? `${job.result.duration}s` : undefined,
          favorite: false,
          path: job.result.images?.[0] || job.result.video,
          jobId: job.id
        };
        jobAssets.push(asset);
      }
    });
    
    setAssets(jobAssets);
  }, [activeJobs, completedJobs]);

  const filteredAssets = assets.filter(asset => {
    if (filter !== 'all' && asset.type !== filter) return false;
    if (searchQuery && !asset.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const toggleSelection = (id: string) => {
    const newSelection = new Set(selectedAssets);
    if (newSelection.has(id)) {
      newSelection.delete(id);
    } else {
      newSelection.add(id);
    }
    setSelectedAssets(newSelection);
  };

  const selectAll = () => {
    if (selectedAssets.size === filteredAssets.length) {
      setSelectedAssets(new Set());
    } else {
      setSelectedAssets(new Set(filteredAssets.map(a => a.id)));
    }
  };

  const handleExport = async (asset: Asset, format?: string) => {
    if (!asset.path) return;
    
    const result = await window.electron.dialog.saveFile({
      defaultPath: `${asset.name}.${asset.type === 'image' ? 'png' : 'mp4'}`,
      filters: asset.type === 'image' 
        ? [
            { name: 'PNG', extensions: ['png'] },
            { name: 'JPEG', extensions: ['jpg', 'jpeg'] },
            { name: 'WebP', extensions: ['webp'] }
          ]
        : [
            { name: 'MP4', extensions: ['mp4'] },
            { name: 'WebM', extensions: ['webm'] },
            { name: 'GIF', extensions: ['gif'] }
          ]
    });

    if (result) {
      // TODO: Copy file to destination
      console.log('Export to:', result);
    }
  };

  const handleExportMultiple = async () => {
    const selected = assets.filter(a => selectedAssets.has(a.id));
    const folder = await window.electron.dialog.selectFolder();
    
    if (folder) {
      // TODO: Export all selected assets to folder
      console.log('Export to folder:', folder, selected);
    }
  };

  const handleDelete = async (asset: Asset) => {
    // TODO: Delete asset
    console.log('Delete:', asset);
  };

  const handlePreview = (asset: Asset) => {
    // TODO: Open preview modal
    console.log('Preview:', asset);
  };

  const completedCount = assets.filter(a => a.type === 'image' ? a.path?.endsWith('.png') : a.path?.endsWith('.mp4')).length;

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-border space-y-4">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-silver" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search assets..."
            className="w-full bg-charcoal border border-border rounded-lg pl-10 pr-4 py-2 text-sm text-white placeholder:text-silver/50 focus:border-red focus:ring-1 focus:ring-red"
          />
        </div>

        {/* Filters & View Toggle */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1 bg-charcoal-lighter rounded-lg p-1">
            {(['all', 'image', 'video'] as AssetType[]).map((type) => (
              <button
                key={type}
                onClick={() => setFilter(type)}
                className={cn(
                  'px-3 py-1 rounded text-sm font-medium transition-all capitalize',
                  filter === type
                    ? 'bg-charcoal text-white'
                    : 'text-silver hover:text-white'
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
                  ? 'bg-charcoal-lighter text-white'
                  : 'text-silver hover:text-white'
              )}
            >
              <Grid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={cn(
                'p-2 rounded-lg transition-all',
                viewMode === 'list'
                  ? 'bg-charcoal-lighter text-white'
                  : 'text-silver hover:text-white'
              )}
            >
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Selection Actions */}
        {selectedAssets.size > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-2 p-2 bg-red/10 border border-red/30 rounded-lg"
          >
            <span className="text-sm text-red font-medium">
              {selectedAssets.size} selected
            </span>
            <div className="flex-1" />
            <Button variant="ghost" size="sm" icon={Download} onClick={handleExportMultiple}>
              Export
            </Button>
            <button 
              onClick={() => setSelectedAssets(new Set())}
              className="p-1.5 rounded text-red hover:bg-red/20"
            >
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}
      </div>

      {/* Assets Grid/List */}
      <div className="flex-1 overflow-y-auto p-4">
        {filteredAssets.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-silver">
            <div className="w-16 h-16 rounded-2xl bg-charcoal-lighter border border-border flex items-center justify-center mb-4">
              <FolderPlus className="w-8 h-8" />
            </div>
            <p className="text-sm">No assets yet</p>
            <p className="text-xs text-silver/60 mt-1">
              Generate some content to see it here
            </p>
          </div>
        ) : (
          <div className={cn(
            viewMode === 'grid' 
              ? 'grid grid-cols-2 gap-3' 
              : 'space-y-2'
          )}>
            {filteredAssets.map((asset, index) => (
              <motion.div
                key={asset.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                onClick={() => toggleSelection(asset.id)}
                className={cn(
                  'group relative rounded-lg border cursor-pointer transition-all overflow-hidden',
                  viewMode === 'grid' ? 'aspect-square' : 'flex items-center gap-3 p-2',
                  selectedAssets.has(asset.id)
                    ? 'border-red bg-red/5'
                    : 'border-border hover:border-border-hover bg-charcoal-lighter'
                )}
              >
                {/* Thumbnail */}
                <div className={cn(
                  'bg-charcoal flex items-center justify-center relative',
                  viewMode === 'grid' ? 'absolute inset-0' : 'w-12 h-12 rounded'
                )}>
                  {asset.type === 'image' ? (
                    asset.thumbnail ? (
                      <img 
                        src={asset.thumbnail} 
                        alt={asset.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <ImageIcon className={cn(
                        'text-silver',
                        viewMode === 'grid' ? 'w-12 h-12' : 'w-6 h-6'
                      )} />
                    )
                  ) : (
                    <div className="relative">
                      <Film className={cn(
                        'text-silver',
                        viewMode === 'grid' ? 'w-12 h-12' : 'w-6 h-6'
                      )} />
                      {viewMode === 'grid' && (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <Play className="w-6 h-6 text-white fill-white" />
                        </div>
                      )}
                    </div>
                  )}
                  
                  {/* Duration Badge */}
                  {asset.duration && viewMode === 'grid' && (
                    <div className="absolute bottom-2 right-2 px-1.5 py-0.5 bg-black/70 rounded text-[10px] text-white">
                      {asset.duration}
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className={cn(
                  'flex-1 min-w-0',
                  viewMode === 'grid' && 'absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/80 to-transparent'
                )}>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-white truncate">
                      {asset.name}
                    </span>
                    {asset.favorite && (
                      <Star className="w-3.5 h-3.5 text-yellow-500 fill-yellow-500" />
                    )}
                  </div>
                  <div className={cn(
                    'flex items-center gap-2 text-xs',
                    viewMode === 'grid' ? 'text-silver' : 'text-silver/60'
                  )}>
                    <span>{asset.size}</span>
                    {asset.duration && viewMode === 'list' && (
                      <>
                        <span>•</span>
                        <span>{asset.duration}</span>
                      </>
                    )}
                    <span>•</span>
                    <span>{new Date(asset.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>

                {/* Actions */}
                <div className={cn(
                  'flex items-center gap-1',
                  viewMode === 'grid' 
                    ? 'absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity' 
                    : ''
                )}>
                  <button 
                    onClick={(e) => { e.stopPropagation(); handlePreview(asset); }}
                    className="p-1.5 rounded bg-charcoal/80 text-silver hover:text-white hover:bg-charcoal transition-all"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </button>
                  <button 
                    onClick={(e) => { e.stopPropagation(); handleExport(asset); }}
                    className="p-1.5 rounded bg-charcoal/80 text-silver hover:text-white hover:bg-charcoal transition-all"
                  >
                    <Download className="w-3.5 h-3.5" />
                  </button>
                  <button 
                    onClick={(e) => { e.stopPropagation(); handleDelete(asset); }}
                    className="p-1.5 rounded bg-charcoal/80 text-silver hover:text-red hover:bg-charcoal transition-all"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Selection Indicator */}
                {selectedAssets.has(asset.id) && (
                  <div className="absolute top-2 left-2 w-5 h-5 rounded-full bg-red flex items-center justify-center">
                    <Check className="w-3 h-3 text-white" />
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Footer Stats */}
      <div className="px-4 py-3 border-t border-border bg-charcoal-light">
        <div className="flex items-center justify-between text-xs text-silver">
          <div className="flex items-center gap-3">
            <span>{filteredAssets.length} items</span>
            {selectedAssets.size > 0 && (
              <button 
                onClick={selectAll}
                className="text-red hover:underline"
              >
                {selectedAssets.size === filteredAssets.length ? 'Deselect all' : 'Select all'}
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <RefreshCw className="w-3 h-3" />
            <span>Auto-refresh</span>
          </div>
        </div>
      </div>
    </div>
  );
}
