import { memo } from 'react';
import { useAppStore } from '@/store/appStore';
import { cn } from '@/utils/cn';

interface OnionSkinOverlayProps {
  /** Frames to render as onion skin (image URLs or data URLs) */
  frames: string[];
  /** The index of the current frame */
  currentFrameIndex: number;
  /** Additional class name */
  className?: string;
}

export const OnionSkinOverlay = memo(function OnionSkinOverlay({
  frames,
  currentFrameIndex,
  className,
}: OnionSkinOverlayProps) {
  const onionSkinEnabled = useAppStore((s) => s.onionSkinEnabled);
  const onionSkinFrameCount = useAppStore((s) => s.onionSkinFrameCount);
  const onionSkinOpacity = useAppStore((s) => s.onionSkinOpacity);
  const onionSkinDirection = useAppStore((s) => s.onionSkinDirection);

  if (!onionSkinEnabled || frames.length === 0) return null;

  const ghostFrames: { url: string; opacity: number; label: string }[] = [];

  for (let i = 1; i <= onionSkinFrameCount; i++) {
    const prevIdx = currentFrameIndex - i;
    const nextIdx = currentFrameIndex + i;
    const frameOpacity = onionSkinOpacity * (1 - (i - 1) / onionSkinFrameCount);

    if (onionSkinDirection !== 'next' && prevIdx >= 0 && prevIdx < frames.length) {
      ghostFrames.push({
        url: frames[prevIdx],
        opacity: frameOpacity,
        label: `Frame ${prevIdx + 1}`,
      });
    }

    if (onionSkinDirection !== 'prev' && nextIdx >= 0 && nextIdx < frames.length) {
      ghostFrames.push({
        url: frames[nextIdx],
        opacity: frameOpacity,
        label: `Frame ${nextIdx + 1}`,
      });
    }
  }

  if (ghostFrames.length === 0) return null;

  return (
    <div
      className={cn('absolute inset-0 pointer-events-none overflow-hidden', className)}
      data-testid="onion-skin-overlay"
    >
      {ghostFrames.map((frame, i) => (
        <img
          key={`${frame.label}-${i}`}
          src={frame.url}
          alt={frame.label}
          className="absolute inset-0 w-full h-full object-contain"
          style={{ opacity: frame.opacity }}
        />
      ))}
    </div>
  );
});
