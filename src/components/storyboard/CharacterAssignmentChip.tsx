import { memo } from 'react';
import { cn } from '@/utils/cn';
import { X, User } from 'lucide-react';
import type { LockedFeature } from '@/types/project';

interface CharacterAssignmentChipProps {
  name: string;
  color: string;
  lockedFeatures: LockedFeature[];
  onRemove?: () => void;
}

const FEATURE_ICONS: Record<LockedFeature, string> = {
  face: 'F',
  body: 'B',
  style: 'S',
  pose: 'P',
};

export const CharacterAssignmentChip = memo(function CharacterAssignmentChip({
  name,
  color,
  lockedFeatures,
  onRemove,
}: CharacterAssignmentChipProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 pl-1 pr-2 py-0.5 rounded-full',
        'bg-elevated border border-border',
        'text-xs font-display font-medium text-text-primary',
        'transition-colors duration-150',
        'hover:border-red-primary/40'
      )}
      data-testid="character-chip"
    >
      {/* Color indicator dot */}
      <span
        className="w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 border border-border overflow-hidden"
        style={{ backgroundColor: color }}
        aria-hidden="true"
      >
        <User className="w-2.5 h-2.5 text-white/80" />
      </span>

      {/* Name */}
      <span className="truncate max-w-[80px]">{name}</span>

      {/* Feature lock badges */}
      {lockedFeatures.length > 0 && (
        <span className="flex items-center gap-0.5" aria-label={`Locked: ${lockedFeatures.join(', ')}`}>
          {lockedFeatures.map((feature) => (
            <span
              key={feature}
              className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-sm bg-red-aura text-micro text-red-primary font-display font-bold"
              title={feature.charAt(0).toUpperCase() + feature.slice(1)}
            >
              {FEATURE_ICONS[feature]}
            </span>
          ))}
        </span>
      )}

      {/* Remove button */}
      {onRemove && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          aria-label={`Remove ${name}`}
          className={cn(
            'ml-0.5 p-0.5 rounded-sm',
            'text-text-muted hover:text-red-primary hover:bg-red-aura',
            'transition-colors duration-150'
          )}
        >
          <X className="w-2.5 h-2.5" aria-hidden="true" />
        </button>
      )}
    </span>
  );
});