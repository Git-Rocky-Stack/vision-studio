/**
 * Converts a hex color string to an rgba() CSS value with the given opacity.
 * Replaces the pattern `${hexColor}XX` which appends hex opacity to hex colors.
 */
export function hexToRgba(hex: string, opacity: number): string {
  // Remove # prefix
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

/**
 * Any CSS colour (hex, rgb(), or a `var(--color-*)` token) at `opacity` over
 * transparent. Unlike hexToRgba this never parses the string, so token
 * colours like `var(--color-feature-03)` keep working instead of becoming
 * rgba(NaN, NaN, NaN).
 */
export function withAlpha(color: string, opacity: number): string {
  const percent = Math.round(Math.max(0, Math.min(1, opacity)) * 1000) / 10;
  return `color-mix(in srgb, ${color} ${percent}%, transparent)`;
}
