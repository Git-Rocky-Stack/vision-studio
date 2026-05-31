import { memo } from 'react';
import { cn } from '@/utils/cn';
import { useAppStore } from '@/store/appStore';
import type { EditTool } from '@/types/editor';
import {
  Move,
  Maximize2,
  Crop,
  RotateCw,
  Paintbrush,
  Eraser,
  Copy,
  Heart,
  Type,
  Square,
  Pen,
  Hand,
  ZoomIn,
  Pipette,
} from 'lucide-react';

interface ToolDef {
  id: EditTool;
  icon: React.ElementType;
  label: string;
  shortcut?: string;
}

const toolGroups: ToolDef[][] = [
  // Selection & Transform
  [
    { id: 'move', icon: Move, label: 'Move', shortcut: 'V' },
    { id: 'scale', icon: Maximize2, label: 'Scale', shortcut: 'T' },
    { id: 'crop', icon: Crop, label: 'Crop', shortcut: 'C' },
    { id: 'rotate', icon: RotateCw, label: 'Rotate', shortcut: 'R' },
  ],
  // Drawing
  [
    { id: 'brush', icon: Paintbrush, label: 'Brush', shortcut: 'B' },
    { id: 'eraser', icon: Eraser, label: 'Eraser', shortcut: 'E' },
    { id: 'clone', icon: Copy, label: 'Clone Stamp', shortcut: 'S' },
    { id: 'heal', icon: Heart, label: 'Heal', shortcut: 'J' },
  ],
  // Shapes & Text
  [
    { id: 'text', icon: Type, label: 'Text', shortcut: 'X' },
    { id: 'shape', icon: Square, label: 'Shape', shortcut: 'U' },
    { id: 'pen', icon: Pen, label: 'Pen', shortcut: 'P' },
  ],
  // Navigation
  [
    { id: 'hand', icon: Hand, label: 'Hand', shortcut: 'H' },
    { id: 'zoom', icon: ZoomIn, label: 'Zoom', shortcut: 'Z' },
    { id: 'eyedropper', icon: Pipette, label: 'Eyedropper', shortcut: 'I' },
  ],
];

export const ToolStrip = memo(function ToolStrip() {
  const activeEditTool = useAppStore(s => s.activeEditTool);
  const setActiveEditTool = useAppStore(s => s.setActiveEditTool);

  return (
    <div className="h-full flex flex-col items-center py-3 gap-1">
      {toolGroups.map((group, groupIdx) => (
        <div key={groupIdx}>
          {groupIdx > 0 && (
            <div className="w-6 h-px bg-border mx-auto my-2" />
          )}
          <div className="flex flex-col items-center gap-1">
            {group.map((tool) => {
              const Icon = tool.icon;
              const isActive = activeEditTool === tool.id;
              return (
                <button
                  key={tool.id}
                  onClick={() => setActiveEditTool(tool.id)}
                  aria-label={`${tool.label}${tool.shortcut ? ` (${tool.shortcut})` : ''}`}
                  aria-pressed={isActive}
                  aria-describedby={`tooltip-${tool.id}`}
                  className={cn(
                    'w-10 h-10 flex items-center justify-center rounded-md transition-all group relative',
                    isActive
                      ? 'bg-accent-primary-muted text-accent-primary'
                      : 'text-text-body hover:text-text-primary hover:bg-elevated'
                  )}
                >
                  <Icon className="w-4 h-4" />
                  {/* Tooltip */}
                  <div id={`tooltip-${tool.id}`} role="tooltip" className="absolute left-full ml-2 px-2.5 py-1.5 bg-elevated border border-border rounded-md text-xs text-text-primary opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 pointer-events-none whitespace-nowrap z-50 shadow-cinematic">
                    {tool.label}
                    {tool.shortcut && (
                      <span className="ml-2 text-text-muted data-mono">{tool.shortcut}</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
});
