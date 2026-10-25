/**
 * Resolve a CSS colour custom property (e.g. `--color-status-error`) to its
 * computed value, for drawing surfaces that cannot evaluate `var()` (Konva,
 * SVG presentation attributes, canvas). Falls back to the `var()` reference
 * when the token is not defined (tests, or before styles load), so callers
 * still name the token instead of a raw hex.
 */
export function resolveCssColor(token: `--${string}`, root?: Element | null): string {
  const fallback = `var(${token})`;
  if (typeof window === 'undefined' || typeof getComputedStyle !== 'function') {
    return fallback;
  }
  const element = root ?? document.documentElement;
  if (!element) return fallback;
  const value = getComputedStyle(element).getPropertyValue(token).trim();
  return value || fallback;
}
