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

/**
 * Tint per preprocessor type, drawn from the LED palette at 25% so each
 * overlay reads distinctly without importing hues the palette does not have
 * (the old blue, purple and cyan were off-palette).
 */
const tint = (token: string) => `color-mix(in srgb, var(${token}) 25%, transparent)`;
const PREPROCESSOR_COLORS: Record<string, string> = {
  canny: tint('--color-led-play'),
  depth: tint('--color-led-jog'),
  openpose: tint('--color-led-rec'),
  scribble: tint('--color-led-cue'),
  segmentation: tint('--color-led-fx'),
  normal: tint('--color-led-time'),
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

  const overlayTint = PREPROCESSOR_COLORS[preprocessorType] ?? PREPROCESSOR_COLORS.canny;

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
        aria-hidden="true"
        style={{ backgroundColor: overlayTint, mixBlendMode: 'multiply' }}
      />
    </div>
  );
});