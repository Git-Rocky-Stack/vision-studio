import { useState } from 'react';
import { cn } from '@/utils/cn';
import { hexToRgba } from '@/utils/colorUtils';
import { useAppStore } from '@/store/appStore';
import { Plus, ChevronDown, ChevronRight } from 'lucide-react';

interface StylePresetsBarProps {
  activePresets: string[];
  onTogglePreset: (presetId: string, modifier: string) => void;
}

const CATEGORY_LABELS: Record<string, string> = {
  cinematic: 'Cinematic',
  anime: 'Anime',
  photography: 'Photography',
  artistic: 'Artistic',
  illustration: 'Illustration',
  creative: 'Creative',
  abstract: 'Abstract',
  realistic: 'Realistic',
};

const CATEGORY_ORDER = ['cinematic', 'anime', 'photography', 'artistic', 'illustration', 'creative', 'abstract'];

export function StylePresetsBar({ activePresets, onTogglePreset }: StylePresetsBarProps) {
  const stylePresets = useAppStore((s) => s.stylePresets);
  const customStylePresets = useAppStore((s) => s.customStylePresets);
  const allPresets = [...stylePresets, ...customStylePresets];

  const grouped = CATEGORY_ORDER.reduce<Record<string, typeof allPresets>>((acc, cat) => {
    const items = allPresets.filter((p) => p.category === cat);
    if (items.length > 0) acc[cat] = items;
    return acc;
  }, {});

  // Custom presets without a matching category
  const uncategorized = allPresets.filter(
    (p) => !CATEGORY_ORDER.includes(p.category)
  );
  if (uncategorized.length > 0) grouped['other'] = uncategorized;

  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const toggleGroup = (cat: string) => {
    setCollapsed((prev) => ({ ...prev, [cat]: !prev[cat] }));
  };

  return (
    <div className="space-y-2">
      <label className="text-label text-text-body">Style</label>

      <div className="space-y-1.5">
        {Object.entries(grouped).map(([cat, presets]) => {
          const isCollapsed = collapsed[cat] !== false;
          const hasActivePreset = presets.some((p) => activePresets.includes(p.id));

          return (
            <div key={cat}>
              <button
                type="button"
                onClick={() => toggleGroup(cat)}
                className="flex w-full items-center gap-1.5 px-1 py-1 type-ui text-text-body hover:text-text-primary transition-colors"
                aria-expanded={!isCollapsed}
                aria-label={`${CATEGORY_LABELS[cat] ?? cat} styles`}
              >
                {isCollapsed ? (
                  <ChevronRight className="h-3 w-3 flex-shrink-0" aria-hidden="true" />
                ) : (
                  <ChevronDown className="h-3 w-3 flex-shrink-0" aria-hidden="true" />
                )}
                <span>{CATEGORY_LABELS[cat] ?? cat}</span>
                {hasActivePreset && (
                  <span className="ml-auto h-1.5 w-1.5 rounded-full bg-accent-primary" aria-hidden="true" />
                )}
              </button>

              {!isCollapsed && (
                <div className="flex flex-wrap gap-2 pl-5 pt-1">
                  {presets.map((preset) => {
                    const isActive = activePresets.includes(preset.id);
                    return (
                      <button
                        key={preset.id}
                        onClick={() => onTogglePreset(preset.id, preset.modifier)}
                        aria-label={`Style: ${preset.name}`}
                        aria-pressed={isActive}
                        className={cn(
                          'flex-shrink-0 flex items-center gap-2 px-3 py-2 rounded-md border transition-all font-display text-xs',
                          isActive
                            ? 'text-text-primary'
                            : 'bg-elevated border-border text-text-body hover:text-text-primary'
                        )}
                        style={
                          isActive
                            ? {
                                borderColor: preset.color,
                                backgroundColor: hexToRgba(preset.color, 0.09),
                                color: preset.color,
                                boxShadow: `0 0 8px ${hexToRgba(preset.color, 0.19)}`,
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
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Add custom preset */}
      <button
        className="flex-shrink-0 flex items-center gap-1 px-3 py-2 rounded-md border border-dashed border-border text-text-muted hover:text-text-body hover:border-border-hover transition-all text-xs"
        aria-label="Add style preset"
      >
        <Plus className="w-3 h-3" />
        Add Style
      </button>
    </div>
  );
}