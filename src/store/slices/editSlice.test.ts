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

describe('edit undo/redo restores state', () => {
  beforeEach(resetStore);

  function textLayer(text: string) {
    return createTextLayer({ text, position: { x: 0, y: 0 }, style: TEXT_LAYER_DEFAULT_STYLE });
  }

  it('undoes and redoes a layer add', () => {
    const layer = textLayer('a');
    useAppStore.getState().addEditLayer(layer);
    expect(useAppStore.getState().canUndo()).toBe(true);

    useAppStore.getState().undo();
    expect(useAppStore.getState().editLayers).toEqual([]);
    expect(useAppStore.getState().canRedo()).toBe(true);

    useAppStore.getState().redo();
    expect(useAppStore.getState().editLayers.map((l) => l.id)).toEqual([layer.id]);
  });

  it('restores a removed layer and drops a stale selection on undo of an add', () => {
    const layer = textLayer('b');
    useAppStore.getState().addEditLayer(layer);
    useAppStore.getState().removeEditLayer(layer.id);
    expect(useAppStore.getState().editLayers).toHaveLength(0);

    useAppStore.getState().undo();
    expect(useAppStore.getState().editLayers).toHaveLength(1);

    useAppStore.getState().setSelectedEditLayerId(layer.id);
    useAppStore.getState().undo();
    expect(useAppStore.getState().selectedEditLayerId).toBeNull();
  });

  it('coalesces a continuous slider drag into one undo step', () => {
    for (const v of [5, 10, 15, 20]) {
      useAppStore.getState().setImageAdjustments({ brightness: v });
    }
    // Original + one coalesced brightness entry.
    expect(useAppStore.getState().editHistory).toHaveLength(2);
    expect(useAppStore.getState().imageAdjustments.brightness).toBe(20);

    useAppStore.getState().undo();
    expect(useAppStore.getState().imageAdjustments.brightness).toBe(0);
  });

  it('does not coalesce different adjustment keys', () => {
    useAppStore.getState().setImageAdjustments({ brightness: 10 });
    useAppStore.getState().setImageAdjustments({ contrast: 10 });
    expect(useAppStore.getState().editHistory).toHaveLength(3);
    useAppStore.getState().undo();
    expect(useAppStore.getState().imageAdjustments).toMatchObject({ brightness: 10, contrast: 0 });
  });

  it('records strokes and filters in history', () => {
    useAppStore.getState().addEditStroke({
      id: 's1',
      tool: 'brush',
      points: [0, 0, 5, 5],
      color: '#ffffff',
      size: 4,
    });
    useAppStore.getState().setEditFilters({ selected: ['noir'] });
    expect(useAppStore.getState().editStrokes).toHaveLength(1);

    useAppStore.getState().undo();
    expect(useAppStore.getState().editFilters.selected).toEqual([]);
    useAppStore.getState().undo();
    expect(useAppStore.getState().editStrokes).toEqual([]);
  });

  it('jumps to an arbitrary history entry', () => {
    useAppStore.getState().addEditLayer(textLayer('1'));
    useAppStore.getState().addEditLayer(textLayer('2'));
    useAppStore.getState().addEditLayer(textLayer('3'));
    useAppStore.getState().jumpToEditHistory(1);
    expect(useAppStore.getState().editLayers).toHaveLength(1);
    expect(useAppStore.getState().editHistoryIndex).toBe(1);
  });

  it('keeps strokes out of the next image', () => {
    useAppStore.getState().addEditStroke({
      id: 's1',
      tool: 'brush',
      points: [0, 0],
      color: '#ffffff',
      size: 4,
    });
    useAppStore.getState().setCurrentImage('next.png', 'C:/next.png');
    expect(useAppStore.getState().editStrokes).toEqual([]);
    expect(useAppStore.getState().editHistory).toEqual([]);
  });
});

describe('retouch, shape and pen state', () => {
  const retouch = {
    id: 'r1',
    tool: 'heal' as const,
    points: [10, 10],
    size: 20,
    hardness: 0.5,
    opacity: 1,
    offset: null,
  };

  beforeEach(() => {
    resetStore();
    useAppStore.getState().setCurrentImage('img.png', 'C:/img.png');
  });

  it('records retouch strokes in history and restores them on undo/redo', () => {
    useAppStore.getState().addRetouchStroke(retouch);
    expect(useAppStore.getState().editHistory.at(-1)?.action).toBe('Spot heal stroke');
    useAppStore.getState().undo();
    expect(useAppStore.getState().editRetouchStrokes).toEqual([]);
    useAppStore.getState().redo();
    expect(useAppStore.getState().editRetouchStrokes).toEqual([retouch]);
    useAppStore.getState().clearRetouchStrokes();
    expect(useAppStore.getState().editRetouchStrokes).toEqual([]);
    useAppStore.getState().undo();
    expect(useAppStore.getState().editRetouchStrokes).toEqual([retouch]);
  });

  it('labels clone and source heal strokes', () => {
    useAppStore.getState().addRetouchStroke({ ...retouch, tool: 'clone', offset: { x: 1, y: 1 } });
    expect(useAppStore.getState().editHistory.at(-1)?.action).toBe('Clone Stamp stroke');
    useAppStore.getState().addRetouchStroke({ ...retouch, offset: { x: 1, y: 1 } });
    expect(useAppStore.getState().editHistory.at(-1)?.action).toBe('Heal stroke');
  });

  it('restarts aligned sampling when a new source is set', () => {
    useAppStore.getState().setEditCloneSource({ x: 1, y: 2 });
    useAppStore.getState().setEditCloneOffset({ x: 5, y: 5 });
    useAppStore.getState().setEditCloneSource({ x: 9, y: 9 });
    expect(useAppStore.getState().editCloneOffset).toBeNull();
  });

  it('clamps hardness, opacity, brush size and outline width', () => {
    const state = useAppStore.getState();
    state.setEditRetouchHardness(2);
    state.setEditRetouchOpacity(-1);
    state.setEditBrushSize(1000);
    state.setEditShapeStyle({ strokeWidth: 500 });
    const next = useAppStore.getState();
    expect(next.editRetouchHardness).toBe(1);
    expect(next.editRetouchOpacity).toBe(0);
    expect(next.editBrushSize).toBe(400);
    expect(next.editShapeStyle.strokeWidth).toBe(100);
  });

  it('keeps retouching, sources and pen drafts out of the next image', () => {
    const state = useAppStore.getState();
    state.addRetouchStroke(retouch);
    state.setEditCloneSource({ x: 1, y: 2 });
    state.setEditPenDraft([0, 0]);
    state.setCurrentImage('next.png', 'C:/next.png');
    const next = useAppStore.getState();
    expect(next.editRetouchStrokes).toEqual([]);
    expect(next.editCloneSource).toBeNull();
    expect(next.editPenDraft).toBeNull();
  });
});
