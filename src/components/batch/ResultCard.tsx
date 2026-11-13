import { memo, useState } from 'react';
import { cn } from '@/utils/cn';
import { Heart, Download, Pencil, AlertTriangle, Clock, Hash, Check, Maximize2 } from 'lucide-react';
import { motion } from 'framer-motion';
import type { BatchResult } from '@/types/generation';
import { ImageWithFallback } from '@/components/ui/ImageWithFallback';

type SelectEvent = React.MouseEvent | React.KeyboardEvent | React.PointerEvent;

interface ResultCardProps {
  result: BatchResult;
  isSelected: boolean;
  /** Pointer selection on the card body: plain = single, Ctrl/Cmd = toggle, Shift = range. */
  onSelect: (id: string, e: SelectEvent) => void;
  /** The explicit select control: toggles this result (Shift extends a range). */
  onToggleSelect: (id: string, e: SelectEvent) => void;
  onPreview: (id: string) => void;
  onToggleFavorite: (id: string) => void;
  onDownload: (id: string) => void;
  onSendToEdit: (id: string) => void;
  viewMode: 'grid' | 'list' | 'large';
  /** The grid's roving tab stop: exactly one card holds tabIndex 0. */
  isTabStop?: boolean;
  /** The card (or a control inside it) received focus. */
  onFocusCard?: (id: string) => void;
  /** Arrow/Home/End on the card body; returns true when it moved focus. */
  onNavigateKey?: (id: string, e: React.KeyboardEvent) => boolean;
  /** id of the visually hidden keyboard instructions shared by every card. */
  describedBy?: string;
}

/** Buttons inside the card must not also run the card body's pointer selection. */
const stopPointer = (e: React.PointerEvent) => e.stopPropagation();

/**
 * One generated result. The card is a plain article (aria-selected is not
 * valid on it); selection is exposed through a real toggle button with
 * aria-pressed. The card body is also a roving-tabindex keyboard target:
 * Enter opens the preview, Space selects (Ctrl/Cmd+Space toggles, Shift+Space
 * extends a range) and the arrow keys move between cards.
 */
export const ResultCard = memo(function ResultCard({
  result,
  isSelected,
  onSelect,
  onToggleSelect,
  onPreview,
  onToggleFavorite,
  onDownload,
  onSendToEdit,
  viewMode,
  isTabStop = false,
  onFocusCard,
  onNavigateKey,
  describedBy,
}: ResultCardProps) {
  const [isHovered, setIsHovered] = useState(false);
  const isFailed = !result.imagePath;
  const selectLabel = `${isSelected ? 'Deselect' : 'Select'} result: ${result.prompt}`;

  // Keys on the card body only; a focused inner button keeps its own keys.
  const handleCardKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === 'Enter') {
      if (isFailed) return;
      e.preventDefault();
      onPreview(result.id);
      return;
    }
    if (e.key === ' ' || e.key === 'Spacebar') {
      e.preventDefault();
      onSelect(result.id, e);
      return;
    }
    if (onNavigateKey?.(result.id, e)) e.preventDefault();
  };

  const cardKeyboardProps = {
    tabIndex: isTabStop ? 0 : -1,
    'data-nav-id': result.id,
    onFocus: () => onFocusCard?.(result.id),
    onKeyDown: handleCardKeyDown,
    'aria-describedby': describedBy,
    'aria-label': `${result.prompt}${isSelected ? ', selected' : ''}${isFailed ? ', failed' : ''}`,
  } as const;

  const selectToggle = (
    <button
      type="button"
      aria-pressed={isSelected}
      aria-label={selectLabel}
      title={isSelected ? 'Deselect (Shift extends a range)' : 'Select (Shift extends a range)'}
      onPointerDown={stopPointer}
      onClick={(e) => {
        e.stopPropagation();
        onToggleSelect(result.id, e);
      }}
      className={cn(
        'flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md transition-opacity',
        viewMode !== 'list' && !isSelected && 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100',
      )}
    >
      <span
        className={cn(
          'flex h-5 w-5 items-center justify-center rounded-full border',
          isSelected
            ? 'border-accent-primary bg-accent-primary text-void'
            : 'border-border-hover bg-void/60 text-transparent',
        )}
        aria-hidden="true"
      >
        <Check className="h-3 w-3" strokeWidth={3} />
      </span>
    </button>
  );

  if (viewMode === 'list') {
    return (
      <motion.div
        layout
        data-testid={`result-card-${result.id}`}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        onPointerDown={(e) => { onSelect(result.id, e); }}
        onDoubleClick={() => onPreview(result.id)}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        role="article"
        {...cardKeyboardProps}
        className={cn(
          'group flex items-center gap-4 p-3 rounded-sm border transition cursor-pointer',
          isSelected
            ? 'border-accent-primary-border ring-2 ring-accent-primary-border bg-accent-primary-muted'
            : 'border-border bg-elevated/50 hover:border-border-hover hover:bg-elevated'
        )}
      >
        {selectToggle}

        {/* Thumbnail */}
        <div className="w-16 h-16 rounded-sm overflow-hidden flex-shrink-0 bg-surface">
          {isFailed ? (
            <div className="w-full h-full flex items-center justify-center bg-status-error-muted">
              <AlertTriangle className="w-5 h-5 text-status-error" aria-hidden="true" />
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
          <p className="text-sm text-text-primary line-clamp-1">
            {result.prompt}
          </p>
          <div className="flex items-center gap-3 mt-1">
            <span className="flex items-center gap-1 type-badge text-text-muted">
              <Hash className="w-3 h-3" aria-hidden="true" />
              {result.seed}
            </span>
            <span className="flex items-center gap-1 type-badge text-text-muted">
              <Clock className="w-3 h-3" aria-hidden="true" />
              {result.generationTime.toFixed(1)}s
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {!isFailed && (
            <button
              type="button"
              onPointerDown={stopPointer}
              onClick={(e) => { e.stopPropagation(); onPreview(result.id); }}
              aria-label="Open preview"
              className="p-2 rounded-md text-text-muted hover:text-text-primary hover:bg-surface transition"
            >
              <Maximize2 className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          )}
          <button
            type="button"
            onPointerDown={stopPointer}
            onClick={(e) => { e.stopPropagation(); onToggleFavorite(result.id); }}
            aria-label={result.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
            className={cn(
              'p-2 rounded-md transition',
              result.isFavorite
                ? 'text-status-warning bg-status-warning-muted'
                : 'text-text-muted hover:text-text-primary hover:bg-surface'
            )}
          >
            <Heart className={cn('w-3.5 h-3.5', result.isFavorite && 'fill-current')} aria-hidden="true" />
          </button>
          <button
            type="button"
            onPointerDown={stopPointer}
            onClick={(e) => { e.stopPropagation(); onDownload(result.id); }}
            aria-label="Download image"
            className="p-2 rounded-md text-text-muted hover:text-text-primary hover:bg-surface transition"
          >
            <Download className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onPointerDown={stopPointer}
            onClick={(e) => { e.stopPropagation(); onSendToEdit(result.id); }}
            aria-label="Send to edit"
            className="p-2 rounded-md text-text-muted hover:text-text-primary hover:bg-surface transition"
          >
            <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>
      </motion.div>
    );
  }

  // Grid and Large view
  return (
    <motion.div
      layout
      data-testid={`result-card-${result.id}`}
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      onPointerDown={(e) => { onSelect(result.id, e); }}
      onDoubleClick={() => onPreview(result.id)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      role="article"
      {...cardKeyboardProps}
      className={cn(
        'rounded-sm border overflow-hidden transition cursor-pointer group',
        isSelected
          ? 'border-accent-primary-border ring-2 ring-accent-primary-border'
          : 'border-border hover:border-border-hover',
        isHovered && !isSelected && 'shadow-overlay scale-[1.02]'
      )}
    >
      {/* Image */}
      <div className={cn(
        'relative bg-surface overflow-hidden',
        viewMode === 'large' ? 'aspect-square' : 'aspect-[4/3]'
      )}>
        {isFailed ? (
          <div className="w-full h-full flex flex-col items-center justify-center bg-status-error-muted">
            <AlertTriangle className="w-8 h-8 text-status-error mb-2" aria-hidden="true" />
            <span className="text-xs text-status-error">Failed</span>
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

        {/* Selection control: shown when selected, on hover, and on focus. */}
        <div className="absolute top-1 left-1 z-10">{selectToggle}</div>

        {/* Favorite badge */}
        {result.isFavorite && (
          <div className="absolute top-2 right-2">
            <Heart className="w-4 h-4 text-status-warning fill-current drop-shadow-lg" aria-hidden="true" />
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
            <p className="text-xs text-text-primary line-clamp-3 mb-2">
              {result.prompt}
            </p>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onPointerDown={stopPointer}
                onClick={(e) => { e.stopPropagation(); onPreview(result.id); }}
                aria-label="Open preview"
                className="p-2 rounded-md bg-void/40 text-text-primary hover:bg-void/60 backdrop-blur-sm transition focus-visible:opacity-100"
              >
                <Maximize2 className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
              <button
                type="button"
                onPointerDown={stopPointer}
                onClick={(e) => { e.stopPropagation(); onToggleFavorite(result.id); }}
                aria-label={result.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                className={cn(
                  'p-2 rounded-md backdrop-blur-sm transition focus-visible:opacity-100',
                  result.isFavorite
                    ? 'bg-status-warning-muted text-status-warning'
                    : 'bg-void/40 text-text-primary hover:bg-void/60'
                )}
              >
                <Heart className={cn('w-3.5 h-3.5', result.isFavorite && 'fill-current')} aria-hidden="true" />
              </button>
              <button
                type="button"
                onPointerDown={stopPointer}
                onClick={(e) => { e.stopPropagation(); onDownload(result.id); }}
                aria-label="Download image"
                className="p-2 rounded-md bg-void/40 text-text-primary hover:bg-void/60 backdrop-blur-sm transition focus-visible:opacity-100"
              >
                <Download className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
              <button
                type="button"
                onPointerDown={stopPointer}
                onClick={(e) => { e.stopPropagation(); onSendToEdit(result.id); }}
                aria-label="Send to edit"
                className="p-2 rounded-md bg-void/40 text-text-primary hover:bg-void/60 backdrop-blur-sm transition focus-visible:opacity-100"
              >
                <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Card footer */}
      <div className="px-2.5 py-2 bg-elevated">
        <p className="text-xs text-text-primary line-clamp-2 leading-relaxed">
          {result.prompt}
        </p>
        <div className="flex items-center gap-3 mt-1.5">
          <span className="type-badge text-text-muted">
            seed:{result.seed}
          </span>
          <span className="type-badge text-text-muted">
            {result.generationTime.toFixed(1)}s
          </span>
        </div>
      </div>
    </motion.div>
  );
});
