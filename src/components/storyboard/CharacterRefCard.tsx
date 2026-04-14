import { memo, useState } from 'react';
import { cn } from '@/utils/cn';
import { User, Trash2, GripVertical, Lock, Unlock } from 'lucide-react';
import { motion } from 'framer-motion';
import type { CharacterRef, LockedFeature } from '@/types/project';

interface CharacterRefCardProps {
  character: CharacterRef;
  isSelected: boolean;
  sceneCount: number; // number of scenes referencing this character
  onClick: () => void;
  onDelete?: () => void;
  onToggleFeature?: (feature: LockedFeature) => void;
}

const FEATURE_LABELS: Record<LockedFeature, string> = {
  face: 'Face',
  body: 'Body',
  style: 'Style',
  pose: 'Pose',
};

export const CharacterRefCard = memo(function CharacterRefCard({
  character,
  isSelected,
  sceneCount,
  onClick,
  onDelete,
  onToggleFeature,
}: CharacterRefCardProps) {
  const [isHovered, setIsHovered] = useState(false);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick();
    }
  };

  return (
    <motion.article
      data-testid="character-ref-card"
      aria-label={`${character.name}, ${sceneCount} scene${sceneCount !== 1 ? 's' : ''}`}
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
      animate={{ scale: isSelected ? 1.01 : 1 }}
      transition={{ duration: 0.15 }}
      className={cn(
        'group flex items-center gap-3 p-2.5 rounded-lg border cursor-pointer select-none',
        'transition-all duration-200',
        'bg-elevated border-border hover:border-red-primary/40',
        isSelected && 'ring-2 ring-red-primary bg-red-aura/10 border-red-primary/60'
      )}
    >
      {/* Color indicator */}
      <div
        className="w-1 h-10 rounded-full flex-shrink-0"
        style={{ backgroundColor: character.color }}
        aria-hidden="true"
      />

      {/* Avatar — face image or placeholder */}
      <div className="relative w-10 h-10 rounded-full overflow-hidden flex-shrink-0 bg-void border border-border">
        {character.faceImages.length > 0 ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={character.faceImages[0]}
            alt={character.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <User className="w-4 h-4 text-text-muted" aria-hidden="true" />
          </div>
        )}

        {/* Multi-image badge */}
        {character.faceImages.length > 1 && (
          <span className="absolute -bottom-0.5 -right-0.5 px-1 rounded-full bg-red-primary text-micro text-text-primary font-display font-bold leading-none">
            {character.faceImages.length}
          </span>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-1">
          <h4 className="font-display font-semibold text-xs text-text-primary truncate leading-tight">
            {character.name}
          </h4>

          {/* Delete button */}
          {onDelete && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              aria-label={`Delete ${character.name}`}
              className={cn(
                'p-1 rounded-md transition-all duration-150',
                'text-text-muted hover:text-red-primary hover:bg-red-aura',
                'opacity-0 pointer-events-none',
                (isHovered || isSelected) && 'opacity-100 pointer-events-auto'
              )}
            >
              <Trash2 className="w-3 h-3" aria-hidden="true" />
            </button>
          )}
        </div>

        {/* Feature locks */}
        <div className="flex items-center gap-1 mt-1">
          {(Object.keys(FEATURE_LABELS) as LockedFeature[]).map((feature) => {
            const isLocked = character.lockedFeatures.includes(feature);
            return (
              <button
                key={feature}
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleFeature?.(feature);
                }}
                aria-label={`${FEATURE_LABELS[feature]} ${isLocked ? 'locked' : 'unlocked'}`}
                aria-pressed={isLocked}
                className={cn(
                  'inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-micro font-display font-medium',
                  'transition-colors duration-150',
                  isLocked
                    ? 'bg-red-aura text-red-primary border border-red-primary/30'
                    : 'bg-surface text-text-muted border border-border hover:border-border-hover'
                )}
              >
                {isLocked ? (
                  <Lock className="w-2.5 h-2.5" aria-hidden="true" />
                ) : (
                  <Unlock className="w-2.5 h-2.5" aria-hidden="true" />
                )}
                {FEATURE_LABELS[feature]}
              </button>
            );
          })}
        </div>

        {/* Scene count */}
        {sceneCount > 0 && (
          <p className="text-micro text-text-muted font-display mt-0.5">
            {sceneCount} scene{sceneCount !== 1 ? 's' : ''}
          </p>
        )}
      </div>
    </motion.article>
  );
});