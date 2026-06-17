import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  assertPathUnderRoots,
  maskCoverage,
  rasterizeMaskToPng,
  readImageDimensions,
  type MaskGeometry,
} from './hostedControlAssets';

function rect(x: number, y: number, width: number, height: number) {
  return { x, y, width, height };
}

const RECT_MASK: MaskGeometry = {
  type: 'rectangle',
  points: [],
  bounds: rect(10, 20, 30, 40),
};

const TRIANGLE_MASK: MaskGeometry = {
  type: 'polygon',
  points: [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 0, y: 100 },
  ],
  bounds: rect(0, 0, 100, 100),
};

describe('maskCoverage', () => {
  it('covers points inside a rectangle and excludes points outside', () => {
    expect(maskCoverage(RECT_MASK, 11, 21)).toBe(true);
    expect(maskCoverage(RECT_MASK, 39, 59)).toBe(true);
    expect(maskCoverage(RECT_MASK, 9, 21)).toBe(false);
    expect(maskCoverage(RECT_MASK, 11, 61)).toBe(false);
  });

  it('covers points inside a polygon via ray casting', () => {
    // Lower-left triangle: (5,5) is inside, (90,90) is outside.
    expect(maskCoverage(TRIANGLE_MASK, 5, 5)).toBe(true);
    expect(maskCoverage(TRIANGLE_MASK, 90, 90)).toBe(false);
  });

  it('falls back to bounds when a freehand mask has fewer than three points', () => {
    const sparse: MaskGeometry = { type: 'brush', points: [{ x: 12, y: 22 }], bounds: rect(10, 20, 30, 40) };
    expect(maskCoverage(sparse, 11, 21)).toBe(true);
    expect(maskCoverage(sparse, 100, 100)).toBe(false);
  });
});

describe('rasterizeMaskToPng', () => {
  it('produces a valid grayscale PNG at the requested dimensions', () => {
    const png = rasterizeMaskToPng(RECT_MASK, 64, 80);
    // PNG signature.
    expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(readImageDimensions(png)).toEqual({ width: 64, height: 80 });
  });

  it('clamps mask bounds that exceed the canvas', () => {
    const png = rasterizeMaskToPng({ type: 'rectangle', points: [], bounds: rect(-5, -5, 1000, 1000) }, 16, 16);
    expect(readImageDimensions(png)).toEqual({ width: 16, height: 16 });
  });
});

describe('readImageDimensions', () => {
  it('reads dimensions from a PNG (round-trip through the encoder)', () => {
    const png = rasterizeMaskToPng(RECT_MASK, 123, 45);
    expect(readImageDimensions(png)).toEqual({ width: 123, height: 45 });
  });

  it('reads dimensions from a baseline JPEG SOF0 header', () => {
    // SOI + APP0(JFIF) + SOF0 with height=200, width=320.
    const jpeg = Buffer.from([
      0xff, 0xd8, // SOI
      0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, // APP0
      0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0xc8, 0x01, 0x40, 0x03, 0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01, // SOF0 h=0x00c8(200) w=0x0140(320)
    ]);
    expect(readImageDimensions(jpeg)).toEqual({ width: 320, height: 200 });
  });

  it('reads dimensions from a VP8X WebP header', () => {
    // RIFF + WEBP + VP8X with canvas 100x50 (stored as value-1, 24-bit LE).
    const webp = Buffer.concat([
      Buffer.from('RIFF'),
      Buffer.from([0x00, 0x00, 0x00, 0x00]),
      Buffer.from('WEBP'),
      Buffer.from('VP8X'),
      Buffer.from([0x0a, 0x00, 0x00, 0x00]), // chunk length 10
      Buffer.from([0x00, 0x00, 0x00, 0x00]), // flags + reserved
      Buffer.from([0x63, 0x00, 0x00]), // width-1 = 99 -> 100
      Buffer.from([0x31, 0x00, 0x00]), // height-1 = 49 -> 50
    ]);
    expect(readImageDimensions(webp)).toEqual({ width: 100, height: 50 });
  });

  it('throws a clear error for an unrecognized payload', () => {
    expect(() => readImageDimensions(Buffer.from('not an image'))).toThrow(/could not read image dimensions/i);
  });
});

describe('assertPathUnderRoots', () => {
  const root = path.resolve('/srv/vision/output');

  it('accepts a path inside an allowed root', () => {
    const target = path.join(root, 'huggingface', '2026-06-17', 'base.png');
    expect(assertPathUnderRoots(target, [root])).toBe(path.resolve(target));
  });

  it('rejects a traversal escape', () => {
    const target = path.join(root, '..', '..', 'etc', 'passwd');
    expect(() => assertPathUnderRoots(target, [root])).toThrow(/outside the allowed/i);
  });

  it('rejects a path under no allowed root', () => {
    expect(() => assertPathUnderRoots(path.resolve('/tmp/elsewhere/x.png'), [root])).toThrow(/outside the allowed/i);
  });

  it('rejects when there are no allowed roots', () => {
    expect(() => assertPathUnderRoots(path.resolve('/srv/vision/output/x.png'), [])).toThrow(/outside the allowed/i);
  });
});
