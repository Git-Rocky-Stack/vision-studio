import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import { RegionMaskDrawer } from './RegionMaskDrawer';
import type { RegionLock } from '@/types/project';
import { DEFAULT_REGION_MASK } from '@/types/project';

const mockRegion: RegionLock = {
  id: 'region-1',
  sceneId: 'scene-1',
  frameId: 'frame-1',
  name: 'Test Region',
  mask: { ...DEFAULT_REGION_MASK },
  targetLayers: [],
  protectedLayers: [],
  generationConfig: {},
  aiTool: 'generative-fill',
  prompt: '',
  strength: 0.85,
  invertMask: false,
};

const CANVAS_W = 1000;
const CANVAS_H = 800;

// Stub getBoundingClientRect so client-space coordinates map 1:1 to local space.
function stubBoundingRect(el: Element | null) {
  if (!el) return;
  (el as HTMLElement).getBoundingClientRect = () =>
    ({
      left: 0,
      top: 0,
      right: CANVAS_W,
      bottom: CANVAS_H,
      width: CANVAS_W,
      height: CANVAS_H,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }) as DOMRect;
}

describe('RegionMaskDrawer', () => {
  beforeEach(cleanup);
  afterEach(cleanup);

  it('renders nothing when tool is "select"', () => {
    const onCommit = vi.fn();
    const { queryByTestId } = render(
      <RegionMaskDrawer
        activeRegion={mockRegion}
        canvasWidth={CANVAS_W}
        canvasHeight={CANVAS_H}
        tool="select"
        brushSize={20}
        onMaskCommit={onCommit}
      />
    );
    expect(queryByTestId('region-mask-drawer')).toBeNull();
  });

  it('renders the stored mask in select mode when explicitly requested', () => {
    const { getByTestId } = render(
      <RegionMaskDrawer
        activeRegion={mockRegion}
        canvasWidth={CANVAS_W}
        canvasHeight={CANVAS_H}
        tool="select"
        brushSize={20}
        showExistingMaskWhenSelect
        onMaskCommit={vi.fn()}
      />
    );

    expect(getByTestId('region-mask-drawer')).toBeTruthy();
    expect(getByTestId('region-mask-drawer').style.pointerEvents).toBe('none');
  });

  it('renders interactive surface for rectangle/brush/polygon tools', () => {
    const { getByTestId, rerender } = render(
      <RegionMaskDrawer
        activeRegion={mockRegion}
        canvasWidth={CANVAS_W}
        canvasHeight={CANVAS_H}
        tool="rectangle"
        brushSize={20}
        onMaskCommit={vi.fn()}
      />
    );
    expect(getByTestId('region-mask-drawer')).toBeTruthy();

    rerender(
      <RegionMaskDrawer
        activeRegion={mockRegion}
        canvasWidth={CANVAS_W}
        canvasHeight={CANVAS_H}
        tool="brush"
        brushSize={20}
        onMaskCommit={vi.fn()}
      />
    );
    expect(getByTestId('region-mask-drawer')).toBeTruthy();

    rerender(
      <RegionMaskDrawer
        activeRegion={mockRegion}
        canvasWidth={CANVAS_W}
        canvasHeight={CANVAS_H}
        tool="polygon"
        brushSize={20}
        onMaskCommit={vi.fn()}
      />
    );
    expect(getByTestId('region-mask-drawer')).toBeTruthy();
  });

  it('includes brushSize in brush mask commits', () => {
    const onCommit = vi.fn();
    const { getByTestId } = render(
      <RegionMaskDrawer
        activeRegion={mockRegion}
        canvasWidth={CANVAS_W}
        canvasHeight={CANVAS_H}
        tool="brush"
        brushSize={20}
        onMaskCommit={onCommit}
      />
    );
    const surface = getByTestId('region-mask-drawer');
    stubBoundingRect(surface);

    fireEvent.pointerDown(surface, { clientX: 100, clientY: 150, button: 0, pointerId: 1 });
    fireEvent.pointerMove(surface, { clientX: 200, clientY: 250, pointerId: 1 });
    fireEvent.pointerUp(surface, { clientX: 200, clientY: 250, pointerId: 1 });

    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'brush', brushSize: 20 })
    );
  });

  it('omits brushSize from polygon commits', () => {
    const onCommit = vi.fn();
    const { getByTestId } = render(
      <RegionMaskDrawer
        activeRegion={mockRegion}
        canvasWidth={CANVAS_W}
        canvasHeight={CANVAS_H}
        tool="polygon"
        brushSize={20}
        onMaskCommit={onCommit}
      />
    );
    const surface = getByTestId('region-mask-drawer');
    stubBoundingRect(surface);

    fireEvent.pointerDown(surface, { clientX: 100, clientY: 150, button: 0, pointerId: 1 });
    fireEvent.pointerMove(surface, { clientX: 200, clientY: 250, pointerId: 1 });
    fireEvent.pointerUp(surface, { clientX: 200, clientY: 250, pointerId: 1 });

    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit.mock.calls[0][0].brushSize).toBeUndefined();
  });

  it('commits rectangle mask with correct bounds from drag', () => {
    const onCommit = vi.fn();
    const { getByTestId } = render(
      <RegionMaskDrawer
        activeRegion={mockRegion}
        canvasWidth={CANVAS_W}
        canvasHeight={CANVAS_H}
        tool="rectangle"
        brushSize={20}
        onMaskCommit={onCommit}
      />
    );
    const surface = getByTestId('region-mask-drawer');
    stubBoundingRect(surface);

    fireEvent.pointerDown(surface, { clientX: 100, clientY: 150, button: 0, pointerId: 1 });
    fireEvent.pointerMove(surface, { clientX: 400, clientY: 500, pointerId: 1 });
    fireEvent.pointerUp(surface, { clientX: 400, clientY: 500, pointerId: 1 });

    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith({
      type: 'rectangle',
      points: [
        { x: 100, y: 150 },
        { x: 400, y: 150 },
        { x: 400, y: 500 },
        { x: 100, y: 500 },
      ],
      bounds: { x: 100, y: 150, width: 300, height: 350 },
    });
  });

  it('normalizes reverse-drag rectangles so bounds are positive', () => {
    const onCommit = vi.fn();
    const { getByTestId } = render(
      <RegionMaskDrawer
        activeRegion={mockRegion}
        canvasWidth={CANVAS_W}
        canvasHeight={CANVAS_H}
        tool="rectangle"
        brushSize={20}
        onMaskCommit={onCommit}
      />
    );
    const surface = getByTestId('region-mask-drawer');
    stubBoundingRect(surface);

    fireEvent.pointerDown(surface, { clientX: 500, clientY: 600, button: 0, pointerId: 1 });
    fireEvent.pointerMove(surface, { clientX: 200, clientY: 100, pointerId: 1 });
    fireEvent.pointerUp(surface, { clientX: 200, clientY: 100, pointerId: 1 });

    expect(onCommit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'rectangle',
        bounds: { x: 200, y: 100, width: 300, height: 500 },
      })
    );
  });

  it('ignores tiny clicks that are not intentional drags', () => {
    const onCommit = vi.fn();
    const { getByTestId } = render(
      <RegionMaskDrawer
        activeRegion={mockRegion}
        canvasWidth={CANVAS_W}
        canvasHeight={CANVAS_H}
        tool="rectangle"
        brushSize={20}
        onMaskCommit={onCommit}
      />
    );
    const surface = getByTestId('region-mask-drawer');
    stubBoundingRect(surface);

    fireEvent.pointerDown(surface, { clientX: 100, clientY: 100, button: 0, pointerId: 1 });
    fireEvent.pointerMove(surface, { clientX: 100.5, clientY: 100.5, pointerId: 1 });
    fireEvent.pointerUp(surface, { clientX: 100.5, clientY: 100.5, pointerId: 1 });

    expect(onCommit).not.toHaveBeenCalled();
  });

  it('commits brush path with bounding box from all points', () => {
    const onCommit = vi.fn();
    const { getByTestId } = render(
      <RegionMaskDrawer
        activeRegion={mockRegion}
        canvasWidth={CANVAS_W}
        canvasHeight={CANVAS_H}
        tool="brush"
        brushSize={20}
        onMaskCommit={onCommit}
      />
    );
    const surface = getByTestId('region-mask-drawer');
    stubBoundingRect(surface);

    fireEvent.pointerDown(surface, { clientX: 50, clientY: 50, button: 0, pointerId: 1 });
    fireEvent.pointerMove(surface, { clientX: 200, clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(surface, { clientX: 300, clientY: 250, pointerId: 1 });
    fireEvent.pointerUp(surface, { clientX: 300, clientY: 250, pointerId: 1 });

    expect(onCommit).toHaveBeenCalledTimes(1);
    const call = onCommit.mock.calls[0][0];
    expect(call.type).toBe('brush');
    expect(call.points.length).toBeGreaterThanOrEqual(3);
    expect(call.bounds).toEqual({ x: 50, y: 50, width: 250, height: 200 });
  });

  it('commits polygon path with correct type', () => {
    const onCommit = vi.fn();
    const { getByTestId } = render(
      <RegionMaskDrawer
        activeRegion={mockRegion}
        canvasWidth={CANVAS_W}
        canvasHeight={CANVAS_H}
        tool="polygon"
        brushSize={20}
        onMaskCommit={onCommit}
      />
    );
    const surface = getByTestId('region-mask-drawer');
    stubBoundingRect(surface);

    fireEvent.pointerDown(surface, { clientX: 10, clientY: 10, button: 0, pointerId: 1 });
    fireEvent.pointerMove(surface, { clientX: 100, clientY: 80, pointerId: 1 });
    fireEvent.pointerUp(surface, { clientX: 100, clientY: 80, pointerId: 1 });

    expect(onCommit).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'polygon' })
    );
  });

  it('clamps out-of-bounds pointer positions into canvas space', () => {
    const onCommit = vi.fn();
    const { getByTestId } = render(
      <RegionMaskDrawer
        activeRegion={mockRegion}
        canvasWidth={CANVAS_W}
        canvasHeight={CANVAS_H}
        tool="rectangle"
        brushSize={20}
        onMaskCommit={onCommit}
      />
    );
    const surface = getByTestId('region-mask-drawer');
    stubBoundingRect(surface);

    fireEvent.pointerDown(surface, { clientX: -50, clientY: -20, button: 0, pointerId: 1 });
    fireEvent.pointerMove(surface, { clientX: CANVAS_W + 100, clientY: CANVAS_H + 200, pointerId: 1 });
    fireEvent.pointerUp(surface, { clientX: CANVAS_W + 100, clientY: CANVAS_H + 200, pointerId: 1 });

    expect(onCommit).toHaveBeenCalledWith(
      expect.objectContaining({
        bounds: { x: 0, y: 0, width: CANVAS_W, height: CANVAS_H },
      })
    );
  });

  it('discards draft on pointerCancel without committing', () => {
    const onCommit = vi.fn();
    const { getByTestId } = render(
      <RegionMaskDrawer
        activeRegion={mockRegion}
        canvasWidth={CANVAS_W}
        canvasHeight={CANVAS_H}
        tool="rectangle"
        brushSize={20}
        onMaskCommit={onCommit}
      />
    );
    const surface = getByTestId('region-mask-drawer');
    stubBoundingRect(surface);

    fireEvent.pointerDown(surface, { clientX: 100, clientY: 100, button: 0, pointerId: 1 });
    fireEvent.pointerMove(surface, { clientX: 300, clientY: 300, pointerId: 1 });
    fireEvent.pointerCancel(surface, { pointerId: 1 });

    expect(onCommit).not.toHaveBeenCalled();
  });

  it('ignores non-left-button pointer events', () => {
    const onCommit = vi.fn();
    const { getByTestId } = render(
      <RegionMaskDrawer
        activeRegion={mockRegion}
        canvasWidth={CANVAS_W}
        canvasHeight={CANVAS_H}
        tool="rectangle"
        brushSize={20}
        onMaskCommit={onCommit}
      />
    );
    const surface = getByTestId('region-mask-drawer');
    stubBoundingRect(surface);

    fireEvent.pointerDown(surface, { clientX: 100, clientY: 100, button: 2, pointerId: 1 });
    fireEvent.pointerMove(surface, { clientX: 300, clientY: 300, pointerId: 1 });
    fireEvent.pointerUp(surface, { clientX: 300, clientY: 300, pointerId: 1 });

    expect(onCommit).not.toHaveBeenCalled();
  });

  it('exposes active-region and active-tool via data attributes', () => {
    const { getByTestId } = render(
      <RegionMaskDrawer
        activeRegion={mockRegion}
        canvasWidth={CANVAS_W}
        canvasHeight={CANVAS_H}
        tool="brush"
        brushSize={20}
        onMaskCommit={vi.fn()}
      />
    );
    const surface = getByTestId('region-mask-drawer');
    expect(surface.getAttribute('data-active-region')).toBe('region-1');
    expect(surface.getAttribute('data-active-tool')).toBe('brush');
  });

  it('renders interactive surface for erase tool', () => {
    const { getByTestId } = render(
      <RegionMaskDrawer
        activeRegion={mockRegion}
        canvasWidth={CANVAS_W}
        canvasHeight={CANVAS_H}
        tool="erase"
        brushSize={30}
        onMaskCommit={vi.fn()}
      />
    );
    expect(getByTestId('region-mask-drawer')).toBeTruthy();
    expect(getByTestId('region-mask-drawer').getAttribute('data-active-tool')).toBe('erase');
  });

  it('uses cell cursor for erase tool', () => {
    const { getByTestId } = render(
      <RegionMaskDrawer
        activeRegion={mockRegion}
        canvasWidth={CANVAS_W}
        canvasHeight={CANVAS_H}
        tool="erase"
        brushSize={20}
        onMaskCommit={vi.fn()}
      />
    );
    const surface = getByTestId('region-mask-drawer');
    expect(surface.style.cursor).toBe('cell');
  });

  it('commits erase mask with correct type and bounding box', () => {
    const onCommit = vi.fn();
    const { getByTestId } = render(
      <RegionMaskDrawer
        activeRegion={mockRegion}
        canvasWidth={CANVAS_W}
        canvasHeight={CANVAS_H}
        tool="erase"
        brushSize={25}
        onMaskCommit={onCommit}
      />
    );
    const surface = getByTestId('region-mask-drawer');
    stubBoundingRect(surface);

    fireEvent.pointerDown(surface, { clientX: 80, clientY: 60, button: 0, pointerId: 1 });
    fireEvent.pointerMove(surface, { clientX: 250, clientY: 120, pointerId: 1 });
    fireEvent.pointerMove(surface, { clientX: 350, clientY: 300, pointerId: 1 });
    fireEvent.pointerUp(surface, { clientX: 350, clientY: 300, pointerId: 1 });

    expect(onCommit).toHaveBeenCalledTimes(1);
    const call = onCommit.mock.calls[0][0];
    expect(call.type).toBe('erase');
    expect(call.points.length).toBeGreaterThanOrEqual(3);
    expect(call.bounds).toEqual({ x: 80, y: 60, width: 270, height: 240 });
  });

  it('renders dashed erase preview path with distinct testid', () => {
    const { getByTestId, queryByTestId } = render(
      <RegionMaskDrawer
        activeRegion={mockRegion}
        canvasWidth={CANVAS_W}
        canvasHeight={CANVAS_H}
        tool="erase"
        brushSize={30}
        onMaskCommit={vi.fn()}
      />
    );
    const surface = getByTestId('region-mask-drawer');
    stubBoundingRect(surface);

    // No preview before drawing
    expect(queryByTestId('mask-draft-erase-path')).toBeNull();

    fireEvent.pointerDown(surface, { clientX: 100, clientY: 100, button: 0, pointerId: 1 });
    fireEvent.pointerMove(surface, { clientX: 200, clientY: 200, pointerId: 1 });

    // Dashed erase preview should appear
    expect(queryByTestId('mask-draft-erase-path')).toBeTruthy();
  });
});
