import { memo } from 'react';
import { cn } from '@/utils/cn';

interface RegionMaskPreviewProps {
  /** URL of the region mask image. */
  maskImageUrl: string | null;
  /** Layer state controlling visibility and opacity. */
  layers: { visible: boolean; opacity: number };
}

/**
 * Shows region masks as a semi-transparent overlay using mix-blend-multiply.
 * Returns null when not visible or no mask image is available.
 */
export const RegionMaskPreview = memo(function RegionMaskPreview({
  maskImageUrl,
  layers,
}: RegionMaskPreviewProps) {
  if (!layers.visible || !maskImageUrl) return null;

  return (
    <div
      className={cn('pointer-events-none absolute inset-0 z-30')}
      style={{ opacity: layers.opacity }}
    >
      <img
        src={maskImageUrl}
        alt="Region mask overlay"
        className={cn('h-full w-full object-contain')}
        style={{ mixBlendMode: 'multiply' }}
        draggable={false}
      />
    </div>
  );
});