import { useEffect } from 'react';

import { useAppStore } from '@/store/appStore';
import type { AppState } from '@/store/appStore.types';
import type { EditTool } from '@/types/editor';
import { isEditableTarget } from '@/utils/isEditableTarget';

import { cancelPenPath, finishPenPath, undoPenAnchor } from './penPath';

/** Single-letter edit tool shortcuts (Photoshop letters where they are free). */
export const EDIT_TOOL_SHORTCUTS: Record<string, EditTool> = {
  v: 'move',
  t: 'scale',
  c: 'crop',
  r: 'rotate',
  b: 'brush',
  e: 'eraser',
  s: 'clone',
  j: 'heal',
  x: 'text',
  u: 'shape',
  p: 'pen',
  h: 'hand',
  z: 'zoom',
  i: 'eyedropper',
};

/** Tools sized by editBrushSize, which `[` and `]` step. */
const SIZED_TOOLS: ReadonlySet<EditTool> = new Set(['brush', 'eraser', 'clone', 'heal']);

/** `[` / `]` brush-size step: finer at small sizes, coarser at large ones. */
export function brushSizeStep(size: number): number {
  if (size < 10) return 1;
  if (size < 50) return 5;
  if (size < 100) return 10;
  return 25;
}

/** Region-mask tool keys, active while region mode is on. `i` inverts. */
export const REGION_TOOL_SHORTCUTS: Record<string, AppState['activeMaskTool'] | 'invert'> = {
  v: 'select',
  r: 'rectangle',
  l: 'polygon',
  b: 'brush',
  e: 'erase',
  i: 'invert',
};

export function handleEditToolShortcut(event: KeyboardEvent): boolean {
  if (event.ctrlKey || event.metaKey || event.altKey) return false;
  if (isEditableTarget(event.target)) return false;
  const key = event.key.toLowerCase();
  const state = useAppStore.getState();

  if (state.regionMode) {
    const regionTool = REGION_TOOL_SHORTCUTS[key];
    if (!regionTool) return false;
    if (regionTool === 'invert') state.toggleMaskInverted();
    else state.setActiveMaskTool(regionTool);
    return true;
  }

  // An unfinished Pen path takes Enter, Escape and Backspace first.
  if (state.activeEditTool === 'pen' && state.editPenDraft) {
    if (event.key === 'Enter') {
      finishPenPath(false);
      return true;
    }
    if (event.key === 'Escape') {
      cancelPenPath();
      return true;
    }
    if (event.key === 'Backspace' || event.key === 'Delete') {
      undoPenAnchor();
      return true;
    }
  }

  if ((event.key === '[' || event.key === ']') && SIZED_TOOLS.has(state.activeEditTool)) {
    const size = state.editBrushSize;
    state.setEditBrushSize(event.key === ']' ? size + brushSizeStep(size) : size - brushSizeStep(size - 1));
    return true;
  }

  const tool = EDIT_TOOL_SHORTCUTS[key];
  if (!tool) return false;
  state.setActiveEditTool(tool);
  return true;
}

/** Mounted by EditCanvas, so the keys work in the editor and nowhere else. */
export function useEditToolShortcuts(): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (handleEditToolShortcut(event)) event.preventDefault();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
