import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAppStore } from '@/store/appStore';
import {
  EXPORT_BRIDGE_MISSING_MESSAGE,
  EXPORT_NO_CANVAS_MESSAGE,
  EXPORT_TAINTED_MESSAGE,
  exportEditedImage,
  registerEditFlattener,
  rgbToHex,
} from './exportEdit';

describe('exportEditedImage', () => {
  beforeEach(() => {
    useAppStore.setState(useAppStore.getInitialState(), true);
  });
  afterEach(() => registerEditFlattener(null));

  it('refuses when no canvas is registered', async () => {
    const result = await exportEditedImage({ assetsApi: { saveDataUrl: vi.fn() } });
    expect(result).toEqual({ ok: false, error: EXPORT_NO_CANVAS_MESSAGE });
  });

  it('reports the missing main-process bridge honestly', async () => {
    registerEditFlattener(() => 'data:image/png;base64,AAAA');
    const result = await exportEditedImage({ assetsApi: {} });
    expect(result).toEqual({ ok: false, error: EXPORT_BRIDGE_MISSING_MESSAGE });
  });

  it('saves the flattened PNG and registers it as an asset', async () => {
    registerEditFlattener(() => 'data:image/png;base64,AAAA');
    useAppStore.setState({ currentImageAssetPath: 'C:/out/photo.png' });
    const saveDataUrl = vi.fn().mockResolvedValue({
      success: true,
      file: {
        originalPath: 'photo-edit.png',
        importedPath: 'C:/assets/photo-edit.png',
        name: 'photo-edit.png',
        type: 'image',
        importedAt: '2026-01-01T00:00:00.000Z',
      },
    });

    const result = await exportEditedImage({ assetsApi: { saveDataUrl }, now: new Date(1000) });

    expect(saveDataUrl).toHaveBeenCalledWith({
      dataUrl: 'data:image/png;base64,AAAA',
      fileName: 'photo-edit-1000.png',
    });
    expect(result).toEqual({ ok: true, path: 'C:/assets/photo-edit.png' });
    expect(useAppStore.getState().assetLibrary.some((a) => a.path.includes('photo-edit'))).toBe(true);
  });

  it('surfaces a save failure', async () => {
    registerEditFlattener(() => 'data:image/png;base64,AAAA');
    const saveDataUrl = vi.fn().mockResolvedValue({ success: false, error: 'Disk full' });
    expect(await exportEditedImage({ assetsApi: { saveDataUrl } })).toEqual({ ok: false, error: 'Disk full' });
  });

  it('explains a tainted canvas instead of throwing', async () => {
    registerEditFlattener(() => {
      const error = new Error('The canvas has been tainted by cross-origin data.');
      error.name = 'SecurityError';
      throw error;
    });
    const result = await exportEditedImage({ assetsApi: { saveDataUrl: vi.fn() } });
    expect(result).toEqual({ ok: false, error: EXPORT_TAINTED_MESSAGE });
  });

  it('formats sampled colours', () => {
    expect(rgbToHex(255, 0, 16.4)).toBe('#ff0010');
  });
});
