import { cn } from '@/utils/cn';
import { useAppStore } from '@/store/appStore';
import {
  Columns2,
  SplitSquareHorizontal,
  Layers,
  Grid3X3,
  X,
} from 'lucide-react';

type ComparisonMode = 'side-by-side' | 'slider' | 'onion' | 'grid';

const modes: { id: ComparisonMode; label: string; icon: React.ElementType }[] = [
  { id: 'side-by-side', label: 'Side by Side', icon: Columns2 },
  { id: 'slider', label: 'Slider', icon: SplitSquareHorizontal },
  { id: 'onion', label: 'Onion Skin', icon: Layers },
  { id: 'grid', label: 'Grid', icon: Grid3X3 },
];

export function ComparisonToolbar() {
  const { comparisonMode, setComparisonMode } = useAppStore();

  if (!comparisonMode || comparisonMode === 'off') return null;

  return (
    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20">
      <div className="flex items-center gap-1 px-2 py-1.5 glass glass-border rounded-lg shadow-cinematic">
        {modes.map((mode) => {
          const Icon = mode.icon;
          const isActive = comparisonMode === mode.id;
          return (
            <button
              key={mode.id}
              onClick={() => setComparisonMode(mode.id)}
              aria-label={mode.label}
              aria-pressed={isActive}
              className={cn(
                'flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-display transition-all',
                isActive
                  ? 'bg-red-aura text-red-primary'
                  : 'text-text-body hover:text-text-primary hover:bg-elevated'
              )}
              title={mode.label}
            >
              <Icon className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{mode.label}</span>
            </button>
          );
        })}

        <div className="w-px h-4 bg-border mx-1" />

        <button
          onClick={() => setComparisonMode('off')}
          className="p-1.5 rounded-md text-text-muted hover:text-red-primary hover:bg-red-aura transition-all"
          aria-label="Close comparison view"
          title="Close comparison"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
