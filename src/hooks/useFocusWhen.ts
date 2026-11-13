import { useEffect, type RefObject } from 'react';

/**
 * Moves focus to `ref` when `active` turns truthy (including on mount while it
 * already is) or changes to another truthy value (an id: a different row's
 * editor opened), for an inline editor the user has just opened: a rename
 * field that replaces the name it edits, a popover's search box, the next
 * step's primary field.
 *
 * This is the focus-management half of those patterns, not the `autoFocus`
 * attribute: the control that opened the editor is usually unmounted by it,
 * so without moving focus the keyboard user is dropped onto <body>. Focus only
 * ever moves in response to the user's own action, never on page load (what
 * jsx-a11y's no-autofocus guards against). A modal's initial focus belongs to
 * useDialogFocus's `initialFocusRef`, not here.
 */
export function useFocusWhen(
  ref: RefObject<HTMLElement | null>,
  active: boolean | string | number | null | undefined,
  options: { select?: boolean } = {},
): void {
  const { select = false } = options;
  useEffect(() => {
    if (!active) return;
    const element = ref.current;
    if (!element) return;
    element.focus({ preventScroll: true });
    if (select && (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)) {
      element.select();
    }
  }, [active, ref, select]);
}
