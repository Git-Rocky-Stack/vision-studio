import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react';
import { cn } from '@/utils/cn';
import { Led } from './Led';
import type { CapabilityColor, LedColor } from './tokens';

interface PadButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  /** Pressed/selected state - lifts to a chrome (or accent) ring + brighter face. */
  selected?: boolean;
  /** Optional leading LED dot (semantic/capability key or a raw CSS color/var). */
  led?: LedColor | CapabilityColor | (string & {});
  /** Pulse the LED. */
  ledPulse?: boolean;
  /** Accent color for the selected ring + text (raw CSS color/var). Defaults to chrome. */
  accent?: string;
  /** Visual density. */
  size?: 'sm' | 'md';
}

const PAD_SIZE: Record<NonNullable<PadButtonProps['size']>, CSSProperties> = {
  sm: { padding: '6px 10px', fontSize: 10 },
  md: { padding: '8px 12px', fontSize: 11 },
};

/**
 * Layer 3 raised control as a performance-pad button. A carbon cap that sits ON
 * a recessed well: lifts on hover and presses on active (the `.vx-pad` envelopes
 * in index.css), and shows a chrome - or accent-tinted - ring plus brighter text
 * when selected. Optional leading LED dot. Use for category banks, preset pads,
 * view toggles, and segmented selectors. Label text is always Mono UPPERCASE.
 */
export function PadButton({
  children,
  selected = false,
  led,
  ledPulse,
  accent,
  size = 'md',
  className,
  style,
  ...rest
}: PadButtonProps) {
  const ringColor = accent ?? 'var(--color-chrome-edge)';
  const glow = accent ?? 'rgba(230,230,230,0.18)';

  return (
    <button
      type="button"
      aria-pressed={selected}
      className={cn('raised-control vx-pad', className)}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        borderRadius: 'var(--radius-control)',
        fontFamily: 'var(--font-mono)',
        fontWeight: 500,
        textTransform: 'uppercase',
        letterSpacing: '0.66px',
        whiteSpace: 'nowrap',
        color: selected ? accent ?? 'var(--color-chrome)' : 'var(--color-silver)',
        // When selected, override the .raised-control shadow with a ringed, glowing cap.
        boxShadow: selected
          ? `inset 0 1px 0 rgba(255,255,255,0.12), inset 0 -1px 0 rgba(0,0,0,0.6), 0 0 0 1px ${ringColor}, 0 0 10px ${glow}, 0 4px 8px rgba(0,0,0,0.5)`
          : undefined,
        cursor: 'pointer',
        ...PAD_SIZE[size],
        ...style,
      }}
      {...rest}
    >
      {led !== undefined && <Led color={led} pulse={ledPulse} />}
      {children}
    </button>
  );
}
