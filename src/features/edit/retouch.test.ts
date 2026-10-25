import { describe, expect, it } from 'vitest';

import type { RetouchStroke } from '@/types/editor';

import {
  HEAL_COARSE_THRESHOLD,
  RetouchCache,
  applyClone,
  applyHeal,
  findHealSource,
  rasterizeStrokeMask,
  renderRetouch,
  strokeBounds,
  type RgbaBuffer,
} from './retouch';

function buffer(width: number, height: number, fill: (x: number, y: number) => [number, number, number]): RgbaBuffer {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = fill(x, y);
      data.set([r, g, b, 255], (y * width + x) * 4);
    }
  }
  return { data, width, height };
}

const px = (image: RgbaBuffer, x: number, y: number) => {
  const i = (y * image.width + x) * 4;
  return [image.data[i], image.data[i + 1], image.data[i + 2], image.data[i + 3]];
};

const stroke = (overrides: Partial<RetouchStroke>): RetouchStroke => ({
  id: 'r',
  tool: 'clone',
  points: [10, 10],
  size: 6,
  hardness: 1,
  opacity: 1,
  offset: null,
  ...overrides,
});

describe('strokeBounds', () => {
  it('pads by the radius and clips to the image', () => {
    expect(strokeBounds([10, 10, 20, 12], 6, 100, 100)).toEqual({ x0: 6, y0: 6, x1: 24, y1: 16 });
    expect(strokeBounds([0, 0], 10, 4, 4)).toEqual({ x0: 0, y0: 0, x1: 4, y1: 4 });
  });

  it('is null for an empty stroke or one outside the image', () => {
    expect(strokeBounds([], 6, 100, 100)).toBeNull();
    expect(strokeBounds([500, 500], 6, 100, 100)).toBeNull();
  });
});

describe('rasterizeStrokeMask', () => {
  it('covers a hard round dab fully inside the radius and not outside it', () => {
    const mask = rasterizeStrokeMask([10, 10], 6, 1, 40, 40)!;
    const at = (x: number, y: number) =>
      mask.coverage[(y - mask.bounds.y0) * (mask.bounds.x1 - mask.bounds.x0) + (x - mask.bounds.x0)];
    expect(at(10, 10)).toBe(1);
    expect(at(11, 11)).toBe(1);
    expect(at(14, 10)).toBe(0);
  });

  it('feathers a soft brush towards its edge', () => {
    const mask = rasterizeStrokeMask([20, 20], 20, 0, 40, 40)!;
    const width = mask.bounds.x1 - mask.bounds.x0;
    const at = (x: number) => mask.coverage[(20 - mask.bounds.y0) * width + (x - mask.bounds.x0)];
    expect(at(20)).toBeGreaterThan(at(24));
    expect(at(24)).toBeGreaterThan(at(28));
    expect(at(28)).toBeGreaterThan(0);
    expect(at(30)).toBe(0);
  });

  it('covers the whole length of a segment', () => {
    const mask = rasterizeStrokeMask([5, 10, 35, 10], 4, 1, 40, 40)!;
    const width = mask.bounds.x1 - mask.bounds.x0;
    for (const x of [5, 15, 25, 35]) {
      expect(mask.coverage[(10 - mask.bounds.y0) * width + (x - mask.bounds.x0)]).toBe(1);
    }
  });
});

describe('applyClone', () => {
  it('copies the source pixels under the brush and leaves the rest alone', () => {
    // Left half red, right half blue; clone from the right onto the left.
    const image = buffer(40, 20, (x) => (x < 20 ? [255, 0, 0] : [0, 0, 255]));
    const source = new Uint8ClampedArray(image.data);
    const mask = rasterizeStrokeMask([8, 10], 6, 1, 40, 20)!;
    applyClone(image, source, mask, { x: 20, y: 0 }, 1);
    expect(px(image, 8, 10)).toEqual([0, 0, 255, 255]);
    expect(px(image, 2, 2)).toEqual([255, 0, 0, 255]);
  });

  it('blends by opacity', () => {
    const image = buffer(40, 20, (x) => (x < 20 ? [200, 0, 0] : [0, 0, 200]));
    const source = new Uint8ClampedArray(image.data);
    const mask = rasterizeStrokeMask([8, 10], 6, 1, 40, 20)!;
    applyClone(image, source, mask, { x: 20, y: 0 }, 0.5);
    expect(px(image, 8, 10)).toEqual([100, 0, 100, 255]);
  });
});

describe('applyHeal', () => {
  it('removes a dark spot from a flat area without leaving a seam', () => {
    const image = buffer(60, 60, (x, y) => (Math.hypot(x - 30, y - 30) < 3 ? [10, 10, 10] : [150, 120, 90]));
    const source = new Uint8ClampedArray(image.data);
    const mask = rasterizeStrokeMask([30, 30], 12, 1, 60, 60)!;
    applyHeal(image, source, mask, null, 1);
    const [r, g, b] = px(image, 30, 30);
    expect(Math.abs(r - 150)).toBeLessThanOrEqual(2);
    expect(Math.abs(g - 120)).toBeLessThanOrEqual(2);
    expect(Math.abs(b - 90)).toBeLessThanOrEqual(2);
  });

  it('heals a large stroke (coarse-seeded solve) to the surrounding gradient', () => {
    // A horizontal gradient with a big dark blot: the healed centre must sit on
    // the gradient, not on the blot and not on a flat average.
    const image = buffer(200, 120, (x, y) => (Math.hypot(x - 100, y - 60) < 30 ? [0, 0, 0] : [x, 100, 200 - x]));
    const source = new Uint8ClampedArray(image.data);
    const mask = rasterizeStrokeMask([100, 60], 90, 1, 200, 120)!;
    expect(mask.coverage.filter((v) => v > 0).length).toBeGreaterThan(HEAL_COARSE_THRESHOLD);
    applyHeal(image, source, mask, null, 1);
    for (const x of [80, 100, 120]) {
      const [r, g, b] = px(image, x, 60);
      expect(Math.abs(r - x)).toBeLessThanOrEqual(6);
      expect(Math.abs(g - 100)).toBeLessThanOrEqual(3);
      expect(Math.abs(b - (200 - x))).toBeLessThanOrEqual(6);
    }
  });

  it('takes texture from the source but matches the light around the stroke', () => {
    // A bright textured patch at the source, a dark flat area with a blemish
    // at the destination: the result keeps the stripes, at the dark level.
    const image = buffer(80, 40, (x, y) => {
      if (x >= 40) return x % 2 === 0 ? [230, 230, 230] : [200, 200, 200];
      return Math.hypot(x - 20, y - 20) < 3 ? [255, 0, 0] : [60, 60, 60];
    });
    const source = new Uint8ClampedArray(image.data);
    const mask = rasterizeStrokeMask([20, 20], 14, 1, 80, 40)!;
    applyHeal(image, source, mask, { x: 40, y: 0 }, 1);
    const even = px(image, 20, 20)[0];
    const odd = px(image, 21, 20)[0];
    expect(Math.abs(even - odd)).toBeGreaterThan(15); // stripes carried over
    expect((even + odd) / 2).toBeLessThan(110); // at the dark level, not the bright one
    expect(px(image, 20, 20)[1]).toBeGreaterThan(30); // the red blemish is gone
  });
});

describe('findHealSource', () => {
  it('picks the neighbourhood that matches the area around the stroke', () => {
    // Grey everywhere except a green band above the spot: the source must
    // not come from above.
    const image = buffer(90, 90, (_x, y) => (y < 30 ? [0, 255, 0] : [128, 128, 128]));
    const mask = rasterizeStrokeMask([45, 45], 10, 1, 90, 90)!;
    const offset = findHealSource(image.data, 90, 90, mask)!;
    expect(offset).not.toBeNull();
    expect(offset.y).toBeGreaterThanOrEqual(0);
  });

  it('returns null when no candidate fits in the image', () => {
    const image = buffer(12, 12, () => [1, 2, 3]);
    const mask = rasterizeStrokeMask([6, 6], 12, 1, 12, 12)!;
    expect(findHealSource(image.data, 12, 12, mask)).toBeNull();
  });
});

describe('renderRetouch and RetouchCache', () => {
  const base = buffer(50, 50, (x, y) => [x * 5, y * 5, 100]);
  const strokes: RetouchStroke[] = [
    stroke({ id: 'a', points: [10, 10, 20, 10], offset: { x: 20, y: 20 } }),
    stroke({ id: 'b', tool: 'heal', points: [30, 30], size: 8 }),
    stroke({ id: 'c', points: [5, 40], offset: { x: 30, y: -20 } }),
  ];

  it('never mutates the base image', () => {
    const before = new Uint8ClampedArray(base.data);
    renderRetouch(base, strokes);
    expect(base.data).toEqual(before);
  });

  it('skips a clone stroke without an offset', () => {
    const result = renderRetouch(base, [stroke({ offset: null })]);
    expect(result.data).toEqual(base.data);
  });

  it('matches a full replay whether strokes are added, undone or replaced', () => {
    const cache = new RetouchCache(base);
    expect(cache.render(strokes.slice(0, 1)).data).toEqual(renderRetouch(base, strokes.slice(0, 1)).data);
    expect(cache.render(strokes).data).toEqual(renderRetouch(base, strokes).data);
    // Undo: a shorter list replays from the base.
    expect(cache.render(strokes.slice(0, 2)).data).toEqual(renderRetouch(base, strokes.slice(0, 2)).data);
    // A different stroke at the same index replays too.
    const replaced = [strokes[0], stroke({ id: 'd', points: [40, 5], offset: { x: -30, y: 30 } })];
    expect(cache.render(replaced).data).toEqual(renderRetouch(base, replaced).data);
    expect(cache.render([]).data).toEqual(base.data);
  });
});
