import type { CSSProperties } from 'react';

type Corner = 'tl' | 'tr' | 'bl' | 'br';

/**
 * Default corner inset (px) for a HexBolt. Exported as the single source of
 * truth so consumers (e.g. Faceplate stripe clearance) can derive geometry
 * from bolt placement rather than re-hardcoding the magic number.
 */
export const HEX_BOLT_INSET = 10;

interface HexBoltProps {
  corner: Corner;
  size?: number;
  inset?: number;
}

const HEX_CLIP = 'polygon(25% 0,75% 0,100% 50%,75% 100%,25% 100%,0 50%)';

/**
 * Stout machined socket-cap bolt: directional-lit hex head + Allen-recess inner
 * hex + countersunk panel halo. Mirrors the website HexBolt. Place at faceplate
 * corners for the rack-mount chassis cue.
 */
export function HexBolt({ corner, size = 20, inset = HEX_BOLT_INSET }: HexBoltProps) {
  const positionStyle: CSSProperties = {
    ...(corner.startsWith('t') ? { top: inset } : { bottom: inset }),
    ...(corner.endsWith('l') ? { left: inset } : { right: inset }),
  };

  return (
    <span
      aria-hidden="true"
      style={{
        position: 'absolute',
        width: size,
        height: size,
        zIndex: 5,
        background:
          'radial-gradient(circle at 50% 50%, transparent 62%, rgba(255,255,255,0.04) 68%, transparent 75%),' +
          'radial-gradient(circle at 28% 22%, #a4a4a4 0%, #7c7c7c 12%, #525252 30%, #323232 55%, #181818 80%, #0a0a0a 100%)',
        clipPath: HEX_CLIP,
        filter:
          'drop-shadow(0 2px 3px rgba(0,0,0,0.95)) drop-shadow(0 1px 1px rgba(0,0,0,0.7)) drop-shadow(0 0 4px rgba(0,0,0,0.5))',
        ...positionStyle,
      }}
    >
      {/* Inner Allen socket recess */}
      <span
        style={{
          position: 'absolute',
          inset: '23%',
          background: 'radial-gradient(circle at 72% 78%, #1c1c1c 0%, #0a0a0a 35%, #000 100%)',
          clipPath: HEX_CLIP,
        }}
      />
    </span>
  );
}

/** All four corner bolts at once. */
export function HexBoltSet({ size, inset }: { size?: number; inset?: number }) {
  return (
    <>
      <HexBolt corner="tl" size={size} inset={inset} />
      <HexBolt corner="tr" size={size} inset={inset} />
      <HexBolt corner="bl" size={size} inset={inset} />
      <HexBolt corner="br" size={size} inset={inset} />
    </>
  );
}
