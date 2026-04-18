import { memo } from 'react';
import { X } from 'lucide-react';

interface ProgressiveStepOverlayProps {
  currentStep: number;
  totalSteps: number;
  onCancel: () => void;
}

/**
 * Overlay shown on top of the preview image during generation.
 * Displays a cancel button (top-right) and a step counter with progress ring (bottom-right).
 * The overlay itself is pointer-events-none except for the cancel button.
 */
export const ProgressiveStepOverlay = memo(function ProgressiveStepOverlay({
  currentStep,
  totalSteps,
  onCancel,
}: ProgressiveStepOverlayProps) {
  const progress = totalSteps > 0 ? currentStep / totalSteps : 0;
  const circumference = 2 * Math.PI * 10; // r=10 ~ 62.83
  const dashOffset = circumference * (1 - progress);

  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex">
      {/* Cancel button - top-right */}
      <div className="pointer-events-auto absolute right-3 top-3">
        <button
          type="button"
          onClick={onCancel}
          aria-label="Cancel generation"
          className="
            flex h-7 w-7 items-center justify-center rounded-md
            border border-border bg-surface/80
            text-text-body backdrop-blur-sm
            transition-colors duration-150
            hover:border-status-error hover:text-status-error
            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-status-error
          "
        >
          <X size={14} strokeWidth={2.5} />
        </button>
      </div>

      {/* Step counter with progress ring - bottom-right */}
      <div className="pointer-events-auto absolute bottom-3 right-3 flex items-center gap-2">
        <div className="relative flex h-6 w-6 items-center justify-center">
          {/* Progress ring SVG */}
          <svg
            viewBox="0 0 24 24"
            className="absolute h-6 w-6 -rotate-90"
            aria-hidden="true"
          >
            {/* Background circle */}
            <circle
              cx="12"
              cy="12"
              r="10"
              fill="none"
              stroke="var(--color-border)"
              strokeWidth="2.5"
            />
            {/* Progress arc */}
            <circle
              cx="12"
              cy="12"
              r="10"
              fill="none"
              stroke="var(--color-accent-primary)"
              strokeWidth="2.5"
              strokeDasharray={circumference.toFixed(2)}
              strokeDashoffset={dashOffset.toFixed(2)}
              strokeLinecap="round"
            />
          </svg>
        </div>

        <span
          className="
            rounded-md bg-surface/80 px-2 py-0.5
            text-xs font-medium text-text-body
            backdrop-blur-sm
          "
          role="status"
          aria-live="polite"
        >
          Step {currentStep} / {totalSteps}
        </span>
      </div>
    </div>
  );
});