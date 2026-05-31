import { memo } from 'react';
import { cn } from '@/utils/cn';
import {
  Square,
  Pen,
  Paintbrush,
  Eraser,
  ArrowDownUp,
} from 'lucide-react';
import type { MaskType } from '@/types/project';

export type RegionTool = MaskType | 'select';

interface RegionLockToolbarProps {
  activeTool: RegionTool;
  brushSize: number;
  isInverted: boolean;
  onToolChange: (tool: RegionTool) => void;
  onBrushSizeChange: (size: number) => void;
  onInvertToggle: () => void;
}

const TOOLS: { id: RegionTool; label: string; icon: React.ElementType; shortcut: string }[] = [
  { id: 'select', label: 'Select', icon: Square, shortcut: 'V' },
  { id: 'rectangle', label: 'Rectangle', icon: Square, shortcut: 'R' },
  { id: 'polygon', label: 'Lasso', icon: Pen, shortcut: 'L' },
  { id: 'brush', label: 'Brush', icon: Paintbrush, shortcut: 'B' },
  { id: 'erase', label: 'Eraser', icon: Eraser, shortcut: 'E' },
];

export const RegionLockToolbar = memo(function RegionLockToolbar({
  activeTool,
  brushSize,
  isInverted,
  onToolChange,
  onBrushSizeChange,
  onInvertToggle,
}: RegionLockToolbarProps) {
  return (
    <div
      className="absolute top-4 left-4 z-20 flex flex-col gap-1"
      data-testid="region-lock-toolbar"
      role="toolbar"
      aria-label="Region mask tools"
    >
      {/* Tool buttons */}
      <div className="flex flex-col gap-1 p-1.5 raised-panel">
        {TOOLS.map((tool) => {
          const Icon = tool.icon;
          const isActive = activeTool === tool.id;
          return (
            <button
              key={tool.id}
              onClick={() => onToolChange(tool.id)}
              className={cn(
                'relative flex items-center justify-center w-9 h-9 rounded-md',
                'transition-all duration-150',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary',
                isActive
                  ? 'bg-accent-primary-muted text-accent-primary'
                  : 'text-text-body hover:text-text-primary hover:bg-elevated'
              )}
              aria-label={`${tool.label} (${tool.shortcut})`}
              aria-pressed={isActive}
              title={`${tool.label} (${tool.shortcut})`}
            >
              <Icon className="w-4 h-4" aria-hidden="true" />
            </button>
          );
        })}

        {/* Separator */}
        <div className="w-6 h-px bg-border mx-auto" />

        {/* Invert toggle */}
        <button
          onClick={onInvertToggle}
          className={cn(
            'relative flex items-center justify-center w-9 h-9 rounded-md',
            'transition-all duration-150',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary',
            isInverted
              ? 'bg-accent-primary-muted text-accent-primary'
              : 'text-text-body hover:text-text-primary hover:bg-elevated'
          )}
          aria-label="Invert mask"
          aria-pressed={isInverted}
          title="Invert mask (I)"
        >
          <ArrowDownUp className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>

      {/* Brush size slider (visible when brush or eraser is active) */}
      {(activeTool === 'brush' || activeTool === 'erase') && (
        <div className="flex flex-col items-center gap-2 p-2 raised-panel">
          <div
            className="rounded-full bg-accent-primary"
            style={{
              width: Math.max(4, Math.min(brushSize / 2, 24)),
              height: Math.max(4, Math.min(brushSize / 2, 24)),
            }}
            aria-hidden="true"
          />
          <input
            type="range"
            min={1}
            max={100}
            value={brushSize}
            onChange={(e) => onBrushSizeChange(Number(e.target.value))}
            className="w-24 accent-[var(--color-accent-primary)]"
            aria-label="Brush size"
            title={`Brush size: ${brushSize}px`}
          />
          <span className="type-caption">
            {brushSize}px
          </span>
        </div>
      )}
    </div>
  );
});
