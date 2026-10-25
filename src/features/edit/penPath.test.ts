import { beforeEach, describe, expect, it } from 'vitest';

import { useAppStore } from '@/store/appStore';

import { cancelPenPath, dedupeAnchors, finishPenPath, undoPenAnchor } from './penPath';

describe('penPath', () => {
  beforeEach(() => {
    useAppStore.setState(useAppStore.getInitialState(), true);
    useAppStore.getState().setCurrentImage('img.png', 'C:/img.png');
  });

  it('drops the duplicate anchor a double-click adds', () => {
    expect(dedupeAnchors([0, 0, 10, 10, 10.2, 10.1, 20, 20])).toEqual([0, 0, 10, 10, 20, 20]);
  });

  it('commits the draft as a selected path layer, with the current style', () => {
    useAppStore.getState().setEditShapeStyle({ stroke: '#123456', strokeWidth: 7 });
    useAppStore.getState().setEditPenSmooth(true);
    useAppStore.getState().setEditPenDraft([0, 0, 10, 0, 10, 10]);

    expect(finishPenPath(true)).toBe(true);
    const state = useAppStore.getState();
    const path = state.editLayers.at(-1)!;
    expect(path.data).toMatchObject({ kind: 'path', closed: true, stroke: '#123456', strokeWidth: 7 });
    expect(path.data.tension).toBeGreaterThan(0);
    expect(state.selectedEditLayerId).toBe(path.id);
    expect(state.editPenDraft).toBeNull();
    expect(state.editHistory.at(-1)?.action).toBe('Add closed path');
  });

  it('keeps a one-point draft instead of committing it', () => {
    useAppStore.getState().setEditPenDraft([5, 5, 5.1, 5]);
    expect(finishPenPath(false)).toBe(false);
    expect(useAppStore.getState().editPenDraft).toEqual([5, 5, 5.1, 5]);
  });

  it('removes anchors one at a time, then cancels', () => {
    useAppStore.getState().setEditPenDraft([0, 0, 1, 1]);
    undoPenAnchor();
    expect(useAppStore.getState().editPenDraft).toEqual([0, 0]);
    undoPenAnchor();
    expect(useAppStore.getState().editPenDraft).toBeNull();

    useAppStore.getState().setEditPenDraft([0, 0, 1, 1]);
    cancelPenPath();
    expect(useAppStore.getState().editPenDraft).toBeNull();
  });

  it('abandons the draft when another tool is picked', () => {
    useAppStore.getState().setActiveEditTool('pen');
    useAppStore.getState().setEditPenDraft([0, 0, 1, 1]);
    useAppStore.getState().setActiveEditTool('pen');
    expect(useAppStore.getState().editPenDraft).not.toBeNull();
    useAppStore.getState().setActiveEditTool('move');
    expect(useAppStore.getState().editPenDraft).toBeNull();
  });
});
