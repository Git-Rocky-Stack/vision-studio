import { useEffect, useRef, useCallback } from 'react';

interface FilmGrainOverlayProps {
  opacity?: number;
  animated?: boolean;
}

export function FilmGrainOverlay({ opacity = 0.025, animated = true }: FilmGrainOverlayProps) {
  const turbulenceRef = useRef<SVGFETurbulenceElement>(null);
  const rafRef = useRef<number>(0);
  const lastUpdateRef = useRef<number>(0);

  const animate = useCallback((timestamp: number) => {
    if (!animated || !turbulenceRef.current) return;

    // Update seed every ~100ms for flicker effect
    if (timestamp - lastUpdateRef.current > 100) {
      const seed = Math.floor(Math.random() * 1000);
      turbulenceRef.current.setAttribute('seed', String(seed));
      lastUpdateRef.current = timestamp;
    }

    rafRef.current = requestAnimationFrame(animate);
  }, [animated]);

  useEffect(() => {
    if (animated) {
      rafRef.current = requestAnimationFrame(animate);
    }
    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [animated, animate]);

  return (
    <div
      className="fixed inset-0 pointer-events-none"
      style={{ zIndex: 9999, opacity }}
    >
      <svg width="100%" height="100%">
        <filter id="film-grain">
          <feTurbulence
            ref={turbulenceRef}
            type="fractalNoise"
            baseFrequency="0.65"
            numOctaves="3"
            stitchTiles="stitch"
            seed="0"
          />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#film-grain)" />
      </svg>
    </div>
  );
}
