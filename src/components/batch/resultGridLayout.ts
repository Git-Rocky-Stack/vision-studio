import { useEffect, useState, type RefObject } from 'react';

export type ResultGridViewMode = 'grid' | 'list' | 'large';

/**
 * Column count for the results grid, from the width the grid actually has.
 *
 * The virtualizer packs `columns` results into each virtual row, the row is
 * rendered as a CSS grid of exactly that many tracks, and the arrow keys step
 * Up/Down by the same number. All three read this one value, so a row can
 * never wrap inside itself (as it did when rows held 3 results while viewport
 * breakpoints drew 2 tracks) and Up/Down always lands on the card visually
 * above or below.
 *
 * Thresholds are container widths (the panel shares the window with docks,
 * so the viewport says little): a grid card needs ~260px, a large card ~400px.
 */
export const RESULT_GRID_MIN_CARD_PX = { grid: 260, large: 400 } as const;
export const RESULT_GRID_GAP_PX = { grid: 12, large: 16 } as const;
const MAX_COLUMNS = { grid: 3, large: 2 } as const;
const MIN_COLUMNS = { grid: 2, large: 1 } as const;

export function resultGridColumns(viewMode: ResultGridViewMode, width: number): number {
  if (viewMode === 'list') return 1;
  // Not measured yet (first paint, or no layout engine): the widest layout,
  // which is what the grid showed before it was measured.
  if (!(width > 0)) return MAX_COLUMNS[viewMode];
  const fit = Math.floor((width + RESULT_GRID_GAP_PX[viewMode]) / (RESULT_GRID_MIN_CARD_PX[viewMode] + RESULT_GRID_GAP_PX[viewMode]));
  return Math.min(MAX_COLUMNS[viewMode], Math.max(MIN_COLUMNS[viewMode], fit));
}

/** Content-box width of an element, kept current with a ResizeObserver. */
export function useContentWidth(ref: RefObject<HTMLElement | null>, remountKey?: unknown): number {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const readWidth = () => {
      const style = getComputedStyle(element);
      const padding = (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0);
      return Math.max(0, element.clientWidth - padding);
    };
    setWidth(readWidth());
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver((entries) => {
      const measured = entries[0]?.contentRect.width;
      setWidth(typeof measured === 'number' ? measured : readWidth());
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref, remountKey]);
  return width;
}
