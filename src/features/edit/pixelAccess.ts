import type { ImageAdjustments } from '@/types/editor';

/**
 * Pixel access for the Edit canvas. The adjustment pipeline, the eyedropper
 * and Export all read pixels back from a canvas, which the browser forbids
 * once a cross-origin image without CORS approval has been drawn ("tainted").
 * The packaged app loads from file:// while previews come from the backend
 * on http://localhost:8000, so this is a real case, not a theoretical one.
 *
 * loadEditableImage asks for CORS first and falls back to a plain load, then
 * probes whether pixels are readable. When they are not, the canvas keeps a
 * CSS preview of the adjustments CSS can express and says what is missing.
 */

export interface LoadedEditImage {
  image: HTMLImageElement;
  pixelAccess: boolean;
}

type ImageCtor = new () => HTMLImageElement;

function isCrossOriginHttp(src: string): boolean {
  if (!/^https?:\/\//i.test(src)) return false;
  try {
    return typeof window === 'undefined' || new URL(src).origin !== window.location.origin;
  } catch {
    return false;
  }
}

function loadOnce(src: string, Ctor: ImageCtor, crossOrigin: boolean): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Ctor();
    if (crossOrigin) img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Image failed to load'));
    img.src = src;
  });
}

/** True when a drawn copy of the image can be read back (the canvas is not tainted). */
export function canReadPixels(image: HTMLImageElement): boolean {
  if (typeof document === 'undefined') return true;
  // jsdom has no canvas backend; there is nothing to probe there.
  if (typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent)) return true;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const context = canvas.getContext('2d');
    if (!context) return true;
    context.drawImage(image, 0, 0, 1, 1);
    context.getImageData(0, 0, 1, 1);
    return true;
  } catch {
    return false;
  }
}

export async function loadEditableImage(
  src: string,
  { ImageClass = (typeof window !== 'undefined' ? window.Image : undefined) as ImageCtor | undefined,
    probe = canReadPixels }: { ImageClass?: ImageCtor; probe?: (img: HTMLImageElement) => boolean } = {},
): Promise<LoadedEditImage> {
  if (!ImageClass) throw new Error('Images cannot be loaded here');
  if (isCrossOriginHttp(src)) {
    try {
      const image = await loadOnce(src, ImageClass, true);
      return { image, pixelAccess: probe(image) };
    } catch {
      // The server sent no CORS approval; load it for display only.
      const image = await loadOnce(src, ImageClass, false);
      return { image, pixelAccess: false };
    }
  }
  const image = await loadOnce(src, ImageClass, false);
  return { image, pixelAccess: probe(image) };
}

export const PIXEL_ACCESS_NOTICE =
  "This image's server does not allow pixel access, so the canvas previews only brightness, contrast, saturation, exposure, temperature and blur, and the eyedropper, filters and Export are unavailable.";

/** CSS approximation used only when pixels cannot be read. */
export function cssFallbackFilter(a: ImageAdjustments): string {
  return [
    a.brightness !== 0 || a.exposure !== 0
      ? `brightness(${(1 + a.brightness / 100) * Math.pow(2, a.exposure / 50)})`
      : '',
    a.contrast !== 0 ? `contrast(${1 + a.contrast / 100})` : '',
    a.saturation !== 0 ? `saturate(${1 + a.saturation / 100})` : '',
    a.blur > 0 ? `blur(${a.blur * 0.2}px)` : '',
    a.temperature > 0 ? `sepia(${a.temperature / 200})` : '',
  ]
    .filter(Boolean)
    .join(' ');
}
