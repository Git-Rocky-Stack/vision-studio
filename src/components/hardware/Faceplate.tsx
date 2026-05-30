import { useCallback, useRef, type CSSProperties, type MouseEvent, type ReactNode } from 'react';
import { cn } from '@/utils/cn';
import { HexBoltSet, HEX_BOLT_INSET } from './HexBolt';
import { Led } from './Led';
import { LED_VARS, type LedColor } from './tokens';

/** Brushed-aluminum stripe header height (px). Body top padding derives from this. */
const STRIPE_H = 32;

interface FaceplateProps {
  children: ReactNode;
  /** Mono UPPERCASE module kicker, e.g. "GENERATE" or "MOD - QUEUE". */
  kicker: string;
  /** Optional right-aligned serial / secondary readout. */
  serial?: string;
  /** Optional LED state label paired with stateLed. */
  stateLabel?: string;
  stateLed?: LedColor;
  className?: string;
  style?: CSSProperties;
  /** Inner body padding (px). Default 20. */
  bodyPadding?: number;
  showBolts?: boolean;
  boltSize?: number;
}

/**
 * Raised hardware faceplate - Layer 1 of the depth hierarchy. App-adapted from
 * the website Faceplate: fills its container (no showroom max-width/margin) so it
 * drops cleanly into Dockview panels. Composition: raised panel + chrome
 * edge-light strip + corner key light + four hex bolts + brushed-aluminum stripe
 * header (mono kicker / serial / LED state). Cursor-following specular highlight
 * via the `.vx-faceplate` rule in index.css.
 */
export function Faceplate({
  children,
  kicker,
  serial,
  stateLabel,
  stateLed,
  className,
  style,
  bodyPadding = 20,
  showBolts = true,
  boltSize = 18,
}: FaceplateProps) {
  const ref = useRef<HTMLDivElement | null>(null);

  const handleMove = useCallback((e: MouseEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    el.style.setProperty('--mx', `${((e.clientX - rect.left) / rect.width) * 100}%`);
    el.style.setProperty('--my', `${((e.clientY - rect.top) / rect.height) * 100}%`);
  }, []);

  const handleLeave = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty('--mx', '70%');
    el.style.setProperty('--my', '0%');
  }, []);

  // Clear the corner bolts: inner bolt edge sits at HEX_BOLT_INSET + boltSize.
  const stripePadX = showBolts ? HEX_BOLT_INSET + boltSize + 10 : 16;

  return (
    <div
      ref={ref}
      className={cn('vx-faceplate', className)}
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
      style={{
        position: 'relative',
        borderRadius: 'var(--radius-card)',
        background:
          'radial-gradient(ellipse 80% 60% at 30% -10%, rgba(255,255,255,0.04) 0%, transparent 60%),' +
          'linear-gradient(180deg, #1C1C1C 0%, #151515 35%, #101010 70%, #0C0C0C 100%)',
        border: '1px solid rgba(255,255,255,0.06)',
        boxShadow:
          'inset 0 1px 0 rgba(255,255,255,0.10),' +
          'inset 0 -1px 0 rgba(0,0,0,0.7),' +
          'inset 1px 0 0 rgba(255,255,255,0.025),' +
          'inset -1px 0 0 rgba(0,0,0,0.4),' +
          '0 1px 0 rgba(0,0,0,0.9),' +
          '0 2px 4px rgba(0,0,0,0.7),' +
          '0 12px 28px rgba(0,0,0,0.55),' +
          '0 40px 80px rgba(0,0,0,0.4)',
        ...style,
      }}
    >
      {/* Top chrome edge-light strip */}
      <span
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: 2,
          left: 24,
          right: 24,
          height: 1,
          background:
            'linear-gradient(90deg, transparent 0%, rgba(230,230,230,0.18) 20%, rgba(230,230,230,0.32) 50%, rgba(230,230,230,0.18) 80%, transparent 100%)',
          pointerEvents: 'none',
          zIndex: 3,
        }}
      />

      {/* Top-right corner key light */}
      <span
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          width: 140,
          height: 60,
          background: 'radial-gradient(ellipse at 80% 0%, rgba(255,255,255,0.05) 0%, transparent 70%)',
          pointerEvents: 'none',
          borderRadius: 'var(--radius-card)',
          zIndex: 1,
        }}
      />

      {/* Brushed-aluminum stripe header */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: STRIPE_H,
          background:
            'repeating-linear-gradient(90deg, rgba(255,255,255,0.025) 0 1px, transparent 1px 3px),' +
            'linear-gradient(180deg, #1F1F1F 0%, #181818 50%, #141414 100%)',
          borderBottom: '1px solid rgba(0,0,0,0.7)',
          boxShadow:
            'inset 0 1px 0 rgba(255,255,255,0.10),' +
            'inset 0 -2px 4px rgba(0,0,0,0.4),' +
            '0 1px 0 rgba(255,255,255,0.04)',
          display: 'flex',
          alignItems: 'center',
          padding: `0 ${stripePadX}px`,
          gap: 12,
          overflow: 'hidden',
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          textTransform: 'uppercase',
          letterSpacing: '0.66px',
          color: 'var(--color-silver)',
          zIndex: 2,
        }}
      >
        <span
          style={{
            color: 'var(--color-chrome)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {kicker}
        </span>
        {serial && (
          <span
            style={{
              marginLeft: 'auto',
              color: 'var(--color-silver-mute)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {serial}
          </span>
        )}
        {stateLed && stateLabel && (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              whiteSpace: 'nowrap',
              flexShrink: 0,
              marginLeft: serial ? undefined : 'auto',
            }}
          >
            <Led color={stateLed} pulse />
            <span style={{ color: LED_VARS[stateLed], textShadow: '0 0 4px currentColor' }}>
              {stateLabel}
            </span>
          </span>
        )}
        {/* Stripe bottom edge-light */}
        <span
          aria-hidden="true"
          style={{
            position: 'absolute',
            left: 8,
            right: 8,
            bottom: -1,
            height: 1,
            background: 'linear-gradient(90deg, transparent, rgba(230,230,230,0.22), transparent)',
            pointerEvents: 'none',
          }}
        />
      </div>

      {showBolts && <HexBoltSet size={boltSize} inset={HEX_BOLT_INSET} />}

      {/* Body - clears the stripe via top padding derived from the stripe height */}
      <div
        style={{
          padding: `${STRIPE_H + 12}px ${bodyPadding}px ${bodyPadding}px`,
          position: 'relative',
          zIndex: 2,
        }}
      >
        {children}
      </div>
    </div>
  );
}
