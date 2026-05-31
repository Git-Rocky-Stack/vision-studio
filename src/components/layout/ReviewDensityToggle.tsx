import type { ReviewDensity } from '@/store/layoutPreferences';
import { cn } from '@/utils/cn';
import { MonoLabel } from '@/components/hardware';

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
      className="recessed-well inline-flex gap-1 p-1"
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
              'rounded-md px-2.5 py-1 transition-all',
              isActive
                ? 'raised-control text-accent-primary'
                : 'text-text-body hover:text-text-primary',
            )}
          >
            <MonoLabel tone={isActive ? 'chrome' : 'silver'}>{option.label}</MonoLabel>
          </button>
        );
      })}
    </div>
  );
}
