import { useAppStore } from '@/store/appStore';

import { registerSavedEditFile, type SaveDataUrlApi } from './exportEdit';
import { loadEditableImage } from './pixelAccess';
import { blendRegionPixels, type RegionBlendSpec } from './regionBlend';

/**
 * Blend Edges I/O: read the original and the generated frame at the source
 * size, composite them through the feathered region mask (regionBlend.ts),
 * save the composite as a new edit asset and make it the current image.
 */

export const BLEND_PIXELS_UNREADABLE =
  'its pixels could not be read (the image server does not allow pixel access)';

export interface PixelIo {
  /** RGBA pixels of `src` drawn at exactly width x height (the result is rescaled). */
  readPixels: (src: string, width: number, height: number) => Promise<Uint8ClampedArray>;
  /** RGBA pixels -> PNG data URL. */
  encodePng: (pixels: Uint8ClampedArray, width: number, height: number) => string;
}

function canvas2d(width: number, height: number): CanvasRenderingContext2D {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('a 2D canvas is not available');
  return context;
}

export const canvasPixelIo: PixelIo = {
  async readPixels(src, width, height) {
    const { image, pixelAccess } = await loadEditableImage(src);
    if (!pixelAccess) throw new Error(BLEND_PIXELS_UNREADABLE);
    const context = canvas2d(width, height);
    context.imageSmoothingQuality = 'high';
    context.drawImage(image, 0, 0, width, height);
    return context.getImageData(0, 0, width, height).data;
  },
  encodePng(pixels, width, height) {
    const context = canvas2d(width, height);
    context.putImageData(new ImageData(new Uint8ClampedArray(pixels), width, height), 0, 0);
    return context.canvas.toDataURL('image/png');
  },
};

export interface BlendRegionResultParams extends RegionBlendSpec {
  /** Preview URL of the image the region was drawn on. */
  originalSrc: string;
  /** Preview URL of the generated frame that just landed. */
  generatedSrc: string;
  /** Library path of the original, used to name the composite. */
  originalPath: string | null;
  width: number;
  height: number;
}

export interface BlendRegionResultOptions {
  io?: PixelIo;
  assetsApi?: SaveDataUrlApi;
  store?: typeof useAppStore;
  now?: Date;
}

export type BlendRegionOutcome = { ok: true; path: string } | { ok: false; error: string };

function blendFileName(originalPath: string | null, now: Date): string {
  const base = (originalPath ?? 'image').split(/[\\/]/).pop() ?? 'image';
  const stem = base.replace(/\.[a-z0-9]+$/i, '') || 'image';
  return `${stem}-region-${now.getTime()}.png`;
}

export async function blendRegionResult(
  params: BlendRegionResultParams,
  {
    io = canvasPixelIo,
    assetsApi = ((typeof window !== 'undefined' ? window.electron?.assets : undefined) ?? {}) as SaveDataUrlApi,
    store = useAppStore,
    now = new Date(),
  }: BlendRegionResultOptions = {},
): Promise<BlendRegionOutcome> {
  const width = Math.max(1, Math.round(params.width));
  const height = Math.max(1, Math.round(params.height));
  if (typeof assetsApi.saveDataUrl !== 'function') {
    return { ok: false, error: 'this build cannot save edited images' };
  }
  try {
    const [original, generated] = await Promise.all([
      io.readPixels(params.originalSrc, width, height),
      io.readPixels(params.generatedSrc, width, height),
    ]);
    const blended = blendRegionPixels(original, generated, width, height, params);
    const saved = await assetsApi.saveDataUrl({
      dataUrl: io.encodePng(blended, width, height),
      fileName: blendFileName(params.originalPath, now),
    });
    if (!saved.success || !saved.file) {
      return { ok: false, error: saved.error || 'the blended image could not be saved' };
    }
    const asset = registerSavedEditFile(store, saved.file);
    store.getState().setCurrentImage(asset.previewUrl, asset.path);
    return { ok: true, path: asset.path };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'the blend failed' };
  }
}
