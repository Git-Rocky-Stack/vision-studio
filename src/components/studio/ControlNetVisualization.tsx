import { memo } from 'react';
import { cn } from '@/utils/cn';

interface ControlNetVisualizationProps {
  /** URL of the preprocessed ControlNet image. */
  preprocessedImageUrl: string | null;
  /** Type of ControlNet preprocessor (e.g. canny, depth, openpose). */
  preprocessorType: string;
  /** Layer state controlling visibility and opacity. */
  layers: { visible: boolean; opacity: number };
}

/** Color mapping per preprocessor type for visual differentiation. */
const PREPROCESSOR_COLORS: Record<string, string> = {
  canny: 'rgba(34,197,94,0.25)',        // green
  depth: 'rgba(59,130,246,0.25)',       // blue
  openpose: 'rgba(239,68,68,0.25)',     // red
  scribble: 'rgba(234,179,8,0.25)',     // yellow
  segmentation: 'rgba(168,85,247,0.25)', // purple
  normal: 'rgba(6,182,212,0.25)',       // cyan
};

/**
 * Shows ControlNet preprocessing overlay with color-coded tinting.
 * Returns null when not visible or no preprocessed image is available.
 */
export const ControlNetVisualization = memo(function ControlNetVisualization({
  preprocessedImageUrl,
  preprocessorType,
  layers,
}: ControlNetVisualizationProps) {
  if (!layers.visible || !preprocessedImageUrl) return null;

  const tint = PREPROCESSOR_COLORS[preprocessorType] ?? PREPROCESSOR_COLORS.canny;

  return (
    <div
      className={cn('pointer-events-none absolute inset-0 z-20')}
      style={{ opacity: layers.opacity }}
    >
      <img
        src={preprocessedImageUrl}
        alt={`${preprocessorType} ControlNet overlay`}
        className={cn('h-full w-full object-contain')}
        style={{ mixBlendMode: 'multiply' }}
        draggable={false}
      />
      <div
        className={cn('absolute inset-0')}
        style={{ backgroundColor: tint, mixBlendMode: 'multiply' }}
      />
    </div>
  );
});