import { describe, expect, it } from 'vitest';

import { DEFAULT_ADJUSTMENTS } from '@/types/editor';
import { cssFallbackFilter, loadEditableImage } from './pixelAccess';

/** Image stub: `failCors` rejects loads that asked for CORS approval. */
function makeImageClass({ failCors = false } = {}) {
  const created: Array<{ crossOrigin: string | null; loadedSrc?: string }> = [];
  class FakeImage {
    crossOrigin: string | null = null;
    loadedSrc?: string;
    width = 10;
    height = 10;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    constructor() {
      created.push(this);
    }
    set src(value: string) {
      this.loadedSrc = value;
      queueMicrotask(() => {
        if (failCors && this.crossOrigin) this.onerror?.();
        else this.onload?.();
      });
    }
  }
  return { ImageClass: FakeImage as unknown as new () => HTMLImageElement, created };
}

describe('loadEditableImage', () => {
  it('asks a cross-origin server for CORS approval and keeps pixel access when granted', async () => {
    const { ImageClass, created } = makeImageClass();
    const result = await loadEditableImage('http://localhost:8000/outputs/a.png', { ImageClass, probe: () => true });
    expect(created[0].crossOrigin).toBe('anonymous');
    expect(result.pixelAccess).toBe(true);
  });

  it('falls back to a display-only load when the server refuses CORS', async () => {
    const { ImageClass, created } = makeImageClass({ failCors: true });
    const result = await loadEditableImage('http://localhost:8000/outputs/a.png', { ImageClass, probe: () => true });
    expect(created).toHaveLength(2);
    expect(created[1].crossOrigin).toBeNull();
    expect(result.pixelAccess).toBe(false);
  });

  it('probes local sources for a tainted canvas', async () => {
    const { ImageClass, created } = makeImageClass();
    const result = await loadEditableImage('file:///C:/out/a.png', { ImageClass, probe: () => false, readDataUrl: undefined });
    expect(created[0].crossOrigin).toBeNull();
    expect(result.pixelAccess).toBe(false);
  });

  it('re-reads a tainted file:// import through the data URL bridge', async () => {
    const { ImageClass } = makeImageClass();
    const readDataUrl = async (path: string) => {
      expect(path).toBe('file:///C:/out/imports/a.png');
      return { success: true, dataUrl: 'data:image/png;base64,AAAA' };
    };
    const probe = (img: HTMLImageElement) =>
      (img as unknown as { loadedSrc?: string }).loadedSrc?.startsWith('data:') ?? false;
    const result = await loadEditableImage('file:///C:/out/imports/a.png', { ImageClass, probe, readDataUrl });
    expect((result.image as unknown as { loadedSrc?: string }).loadedSrc).toBe('data:image/png;base64,AAAA');
    expect(result.pixelAccess).toBe(true);
  });

  it('keeps the display-only image when the bridge refuses the path', async () => {
    const { ImageClass } = makeImageClass();
    const readDataUrl = async () => ({ success: false, error: 'outside managed output directories' });
    const result = await loadEditableImage('file:///C:/elsewhere/a.png', { ImageClass, probe: () => false, readDataUrl });
    expect((result.image as unknown as { loadedSrc?: string }).loadedSrc).toBe('file:///C:/elsewhere/a.png');
    expect(result.pixelAccess).toBe(false);
  });
});

describe('cssFallbackFilter', () => {
  it('previews what CSS can express and nothing at neutral', () => {
    expect(cssFallbackFilter(DEFAULT_ADJUSTMENTS)).toBe('');
    expect(cssFallbackFilter({ ...DEFAULT_ADJUSTMENTS, contrast: 20, blur: 10 })).toBe('contrast(1.2) blur(2px)');
  });
});
