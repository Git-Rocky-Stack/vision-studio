import { beforeEach, describe, expect, it } from 'vitest';

import { useAppStore } from '@/store/appStore';

import { brushSizeStep, handleEditToolShortcut } from './useEditToolShortcuts';

// Unit project (node): a plain event-shaped object, aimed at no element.
const key = (k: string, init: { altKey?: boolean } = {}) =>
  ({ key: k, ctrlKey: false, metaKey: false, altKey: false, target: null, ...init }) as unknown as KeyboardEvent;

describe('handleEditToolShortcut', () => {
  beforeEach(() => {
    useAppStore.setState(useAppStore.getInitialState(), true);
    useAppStore.getState().setCurrentImage('img.png', 'C:/img.png');
  });

  it('steps the brush size with [ and ] for sized tools only', () => {
    useAppStore.getState().setActiveEditTool('clone');
    useAppStore.getState().setEditBrushSize(20);
    expect(handleEditToolShortcut(key(']'))).toBe(true);
    expect(useAppStore.getState().editBrushSize).toBe(25);
    expect(handleEditToolShortcut(key('['))).toBe(true);
    expect(useAppStore.getState().editBrushSize).toBe(20);

    useAppStore.getState().setActiveEditTool('move');
    expect(handleEditToolShortcut(key(']'))).toBe(false);
    expect(useAppStore.getState().editBrushSize).toBe(20);
  });

  it('never steps the size below 1', () => {
    useAppStore.getState().setActiveEditTool('brush');
    useAppStore.getState().setEditBrushSize(1);
    handleEditToolShortcut(key('['));
    expect(useAppStore.getState().editBrushSize).toBe(1);
  });

  it('uses finer steps at small sizes', () => {
    expect(brushSizeStep(4)).toBe(1);
    expect(brushSizeStep(30)).toBe(5);
    expect(brushSizeStep(80)).toBe(10);
    expect(brushSizeStep(250)).toBe(25);
  });

  it('gives an unfinished pen path Enter, Backspace and Escape', () => {
    useAppStore.getState().setActiveEditTool('pen');
    useAppStore.getState().setEditPenDraft([0, 0, 10, 10, 20, 0]);
    expect(handleEditToolShortcut(key('Backspace'))).toBe(true);
    expect(useAppStore.getState().editPenDraft).toEqual([0, 0, 10, 10]);
    expect(handleEditToolShortcut(key('Enter'))).toBe(true);
    expect(useAppStore.getState().editLayers.at(-1)?.type).toBe('shape');

    useAppStore.getState().setEditPenDraft([5, 5]);
    expect(handleEditToolShortcut(key('Escape'))).toBe(true);
    expect(useAppStore.getState().editPenDraft).toBeNull();
  });

  it('leaves Enter and Escape alone without a pen draft', () => {
    useAppStore.getState().setActiveEditTool('pen');
    expect(handleEditToolShortcut(key('Enter'))).toBe(false);
    expect(handleEditToolShortcut(key('Escape'))).toBe(false);
  });

  it('ignores Alt chords, so Alt+click sampling never switches tools', () => {
    expect(handleEditToolShortcut(key('s', { altKey: true }))).toBe(false);
    expect(useAppStore.getState().activeEditTool).toBe('move');
  });
});
