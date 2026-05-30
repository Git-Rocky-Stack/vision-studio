import type { CSSProperties, ReactNode } from 'react';
import { LED_VARS, type LedColor } from './tokens';

interface LcdProps {
  children: ReactNode;
  /** Phosphor color of the readout. */
  color?: LedColor;
  size?: 'sm' | 'md' | 'lg';
  minWidth?: number;
  className?: string;
  style?: CSSProperties;
}

const SIZE: Record<NonNullable<LcdProps['size']>, CSSProperties> = {
  sm: { fontSize: 10, padding: '3px 8px' },
  md: { fontSize: 11, padding: '4px 10px' },
  lg: { fontSize: 13, padding: '6px 14px' },
};

/**
 * Segmented-LCD readout - recessed black well with glowing phosphor text.
 * For live values: model name, queue depth, GPU temp, dimensions, etc.
 * Mirrors the website LCD; phosphor color comes from the LED token map.
 */
export function Lcd({ children, color = 'play', size = 'md', minWidth, className, style }: LcdProps) {
  const hex = LED_VARS[color];
  return (
    <span
      className={className}
      style={{
        fontFamily: 'var(--font-mono)',
        fontWeight: 500,
        textTransform: 'uppercase',
        letterSpacing: '0.66px',
        color: hex,
        textShadow: `0 0 4px ${hex}`,
        background: 'linear-gradient(180deg, #040404 0%, #020202 100%)',
        boxShadow:
          'inset 0 1px 3px rgba(0,0,0,0.9),' +
          'inset 0 -1px 0 rgba(255,255,255,0.04),' +
          'inset 1px 0 2px rgba(0,0,0,0.7),' +
          'inset -1px 0 2px rgba(0,0,0,0.7)',
        border: '1px solid rgba(0,0,0,0.8)',
        borderRadius: 'var(--radius-card)',
        textAlign: 'center',
        display: 'inline-block',
        minWidth,
        ...SIZE[size],
        ...style,
      }}
    >
      {children}
    </span>
  );
}
