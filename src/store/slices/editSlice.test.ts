import { describe, expect, it, beforeEach } from 'vitest';

import { useAppStore } from '@/store/appStore';
import { TEXT_LAYER_DEFAULT_STYLE, createTextLayer } from '@/features/edit/textLayers';
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

describe('edit layer selection (#32)', () => {
  beforeEach(resetStore);

  function seedTextLayer(text = 'hello') {
    const layer = createTextLayer({
      text,
      position: { x: 10, y: 20 },
      style: TEXT_LAYER_DEFAULT_STYLE,
    });
    useAppStore.getState().addEditLayer(layer);
    return layer;
  }

  it('starts with no selected layer', () => {
    expect(useAppStore.getState().selectedEditLayerId).toBeNull();
  });

  it('selects and clears a layer id', () => {
    const layer = seedTextLayer();
    useAppStore.getState().setSelectedEditLayerId(layer.id);
    expect(useAppStore.getState().selectedEditLayerId).toBe(layer.id);
    useAppStore.getState().setSelectedEditLayerId(null);
    expect(useAppStore.getState().selectedEditLayerId).toBeNull();
  });

  it('clears the selection when the selected layer is removed', () => {
    const layer = seedTextLayer();
    useAppStore.getState().setSelectedEditLayerId(layer.id);
    useAppStore.getState().removeEditLayer(layer.id);
    expect(useAppStore.getState().selectedEditLayerId).toBeNull();
    expect(useAppStore.getState().editLayers).toHaveLength(0);
  });

  it('keeps the selection when a different layer is removed', () => {
    const kept = seedTextLayer('kept');
    const removed = seedTextLayer('removed');
    useAppStore.getState().setSelectedEditLayerId(kept.id);
    useAppStore.getState().removeEditLayer(removed.id);
    expect(useAppStore.getState().selectedEditLayerId).toBe(kept.id);
  });

  it('clears the selection when the edit image changes (layers reset)', () => {
    const layer = seedTextLayer();
    useAppStore.getState().setSelectedEditLayerId(layer.id);
    useAppStore.getState().setCurrentImage('preview.png', 'C:/assets/preview.png');
    expect(useAppStore.getState().selectedEditLayerId).toBeNull();
  });
});

describe('edit image intrinsic size (#32)', () => {
  beforeEach(resetStore);

  it('stores and clears the intrinsic size', () => {
    useAppStore.getState().setCurrentImageSize({ width: 640, height: 480 });
    expect(useAppStore.getState().currentImageSize).toEqual({ width: 640, height: 480 });
    useAppStore.getState().setCurrentImageSize(null);
    expect(useAppStore.getState().currentImageSize).toBeNull();
  });

  it('clears the stale size when the edit image changes', () => {
    useAppStore.getState().setCurrentImageSize({ width: 640, height: 480 });
    useAppStore.getState().setCurrentImage('preview.png', 'C:/assets/preview.png');
    expect(useAppStore.getState().currentImageSize).toBeNull();
  });
});
