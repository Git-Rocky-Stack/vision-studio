import { useMemo, useRef } from 'react';

import type { RetouchStroke } from '@/types/editor';

import { RetouchCache } from './retouch';

/**
 * The base image with Clone Stamp and Heal strokes burned in, as a canvas
 * the Konva base image can display (and filter, sample and export). Returns
 * the untouched image when there are no strokes, or when its pixels cannot
 * be read (a tainted image: see pixelAccess.ts).
 */
export function useRetouchedImage(
  image: HTMLImageElement | null,
  strokes: readonly RetouchStroke[],
  pixelAccess: boolean,
): HTMLImageElement | HTMLCanvasElement | null {
  const cacheRef = useRef<{ image: HTMLImageElement; cache: RetouchCache } | null>(null);

  return useMemo(() => {
    if (!image || !pixelAccess || strokes.length === 0) return image;
    const width = image.naturalWidth || image.width;
    const height = image.naturalHeight || image.height;
    try {
      if (cacheRef.current?.image !== image) {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (!context) return image;
        context.drawImage(image, 0, 0, width, height);
        const pixels = context.getImageData(0, 0, width, height);
        cacheRef.current = { image, cache: new RetouchCache({ data: pixels.data, width, height }) };
      }
      const buffer = cacheRef.current.cache.render(strokes);
      const output = document.createElement('canvas');
      output.width = width;
      output.height = height;
      const context = output.getContext('2d');
      if (!context) return image;
      context.putImageData(new ImageData(new Uint8ClampedArray(buffer.data), width, height), 0, 0);
      return output;
    } catch {
      // Unreadable pixels: show the image without retouching.
      return image;
    }
  }, [image, strokes, pixelAccess]);
}
