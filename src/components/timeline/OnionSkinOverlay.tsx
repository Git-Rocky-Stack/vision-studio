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

  // A slot with no image is skipped rather than ghosted: an <img src=""> both
  // shows nothing and makes the browser re-request the current document.
  const pushGhost = (index: number, opacity: number) => {
    if (index < 0 || index >= frames.length) return;
    const url = frames[index];
    if (!url) return;
    ghostFrames.push({ url, opacity, label: `Frame ${index + 1}` });
  };

  for (let i = 1; i <= onionSkinFrameCount; i++) {
    const frameOpacity = onionSkinOpacity * (1 - (i - 1) / onionSkinFrameCount);

    if (onionSkinDirection !== 'next') pushGhost(currentFrameIndex - i, frameOpacity);
    if (onionSkinDirection !== 'prev') pushGhost(currentFrameIndex + i, frameOpacity);
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
