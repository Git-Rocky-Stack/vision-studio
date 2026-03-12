import { describe, expect, it } from 'vitest';
import { buildCropBox, getCropDimensions } from './crop';

describe('buildCropBox', () => {
  it('returns null for free mode', () => {
    expect(buildCropBox('free', 1600, 1200, 800, 600)).toBeNull();
  });

  it('creates a centered preset crop for aspect ratios', () => {
    expect(buildCropBox('16:9', 1600, 1200, 800, 600)).toEqual({
      left: 0,
      top: 150,
      width: 1600,
      height: 900,
    });
  });

  it('creates a centered custom crop using the requested dimensions', () => {
    expect(buildCropBox('custom', 1600, 1200, 400, 300)).toEqual({
      left: 600,
      top: 450,
      width: 400,
      height: 300,
    });
  });
});

describe('getCropDimensions', () => {
  it('reports the full image size for free mode', () => {
    expect(getCropDimensions('free', 1600, 1200, 400, 300)).toEqual({
      width: 1600,
      height: 1200,
    });
  });

  it('reports the computed crop size for a preset aspect ratio', () => {
    expect(getCropDimensions('1:1', 1600, 1200, 400, 300)).toEqual({
      width: 1200,
      height: 1200,
    });
  });
});
