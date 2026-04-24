import { memo, useMemo, useRef, useState } from 'react';
import { ArrowLeftRight, GitBranch, X } from 'lucide-react';
import { cn } from '@/utils/cn';
import { useAppStore } from '@/store/appStore';
import { computeSettingsDiff } from '@/utils/iterationTreeUtils';
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
  const iterationBranches = useAppStore((s) => s.iterationBranches);
  const comparisonMode = useAppStore((s) => s.iterationComparisonMode);
  const clearIterationComparison = useAppStore((s) => s.clearIterationComparison);
  const setActiveIteration = useAppStore((s) => s.setActiveIteration);
  const setIterationComparisonMode = useAppStore((s) => s.setIterationComparisonMode);
  const swapIterationComparison = useAppStore((s) => s.swapIterationComparison);

  const left = iterationNodes.get(leftId);
  const right = iterationNodes.get(rightId);
  const sliderRef = useRef<HTMLDivElement>(null);
  const [sliderPos, setSliderPos] = useState(50);
  const settingsDiff = useMemo(
    () =>
      left && right
        ? computeSettingsDiff(left.generationJob.params, right.generationJob.params)
        : null,
    [left, right],
  );

  if (!left || !right) return null;

  const modes: { id: ComparisonMode; label: string }[] = [
    { id: 'side-by-side', label: 'Side by Side' },
    { id: 'slider', label: 'Slider' },
    { id: 'grid', label: 'Grid' },
  ];
  const leftBranch = iterationBranches.find((branch) => branch.id === left.branchId);
  const rightBranch = iterationBranches.find((branch) => branch.id === right.branchId);
  const isCrossBranch = left.branchId !== right.branchId;

  const handleSliderMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!sliderRef.current) return;
    const rect = sliderRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    setSliderPos(Math.max(0, Math.min(100, (x / rect.width) * 100)));
  };

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div className="flex flex-wrap items-start justify-between gap-2 rounded-md border border-border bg-surface px-3 py-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="type-ui text-text-primary">Compare iterations</h3>
            {isCrossBranch && (
              <span className="inline-flex items-center gap-1 rounded-full border border-accent-primary-border bg-accent-primary-muted px-2 py-0.5 type-badge text-accent-primary">
                <GitBranch className="h-3 w-3" />
                Cross branch
              </span>
            )}
          </div>
          <p className="mt-1 type-caption text-text-muted">
            {leftBranch?.name ?? 'Branch'} vs {rightBranch?.name ?? 'Branch'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={swapIterationComparison}
            className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 type-ui text-text-body transition-colors hover:border-border-hover hover:bg-elevated hover:text-text-primary"
            aria-label="Swap comparison sides"
          >
            <ArrowLeftRight className="h-3.5 w-3.5" />
            Swap
          </button>
          <button
            type="button"
            onClick={clearIterationComparison}
            className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 type-ui text-text-body transition-colors hover:border-border-hover hover:bg-elevated hover:text-text-primary"
            aria-label="Clear Compare"
          >
            <X className="h-3.5 w-3.5" />
            Clear Compare
          </button>
        </div>
      </div>

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
          <button
            type="button"
            onClick={() => setActiveIteration(left.id)}
            className="overflow-hidden rounded-md border border-border text-left transition-colors hover:border-border-hover"
            aria-label={`Focus ${left.id}`}
          >
            {left.thumbnail ? (
              <img src={left.thumbnail} alt="Left iteration" className="w-full" />
            ) : (
              <div className="aspect-square bg-void flex items-center justify-center text-text-muted type-body-sm">No image</div>
            )}
          </button>
          <button
            type="button"
            onClick={() => setActiveIteration(right.id)}
            className="overflow-hidden rounded-md border border-border text-left transition-colors hover:border-border-hover"
            aria-label={`Focus ${right.id}`}
          >
            {right.thumbnail ? (
              <img src={right.thumbnail} alt="Right iteration" className="w-full" />
            ) : (
              <div className="aspect-square bg-void flex items-center justify-center text-text-muted type-body-sm">No image</div>
            )}
          </button>
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
            <button
              key={node.id}
              type="button"
              onClick={() => setActiveIteration(node.id)}
              className="overflow-hidden rounded-md border border-border text-left transition-colors hover:border-border-hover"
              aria-label={`Focus ${node.id}`}
            >
              {node.thumbnail ? (
                <img src={node.thumbnail} alt="" className="w-full" />
              ) : (
                <div className="aspect-square bg-void" />
              )}
            </button>
          ))}
        </div>
      )}

      {/* Settings diff */}
      {settingsDiff && (
        <SettingsDiffPanel diff={settingsDiff} />
      )}
    </div>
  );
});
