import { memo, type Ref } from 'react';
import { cn } from '@/utils/cn';
import { ArrowRight, ChevronRight, Minus, MoveHorizontal, ZoomIn } from 'lucide-react';
import type { TransitionType } from '@/types/project';

interface TransitionIndicatorProps {
  type: TransitionType;
  duration?: number; // ms
  onClick?: () => void;
  /** Set when the indicator opens a transition editor popover. */
  expanded?: boolean;
  /** Id of the popover the indicator controls. */
  controlsId?: string;
  ref?: Ref<HTMLButtonElement>;
}

export const TRANSITION_CONFIG: Record<
  TransitionType,
  { icon: React.ElementType; label: string; className: string }
> = {
  cut: {
    icon: ChevronRight,
    label: 'Cut',
    className: 'text-text-muted',
  },
  fade: {
    icon: Minus,
    label: 'Fade',
    className: 'text-status-info',
  },
  dissolve: {
    icon: ArrowRight,
    label: 'Dissolve',
    className: 'text-feature-06',
  },
  'wipe-left': {
    icon: MoveHorizontal,
    label: 'Wipe Left',
    className: 'text-feature-04',
  },
  'wipe-right': {
    icon: MoveHorizontal,
    label: 'Wipe Right',
    className: 'text-feature-04',
  },
  zoom: {
    icon: ZoomIn,
    label: 'Zoom',
    className: 'text-led-fx',
  },
};

export function formatTransitionDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export const TransitionIndicator = memo(function TransitionIndicator({
  type,
  duration,
  onClick,
  expanded,
  controlsId,
  ref,
}: TransitionIndicatorProps) {
  const config = TRANSITION_CONFIG[type];
  const Icon = config.icon;

  return (
    <button
      ref={ref}
      type="button"
      data-testid="transition-indicator"
      aria-label={`${config.label} transition${duration ? `, ${formatTransitionDuration(duration)}` : ''}`}
      aria-haspopup={expanded === undefined ? undefined : 'dialog'}
      aria-expanded={expanded}
      aria-controls={expanded ? controlsId : undefined}
      onClick={onClick}
      className={cn(
        'flex items-center justify-center gap-1 py-1.5 w-full',
        'type-ui transition-colors duration-150',
        'hover:bg-elevated rounded-md cursor-pointer',
        onClick ? 'cursor-pointer' : 'cursor-default',
        'text-text-body'
      )}
    >
      <Icon className={cn('w-3 h-3', config.className)} aria-hidden="true" />
      <span>{config.label}</span>
      {duration !== undefined && duration > 0 && (
        <span className="text-text-muted ml-0.5">
          {formatTransitionDuration(duration)}
        </span>
      )}
    </button>
  );
});
