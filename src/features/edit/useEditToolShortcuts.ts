import { useEffect } from 'react';

import { useAppStore } from '@/store/appStore';
import type { AppState } from '@/store/appStore.types';
import type { EditTool } from '@/types/editor';
import { isEditableTarget } from '@/utils/isEditableTarget';

/**
 * Single-letter edit tool shortcuts. Only tools that do real work on the
 * canvas get a key; Clone, Heal, Shape and Pen are not implemented yet.
 */
export const EDIT_TOOL_SHORTCUTS: Record<string, EditTool> = {
  v: 'move',
  t: 'scale',
  c: 'crop',
  r: 'rotate',
  b: 'brush',
  e: 'eraser',
  x: 'text',
  h: 'hand',
  z: 'zoom',
  i: 'eyedropper',
};

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
