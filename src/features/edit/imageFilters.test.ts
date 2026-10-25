import { describe, expect, it } from 'vitest';

import { DEFAULT_ADJUSTMENTS, DEFAULT_EDIT_FILTERS, type ImageAdjustments } from '@/types/editor';
import {
  LOOK_FILTERS,
  applyEditPipeline,
  isIdentityEdit,
  lookFilterCss,
  toggleLookFilter,
} from './imageFilters';

function solid(width: number, height: number, rgb: [number, number, number]): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = rgb[0];
    data[i + 1] = rgb[1];
    data[i + 2] = rgb[2];
    data[i + 3] = 255;
  }
  return data;
}

function run(adjust: Partial<ImageAdjustments>, rgb: [number, number, number] = [128, 128, 128], size = 4) {
  const data = solid(size, size, rgb);
  applyEditPipeline(data, size, size, { ...DEFAULT_ADJUSTMENTS, ...adjust }, DEFAULT_EDIT_FILTERS);
  return data;
}

describe('applyEditPipeline', () => {
  it('leaves pixels untouched at neutral settings', () => {
    expect(Array.from(run({}))).toEqual(Array.from(solid(4, 4, [128, 128, 128])));
    expect(isIdentityEdit(DEFAULT_ADJUSTMENTS, DEFAULT_EDIT_FILTERS)).toBe(true);
  });

  it.each([
    ['exposure', 50, 'up'],
    ['exposure', -50, 'down'],
    ['brightness', 40, 'up'],
    ['highlights', 80, 'up'],
    ['shadows', 80, 'up'],
    ['whites', 80, 'up'],
    ['blacks', 80, 'up'],
    ['blacks', -80, 'down'],
  ] as const)('%s %d moves a grey pixel %s', (key, value, dir) => {
    const rgb: [number, number, number] = key === 'highlights' ? [200, 200, 200] : key === 'shadows' ? [40, 40, 40] : [128, 128, 128];
    const before = rgb[0];
    const out = run({ [key]: value }, rgb);
    if (dir === 'up') expect(out[0]).toBeGreaterThan(before);
    else expect(out[0]).toBeLessThan(before);
  });

  it('temperature warms red and cools blue; tint shifts green', () => {
    const warm = run({ temperature: 100 });
    expect(warm[0]).toBeGreaterThan(warm[2]);
    const magenta = run({ tint: 100 });
    expect(magenta[1]).toBeLessThan(128);
  });

  it('saturation -100 collapses a colour to grey', () => {
    const out = run({ saturation: -100 }, [200, 50, 50]);
    expect(Math.abs(out[0] - out[1])).toBeLessThanOrEqual(1);
  });

  it('vignette darkens corners more than the centre', () => {
    const size = 21;
    const data = solid(size, size, [200, 200, 200]);
    applyEditPipeline(data, size, size, { ...DEFAULT_ADJUSTMENTS, vignette: 100 }, DEFAULT_EDIT_FILTERS);
    const centre = data[(10 * size + 10) * 4];
    const corner = data[0];
    expect(corner).toBeLessThan(centre);
  });

  it('grain adds stable, non-uniform noise', () => {
    const a = run({ grain: 100 }, [128, 128, 128], 8);
    const b = run({ grain: 100 }, [128, 128, 128], 8);
    expect(Array.from(a)).toEqual(Array.from(b));
    expect(new Set(Array.from(a).filter((_, i) => i % 4 === 0)).size).toBeGreaterThan(1);
  });

  it('blur and noise reduction smooth an edge; sharpness steepens it', () => {
    const width = 6;
    const make = () => {
      const d = solid(width, 1, [0, 0, 0]);
      for (let x = 3; x < width; x += 1) d[x * 4] = 255;
      return d;
    };
    const blurred = make();
    applyEditPipeline(blurred, width, 1, { ...DEFAULT_ADJUSTMENTS, blur: 10 }, DEFAULT_EDIT_FILTERS);
    expect(blurred[2 * 4]).toBeGreaterThan(0);

    const denoised = make();
    applyEditPipeline(denoised, width, 1, { ...DEFAULT_ADJUSTMENTS, noiseReduction: 100 }, DEFAULT_EDIT_FILTERS);
    expect(denoised[2 * 4]).toBeGreaterThan(0);

    const greyEdge = solid(width, 1, [100, 100, 100]);
    for (let x = 3; x < width; x += 1) greyEdge[x * 4] = 160;
    applyEditPipeline(greyEdge, width, 1, { ...DEFAULT_ADJUSTMENTS, sharpness: 100 }, DEFAULT_EDIT_FILTERS);
    expect(greyEdge[2 * 4]).toBeLessThan(100);
    expect(greyEdge[3 * 4]).toBeGreaterThan(160);
  });

  it('applies a look filter scaled by intensity', () => {
    const full = solid(2, 2, [200, 50, 50]);
    applyEditPipeline(full, 2, 2, DEFAULT_ADJUSTMENTS, { selected: ['bw-classic'], intensity: 100, stackMode: false });
    expect(Math.abs(full[0] - full[1])).toBeLessThanOrEqual(1);

    const none = solid(2, 2, [200, 50, 50]);
    applyEditPipeline(none, 2, 2, DEFAULT_ADJUSTMENTS, { selected: ['bw-classic'], intensity: 0, stackMode: false });
    expect(none[0]).toBe(200);
  });
});

describe('look filter helpers', () => {
  it('renders CSS for previews', () => {
    const noir = LOOK_FILTERS.find((f) => f.id === 'noir')!;
    expect(lookFilterCss(noir.ops)).toBe('grayscale(1) contrast(1.3) brightness(0.9)');
  });

  it('toggles single and stacked selection', () => {
    expect(toggleLookFilter({ ...DEFAULT_EDIT_FILTERS, selected: ['noir'] }, 'matte')).toEqual(['matte']);
    expect(toggleLookFilter({ ...DEFAULT_EDIT_FILTERS, selected: ['noir'] }, 'noir')).toEqual([]);
    expect(
      toggleLookFilter({ ...DEFAULT_EDIT_FILTERS, selected: ['noir'], stackMode: true }, 'matte'),
    ).toEqual(['noir', 'matte']);
  });
});
