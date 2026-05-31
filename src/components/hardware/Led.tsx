import type { CSSProperties } from 'react';
import { resolveHardwareColor, type LedColor, type CapabilityColor } from './tokens';

interface LedProps {
  /**
   * LED semantic (rec/cue/play/jog/fx/time), capability
   * (image/video/edit/local/cloud), or a raw CSS color/var for category hues.
   */
  color: LedColor | CapabilityColor | (string & {});
  /** Diameter in px. */
  size?: number;
  /** Breathing pulse animation (collapses under prefers-reduced-motion). */
  pulse?: boolean;
  /** Glow radius override (px). Defaults to size + 2. */
  glow?: number;
  className?: string;
  style?: CSSProperties;
}

/**
 * Pinpoint instrument LED with a real-hardware glow. Mirrors the website's LED.
 * Use only as a small indicator next to text or as a state badge dot - never as
 * a text or background fill color (see DESIGN.md anti-slop rules).
 */
export function Led({ color, size = 6, pulse = false, glow, className, style }: LedProps) {
  const hex = resolveHardwareColor(color);
  const glowSize = glow ?? Math.max(6, size + 2);

  return (
    <span
      aria-hidden="true"
      className={className}
      style={{
        display: 'inline-block',
        width: size,
        height: size,
        borderRadius: 'var(--radius-pill)',
        background: hex,
        boxShadow: `0 0 ${glowSize}px ${hex}`,
        flexShrink: 0,
        animation: pulse ? 'pulse-led 1.5s infinite' : undefined,
        ...style,
      }}
    />
  );
}
