import { describe, expect, it, beforeEach } from 'vitest';

import { useAppStore } from '@/store/appStore';
import type { RegionMask } from '@/types/project';

const MASK: RegionMask = {
  type: 'brush',
  points: [
    { x: 4, y: 4 },
    { x: 20, y: 20 },
  ],
  bounds: { x: 4, y: 4, width: 16, height: 16 },
  brushSize: 32,
  featherRadius: 2,
  blendEdges: true,
};

function resetStore() {
  useAppStore.setState(useAppStore.getInitialState());
}

describe('edit AI mask state (#34 PR2)', () => {
  beforeEach(resetStore);

  it('stores and clears the mask', () => {
    useAppStore.getState().setEditAiMask(MASK);
    expect(useAppStore.getState().editAiMask).toEqual(MASK);
    useAppStore.getState().setEditAiMask(null);
    expect(useAppStore.getState().editAiMask).toBeNull();
  });

  it('clears the mask when the edit image changes (stale coordinates)', () => {
    useAppStore.getState().setEditAiMask(MASK);
    useAppStore.getState().setCurrentImage('preview.png', 'C:/assets/preview.png');
    expect(useAppStore.getState().editAiMask).toBeNull();
  });

  it('tracks tool, brush size and drawing mode', () => {
    expect(useAppStore.getState().editAiMaskTool).toBe('brush');
    expect(useAppStore.getState().editAiMaskBrushSize).toBe(40);
    expect(useAppStore.getState().editAiMaskDrawing).toBe(false);
    useAppStore.getState().setEditAiMaskTool('rectangle');
    useAppStore.getState().setEditAiMaskBrushSize(80);
    useAppStore.getState().setEditAiMaskDrawing(true);
    expect(useAppStore.getState().editAiMaskTool).toBe('rectangle');
    expect(useAppStore.getState().editAiMaskBrushSize).toBe(80);
    expect(useAppStore.getState().editAiMaskDrawing).toBe(true);
  });
});
