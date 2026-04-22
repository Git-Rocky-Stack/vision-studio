import type { ReviewDensity } from '@/store/layoutPreferences';
import { cn } from '@/utils/cn';

const densityOptions: { id: ReviewDensity; label: string }[] = [
  { id: 'comfortable', label: 'Comfortable' },
  { id: 'compact', label: 'Compact' },
];

interface ReviewDensityToggleProps {
  density: ReviewDensity;
  onChange: (density: ReviewDensity) => void;
}

export function ReviewDensityToggle({
  density,
  onChange,
}: ReviewDensityToggleProps) {
  return (
    <div
      role="group"
      aria-label="Review density"
      className="inline-flex rounded-md border border-border bg-elevated p-1"
    >
      {densityOptions.map((option) => {
        const isActive = density === option.id;

        return (
          <button
            key={option.id}
            type="button"
            aria-pressed={isActive}
            onClick={() => onChange(option.id)}
            className={cn(
              'rounded px-2.5 py-1.5 type-ui transition-all',
              isActive
                ? 'bg-accent-primary-muted text-accent-primary'
                : 'text-text-body hover:bg-surface hover:text-text-primary',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
