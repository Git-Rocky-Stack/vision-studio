import { memo, useMemo } from 'react';
import { cn } from '@/utils/cn';
import { Led } from '@/components/hardware/Led';
import type { RegionLock, AITool } from '@/types/project';

interface RegionLockOverlayProps {
  regionLocks: RegionLock[];
  canvasWidth: number;
  canvasHeight: number;
  activeRegionId: string | null;
  onRegionClick?: (regionId: string) => void;
}

const AI_TOOL_LABELS: Record<AITool, string> = {
  'generative-fill': 'Fill',
  'style-transfer': 'Style',
  upscale: 'Upscale',
  remove: 'Remove',
};

// Semantic tokens only: the region tint follows the theme with the rest of
// the status palette (DESIGN.md, LED palette).
export const AI_TOOL_COLORS: Record<AITool, string> = {
  'generative-fill': 'var(--color-status-success)',
  'style-transfer': 'var(--color-capability-edit)',
  upscale: 'var(--color-status-info)',
  remove: 'var(--color-status-error)',
};

const ERASE_COLOR = 'var(--color-status-info)';
const INVERT_COLOR = 'var(--color-status-error)';

/** A token colour at a given strength over transparent, for fills and glows. */
function tokenMix(color: string, percent: number): string {
  return `color-mix(in srgb, ${color} ${percent}%, transparent)`;
}

export const RegionLockOverlay = memo(function RegionLockOverlay({
  regionLocks,
  canvasWidth,
  canvasHeight,
  activeRegionId,
  onRegionClick,
}: RegionLockOverlayProps) {
  if (regionLocks.length === 0) return null;

  return (
    <div
      className="absolute inset-0 pointer-events-none"
      data-testid="region-lock-overlay"
      style={{ width: canvasWidth, height: canvasHeight }}
    >
      {regionLocks.map((region) => (
        <RegionMask
          key={region.id}
          region={region}
          canvasWidth={canvasWidth}
          canvasHeight={canvasHeight}
          isActive={region.id === activeRegionId}
          onClick={onRegionClick}
        />
      ))}
    </div>
  );
});

interface RegionMaskProps {
  region: RegionLock;
  canvasWidth: number;
  canvasHeight: number;
  isActive: boolean;
  onClick?: (regionId: string) => void;
}

const RegionMask = memo(function RegionMask({
  region,
  canvasWidth,
  canvasHeight,
  isActive,
  onClick,
}: RegionMaskProps) {
  const { mask, name, aiTool, strength, invertMask } = region;
  const { bounds, featherRadius, blendEdges } = mask;

  // Scale bounds to canvas dimensions
  const scaledBounds = useMemo(() => {
    // Bounds are stored as pixel coordinates relative to the frame
    const x = Math.min(bounds.x, canvasWidth - 1);
    const y = Math.min(bounds.y, canvasHeight - 1);
    const width = Math.min(bounds.width, canvasWidth - x);
    const height = Math.min(bounds.height, canvasHeight - y);
    return { x, y, width: Math.max(width, 1), height: Math.max(height, 1) };
  }, [bounds, canvasWidth, canvasHeight]);

  const toolColor = AI_TOOL_COLORS[aiTool];
  const toolLabel = AI_TOOL_LABELS[aiTool];
  const isEraseMask = mask.type === 'erase';
  const stateColor = isEraseMask ? ERASE_COLOR : invertMask ? INVERT_COLOR : toolColor;

  return (
    <div
      className={cn(
        'absolute cursor-pointer pointer-events-auto transition duration-150',
        isActive ? 'z-10' : 'z-0'
      )}
      style={{
        left: scaledBounds.x,
        top: scaledBounds.y,
        width: scaledBounds.width,
        height: scaledBounds.height,
      }}
      onClick={() => onClick?.(region.id)}
      role="button"
      tabIndex={0}
      aria-label={`Region: ${name}, tool: ${toolLabel}`}
    >
      {/* Mask fill */}
      <div
        className={cn(
          'absolute inset-0 rounded-sm',
          isEraseMask
            ? 'bg-status-info/10'
            : invertMask
              ? 'bg-status-error/10'
              : 'bg-status-success/10',
          isActive && isEraseMask
            ? 'bg-status-info/20'
            : isActive && invertMask
              ? 'bg-status-error/20'
              : isActive && !invertMask
                ? 'bg-status-success/20' : ''
        )}
      />

      {/* Border - dashed for inactive or erase masks, solid for active additive masks */}
      <div
        className={cn(
          'absolute inset-0 rounded-sm',
          isActive && !isEraseMask
            ? 'border-2'
            : 'border border-dashed'
        )}
        style={{
          borderColor: isEraseMask || invertMask ? tokenMix(stateColor, 60) : toolColor,
        }}
      />

      {/* Feather indicator - subtle inner glow when feathering is active */}
      {featherRadius > 0 && blendEdges && (
        <div
          className="absolute inset-0 rounded-sm pointer-events-none"
          style={{
            boxShadow: `inset 0 0 ${featherRadius}px ${tokenMix(
              isEraseMask || invertMask ? stateColor : 'var(--color-status-success)',
              15,
            )}`,
          }}
        />
      )}

      {/* Label: a recessed chip with an LED for the state colour, so the text
          stays primary-on-dark in both themes instead of white on a tint. */}
      <div
        className={cn(
          'recessed-well absolute -top-7 left-0 flex items-center gap-1.5',
          'px-2 py-0.5 type-ui text-text-primary whitespace-nowrap',
          'pointer-events-none'
        )}
        role="status"
        aria-live="polite"
        aria-label={`${name} ${toolLabel} ${Math.round(strength * 100)}%`}
        data-state-color={stateColor}
      >
        <Led color={stateColor} size={6} />
        <span className="font-semibold">{name}</span>
        <span className="h-3 w-px bg-border-hover" aria-hidden="true" />
        <span>{toolLabel}</span>
        <span className="text-text-muted">{Math.round(strength * 100)}%</span>
      </div>

      {/* Erase / invert indicators */}
      {(isEraseMask || invertMask) && (
        <div className="recessed-well mono-label absolute -top-7 -right-1 flex items-center gap-1 px-1.5 py-0.5 text-text-primary pointer-events-none">
          <Led color={stateColor} size={5} />
          {isEraseMask ? 'ERASE' : 'INV'}
        </div>
      )}

      {/* Active indicator - corner handles */}
      {isActive && (
        <>
          {['-top-1 -left-1', '-top-1 -right-1', '-bottom-1 -left-1', '-bottom-1 -right-1'].map((pos) => (
            <div
              key={pos}
              className={cn('absolute h-2 w-2 rounded-full border-2 border-text-primary', pos)}
              style={{ backgroundColor: isEraseMask ? ERASE_COLOR : toolColor }}
            />
          ))}
        </>
      )}
    </div>
  );
});
