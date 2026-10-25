import { describe, expect, it } from 'vitest';

import { isEditableTarget, ownsNavigationKeys } from './isEditableTarget';

describe('isEditableTarget', () => {
  it('recognises fields, selects and contentEditable', () => {
    expect(isEditableTarget(document.createElement('input'))).toBe(true);
    expect(isEditableTarget(document.createElement('textarea'))).toBe(true);
    expect(isEditableTarget(document.createElement('select'))).toBe(true);
    const rich = document.createElement('div');
    rich.setAttribute('contenteditable', 'true');
    expect(isEditableTarget(rich)).toBe(true);
  });

  it('ignores ordinary elements and non-elements', () => {
    expect(isEditableTarget(document.createElement('button'))).toBe(false);
    const off = document.createElement('div');
    off.setAttribute('contenteditable', 'false');
    expect(isEditableTarget(off)).toBe(false);
    expect(isEditableTarget(window)).toBe(false);
    expect(isEditableTarget(null)).toBe(false);
  });
});

describe('ownsNavigationKeys', () => {
  it('is true for fields and for widgets that handle Space, Home/End and arrows', () => {
    expect(ownsNavigationKeys(document.createElement('input'))).toBe(true);
    expect(ownsNavigationKeys(document.createElement('button'))).toBe(true);
    const link = document.createElement('a');
    link.href = '#x';
    expect(ownsNavigationKeys(link)).toBe(true);
    for (const role of ['slider', 'tab', 'menuitem', 'separator', 'option']) {
      const el = document.createElement('div');
      el.setAttribute('role', role);
      expect(ownsNavigationKeys(el), role).toBe(true);
    }
  });

  it('is false for the page itself and for plain containers', () => {
    expect(ownsNavigationKeys(document.body)).toBe(false);
    expect(ownsNavigationKeys(document.createElement('div'))).toBe(false);
    expect(ownsNavigationKeys(document.createElement('a'))).toBe(false);
    expect(ownsNavigationKeys(null)).toBe(false);
  });
});
