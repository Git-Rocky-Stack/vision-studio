import { describe, expect, it } from 'vitest';

import type { RegionMask } from '@/types/project';

import {
  blendRegionPixels,
  compositeThroughMask,
  featherCoverage,
  invertCoverage,
  rasterizeRegionMask,
} from './regionBlend';

function mask(over: Partial<RegionMask>): RegionMask {
  return {
    type: 'rectangle',
    points: [{ x: 0, y: 0 }],
    bounds: { x: 0, y: 0, width: 0, height: 0 },
    featherRadius: 0,
    blendEdges: true,
    ...over,
  };
}

const at = (m: Float32Array, width: number, x: number, y: number) => m[y * width + x];
const sum = (m: Float32Array) => m.reduce((total, value) => total + value, 0);

function solid(width: number, height: number, value: number): Uint8ClampedArray {
  return new Uint8ClampedArray(width * height * 4).fill(value);
}

describe('rasterizeRegionMask', () => {
  it('fills a rectangle from its bounds, pixel centres inside', () => {
    const m = rasterizeRegionMask(mask({ bounds: { x: 2, y: 3, width: 4, height: 2 } }), 10, 10);
    expect(sum(m)).toBe(8);
    expect(at(m, 10, 2, 3)).toBe(1);
    expect(at(m, 10, 5, 4)).toBe(1);
    expect(at(m, 10, 6, 4)).toBe(0);
    expect(at(m, 10, 2, 5)).toBe(0);
  });

  it('fills a polygon with the even-odd rule', () => {
    const square = mask({
      type: 'polygon',
      points: [
        { x: 2, y: 2 },
        { x: 8, y: 2 },
        { x: 8, y: 8 },
        { x: 2, y: 8 },
      ],
    });
    const m = rasterizeRegionMask(square, 10, 10);
    expect(sum(m)).toBe(36);
    expect(at(m, 10, 1, 5)).toBe(0);
    expect(at(m, 10, 5, 5)).toBe(1);
  });

  it('draws a brush as a round stroke of half the brush size', () => {
    const stroke = mask({
      type: 'brush',
      brushSize: 4,
      points: [
        { x: 5, y: 10 },
        { x: 15, y: 10 },
      ],
    });
    const m = rasterizeRegionMask(stroke, 20, 20);
    expect(at(m, 20, 10, 10)).toBe(1);
    expect(at(m, 20, 10, 11)).toBe(1);
    expect(at(m, 20, 10, 13)).toBe(0);
    // Round caps reach radius 2 past each end.
    expect(at(m, 20, 3, 9)).toBe(1);
    expect(at(m, 20, 1, 9)).toBe(0);
  });

  it('treats a standalone erase mask and an empty mask as covering nothing', () => {
    expect(sum(rasterizeRegionMask(mask({ type: 'erase', points: [{ x: 1, y: 1 }] }), 8, 8))).toBe(0);
    expect(sum(rasterizeRegionMask(mask({ points: [] }), 8, 8))).toBe(0);
  });
});

describe('featherCoverage', () => {
  const hard = () => rasterizeRegionMask(mask({ bounds: { x: 10, y: 0, width: 20, height: 40 } }), 40, 40);

  it('returns an unblurred copy at radius 0', () => {
    const source = hard();
    const out = featherCoverage(source, 40, 40, 0);
    expect(Array.from(out)).toEqual(Array.from(source));
    expect(out).not.toBe(source);
  });

  it('turns the hard edge into a monotonic ramp about the radius wide', () => {
    const out = featherCoverage(hard(), 40, 40, 6);
    const row = Array.from({ length: 40 }, (_, x) => at(out, 40, x, 20));
    // Deep inside and far outside are untouched.
    expect(row[20]).toBeCloseTo(1, 5);
    expect(row[0]).toBeCloseTo(0, 5);
    // Across the left edge the coverage rises steadily through partial values.
    for (let x = 1; x <= 20; x += 1) expect(row[x]).toBeGreaterThanOrEqual(row[x - 1] - 1e-6);
    expect(row[9]).toBeGreaterThan(0.05);
    expect(row[9]).toBeLessThan(0.95);
    expect(row[10]).toBeGreaterThan(0.05);
    expect(row[10]).toBeLessThan(0.95);
    // Blurring moves coverage, it does not create or destroy it.
    expect(sum(out)).toBeCloseTo(sum(hard()), 1);
  });

  it('keeps a region that touches the frame solid at the frame edge', () => {
    const full = rasterizeRegionMask(mask({ bounds: { x: 0, y: 0, width: 40, height: 40 } }), 40, 40);
    const out = featherCoverage(full, 40, 40, 12);
    expect(at(out, 40, 0, 0)).toBeCloseTo(1, 5);
  });
});

describe('compositeThroughMask', () => {
  it('mixes each channel by coverage', () => {
    const out = compositeThroughMask(
      new Uint8ClampedArray([0, 0, 0, 255, 100, 100, 100, 255]),
      new Uint8ClampedArray([200, 200, 200, 255, 200, 200, 200, 255]),
      new Float32Array([0.5, 0]),
    );
    expect(Array.from(out)).toEqual([100, 100, 100, 255, 100, 100, 100, 255]);
  });

  it('refuses buffers of different sizes', () => {
    expect(() =>
      compositeThroughMask(new Uint8ClampedArray(8), new Uint8ClampedArray(4), new Float32Array(2)),
    ).toThrow(/sizes do not match/);
  });
});

describe('blendRegionPixels', () => {
  const region = mask({ bounds: { x: 4, y: 4, width: 8, height: 8 } });

  it('keeps every pixel outside the region exactly as the original', () => {
    const out = blendRegionPixels(solid(16, 16, 10), solid(16, 16, 200), 16, 16, {
      mask: region,
      invert: false,
      featherRadius: 0,
    });
    expect(out[(0 * 16 + 0) * 4]).toBe(10);
    expect(out[(15 * 16 + 15) * 4]).toBe(10);
    expect(out[(8 * 16 + 8) * 4]).toBe(200);
  });

  it('swaps the kept and repainted areas when the mask is inverted', () => {
    const out = blendRegionPixels(solid(16, 16, 10), solid(16, 16, 200), 16, 16, {
      mask: region,
      invert: true,
      featherRadius: 0,
    });
    expect(out[0]).toBe(200);
    expect(out[(8 * 16 + 8) * 4]).toBe(10);
  });

  it('feathers the seam into intermediate values', () => {
    const out = blendRegionPixels(solid(16, 16, 0), solid(16, 16, 240), 16, 16, {
      mask: region,
      invert: false,
      featherRadius: 3,
    });
    const edge = out[(8 * 16 + 4) * 4];
    expect(edge).toBeGreaterThan(0);
    expect(edge).toBeLessThan(240);
  });

  it('inverts coverage in place', () => {
    const m = new Float32Array([0, 0.25, 1]);
    expect(Array.from(invertCoverage(m))).toEqual([1, 0.75, 0]);
  });
});
