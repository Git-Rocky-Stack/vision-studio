/**
 * Hardware-primitive token map.
 *
 * Mirrors the Vision Studio-X website's Pioneer-DJ LED + capability vocabulary,
 * but resolves to the app's canonical CSS custom properties (aliased in
 * index.css) rather than hard-coded hexes. This keeps a single source of truth:
 * change a color in the @theme block and every hardware primitive follows.
 *
 * Each value is a `var(--color-led-*)` / `var(--color-cap-*)` reference, usable
 * directly as a CSS color, box-shadow color, or text-shadow color.
 */

export const LED_VARS = {
  rec: 'var(--color-led-rec)',
  cue: 'var(--color-led-cue)',
  play: 'var(--color-led-play)',
  jog: 'var(--color-led-jog)',
  fx: 'var(--color-led-fx)',
  time: 'var(--color-led-time)',
} as const;

export const CAP_VARS = {
  image: 'var(--color-cap-image)',
  video: 'var(--color-cap-video)',
  edit: 'var(--color-cap-edit)',
  local: 'var(--color-cap-local)',
  cloud: 'var(--color-cap-cloud)',
} as const;

export type LedColor = keyof typeof LED_VARS;
export type CapabilityColor = keyof typeof CAP_VARS;

/**
 * Resolve an LED or capability key to its CSS color variable. Any other string
 * (a raw CSS color or `var(--color-category-*)`) passes through unchanged, so
 * category/feature hues can drive a pinpoint LED without leaving the LED idiom.
 */
export function resolveHardwareColor(color: LedColor | CapabilityColor | (string & {})): string {
  if (color in LED_VARS) return LED_VARS[color as LedColor];
  if (color in CAP_VARS) return CAP_VARS[color as CapabilityColor];
  return color;
}
