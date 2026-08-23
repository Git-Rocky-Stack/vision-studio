import type { CSSProperties, ElementType, ReactNode } from 'react';
import { cn } from '@/utils/cn';

interface MonoLabelProps {
  children: ReactNode;
  /** Render element. Defaults to span. */
  as?: ElementType;
  /** Tone of the label text. */
  tone?: 'chrome' | 'silver' | 'muted';
  className?: string;
  style?: CSSProperties;
  /** DOM id, so a region can name itself via `aria-labelledby`. */
  id?: string;
}

const TONE: Record<NonNullable<MonoLabelProps['tone']>, string> = {
  chrome: 'var(--color-chrome)',
  silver: 'var(--color-silver)',
  muted: 'var(--color-silver-mute)',
};

/**
 * The canonical UI label: IBM Plex Mono, UPPERCASE, +0.66px tracking.
 * Applies the `.mono-label` utility (which sets its own transform/tracking so it
 * survives the app's global .uppercase / .tracking-* resets) plus a tone color.
 */
export function MonoLabel({
  children,
  as: Tag = 'span',
  tone = 'silver',
  className,
  style,
  id,
}: MonoLabelProps) {
  return (
    <Tag id={id} className={cn('mono-label', className)} style={{ color: TONE[tone], ...style }}>
      {children}
    </Tag>
  );
}
