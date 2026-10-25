import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/utils/cn';

export type ChromeButtonSize = 'sm' | 'md' | 'lg';

interface ChromeButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  /** chrome = polished metal-cap primary CTA. ghost = dark carbon secondary. */
  variant?: 'chrome' | 'ghost';
  /**
   * sm = in-card actions (a template's Use), md = section actions (Create
   * Template), lg = the panel's primary CTA (Generate, Start Batch).
   */
  size?: ChromeButtonSize;
}

/**
 * Primary action as a polished chrome metal cap (not a hue gradient). Mirrors
 * the website Button.
 *
 * Every visual lives in index.css (.vx-btn, .btn-chrome / .vx-btn-chrome,
 * .vx-btn-ghost, .vx-btn-sm/md/lg). It used to be inline style, and an inline
 * background and box-shadow outrank any stylesheet rule, so the cap's hover
 * and pressed states were never drawn. A caller adjusts layout with className
 * (w-full, flex-1), never by restyling the cap.
 */
export function ChromeButton({
  children,
  variant = 'chrome',
  size = 'lg',
  className,
  ...rest
}: ChromeButtonProps) {
  return (
    <button
      // vx-btn-* hover/active states are suppressed when disabled (CSS :not(:disabled)).
      className={cn(
        'vx-btn whitespace-nowrap',
        variant === 'chrome' ? 'btn-chrome vx-btn-chrome' : 'vx-btn-ghost',
        `vx-btn-${size}`,
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
