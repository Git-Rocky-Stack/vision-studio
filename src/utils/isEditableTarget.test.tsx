import { describe, expect, it } from 'vitest';

import { isEditableTarget } from './isEditableTarget';

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
