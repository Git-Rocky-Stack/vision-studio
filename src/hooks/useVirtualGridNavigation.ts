import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

/**
 * Roving-tabindex keyboard navigation for a virtualized card grid.
 *
 * One card holds tabIndex 0 (the "active" card), the rest -1, so Tab enters
 * the grid once and leaves it once. Arrow keys move by one card (Left/Right)
 * or one row (Up/Down), Home/End jump to the first/last card. Because the
 * grid is virtualized the target card may not be mounted yet: the hook asks
 * the virtualizer to scroll its row into view, then focuses the card on the
 * next frames once it renders.
 *
 * Cards are found by `data-nav-id`, so the hook needs no per-card refs.
 */
export interface VirtualGridNavigationOptions {
  /** Card ids in visual (reading) order. */
  ids: readonly string[];
  /** Cards per virtual row (Up/Down step). */
  columns: number;
  /** Scroll container that holds the rendered cards. */
  containerRef: RefObject<HTMLElement | null>;
  /** Bring a virtual row into view (e.g. rowVirtualizer.scrollToIndex). */
  scrollToRow: (rowIndex: number) => void;
}

export interface VirtualGridNavigation {
  /** The card that currently holds tabIndex 0. */
  activeId: string | null;
  /** Make a card the tab stop (stable; call it from a card's onFocus). */
  activate: (id: string) => void;
  /** Props to spread on each card. */
  getItemProps: (id: string) => { tabIndex: 0 | -1; 'data-nav-id': string; onFocus: () => void };
  /**
   * Handles a navigation key pressed on a card. Returns true when the key was
   * a navigation key (the caller should preventDefault), false otherwise.
   */
  handleNavigationKey: (id: string, event: { key: string; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean }) => boolean;
}

/** Frames to wait for a scrolled-to card to mount before giving up. */
const MAX_FOCUS_FRAMES = 20;

export function targetIndexForKey(key: string, index: number, count: number, columns: number): number | null {
  if (count === 0) return null;
  const step = Math.max(1, columns);
  switch (key) {
    case 'ArrowRight':
      return Math.min(count - 1, index + 1);
    case 'ArrowLeft':
      return Math.max(0, index - 1);
    case 'ArrowDown':
      return Math.min(count - 1, index + step);
    case 'ArrowUp':
      return Math.max(0, index - step);
    case 'Home':
      return 0;
    case 'End':
      return count - 1;
    default:
      return null;
  }
}

function findCard(container: HTMLElement | null, id: string): HTMLElement | null {
  if (!container) return null;
  for (const element of container.querySelectorAll<HTMLElement>('[data-nav-id]')) {
    if (element.dataset.navId === id) return element;
  }
  return null;
}

export function useVirtualGridNavigation({
  ids,
  columns,
  containerRef,
  scrollToRow,
}: VirtualGridNavigationOptions): VirtualGridNavigation {
  const [requestedId, setRequestedId] = useState<string | null>(null);
  const activeId = requestedId !== null && ids.includes(requestedId) ? requestedId : (ids[0] ?? null);
  const frameRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    },
    [],
  );

  const focusWhenMounted = useCallback(
    (id: string) => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      let frames = 0;
      const attempt = () => {
        frameRef.current = null;
        const card = findCard(containerRef.current, id);
        if (card) {
          card.focus({ preventScroll: false });
          return;
        }
        frames += 1;
        if (frames < MAX_FOCUS_FRAMES) frameRef.current = requestAnimationFrame(attempt);
      };
      // Already mounted (the common case): focus synchronously so the next
      // key press lands on it; otherwise wait for the virtualizer to render.
      const mounted = findCard(containerRef.current, id);
      if (mounted) mounted.focus({ preventScroll: false });
      else frameRef.current = requestAnimationFrame(attempt);
    },
    [containerRef],
  );

  const handleNavigationKey = useCallback<VirtualGridNavigation['handleNavigationKey']>(
    (id, event) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return false;
      const index = ids.indexOf(id);
      if (index === -1) return false;
      const target = targetIndexForKey(event.key, index, ids.length, columns);
      if (target === null) return false;
      const targetId = ids[target];
      setRequestedId(targetId);
      if (target !== index) {
        scrollToRow(Math.floor(target / Math.max(1, columns)));
        focusWhenMounted(targetId);
      }
      return true;
    },
    [ids, columns, scrollToRow, focusWhenMounted],
  );

  const getItemProps = useCallback<VirtualGridNavigation['getItemProps']>(
    (id) => ({
      tabIndex: id === activeId ? 0 : -1,
      'data-nav-id': id,
      onFocus: () => setRequestedId(id),
    }),
    [activeId],
  );

  return { activeId, activate: setRequestedId, getItemProps, handleNavigationKey };
}
