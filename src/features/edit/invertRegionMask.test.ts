import { describe, expect, it } from 'vitest';

import type { Point, RegionMask } from '@/types/project';

import { invertRegionMask, traceStrokeOutlines } from './invertRegionMask';

function mask(overrides: Partial<RegionMask>): RegionMask {
  return {
    type: 'rectangle',
    points: [{ x: 0, y: 0 }],
    bounds: { x: 0, y: 0, width: 0, height: 0 },
    featherRadius: 2,
    blendEdges: true,
    ...overrides,
  };
}

/**
 * Even-odd point-in-polygon - the fill rule PIL's polygon rasterizer applies
 * on the backend, so this is what the inverted mask will actually paint.
 */
function evenOddInside(polygon: Point[], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const a = polygon[i];
    const b = polygon[j];
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

describe('invertRegionMask', () => {
  it('cuts a rectangle out of the frame as one even-odd polygon', () => {
    const inverted = invertRegionMask(
      mask({ bounds: { x: 100, y: 120, width: 200, height: 80 }, points: [{ x: 100, y: 120 }] }),
      512,
      384,
    );
    expect(inverted.type).toBe('polygon');
    expect(inverted.bounds).toEqual({ x: 0, y: 0, width: 512, height: 384 });
    // Inside the drawn region: protected. Outside it: regenerated.
    expect(evenOddInside(inverted.points, 200.5, 160.5)).toBe(false);
    expect(evenOddInside(inverted.points, 20.5, 20.5)).toBe(true);
    expect(evenOddInside(inverted.points, 450.5, 300.5)).toBe(true);
    expect(evenOddInside(inverted.points, 200.5, 300.5)).toBe(true);
    // The keyhole bridge sits above the hole, not through it.
    expect(evenOddInside(inverted.points, 99.5, 60.5)).toBe(true);
  });

  it('inverts a non-convex polygon exactly', () => {
    const lShape = [
      { x: 50, y: 50 },
      { x: 150, y: 50 },
      { x: 150, y: 100 },
      { x: 100, y: 100 },
      { x: 100, y: 150 },
      { x: 50, y: 150 },
    ];
    const inverted = invertRegionMask(
      mask({ type: 'polygon', points: lShape, bounds: { x: 50, y: 50, width: 100, height: 100 } }),
      200,
      200,
    );
    expect(evenOddInside(inverted.points, 75.5, 125.5)).toBe(false); // in the L
    expect(evenOddInside(inverted.points, 125.5, 125.5)).toBe(true); // in the notch
    expect(evenOddInside(inverted.points, 10.5, 190.5)).toBe(true);
  });

  it('protects the whole brush stroke and regenerates the rest', () => {
    const stroke = mask({
      type: 'brush',
      points: [
        { x: 40, y: 100 },
        { x: 160, y: 100 },
      ],
      brushSize: 20,
      bounds: { x: 40, y: 90, width: 120, height: 20 },
    });
    const inverted = invertRegionMask(stroke, 200, 200);
    // Every point the backend would paint (within radius 10 of the stroke) is protected.
    for (const [x, y] of [[40, 100], [100, 91], [100, 109], [160, 100], [31, 100], [169, 100]]) {
      expect(evenOddInside(inverted.points, x + 0.01, y + 0.01)).toBe(false);
    }
    expect(evenOddInside(inverted.points, 100.5, 40.5)).toBe(true);
    expect(evenOddInside(inverted.points, 100.5, 160.5)).toBe(true);
  });

  it('traces one outline for a connected stroke', () => {
    const outlines = traceStrokeOutlines(
      mask({ type: 'brush', points: [{ x: 10, y: 10 }, { x: 90, y: 90 }], brushSize: 8 }),
      100,
      100,
    );
    expect(outlines).toHaveLength(1);
    expect(outlines[0].length).toBeGreaterThanOrEqual(4);
  });

  it('regenerates the whole frame for an erase mask', () => {
    const inverted = invertRegionMask(mask({ type: 'erase', points: [{ x: 1, y: 1 }] }), 64, 32);
    expect(evenOddInside(inverted.points, 32.5, 16.5)).toBe(true);
  });

  it('returns an empty mask when the region already covers the frame', () => {
    const inverted = invertRegionMask(
      mask({ bounds: { x: 0, y: 0, width: 64, height: 64 }, points: [{ x: 0, y: 0 }] }),
      64,
      64,
    );
    expect(inverted.points).toEqual([]);
  });
});
