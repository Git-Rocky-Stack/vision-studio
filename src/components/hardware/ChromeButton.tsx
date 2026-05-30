import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react';
import { cn } from '@/utils/cn';

interface ChromeButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  /** chrome = polished metal-cap primary CTA. ghost = dark carbon secondary. */
  variant?: 'chrome' | 'ghost';
}

const BASE: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 13,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '1px',
  padding: '12px 22px',
  borderRadius: 'var(--radius-control)',
  cursor: 'pointer',
  border: 'none',
  transition: 'all var(--duration-click) var(--ease-click)',
  position: 'relative',
};

const CHROME: CSSProperties = {
  background: 'linear-gradient(180deg, #FFF 0%, #E6E6E6 50%, #C8C8C8 100%)',
  color: 'var(--color-void)',
  boxShadow:
    'inset 0 1px 0 rgba(255,255,255,0.9),' +
    'inset 0 -1px 0 rgba(0,0,0,0.3),' +
    'inset 0 -2px 0 rgba(0,0,0,0.15),' +
    '0 0 0 1px rgba(230,230,230,0.4),' +
    '0 1px 2px rgba(0,0,0,0.6),' +
    '0 4px 12px rgba(0,0,0,0.5),' +
    '0 0 24px rgba(230,230,230,0.18)',
};

const GHOST: CSSProperties = {
  background: 'linear-gradient(180deg, #1F1F1F 0%, #171717 60%, #121212 100%)',
  color: 'var(--color-platinum)',
  border: '1px solid rgba(255,255,255,0.18)',
  boxShadow:
    'inset 0 1px 0 rgba(255,255,255,0.10),' +
    'inset 0 -1px 0 rgba(0,0,0,0.5),' +
    '0 1px 2px rgba(0,0,0,0.6),' +
    '0 4px 8px rgba(0,0,0,0.4)',
};

/**
 * Primary action as a polished chrome metal cap (not a hue gradient). Hover/
 * active states live in index.css (.vx-btn-chrome / .vx-btn-ghost). Mirrors the
 * website Button.
 */
export function ChromeButton({ children, variant = 'chrome', className, style, disabled, ...rest }: ChromeButtonProps) {
  return (
    <button
      // vx-btn-* hover/active states are suppressed when disabled (CSS :not(:disabled)).
      className={cn('vx-btn', `vx-btn-${variant}`, className)}
      disabled={disabled}
      style={{
        ...BASE,
        ...(variant === 'chrome' ? CHROME : GHOST),
        ...(disabled ? { opacity: 0.45, cursor: 'not-allowed', filter: 'saturate(0.6)' } : null),
        ...style,
      }}
      {...rest}
    >
      {variant === 'ghost' && (
        <span
          aria-hidden="true"
          style={{
            position: 'absolute',
            top: 2,
            left: 14,
            right: 14,
            height: 1,
            background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.18), transparent)',
            pointerEvents: 'none',
          }}
        />
      )}
      {children}
    </button>
  );
}
