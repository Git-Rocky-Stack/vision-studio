import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAppStore } from '@/store/appStore';
import type { RegionMask } from '@/types/project';

import { blendRegionResult, type PixelIo } from './regionBlendRunner';

const MASK: RegionMask = {
  type: 'rectangle',
  points: [{ x: 0, y: 0 }],
  bounds: { x: 0, y: 0, width: 2, height: 4 },
  featherRadius: 0,
  blendEdges: true,
};

const PARAMS = {
  originalSrc: 'preview://original.png',
  generatedSrc: 'preview://generated.png',
  originalPath: 'C:/library/portrait.png',
  mask: MASK,
  invert: false,
  featherRadius: 0,
  width: 4,
  height: 4,
};

function fakeIo(): PixelIo & { encoded: Uint8ClampedArray[] } {
  const encoded: Uint8ClampedArray[] = [];
  return {
    encoded,
    readPixels: vi.fn(async (src: string, width: number, height: number) =>
      new Uint8ClampedArray(width * height * 4).fill(src.includes('original') ? 10 : 200),
    ),
    encodePng: vi.fn((pixels: Uint8ClampedArray) => {
      encoded.push(pixels);
      return 'data:image/png;base64,blended';
    }),
  };
}

const FILE = {
  originalPath: 'portrait-region.png',
  importedPath: 'C:\\outputs\\edits\\portrait-region-1.png',
  name: 'portrait-region-1.png',
  type: 'image' as const,
  importedAt: '2026-11-11T00:00:00.000Z',
};

describe('blendRegionResult', () => {
  beforeEach(() => {
    useAppStore.setState({ assetLibrary: [], currentImage: 'preview://generated.png' });
  });

  it('composites through the mask, saves the result and makes it the current image', async () => {
    const io = fakeIo();
    const saveDataUrl = vi.fn().mockResolvedValue({ success: true, file: FILE });
    const outcome = await blendRegionResult(PARAMS, {
      io,
      assetsApi: { saveDataUrl },
      now: new Date(1_700_000_000_000),
    });

    expect(outcome).toEqual({ ok: true, path: 'C:/outputs/edits/portrait-region-1.png' });
    expect(io.readPixels).toHaveBeenCalledWith('preview://original.png', 4, 4);
    expect(io.readPixels).toHaveBeenCalledWith('preview://generated.png', 4, 4);
    // Left half (the region) is generated, right half keeps the original.
    const pixels = io.encoded[0];
    expect(pixels[0]).toBe(200);
    expect(pixels[3 * 4]).toBe(10);
    expect(saveDataUrl).toHaveBeenCalledWith({
      dataUrl: 'data:image/png;base64,blended',
      fileName: 'portrait-region-1700000000000.png',
    });
    const state = useAppStore.getState();
    expect(state.currentImageAssetPath).toBe('C:/outputs/edits/portrait-region-1.png');
    expect(state.assetLibrary.some((asset) => asset.path === 'C:/outputs/edits/portrait-region-1.png')).toBe(true);
  });

  it('reports a missing save bridge without touching pixels', async () => {
    const io = fakeIo();
    const outcome = await blendRegionResult(PARAMS, { io, assetsApi: {} });
    expect(outcome).toEqual({ ok: false, error: 'this build cannot save edited images' });
    expect(io.readPixels).not.toHaveBeenCalled();
  });

  it('reports unreadable pixels and leaves the current image alone', async () => {
    const io = fakeIo();
    (io.readPixels as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('pixels unreadable'));
    const outcome = await blendRegionResult(PARAMS, {
      io,
      assetsApi: { saveDataUrl: vi.fn() },
    });
    expect(outcome).toEqual({ ok: false, error: 'pixels unreadable' });
    expect(useAppStore.getState().currentImage).toBe('preview://generated.png');
  });

  it('reports a failed save', async () => {
    const outcome = await blendRegionResult(PARAMS, {
      io: fakeIo(),
      assetsApi: { saveDataUrl: vi.fn().mockResolvedValue({ success: false, error: 'disk full' }) },
    });
    expect(outcome).toEqual({ ok: false, error: 'disk full' });
  });
});
