import { memo } from 'react';
import { cn } from '@/utils/cn';
import type { PipelineStep } from '@/types/pipeline';
import { Switch } from '@/components/ui/Switch';
import {
  Maximize2,
  Eraser,
  Zap,
  Sparkles,
  Palette,
  ImageOff,
  Brush,
  Droplets,
  Crop,
  Settings2,
  X,
  GripVertical,
} from 'lucide-react';

const TYPE_ICONS: Record<string, React.ElementType> = {
  upscale: Maximize2,
  denoise: Eraser,
  sharpen: Zap,
  'face-restore': Sparkles,
  'color-correct': Palette,
  'background-remove': ImageOff,
  'style-transfer': Brush,
  blur: Droplets,
  'crop-resize': Crop,
  custom: Settings2,
};

interface PipelineNodeProps {
  step: PipelineStep;
  index: number;
  isSelected: boolean;
  isFirst: boolean;
  isLast: boolean;
  onSelect: () => void;
  onToggle: () => void;
  onRemove: () => void;
  className?: string;
}

export const PipelineNode = memo(function PipelineNode({
  step,
  index,
  isSelected,
  isFirst,
  isLast,
  onSelect,
  onToggle,
      onRemove,
      className,
}: PipelineNodeProps) {
  const Icon = TYPE_ICONS[step.type] ?? Settings2;

  return (
    <div className={cn('flex items-center gap-0 shrink-0', className)}>
      {/* Input port */}
      {!isFirst && (
        <div className="w-4 h-0.5 bg-border" />
      )}
      {isFirst && <div className="w-2" />}

      {/* Node card */}
      <div
        role="button"
        tabIndex={0}
        aria-label={`${step.label} step ${index + 1}`}
        aria-selected={isSelected}
        onClick={onSelect}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onSelect();
          }
        }}
        className={cn(
          'relative flex items-center gap-2 rounded-md border px-3 py-2.5 min-w-[140px] max-w-[180px] transition-all cursor-pointer group',
          isSelected
            ? 'border-accent-primary bg-accent-primary-muted shadow-accent-subtle'
            : 'border-border bg-elevated hover:border-border-hover',
          !step.enabled && 'opacity-50'
        )}
      >
        {/* Input port dot */}
        {!isFirst && (
          <div className="absolute -left-1.5 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full border-2 border-border bg-canvas" />
        )}

        {/* Output port dot */}
        {!isLast && (
          <div className="absolute -right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full border-2 border-border bg-canvas" />
        )}

        <GripVertical className="w-3 h-3 text-text-muted cursor-grab shrink-0" />

        <div className="flex items-center justify-center w-6 h-6 rounded bg-surface shrink-0">
          <Icon className="w-3.5 h-3.5 text-text-body" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="text-xs text-text-primary font-medium truncate leading-tight">
            {step.label}
          </div>
          <div className="type-badge text-text-muted mt-0.5">
            #{index + 1}
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <Switch
            checked={step.enabled}
            onChange={onToggle}
            label={`Toggle ${step.label}`}
          />
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            aria-label={`Remove ${step.label}`}
            className="p-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity hover:bg-surface"
          >
            <X className="w-3 h-3 text-text-muted hover:text-status-error" />
          </button>
        </div>
      </div>

      {/* Output connector */}
      {!isLast && (
        <div className="w-4 h-0.5 bg-border" />
      )}
      {isLast && <div className="w-2" />}
    </div>
  );
});
