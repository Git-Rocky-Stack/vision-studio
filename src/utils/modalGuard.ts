/**
 * Shared "a modal dialog is open" guard for window- and document-level
 * keyboard shortcuts.
 *
 * Every modal in the app marks itself `aria-modal="true"` (required for the
 * dialog pattern anyway), so the DOM is the single source of truth: it covers
 * dialogs from every owner, including ones that do not use useDialogFocus.
 * While one is open, workspace shortcuts (timeline S / Delete, mask-tool
 * letters, Pen Escape, zoom keys) must not act on the surface behind it.
 */
export const MODAL_DIALOG_SELECTOR = '[aria-modal="true"]';

/** True while any modal dialog is mounted in the document. */
export function isModalDialogOpen(doc: Document | undefined = globalThis.document): boolean {
  if (!doc) return false;
  return doc.querySelector(MODAL_DIALOG_SELECTOR) !== null;
}

/**
 * True when a workspace-level keyboard shortcut must ignore this event because
 * a modal dialog owns the keyboard. Handlers that belong to the dialog itself
 * (e.g. the image preview's own arrow keys) must not call this.
 */
export function isWorkspaceShortcutBlocked(event: KeyboardEvent): boolean {
  if (isModalDialogOpen()) return true;
  // A dialog that consumed the key (Escape closing it) stops propagation, but
  // a handler on the same node may still run; honour an explicit claim too.
  return event.defaultPrevented && event.key === 'Escape';
}
