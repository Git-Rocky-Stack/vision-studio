import { memo, useMemo } from 'react';
import { cn } from '@/utils/cn';
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

const AI_TOOL_COLORS: Record<AITool, string> = {
  'generative-fill': '#22c55e',
  'style-transfer': '#6c5ce7',
  upscale: '#38bdf8',
  remove: '#ef4444',
};

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

  return (
    <div
      className={cn(
        'absolute cursor-pointer pointer-events-auto transition-all duration-150',
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
            ? 'bg-sky-400/10'
            : invertMask
              ? 'bg-red-primary/10'
              : 'bg-green-500/10',
          isActive && isEraseMask
            ? 'bg-sky-400/20'
            : isActive && invertMask
              ? 'bg-red-primary/20'
              : isActive && !invertMask
                ? 'bg-green-500/20' : ''
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
          borderColor: isEraseMask
            ? 'rgba(56, 189, 248, 0.6)'
            : invertMask
              ? 'rgba(239, 68, 68, 0.6)'
              : toolColor,
        }}
      />

      {/* Feather indicator - subtle inner glow when feathering is active */}
      {featherRadius > 0 && blendEdges && (
        <div
          className="absolute inset-0 rounded-sm pointer-events-none"
          style={{
            boxShadow: `inset 0 0 ${featherRadius}px ${isEraseMask ? 'rgba(56, 189, 248, 0.15)' : invertMask ? 'rgba(239, 68, 68, 0.15)' : 'rgba(34, 197, 94, 0.15)'}`,
          }}
        />
      )}

      {/* Label */}
      <div
        className={cn(
          'absolute -top-6 left-0 flex items-center gap-1.5',
          'px-2 py-0.5 rounded-md text-micro font-display font-medium whitespace-nowrap',
          'pointer-events-none'
        )}
        style={{
          backgroundColor: isEraseMask ? 'rgba(56, 189, 248, 0.9)' : invertMask ? 'rgba(239, 68, 68, 0.9)' : toolColor,
          color: '#fff',
        }}
      >
        <span className="font-semibold">{name}</span>
        <span className="opacity-75">·</span>
        <span>{toolLabel}</span>
        <span className="opacity-70">{Math.round(strength * 100)}%</span>
      </div>

      {/* Erase indicator */}
      {isEraseMask && (
        <div className="absolute -top-5 -right-1 px-1 py-0.5 rounded-sm bg-sky-400 text-micro text-white font-display font-bold pointer-events-none">
          ERASE
        </div>
      )}

      {/* Invert indicator */}
      {invertMask && (
        <div className="absolute -top-5 -right-1 px-1 py-0.5 rounded-sm bg-red-primary text-micro text-white font-display font-bold pointer-events-none">
          INV
        </div>
      )}

      {/* Active indicator - corner handles */}
      {isActive && (
        <>
          <div
            className="absolute w-2 h-2 -top-1 -left-1 rounded-full border-2 border-white"
            style={{ backgroundColor: isEraseMask ? '#38bdf8' : toolColor }}
          />
          <div
            className="absolute w-2 h-2 -top-1 -right-1 rounded-full border-2 border-white"
            style={{ backgroundColor: isEraseMask ? '#38bdf8' : toolColor }}
          />
          <div
            className="absolute w-2 h-2 -bottom-1 -left-1 rounded-full border-2 border-white"
            style={{ backgroundColor: isEraseMask ? '#38bdf8' : toolColor }}
          />
          <div
            className="absolute w-2 h-2 -bottom-1 -right-1 rounded-full border-2 border-white"
            style={{ backgroundColor: isEraseMask ? '#38bdf8' : toolColor }}
          />
        </>
      )}
    </div>
  );
});