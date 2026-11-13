import { useEffect, useRef, type RefObject } from 'react';

/**
 * Shared modal-dialog keyboard contract (WAI-ARIA dialog pattern):
 *
 * - On open, remembers the element that had focus and moves focus into the
 *   dialog (an explicit initial target, else the first tabbable control, else
 *   the container itself).
 * - Tab / Shift+Tab cycle inside the dialog and never escape to the page
 *   behind it; focus that has drifted outside is pulled back in.
 * - Escape closes the topmost dialog only and stops propagating, so
 *   window-level workspace shortcuts (Pen path cancel, timeline keys) never
 *   see the keystroke that closed the dialog.
 * - On close, focus returns to the element that opened it.
 *
 * Nested dialogs (a confirm over a modal) form a stack: only the topmost one
 * handles Tab and Escape.
 */

export const TABBABLE_SELECTOR = [
  'a[href]',
  'area[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'iframe',
  'audio[controls]',
  'video[controls]',
  '[contenteditable]:not([contenteditable="false"])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/** Tabbable descendants in DOM order, skipping hidden, inert and negative-tabindex nodes. */
export function getTabbableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(TABBABLE_SELECTOR)).filter(
    (el) =>
      el.tabIndex >= 0 &&
      !el.closest('[hidden], [inert], [aria-hidden="true"]') &&
      el.getAttribute('disabled') === null,
  );
}

const dialogStack: symbol[] = [];

/** Test seam: number of dialogs currently managed by the hook. */
export function getManagedDialogCount(): number {
  return dialogStack.length;
}

export interface UseDialogFocusOptions {
  /** Whether the dialog is currently open. */
  open: boolean;
  /**
   * Called when Escape is pressed while this dialog is topmost. Omit to make
   * Escape inert (e.g. while a non-cancellable operation runs); the key is
   * still contained so it cannot reach the workspace behind the dialog.
   */
  onEscape?: () => void;
  /** Element to focus when the dialog opens. */
  initialFocusRef?: RefObject<HTMLElement | null>;
  /** Selector (inside the container) to focus when the dialog opens. */
  initialFocusSelector?: string;
  /** Return focus to the opener on close. Defaults to true. */
  restoreFocus?: boolean;
}

export function useDialogFocus(
  containerRef: RefObject<HTMLElement | null>,
  { open, onEscape, initialFocusRef, initialFocusSelector, restoreFocus = true }: UseDialogFocusOptions,
): void {
  // Callbacks and focus targets live in refs so a parent re-render (a new
  // inline onEscape) never re-runs the open effect and steals focus back.
  const onEscapeRef = useRef(onEscape);
  const initialRef = useRef({ initialFocusRef, initialFocusSelector, restoreFocus });
  useEffect(() => {
    onEscapeRef.current = onEscape;
    initialRef.current = { initialFocusRef, initialFocusSelector, restoreFocus };
  });

  useEffect(() => {
    if (!open) return;
    const token = Symbol('dialog');
    dialogStack.push(token);
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const isTopmost = () => dialogStack[dialogStack.length - 1] === token;

    const focusInitial = () => {
      const container = containerRef.current;
      if (!container || !isTopmost()) return;
      if (container.contains(document.activeElement) && document.activeElement !== container) return;
      const { initialFocusRef: explicitRef, initialFocusSelector: selector } = initialRef.current;
      const target =
        explicitRef?.current ??
        (selector ? container.querySelector<HTMLElement>(selector) : null) ??
        getTabbableElements(container)[0] ??
        container;
      if (target === container && !container.hasAttribute('tabindex')) {
        container.setAttribute('tabindex', '-1');
      }
      target.focus({ preventScroll: true });
    };

    const frame = requestAnimationFrame(focusInitial);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isTopmost()) return;
      const container = containerRef.current;
      if (!container) return;

      if (event.key === 'Escape') {
        // A widget inside the dialog (an open menu) already claimed it.
        if (event.defaultPrevented) return;
        event.stopPropagation();
        const handler = onEscapeRef.current;
        if (handler) {
          event.preventDefault();
          handler();
        }
        return;
      }

      if (event.key !== 'Tab') return;
      const tabbable = getTabbableElements(container);
      if (tabbable.length === 0) {
        event.preventDefault();
        container.focus({ preventScroll: true });
        return;
      }
      const first = tabbable[0];
      const last = tabbable[tabbable.length - 1];
      const active = document.activeElement;
      const outside = !container.contains(active);
      if (event.shiftKey) {
        if (outside || active === first || active === container) {
          event.preventDefault();
          last.focus();
        }
      } else if (outside || active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('keydown', handleKeyDown);
      const index = dialogStack.indexOf(token);
      if (index !== -1) dialogStack.splice(index, 1);
      if (initialRef.current.restoreFocus && opener && opener.isConnected) {
        opener.focus({ preventScroll: true });
      }
    };
  }, [open, containerRef]);
}
