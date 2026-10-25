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

/** Roles whose widgets handle Space, Home/End and the arrow keys themselves. */
const KEY_OWNING_ROLES = new Set([
  'button',
  'checkbox',
  'link',
  'listbox',
  'menu',
  'menuitem',
  'menuitemcheckbox',
  'menuitemradio',
  'option',
  'radio',
  'scrollbar',
  'separator',
  'slider',
  'spinbutton',
  'switch',
  'tab',
  'tablist',
  'tree',
  'treeitem',
]);

/**
 * True when the focused element already gives Space, Enter, Home/End or the
 * arrow keys a meaning of its own - a text field, a button (Space presses it),
 * a link, a slider, a tab, a menu, a focusable resize separator - so a
 * window-wide transport or navigation shortcut must leave the key to it.
 */
export function ownsNavigationKeys(target: EventTarget | null): boolean {
  if (isEditableTarget(target)) return true;
  if (!target || typeof HTMLElement === 'undefined' || !(target instanceof HTMLElement)) {
    return false;
  }
  if (target instanceof HTMLButtonElement) return true;
  if (target instanceof HTMLAnchorElement && target.hasAttribute('href')) return true;
  const role = target.getAttribute('role');
  return role !== null && KEY_OWNING_ROLES.has(role);
}
