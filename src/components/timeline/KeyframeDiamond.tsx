import { memo } from 'react';
import { cn } from '@/utils/cn';
import type { KeyframeInterpolation } from '@/types/timeline';

interface KeyframeDiamondProps {
  time: number;
  totalDuration: number;
  trackHeight: number;
  interpolation: KeyframeInterpolation;
  isSelected: boolean;
  onSelect: () => void;
  className?: string;
}

const INTERPOLATION_COLORS: Record<KeyframeInterpolation, string> = {
  linear: 'bg-text-body',
  'ease-in': 'bg-status-warning',
  'ease-out': 'bg-category-youtube',
  'ease-in-out': 'bg-category-social',
};

export const KeyframeDiamond = memo(function KeyframeDiamond({
  time,
  totalDuration,
  trackHeight,
  interpolation,
  isSelected,
  onSelect,
  className,
}: KeyframeDiamondProps) {
  const left = totalDuration > 0 ? (time / totalDuration) * 100 : 0;

  return (
    <button
      onClick={onSelect}
      className={cn('absolute z-10', className)}
      style={{
        left: `${left}%`,
        top: `${(trackHeight - 12) / 2}px`,
      }}
      aria-label={`Keyframe at ${time}ms`}
      aria-pressed={isSelected}
      title={`${interpolation} keyframe at ${time}ms`}
    >
      <div
        className={cn(
          'w-3 h-3 rotate-45 transition-all cursor-pointer',
          INTERPOLATION_COLORS[interpolation] || 'bg-text-body',
          isSelected
            ? 'ring-2 ring-accent-primary ring-offset-1 ring-offset-surface scale-125'
            : 'hover:scale-110'
        )}
      />
    </button>
  );
});
