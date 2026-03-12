import { useState } from 'react';
import { cn } from '@/utils/cn';
import { Heart, Download, Pencil, AlertTriangle, Clock, Hash } from 'lucide-react';
import { motion } from 'framer-motion';
import type { BatchResult } from '@/types/generation';
import { ImageWithFallback } from '@/components/ui/ImageWithFallback';

interface ResultCardProps {
  result: BatchResult;
  isSelected: boolean;
  onSelect: (id: string, e: React.MouseEvent) => void;
  onPreview: (id: string) => void;
  onToggleFavorite: (id: string) => void;
  onDownload: (id: string) => void;
  onSendToEdit: (id: string) => void;
  viewMode: 'grid' | 'list' | 'large';
}

export function ResultCard({
  result,
  isSelected,
  onSelect,
  onPreview,
  onToggleFavorite,
  onDownload,
  onSendToEdit,
  viewMode,
}: ResultCardProps) {
  const [isHovered, setIsHovered] = useState(false);
  const isFailed = !result.imagePath;

  if (viewMode === 'list') {
    return (
      <motion.div
        layout
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        onClick={(e) => onSelect(result.id, e)}
        onDoubleClick={() => onPreview(result.id)}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className={cn(
          'flex items-center gap-4 p-3 rounded-lg border transition-all cursor-pointer',
          isSelected
            ? 'border-red-primary ring-2 ring-red-glow bg-red-aura'
            : 'border-border bg-elevated/50 hover:border-border-hover hover:bg-elevated'
        )}
      >
        {/* Thumbnail */}
        <div className="w-16 h-16 rounded-lg overflow-hidden flex-shrink-0 bg-surface">
          {isFailed ? (
            <div className="w-full h-full flex items-center justify-center bg-red-primary/10">
              <AlertTriangle className="w-5 h-5 text-red-primary" />
            </div>
          ) : (
            <ImageWithFallback
              src={result.imagePath}
              alt={result.prompt}
              className="w-full h-full object-cover"
              fallbackClassName="w-16 h-16"
              loading="lazy"
            />
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <p className="text-sm text-text-primary font-display line-clamp-1">
            {result.prompt}
          </p>
          <div className="flex items-center gap-3 mt-1">
            <span className="flex items-center gap-1 text-micro text-text-muted font-mono">
              <Hash className="w-3 h-3" />
              {result.seed}
            </span>
            <span className="flex items-center gap-1 text-micro text-text-muted font-mono">
              <Clock className="w-3 h-3" />
              {result.generationTime.toFixed(1)}s
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={(e) => { e.stopPropagation(); onToggleFavorite(result.id); }}
            aria-label={result.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
            className={cn(
              'p-1.5 rounded-lg transition-all',
              result.isFavorite
                ? 'text-red-primary bg-red-aura'
                : 'text-text-muted hover:text-text-primary hover:bg-surface'
            )}
          >
            <Heart className={cn('w-3.5 h-3.5', result.isFavorite && 'fill-current')} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDownload(result.id); }}
            aria-label="Download image"
            className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface transition-all"
          >
            <Download className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onSendToEdit(result.id); }}
            aria-label="Send to edit"
            className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface transition-all"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
        </div>
      </motion.div>
    );
  }

  // Grid and Large view
  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      onClick={(e) => onSelect(result.id, e)}
      onDoubleClick={() => onPreview(result.id)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={cn(
        'rounded-lg border overflow-hidden transition-all cursor-pointer group',
        isSelected
          ? 'border-red-primary ring-2 ring-red-glow'
          : 'border-border hover:border-border-hover',
        isHovered && !isSelected && 'shadow-cinematic scale-[1.02]'
      )}
    >
      {/* Image */}
      <div className={cn(
        'relative bg-surface overflow-hidden',
        viewMode === 'large' ? 'aspect-square' : 'aspect-[4/3]'
      )}>
        {isFailed ? (
          <div className="w-full h-full flex flex-col items-center justify-center bg-red-primary/5">
            <AlertTriangle className="w-8 h-8 text-red-primary mb-2" />
            <span className="text-xs text-red-primary font-display">Failed</span>
          </div>
        ) : (
          <ImageWithFallback
            src={result.imagePath}
            alt={result.prompt}
            className="w-full h-full object-cover"
            fallbackClassName="w-full h-full"
            loading="lazy"
          />
        )}

        {/* Selected overlay */}
        {isSelected && (
          <div className="absolute top-2 left-2">
            <div className="w-5 h-5 rounded-full bg-red-primary flex items-center justify-center">
              <svg
                className="w-3 h-3 text-text-primary"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={3}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
          </div>
        )}

        {/* Favorite badge */}
        {result.isFavorite && (
          <div className="absolute top-2 right-2">
            <Heart className="w-4 h-4 text-red-primary fill-current drop-shadow-lg" />
          </div>
        )}

        {/* Hover overlay */}
        {!isFailed && (
          <div
            className={cn(
              'absolute inset-0 bg-gradient-to-t from-void/80 via-void/20 to-transparent flex flex-col justify-end p-3 transition-opacity duration-150',
              isHovered ? 'opacity-100' : 'opacity-0 focus-within:opacity-100'
            )}
          >
            <p className="text-xs text-text-primary font-display line-clamp-3 mb-2">
              {result.prompt}
            </p>
            <div className="flex items-center gap-1">
              <button
                onClick={(e) => { e.stopPropagation(); onToggleFavorite(result.id); }}
                aria-label={result.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                className={cn(
                  'p-1.5 rounded-lg backdrop-blur-sm transition-all focus-visible:opacity-100',
                  result.isFavorite
                    ? 'bg-red-primary/30 text-red-primary'
                    : 'bg-void/40 text-text-primary hover:bg-void/60'
                )}
              >
                <Heart className={cn('w-3.5 h-3.5', result.isFavorite && 'fill-current')} />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onDownload(result.id); }}
                aria-label="Download image"
                className="p-1.5 rounded-lg bg-void/40 text-text-primary hover:bg-void/60 backdrop-blur-sm transition-all focus-visible:opacity-100"
              >
                <Download className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onSendToEdit(result.id); }}
                aria-label="Send to edit"
                className="p-1.5 rounded-lg bg-void/40 text-text-primary hover:bg-void/60 backdrop-blur-sm transition-all focus-visible:opacity-100"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Card footer */}
      <div className="px-2.5 py-2 bg-elevated">
        <p className="text-xs text-text-primary font-display line-clamp-2 leading-relaxed">
          {result.prompt}
        </p>
        <div className="flex items-center gap-3 mt-1.5">
          <span className="text-micro text-text-muted font-mono">
            seed:{result.seed}
          </span>
          <span className="text-micro text-text-muted font-mono">
            {result.generationTime.toFixed(1)}s
          </span>
        </div>
      </div>
    </motion.div>
  );
}
