import { memo } from 'react';
import { cn } from '@/utils/cn';

interface ReferenceOverlayProps {
  /** URL of the reference image to display. */
  imageUrl: string | null;
  /** Layer state controlling visibility, opacity, and blend mode. */
  layers: { visible: boolean; opacity: number; blendMode: 'normal' | 'overlay' | 'multiply' };
}

const BLEND_MODE_MAP: Record<string, string> = {
  normal: 'normal',
  overlay: 'overlay',
  multiply: 'multiply',
};

/**
 * Shows the reference image as a base layer in the composition preview.
 * Returns null when not visible or no imageUrl is provided.
 */
export const ReferenceOverlay = memo(function ReferenceOverlay({
  imageUrl,
  layers,
}: ReferenceOverlayProps) {
  if (!layers.visible || !imageUrl) return null;

  const mixBlendMode = BLEND_MODE_MAP[layers.blendMode] ?? 'normal';

  return (
    <div
      className={cn('pointer-events-none absolute inset-0 z-0 flex items-center justify-center')}
      style={{ opacity: layers.opacity }}
    >
      <img
        src={imageUrl}
        alt="Reference composition layer"
        className={cn('h-full w-full object-contain')}
        style={{ mixBlendMode: mixBlendMode as React.CSSProperties['mixBlendMode'] }}
        draggable={false}
      />
    </div>
  );
});