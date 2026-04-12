import { useState } from 'react';
import { cn } from '@/utils/cn';
import { Slider } from '@/components/ui/Slider';
import { Layers, Sparkles } from 'lucide-react';

interface FilterDef {
  id: string;
  name: string;
  category: string;
  css: string;
}

const FILTERS: FilterDef[] = [
  { id: 'cinematic-warm', name: 'Cinematic Warm', category: 'cinematic', css: 'contrast(1.1) saturate(1.3) sepia(0.15)' },
  { id: 'cinematic-cool', name: 'Cinematic Cool', category: 'cinematic', css: 'contrast(1.15) saturate(0.9) hue-rotate(10deg)' },
  { id: 'vintage-film', name: 'Vintage Film', category: 'vintage', css: 'sepia(0.4) contrast(1.1) brightness(0.95)' },
  { id: 'vintage-fade', name: 'Vintage Fade', category: 'vintage', css: 'sepia(0.2) contrast(0.9) brightness(1.1) saturate(0.8)' },
  { id: 'noir', name: 'Noir', category: 'bw', css: 'grayscale(1) contrast(1.3) brightness(0.9)' },
  { id: 'bw-classic', name: 'B&W Classic', category: 'bw', css: 'grayscale(1) contrast(1.1)' },
  { id: 'portrait-soft', name: 'Portrait Soft', category: 'portrait', css: 'contrast(0.95) brightness(1.05) saturate(1.1)' },
  { id: 'landscape-vivid', name: 'Landscape Vivid', category: 'landscape', css: 'saturate(1.5) contrast(1.1) brightness(1.05)' },
  { id: 'dreamy', name: 'Dreamy', category: 'creative', css: 'brightness(1.1) contrast(0.9) saturate(1.2)' },
  { id: 'cyberpunk', name: 'Cyberpunk', category: 'creative', css: 'contrast(1.3) saturate(1.5) hue-rotate(-10deg)' },
  { id: 'vibrant', name: 'Vibrant', category: 'creative', css: 'saturate(1.8) contrast(1.1)' },
  { id: 'matte', name: 'Matte', category: 'creative', css: 'contrast(0.85) brightness(1.1) saturate(0.9)' },
];

const CATEGORIES = [
  { id: 'all', label: 'All' },
  { id: 'cinematic', label: 'Cinematic' },
  { id: 'vintage', label: 'Vintage' },
  { id: 'bw', label: 'B&W' },
  { id: 'portrait', label: 'Portrait' },
  { id: 'landscape', label: 'Landscape' },
  { id: 'creative', label: 'Creative' },
];

interface FilterGridProps {
  selectedFilters: string[];
  onToggleFilter: (filterId: string) => void;
  intensity: number;
  onIntensityChange: (value: number) => void;
  stackMode: boolean;
  onStackModeChange: (enabled: boolean) => void;
  previewImage?: string;
}

export function FilterGrid({
  selectedFilters,
  onToggleFilter,
  intensity,
  onIntensityChange,
  stackMode,
  onStackModeChange,
  previewImage,
}: FilterGridProps) {
  const [activeCategory, setActiveCategory] = useState('all');

  const filteredFilters = FILTERS.filter(
    (f) => activeCategory === 'all' || f.category === activeCategory
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Sparkles className="w-3.5 h-3.5 text-red-primary" />
        <span className="text-label text-text-primary">Filters</span>
      </div>

      {/* Category Pills */}
      <div className="flex flex-wrap gap-2">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setActiveCategory(cat.id)}
            aria-pressed={activeCategory === cat.id}
            className={cn(
              'px-2.5 py-1 rounded-full text-xs font-display font-medium transition-all',
              activeCategory === cat.id
                ? 'bg-red-primary text-text-primary'
                : 'bg-elevated text-text-body hover:text-text-primary'
            )}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Filter Grid */}
      <div className="grid grid-cols-2 gap-2">
        {filteredFilters.map((filter) => {
          const isSelected = selectedFilters.includes(filter.id);
          return (
            <button
              key={filter.id}
              onClick={() => onToggleFilter(filter.id)}
              aria-pressed={isSelected}
              aria-label={`Filter: ${filter.name}`}
              className={cn(
                'rounded-lg border overflow-hidden transition-all text-left',
                isSelected
                  ? 'border-red-primary glow-red-subtle'
                  : 'border-border hover:border-border-hover'
              )}
            >
              {/* Preview thumbnail */}
              <div
                className="w-full aspect-[4/3] bg-elevated relative"
                style={{ filter: filter.css }}
              >
                {previewImage ? (
                  <img
                    src={previewImage}
                    alt={filter.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-surface to-elevated" />
                )}
                {isSelected && (
                  <div className="absolute inset-0 bg-red-primary/10 flex items-center justify-center">
                    <div className="w-5 h-5 rounded-full bg-red-primary flex items-center justify-center">
                      <svg
                        className="w-3 h-3 text-text-primary"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={3}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                    </div>
                  </div>
                )}
              </div>
              <div className="px-2 py-1.5">
                <span
                  className={cn(
                    'font-display text-xs font-medium',
                    isSelected ? 'text-red-primary' : 'text-text-primary'
                  )}
                >
                  {filter.name}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Intensity Slider */}
      {selectedFilters.length > 0 && (
        <div className="pt-2">
          <Slider
            label="Intensity"
            value={intensity}
            min={0}
            max={100}
            onChange={onIntensityChange}
            valueFormatter={(v) => `${v}%`}
          />
        </div>
      )}

      {/* Stack Filters Toggle */}
      <div className="flex items-center justify-between py-2 border-t border-border">
        <div className="flex items-center gap-2">
          <Layers className="w-3.5 h-3.5 text-text-muted" />
          <span className="font-display text-xs text-text-body">Stack Filters</span>
        </div>
        <button
          role="switch"
          aria-checked={stackMode}
          aria-label="Toggle stack filters"
          onClick={() => onStackModeChange(!stackMode)}
          className={cn(
            'w-9 h-5 rounded-full transition-all relative',
            stackMode ? 'bg-red-primary' : 'bg-elevated border border-border'
          )}
        >
          <span
            className={cn(
              'absolute top-0.5 w-4 h-4 rounded-full bg-text-primary transition-all',
              stackMode ? 'left-[18px]' : 'left-0.5'
            )}
          />
        </button>
      </div>
    </div>
  );
}
