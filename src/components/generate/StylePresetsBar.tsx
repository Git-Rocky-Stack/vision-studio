import { useEffect, useRef, useState } from 'react';
import { cn } from '@/utils/cn';
import { withAlpha } from '@/utils/colorUtils';
import { useAppStore } from '@/store/appStore';
import { Button } from '@/components/ui/Button';
import { Plus, ChevronDown, ChevronRight, Trash2 } from 'lucide-react';

interface StylePresetsBarProps {
  activePresets: string[];
  onTogglePreset: (presetId: string, modifier: string) => void;
}

const CATEGORY_LABELS: Record<string, string> = {
  custom: 'Custom',
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

/** Custom styles take the chrome accent: they have no category hue of their own. */
export const CUSTOM_STYLE_COLOR = 'var(--color-accent-primary)';

export function StylePresetsBar({ activePresets, onTogglePreset }: StylePresetsBarProps) {
  const stylePresets = useAppStore((s) => s.stylePresets);
  const customStylePresets = useAppStore((s) => s.customStylePresets);
  const addCustomStylePreset = useAppStore((s) => s.addCustomStylePreset);
  const removeCustomStylePreset = useAppStore((s) => s.removeCustomStylePreset);

  const grouped: Record<string, typeof stylePresets> = {};
  // User styles get their own group, first, so a new one is easy to find.
  if (customStylePresets.length > 0) grouped.custom = customStylePresets;
  for (const cat of CATEGORY_ORDER) {
    const items = stylePresets.filter((p) => p.category === cat);
    if (items.length > 0) grouped[cat] = items;
  }
  const uncategorized = stylePresets.filter((p) => !CATEGORY_ORDER.includes(p.category));
  if (uncategorized.length > 0) grouped.other = uncategorized;

  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  // Groups start collapsed (undefined reads as collapsed), so invert the
  // effective state; inverting the raw value made the first click a no-op.
  const toggleGroup = (cat: string) => {
    setCollapsed((prev) => ({ ...prev, [cat]: prev[cat] === false }));
  };

  // Add Style popover
  const [isAdding, setIsAdding] = useState(false);
  const [name, setName] = useState('');
  const [modifier, setModifier] = useState('');
  const [addError, setAddError] = useState<string | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isAdding) return;
    const onPointerDown = (event: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) setIsAdding(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsAdding(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [isAdding]);

  const handleAdd = () => {
    const trimmedName = name.trim();
    const trimmedModifier = modifier.trim();
    if (!trimmedName || !trimmedModifier) {
      setAddError('A style needs a name and the prompt text it adds.');
      return;
    }
    const all = [...stylePresets, ...customStylePresets];
    if (all.some((p) => p.name.toLowerCase() === trimmedName.toLowerCase())) {
      setAddError(`A style named "${trimmedName}" already exists.`);
      return;
    }
    addCustomStylePreset({
      id: `custom-style-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: trimmedName,
      modifier: trimmedModifier,
      color: CUSTOM_STYLE_COLOR,
      category: 'creative',
      isCustom: true,
    });
    setCollapsed((prev) => ({ ...prev, custom: false }));
    setName('');
    setModifier('');
    setAddError(null);
    setIsAdding(false);
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
                className="flex min-h-6 w-full items-center gap-1.5 px-1 py-1 type-ui text-text-body hover:text-text-primary transition-colors"
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
                      <span key={preset.id} className="inline-flex items-center">
                        <button
                          type="button"
                          onClick={() => onTogglePreset(preset.id, preset.modifier)}
                          aria-label={`Style: ${preset.name}`}
                          aria-pressed={isActive}
                          title={preset.modifier}
                          className={cn(
                            'flex-shrink-0 flex items-center gap-2 px-3 py-2 rounded-md border transition text-xs',
                            isActive
                              ? 'text-text-primary'
                              : 'bg-elevated border-border text-text-body hover:text-text-primary'
                          )}
                          // color-mix keeps token colours (var(--color-feature-0X))
                          // working; the old hex parse turned them into NaN, so the
                          // selected chip lost its fill.
                          style={
                            isActive
                              ? {
                                  borderColor: preset.color,
                                  backgroundColor: withAlpha(preset.color, 0.09),
                                  boxShadow: `0 0 8px ${withAlpha(preset.color, 0.19)}`,
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
                        {preset.isCustom && (
                          <button
                            type="button"
                            onClick={() => removeCustomStylePreset(preset.id)}
                            aria-label={`Remove style ${preset.name}`}
                            className="ml-0.5 rounded-md p-1 text-text-muted transition hover:text-status-error"
                          >
                            <Trash2 className="h-3 w-3" aria-hidden="true" />
                          </button>
                        )}
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Add custom preset */}
      <div className="relative" ref={popoverRef}>
        <button
          type="button"
          onClick={() => setIsAdding((open) => !open)}
          aria-expanded={isAdding}
          aria-haspopup="true"
          className="flex-shrink-0 flex items-center gap-1 px-3 py-2 rounded-md border border-dashed border-border text-text-muted hover:text-text-body hover:border-border-hover transition text-xs"
          aria-label="Add style preset"
        >
          <Plus className="w-3 h-3" />
          Add Style
        </button>
        {isAdding && (
          <form
            role="dialog"
            aria-label="New style"
            className="absolute left-0 top-full z-30 mt-1 w-64 space-y-2 rounded-xl border border-border bg-elevated p-3 shadow-cinematic"
            onSubmit={(event) => {
              event.preventDefault();
              handleAdd();
            }}
          >
            <label className="block space-y-1">
              <span className="mono-label text-text-muted">Name</span>
              <input
                type="text"
                value={name}
                autoFocus
                onChange={(e) => setName(e.target.value)}
                placeholder="Moody neon"
                className="recessed-well w-full px-2 py-1.5 text-xs text-text-primary placeholder:text-text-muted"
              />
            </label>
            <label className="block space-y-1">
              <span className="mono-label text-text-muted">Prompt modifier</span>
              <textarea
                value={modifier}
                onChange={(e) => setModifier(e.target.value)}
                placeholder="neon lighting, wet streets, high contrast"
                rows={2}
                className="recessed-well w-full resize-none px-2 py-1.5 text-xs text-text-primary placeholder:text-text-muted"
              />
            </label>
            {addError && (
              <p role="alert" className="text-xs text-status-error">
                {addError}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" size="xs" onClick={() => setIsAdding(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" size="xs">
                Add Style
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
