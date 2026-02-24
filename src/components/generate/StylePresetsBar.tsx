import { cn } from '@/utils/cn';
import { useAppStore } from '@/store/appStore';
import { Plus } from 'lucide-react';

interface StylePresetsBarProps {
  activePresets: string[]; // array of preset IDs currently active
  onTogglePreset: (presetId: string, modifier: string) => void;
}

export function StylePresetsBar({ activePresets, onTogglePreset }: StylePresetsBarProps) {
  const { stylePresets, customStylePresets } = useAppStore();
  const allPresets = [...stylePresets, ...customStylePresets];

  return (
    <div className="space-y-2">
      <label className="text-label text-text-body">Style</label>

      <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
        {allPresets.map((preset) => {
          const isActive = activePresets.includes(preset.id);
          return (
            <button
              key={preset.id}
              onClick={() => onTogglePreset(preset.id, preset.modifier)}
              className={cn(
                'flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full border transition-all font-display text-xs',
                isActive
                  ? 'text-text-primary'
                  : 'bg-elevated border-border text-text-body hover:text-text-primary'
              )}
              style={
                isActive
                  ? {
                      borderColor: preset.color,
                      backgroundColor: `${preset.color}18`,
                      color: preset.color,
                      boxShadow: `0 0 8px ${preset.color}30`,
                    }
                  : undefined
              }
            >
              <span
                className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: preset.color }}
              />
              {preset.name}
            </button>
          );
        })}

        {/* Add custom preset */}
        <button
          className="flex-shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-full border border-dashed border-border text-text-muted hover:text-text-body hover:border-border-hover transition-all text-xs"
          title="Add custom style"
        >
          <Plus className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}
