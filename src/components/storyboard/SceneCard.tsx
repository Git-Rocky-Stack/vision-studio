import { memo, useState } from 'react';
import { cn } from '@/utils/cn';
import {
  ImageOff,
  Trash2,
  Copy,
  CheckCircle2,
  Clock,
  AlertCircle,
  Loader2,
  GripVertical,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Scene, SceneStatus } from '@/types/project';

interface SceneCardProps {
  scene: Scene;
  isSelected: boolean;
  onClick: () => void;
  onDelete?: () => void;
  onDuplicate?: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
}

const STATUS_CONFIG: Record<
  SceneStatus,
  { label: string; icon: React.ElementType; className: string }
> = {
  draft: {
    label: 'draft',
    icon: Clock,
    className: 'bg-surface text-text-muted border border-border',
  },
  queued: {
    label: 'queued',
    icon: Clock,
    className: 'bg-status-warning-muted text-status-warning border border-status-warning-border',
  },
  generating: {
    label: 'generating',
    icon: Loader2,
    className: 'bg-red-aura text-red-primary border border-red-pressed animate-pulse',
  },
  complete: {
    label: 'complete',
    icon: CheckCircle2,
    className: 'bg-status-success-muted text-status-success border border-status-success-border',
  },
  error: {
    label: 'error',
    icon: AlertCircle,
    className: 'bg-red-aura text-red-primary border border-red-pressed',
  },
};

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export const SceneCard = memo(function SceneCard({
  scene,
  isSelected,
  onClick,
  onDelete,
  onDuplicate,
  onMoveUp,
  onMoveDown,
  canMoveUp = false,
  canMoveDown = false,
}: SceneCardProps) {
  const [isHovered, setIsHovered] = useState(false);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: scene.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const sceneNumber = String(scene.orderIndex + 1).padStart(2, '0');
  const status = STATUS_CONFIG[scene.status];
  const StatusIcon = status.icon;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick();
    }
  };

  return (
    <div ref={setNodeRef} style={style} className="relative">
      {/* Drag handle */}
      <button
        {...attributes}
        {...listeners}
        aria-label="Drag to reorder scene"
        className={cn(
          'absolute left-1 top-1/2 -translate-y-1/2 z-20 p-1 min-w-[44px] min-h-[44px] rounded-lg',
          'text-text-muted hover:text-text-primary hover:bg-elevated',
          'opacity-0 group-hover:opacity-100 focus:opacity-100 focus-visible:opacity-100',
          isDragging && 'opacity-100',
          'cursor-grab active:cursor-grabbing'
        )}
      >
        <GripVertical className="w-3.5 h-3.5" aria-hidden="true" />
      </button>

      <motion.article
        data-testid="scene-card"
        aria-label={`Scene ${sceneNumber}: ${scene.name}, ${scene.status}`}
        aria-selected={isSelected}
        onClick={onClick}
        onKeyDown={handleKeyDown}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onFocus={() => setIsHovered(true)}
        onBlur={() => setIsHovered(false)}
        tabIndex={0}
        role="button"
        layout
        initial={false}
        animate={{
          scale: isSelected ? 1.02 : 1,
          opacity: 1,
        }}
        transition={{ duration: 0.15 }}
        className={cn(
          'group flex gap-3 p-3 rounded-xl border cursor-pointer select-none',
          'transition-all duration-200 min-h-[88px]',
          'bg-elevated border-border hover:border-red-primary/40',
          isSelected && 'ring-2 ring-red-primary bg-red-aura/10 border-red-primary/60 shadow-red-glow'
        )}
      >
        {/* Thumbnail */}
        <div className="relative w-24 h-16 rounded-lg overflow-hidden flex-shrink-0 bg-void border border-border">
          {scene.thumbnail ? (
            <img
              src={scene.thumbnail}
              alt="Scene thumbnail"
              className="w-full h-full object-cover"
            />
          ) : (
            <div
              data-testid="scene-card-placeholder"
              className="w-full h-full flex items-center justify-center"
            >
              <ImageOff className="w-5 h-5 text-text-muted" aria-hidden="true" />
            </div>
          )}

          {/* Scene number badge */}
          <span className="absolute top-1 left-1 px-1.5 py-0.5 rounded bg-void/80 type-ui font-bold text-text-primary">
            {sceneNumber}
          </span>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0 flex flex-col justify-between py-0.5">
          <div className="flex items-start justify-between gap-2">
            <h3 className="type-section truncate leading-tight">
              {scene.name}
            </h3>
          </div>

          <div className="flex items-center justify-between gap-2 mt-1">
            {/* Status badge */}
            <span
              className={cn(
                'inline-flex items-center gap-1 px-2 py-0.5 rounded-full type-ui',
                status.className
              )}
            >
              <StatusIcon
                className={cn(
                  'w-3 h-3',
                  scene.status === 'generating' && 'animate-spin'
                )}
                aria-hidden="true"
              />
              {status.label}
            </span>

            {/* Duration */}
            <span className="type-caption">
              {formatDuration(scene.metadata.duration)}
            </span>
          </div>
        </div>
      </motion.article>

      {/* Action buttons - duplicate + delete */}
      <div className={cn(
        'absolute top-2 right-2 z-10 flex items-center gap-1',
        'transition-opacity duration-150',
        'opacity-0 pointer-events-none focus-within:opacity-100 focus-within:pointer-events-auto',
        (isHovered || isSelected) && 'opacity-100 pointer-events-auto'
      )}>
        {onMoveUp && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onMoveUp();
            }}
            disabled={!canMoveUp}
            aria-label="Move scene up"
            className={cn(
              'p-1.5 min-w-[44px] min-h-[44px] rounded-lg transition-all duration-150',
              'bg-elevated/90 backdrop-blur-sm border border-border',
              canMoveUp
                ? 'text-text-muted hover:text-text-primary hover:bg-surface'
                : 'text-text-muted/30 cursor-not-allowed',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-red-primary'
            )}
          >
            <ArrowUp className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        )}
        {onMoveDown && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onMoveDown();
            }}
            disabled={!canMoveDown}
            aria-label="Move scene down"
            className={cn(
              'p-1.5 min-w-[44px] min-h-[44px] rounded-lg transition-all duration-150',
              'bg-elevated/90 backdrop-blur-sm border border-border',
              canMoveDown
                ? 'text-text-muted hover:text-text-primary hover:bg-surface'
                : 'text-text-muted/30 cursor-not-allowed',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-red-primary'
            )}
          >
            <ArrowDown className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        )}
        {onDuplicate && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDuplicate();
            }}
            aria-label="Duplicate scene"
            className={cn(
              'p-1.5 min-w-[44px] min-h-[44px] rounded-lg transition-all duration-150',
              'bg-elevated/90 backdrop-blur-sm text-text-muted hover:text-text-primary hover:bg-surface',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-red-primary',
              'border border-border'
            )}
          >
            <Copy className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        )}
        {onDelete && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            aria-label="Delete scene"
            className={cn(
              'p-1.5 min-w-[44px] min-h-[44px] rounded-lg transition-all duration-150',
              'bg-elevated/90 backdrop-blur-sm text-text-muted hover:text-red-primary hover:bg-red-aura',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-red-primary',
              'border border-border'
            )}
          >
            <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  );
});
