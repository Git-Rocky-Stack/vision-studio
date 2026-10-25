import { useAppStore } from '@/store/appStore';

import { createShapeLayer, pathDataFromAnchors } from './shapeLayers';

/**
 * Pen tool actions on the store's draft path, shared by the canvas (clicks,
 * double-click), the keyboard (Enter, Escape, Backspace) and the tool
 * options (Finish, Cancel).
 */

/** Drop consecutive anchors closer than half a pixel (a double-click adds two). */
export function dedupeAnchors(anchors: number[]): number[] {
  const result: number[] = [];
  for (let i = 0; i + 1 < anchors.length; i += 2) {
    const x = anchors[i];
    const y = anchors[i + 1];
    const last = result.length;
    if (last >= 2 && Math.hypot(x - result[last - 2], y - result[last - 1]) < 0.5) continue;
    result.push(x, y);
  }
  return result;
}

/**
 * Commit the draft as a path layer and select it. Returns false (and keeps
 * the draft) when it has fewer than two distinct anchors.
 */
export function finishPenPath(closed: boolean): boolean {
  const state = useAppStore.getState();
  const anchors = dedupeAnchors(state.editPenDraft ?? []);
  const data = pathDataFromAnchors(anchors, closed, state.editPenSmooth, state.editShapeStyle);
  if (!data) return false;
  const layer = createShapeLayer(data);
  state.addEditLayer(layer, data.closed ? 'Add closed path' : 'Add path');
  state.setSelectedEditLayerId(layer.id);
  state.setEditPenDraft(null);
  return true;
}

export function cancelPenPath(): void {
  useAppStore.getState().setEditPenDraft(null);
}

/** Remove the last anchor; removing the only one cancels the path. */
export function undoPenAnchor(): void {
  const state = useAppStore.getState();
  const draft = state.editPenDraft;
  if (!draft) return;
  state.setEditPenDraft(draft.length > 2 ? draft.slice(0, -2) : null);
}
