import { describe, expect, it } from 'vitest';

import type { ShapeStyle } from '@/types/editor';

import {
  PEN_SMOOTH_TENSION,
  closesPath,
  createShapeLayer,
  isShapeLayer,
  pathDataFromAnchors,
  shapeDataFromDrag,
  snapTo45,
} from './shapeLayers';

const style: ShapeStyle = { stroke: '#ff0000', strokeWidth: 3, fill: '#00ff00', fillEnabled: true };

describe('shapeDataFromDrag', () => {
  it('normalises a rectangle dragged in any direction', () => {
    expect(shapeDataFromDrag('rectangle', { x: 50, y: 40 }, { x: 10, y: 10 }, style)).toMatchObject({
      kind: 'rectangle',
      x: 10,
      y: 10,
      width: 40,
      height: 30,
      stroke: '#ff0000',
      fillEnabled: true,
    });
  });

  it('positions an ellipse by its centre', () => {
    expect(shapeDataFromDrag('ellipse', { x: 0, y: 0 }, { x: 40, y: 20 }, style)).toMatchObject({
      x: 20,
      y: 10,
      width: 40,
      height: 20,
    });
  });

  it('makes Shift-drawn rectangles square, keeping the drag direction', () => {
    expect(shapeDataFromDrag('rectangle', { x: 100, y: 100 }, { x: 60, y: 90 }, style, true)).toMatchObject({
      x: 60,
      y: 60,
      width: 40,
      height: 40,
    });
  });

  it('draws lines and arrows as relative points, and lines never fill', () => {
    const line = shapeDataFromDrag('line', { x: 5, y: 5 }, { x: 25, y: 15 }, style)!;
    expect(line).toMatchObject({ kind: 'line', x: 5, y: 5, points: [0, 0, 20, 10], fillEnabled: false });
    const arrow = shapeDataFromDrag('arrow', { x: 0, y: 0 }, { x: 10, y: 0 }, style)!;
    expect(arrow).toMatchObject({ kind: 'arrow', points: [0, 0, 10, 0], fillEnabled: true });
  });

  it('snaps Shift-drawn lines to 45 degrees', () => {
    const line = shapeDataFromDrag('line', { x: 0, y: 0 }, { x: 100, y: 10 }, style, true)!;
    expect(line.points[3]).toBeCloseTo(0);
    expect(line.points[2]).toBeCloseTo(Math.hypot(100, 10));
  });

  it('draws nothing for a click', () => {
    expect(shapeDataFromDrag('rectangle', { x: 1, y: 1 }, { x: 2, y: 1 }, style)).toBeNull();
  });
});

describe('snapTo45', () => {
  it('keeps the length and rounds the angle', () => {
    const { dx, dy } = snapTo45(10, 9);
    expect(Math.hypot(dx, dy)).toBeCloseTo(Math.hypot(10, 9));
    expect(dx).toBeCloseTo(dy);
  });
});

describe('pathDataFromAnchors', () => {
  it('stores anchors relative to the first one', () => {
    expect(pathDataFromAnchors([10, 10, 30, 10, 30, 40], false, false, style)).toMatchObject({
      kind: 'path',
      x: 10,
      y: 10,
      points: [0, 0, 20, 0, 20, 30],
      width: 20,
      height: 30,
      closed: false,
      tension: 0,
      // An open path has no inside to fill.
      fillEnabled: false,
    });
  });

  it('closes and fills a path of three or more anchors, and smooths on request', () => {
    expect(pathDataFromAnchors([0, 0, 10, 0, 10, 10], true, true, style)).toMatchObject({
      closed: true,
      fillEnabled: true,
      tension: PEN_SMOOTH_TENSION,
    });
    expect(pathDataFromAnchors([0, 0, 10, 0], true, false, style)?.closed).toBe(false);
  });

  it('needs two anchors', () => {
    expect(pathDataFromAnchors([0, 0], false, false, style)).toBeNull();
  });
});

describe('closesPath', () => {
  const anchors = [100, 100, 200, 100, 200, 200];

  it('closes within a few screen pixels of the first anchor, at any zoom', () => {
    expect(closesPath(anchors, { x: 104, y: 103 }, 1)).toBe(true);
    expect(closesPath(anchors, { x: 104, y: 103 }, 4)).toBe(false);
    expect(closesPath(anchors, { x: 115, y: 100 }, 0.5)).toBe(true);
  });

  it('needs three anchors before it closes', () => {
    expect(closesPath([100, 100, 200, 100], { x: 100, y: 100 }, 1)).toBe(false);
  });
});

describe('createShapeLayer', () => {
  it('names the layer by kind', () => {
    const layer = createShapeLayer(pathDataFromAnchors([0, 0, 5, 5], false, false, style)!);
    expect(layer).toMatchObject({ type: 'shape', name: 'Path', visible: true, opacity: 1, locked: false });
    expect(isShapeLayer(layer)).toBe(true);
    expect(createShapeLayer(shapeDataFromDrag('arrow', { x: 0, y: 0 }, { x: 9, y: 9 }, style)!).name).toBe('Arrow');
  });
});
