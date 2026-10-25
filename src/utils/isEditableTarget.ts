/**
 * True when a keyboard event is aimed at something that takes typed input,
 * so single-letter and undo shortcuts must not fire: text fields, selects,
 * and any contentEditable surface (rich text, inline rename).
 */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!target || typeof HTMLElement === 'undefined' || !(target instanceof HTMLElement)) {
    return false;
  }
  if (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  ) {
    return true;
  }
  if (target.isContentEditable) return true;
  const editable = target.getAttribute('contenteditable');
  return editable !== null && editable !== 'false';
}
