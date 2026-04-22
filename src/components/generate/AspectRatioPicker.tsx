import { memo, useMemo } from 'react';
import { ArrowLeftRight } from 'lucide-react';
import { useAppStore } from '@/store/appStore';
import { cn } from '@/utils/cn';
import { ASPECT_RATIOS, computeDimensions, type AspectRatio, type ResolutionTier } from '@/types/resolution';

const TIERS: { id: ResolutionTier; label: string; px: number }[] = [
  { id: 'standard', label: 'Standard', px: 512 },
  { id: 'high', label: 'High', px: 768 },
  { id: 'ultra', label: 'Ultra', px: 1024 },
];

export const AspectRatioPicker = memo(function AspectRatioPicker() {
  const aspectRatio = useAppStore((s) => s.aspectRatio);
  const resolutionTier = useAppStore((s) => s.resolutionTier);
  const customWidth = useAppStore((s) => s.customWidth);
  const customHeight = useAppStore((s) => s.customHeight);
  const setAspectRatio = useAppStore((s) => s.setAspectRatio);
  const setResolutionTier = useAppStore((s) => s.setResolutionTier);
  const setCustomWidth = useAppStore((s) => s.setCustomWidth);
  const setCustomHeight = useAppStore((s) => s.setCustomHeight);

  const dimensions = useMemo(
    () => computeDimensions(aspectRatio, resolutionTier, customWidth, customHeight),
    [aspectRatio, resolutionTier, customWidth, customHeight]
  );

  return (
    <div className="space-y-3">
      <span className="text-label text-text-body">Aspect Ratio</span>

      {/* Ratio grid */}
      <div className="grid grid-cols-4 gap-1.5">
        {ASPECT_RATIOS.map((opt) => {
          const isActive = aspectRatio === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              aria-label={opt.id}
              data-active={isActive}
              title={opt.description}
              onClick={() => setAspectRatio(opt.id)}
              className={cn(
                'flex flex-col items-center justify-center rounded-lg border py-2 px-1 transition-all',
                isActive
                  ? 'border-accent-primary-border bg-accent-primary-muted text-accent-primary'
                  : 'border-border text-text-body hover:border-border-hover hover:bg-elevated hover:text-text-primary'
              )}
            >
              {/* Proportional preview rectangle */}
              <div
                className={cn(
                  'rounded-sm mb-1',
                  isActive ? 'bg-accent-primary' : 'bg-text-muted/30'
                )}
                style={{
                  width: `${Math.min(24, 24 * (opt.ratio >= 1 ? 1 : opt.ratio))}px`,
                  height: `${Math.min(24, 24 * (opt.ratio >= 1 ? 1 / opt.ratio : 1))}px`,
                }}
              />
              <span className="font-mono text-micro leading-none">{opt.label}</span>
            </button>
          );
        })}

        {/* Custom button */}
        <button
          type="button"
          aria-label="custom"
          data-active={aspectRatio === 'custom'}
          onClick={() => setAspectRatio('custom')}
          className={cn(
            'flex flex-col items-center justify-center rounded-lg border py-2 px-1 transition-all',
            aspectRatio === 'custom'
              ? 'border-accent-primary-border bg-accent-primary-muted text-accent-primary'
              : 'border-border text-text-body hover:border-border-hover hover:bg-elevated hover:text-text-primary'
          )}
        >
          <ArrowLeftRight className="mb-1 h-3.5 w-3.5" aria-hidden="true" />
          <span className="font-mono text-micro leading-none">Custom</span>
        </button>
      </div>

      {/* Resolution tier */}
      <div className="flex gap-1.5">
        {TIERS.map((tier) => {
          const isActive = resolutionTier === tier.id;
          return (
            <button
              key={tier.id}
              type="button"
              aria-label={`${tier.label} ${tier.px}px`}
              data-active={isActive}
              onClick={() => setResolutionTier(tier.id)}
              className={cn(
                'flex-1 rounded-lg border py-1.5 text-center transition-all',
                isActive
                  ? 'border-accent-primary-border bg-accent-primary-muted text-accent-primary'
                  : 'border-border text-text-body hover:border-border-hover hover:bg-elevated hover:text-text-primary'
              )}
            >
              <div className="type-ui font-medium">{tier.label}</div>
              <div className="font-mono text-micro text-text-muted">{tier.px}px</div>
            </button>
          );
        })}
      </div>

      {/* Dimensions display */}
      <div className="flex items-center justify-between rounded-lg bg-elevated/50 px-3 py-2 border border-border">
        <span className="text-label text-text-body">Output</span>
        <span className="font-mono type-ui text-text-primary">{dimensions.width} x {dimensions.height}</span>
      </div>

      {/* Custom inputs (visible only in custom mode) */}
      {aspectRatio === 'custom' && (
        <div className="flex gap-2">
          <div className="flex-1">
            <span className="text-label text-text-body mb-1 block">Width</span>
            <input
              type="number"
              aria-label="Custom width"
              value={customWidth}
              onChange={(e) => setCustomWidth(Number(e.target.value))}
              min={256}
              max={2048}
              step={64}
              className="w-full rounded-md border border-border bg-surface px-2 py-1.5 type-ui text-text-primary focus:border-accent-primary focus:outline-none"
            />
          </div>
          <div className="flex-1">
            <span className="text-label text-text-body mb-1 block">Height</span>
            <input
              type="number"
              aria-label="Custom height"
              value={customHeight}
              onChange={(e) => setCustomHeight(Number(e.target.value))}
              min={256}
              max={2048}
              step={64}
              className="w-full rounded-md border border-border bg-surface px-2 py-1.5 type-ui text-text-primary focus:border-accent-primary focus:outline-none"
            />
          </div>
        </div>
      )}
    </div>
  );
});
