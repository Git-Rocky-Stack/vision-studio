import { memo, useState, useRef } from 'react';
import { cn } from '@/utils/cn';
import { useAppStore } from '@/store/appStore';
import { SettingsDiffPanel } from './SettingsDiffPanel';
import type { ComparisonMode } from '@/types/iteration';

interface ComparisonPanelProps {
  leftId: string;
  rightId: string;
  className?: string;
}

export const ComparisonPanel = memo(function ComparisonPanel({
  leftId,
  rightId,
  className,
}: ComparisonPanelProps) {
  const iterationNodes = useAppStore((s) => s.iterationNodes);
  const comparisonMode = useAppStore((s) => s.iterationComparisonMode);
  const setIterationComparisonMode = useAppStore((s) => s.setIterationComparisonMode);

  const left = iterationNodes.get(leftId);
  const right = iterationNodes.get(rightId);
  const sliderRef = useRef<HTMLDivElement>(null);
  const [sliderPos, setSliderPos] = useState(50);

  if (!left || !right) return null;

  const modes: { id: ComparisonMode; label: string }[] = [
    { id: 'side-by-side', label: 'Side by Side' },
    { id: 'slider', label: 'Slider' },
    { id: 'grid', label: 'Grid' },
  ];

  const handleSliderMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!sliderRef.current) return;
    const rect = sliderRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    setSliderPos(Math.max(0, Math.min(100, (x / rect.width) * 100)));
  };

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {/* Mode selector */}
      <div className="flex gap-1" role="tablist" aria-label="Comparison mode">
        {modes.map((mode) => (
          <button
            key={mode.id}
            type="button"
            role="tab"
            aria-selected={comparisonMode === mode.id}
            onClick={() => setIterationComparisonMode(mode.id)}
            className={cn(
              'rounded-md px-2.5 py-1 type-micro transition-colors',
              comparisonMode === mode.id
                ? 'bg-accent-primary-muted text-accent-primary border border-accent-primary-border'
                : 'text-text-muted hover:text-text-body border border-transparent hover:bg-elevated',
            )}
          >
            {mode.label}
          </button>
        ))}
      </div>

      {/* Comparison view */}
      {comparisonMode === 'side-by-side' && (
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-md border border-border overflow-hidden">
            {left.thumbnail ? (
              <img src={left.thumbnail} alt="Left iteration" className="w-full" />
            ) : (
              <div className="aspect-square bg-void flex items-center justify-center text-text-muted type-body-sm">No image</div>
            )}
          </div>
          <div className="rounded-md border border-border overflow-hidden">
            {right.thumbnail ? (
              <img src={right.thumbnail} alt="Right iteration" className="w-full" />
            ) : (
              <div className="aspect-square bg-void flex items-center justify-center text-text-muted type-body-sm">No image</div>
            )}
          </div>
        </div>
      )}

      {comparisonMode === 'slider' && (
        <div
          ref={sliderRef}
          className="relative rounded-md border border-border overflow-hidden cursor-col-resize"
          onMouseMove={handleSliderMove}
        >
          <div className="aspect-[4/3]">
            {right.thumbnail ? (
              <img src={right.thumbnail} alt="Right iteration" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-void flex items-center justify-center text-text-muted type-body-sm">No image</div>
            )}
          </div>
          <div
            className="absolute inset-0 overflow-hidden"
            style={{ clipPath: `inset(0 ${100 - sliderPos}% 0 0)` }}
          >
            {left.thumbnail ? (
              <img src={left.thumbnail} alt="Left iteration" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-void flex items-center justify-center text-text-muted type-body-sm">No image</div>
            )}
          </div>
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-accent-primary"
            style={{ left: `${sliderPos}%` }}
          />
        </div>
      )}

      {comparisonMode === 'grid' && (
        <div className="grid grid-cols-2 gap-1">
          {[left, right].map((node) => (
            <div key={node.id} className="rounded-md border border-border overflow-hidden">
              {node.thumbnail ? (
                <img src={node.thumbnail} alt="" className="w-full" />
              ) : (
                <div className="aspect-square bg-void" />
              )}
            </div>
          ))}
        </div>
      )}

      {/* Settings diff */}
      {left.settingsDiff && (
        <SettingsDiffPanel diff={left.settingsDiff} />
      )}
    </div>
  );
});