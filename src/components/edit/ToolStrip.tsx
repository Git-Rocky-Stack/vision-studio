import { memo } from 'react';
import { cn } from '@/utils/cn';
import { useAppStore } from '@/store/appStore';
import { Tooltip } from '@/components/ui/Tooltip';
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

  // A wrapping toolbar, not a single column: the strip lives at the top of a
  // 320px dock above the properties panel, and fourteen stacked tools pushed
  // every adjustment control below the fold.
  return (
    <div
      role="toolbar"
      aria-label="Edit tools"
      className="flex flex-shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-border px-3 py-2"
    >
      {toolGroups.map((group, groupIdx) => (
        // Each group wraps as a unit, so a row never ends on an orphaned tool.
        <div key={groupIdx} role="group" className="flex items-center gap-1">
          {group.map((tool) => {
            const Icon = tool.icon;
            const isActive = activeEditTool === tool.id;
            const name = tool.shortcut ? `${tool.label} (${tool.shortcut})` : tool.label;
            return (
              <Tooltip key={tool.id} content={name} placement="bottom">
                <button
                  type="button"
                  onClick={() => setActiveEditTool(tool.id)}
                  aria-label={name}
                  aria-pressed={isActive}
                  className={cn(
                    'flex h-10 w-10 items-center justify-center rounded-md transition-colors',
                    isActive
                      ? 'bg-accent-primary-muted text-accent-primary'
                      : 'text-text-body hover:bg-elevated hover:text-text-primary'
                  )}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </button>
              </Tooltip>
            );
          })}
        </div>
      ))}
    </div>
  );
});
