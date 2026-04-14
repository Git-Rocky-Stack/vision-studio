import { memo, useState } from 'react';
import { cn } from '@/utils/cn';
import { ImageOff, Trash2, CheckCircle2, Clock, AlertCircle, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';
import type { Scene, SceneStatus } from '@/types/project';

interface SceneCardProps {
  scene: Scene;
  isSelected: boolean;
  onClick: () => void;
  onDelete?: () => void;
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
}: SceneCardProps) {
  const [isHovered, setIsHovered] = useState(false);

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
    <div className="relative">
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
            // eslint-disable-next-line @next/next/no-img-element
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
          <span className="absolute top-1 left-1 px-1.5 py-0.5 rounded bg-void/80 text-micro font-display font-bold text-text-primary">
            {sceneNumber}
          </span>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0 flex flex-col justify-between py-0.5">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-display font-semibold text-sm text-text-primary truncate leading-tight">
              {scene.name}
            </h3>
          </div>

          <div className="flex items-center justify-between gap-2 mt-1">
            {/* Status badge */}
            <span
              className={cn(
                'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-micro font-display font-medium',
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
            <span className="text-micro text-text-muted font-display">
              {formatDuration(scene.metadata.duration)}
            </span>
          </div>
        </div>
      </motion.article>

      {/* Delete button — always rendered, visibility toggled via CSS to avoid DOM timing issues */}
      {onDelete && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          aria-label="Delete scene"
          className={cn(
            'absolute top-2 right-2 z-10 p-1.5 rounded-lg transition-all duration-150',
            'bg-elevated/90 backdrop-blur-sm text-text-muted hover:text-red-primary hover:bg-red-aura',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-red-primary',
            'border border-border',
            'opacity-0 pointer-events-none',
            (isHovered || isSelected) && 'opacity-100 pointer-events-auto'
          )}
        >
          <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
        </button>
      )}
    </div>
  );
});
