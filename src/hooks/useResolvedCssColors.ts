import { useEffect, useState } from 'react';

import { resolveCssColor } from '@/utils/resolveCssColor';

type ColorTokens = Record<string, `--${string}`>;

function resolveAll<T extends ColorTokens>(tokens: T): { [K in keyof T]: string } {
  const resolved = {} as { [K in keyof T]: string };
  for (const key of Object.keys(tokens) as Array<keyof T>) {
    resolved[key] = resolveCssColor(tokens[key]);
  }
  return resolved;
}

/**
 * Computed values of colour tokens, for drawing surfaces that cannot evaluate
 * var() (Konva, canvas). Re-resolved whenever the document's data-theme
 * changes, so a theme switch - including a "system" preference flipping -
 * repaints with the new palette. `tokens` should be a stable (module-level)
 * object.
 */
export function useResolvedCssColors<T extends ColorTokens>(tokens: T): { [K in keyof T]: string } {
  const [colors, setColors] = useState(() => resolveAll(tokens));

  useEffect(() => {
    setColors(resolveAll(tokens));
    if (typeof MutationObserver === 'undefined' || typeof document === 'undefined') return;
    const observer = new MutationObserver(() => setColors(resolveAll(tokens)));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, [tokens]);

  return colors;
}
