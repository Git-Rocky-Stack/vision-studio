import { memo, useEffect, useState } from 'react';

interface FilmGrainOverlayProps {
  opacity?: number;
  animated?: boolean;
}

const GRAIN_TILE_SIZE = 128;

let cachedGrainTile: string | null | undefined;

/**
 * Renders one tile of monochrome noise into a canvas, once per session.
 *
 * The overlay used to run a full-viewport feTurbulence filter and re-seed it
 * every 100ms from an endless rAF loop, so the GPU re-rasterised fractal noise
 * for the whole window ten times a second, hidden or not, reduced motion or
 * not. A 128px tile repeated as a background costs one paint; the flicker is a
 * stepped CSS transform on the compositor.
 */
function getGrainTile(): string | null {
  if (cachedGrainTile !== undefined) return cachedGrainTile;
  cachedGrainTile = null;
  if (typeof document === 'undefined') return cachedGrainTile;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = GRAIN_TILE_SIZE;
    canvas.height = GRAIN_TILE_SIZE;
    const context = canvas.getContext('2d');
    if (!context) return cachedGrainTile;
    const image = context.createImageData(GRAIN_TILE_SIZE, GRAIN_TILE_SIZE);
    const { data } = image;
    for (let i = 0; i < data.length; i += 4) {
      const value = Math.floor(Math.random() * 256);
      data[i] = value;
      data[i + 1] = value;
      data[i + 2] = value;
      data[i + 3] = 255;
    }
    context.putImageData(image, 0, 0);
    cachedGrainTile = canvas.toDataURL('image/png');
  } catch {
    cachedGrainTile = null;
  }
  return cachedGrainTile;
}

function useDocumentHidden(): boolean {
  const [hidden, setHidden] = useState(() =>
    typeof document !== 'undefined' ? document.visibilityState === 'hidden' : false,
  );
  useEffect(() => {
    const onChange = () => setHidden(document.visibilityState === 'hidden');
    document.addEventListener('visibilitychange', onChange);
    return () => document.removeEventListener('visibilitychange', onChange);
  }, []);
  return hidden;
}

export const FilmGrainOverlay = memo(function FilmGrainOverlay({ opacity = 0.025, animated = true }: FilmGrainOverlayProps) {
  const [tile] = useState(getGrainTile);
  const hidden = useDocumentHidden();

  if (!tile) return null;

  return (
    <div
      aria-hidden="true"
      data-testid="film-grain-overlay"
      className="film-grain z-[9999]"
      data-animated={animated ? 'true' : 'false'}
      data-paused={hidden ? 'true' : 'false'}
      style={{ opacity, backgroundImage: `url(${tile})` }}
    />
  );
});
