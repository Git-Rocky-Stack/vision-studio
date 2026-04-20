import { memo } from 'react';
import { cn } from '@/utils/cn';

const RATIO_MAP: Record<string, number> = {
  '1:1': 1,
  '4:3': 4 / 3,
  '3:4': 3 / 4,
  '16:9': 16 / 9,
  '9:16': 9 / 16,
  '2:3': 2 / 3,
  '3:2': 3 / 2,
};

interface AspectRatioFrameProps {
  /** Aspect ratio string, e.g. '1:1', '16:9'. Defaults to '1:1' if unrecognized. */
  ratio: string;
  /** Whether the frame overlay is visible. */
  visible: boolean;
  /** Opacity of the frame overlay (0-1). */
  opacity: number;
}

/**
 * Renders a dashed border frame overlay matching the selected aspect ratio.
 * Centered within its parent using a pointer-events-none overlay.
 */
export const AspectRatioFrame = memo(function AspectRatioFrame({
  ratio,
  visible,
  opacity,
}: AspectRatioFrameProps) {
  if (!visible) return null;

  const numericRatio = RATIO_MAP[ratio] ?? 1;

  return (
    <div
      className={cn('pointer-events-none absolute inset-0 z-10 flex items-center justify-center')}
      aria-hidden="true"
      style={{ opacity }}
    >
      <div
        className={cn(
          'max-h-full max-w-full rounded-sm border-2 border-dashed border-accent-primary',
        )}
        style={{ aspectRatio: `${numericRatio}`, width: '100%', height: '100%' }}
      />
    </div>
  );
});