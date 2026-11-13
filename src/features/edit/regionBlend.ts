import type { RegionMask } from '@/types/project';

/**
 * Region Lock Feather + Blend Edges (client-side paste-back).
 *
 * The backend inpaint pass (backend/utils/direct_generator.py) rasterises the
 * vector mask hard (backend/guided/masks.py) and returns the pipeline's whole
 * frame. It has no mask-blur or paste-back parameter, and the request schema
 * only accepts vector masks, so a pre-blurred raster cannot be uploaded.
 *
 * Both controls are therefore applied here, when the result returns:
 *
 * - Blend Edges ON: the generated frame is composited back over the original
 *   through the region mask. Pixels outside the region stay exactly as they
 *   were (the raw pipeline frame drifts slightly everywhere through the VAE
 *   round trip), and the seam is softened by Feather.
 * - Feather: the width in source pixels of that soft edge - the hard mask is
 *   blurred (three separable box blurs, a close Gaussian approximation)
 *   before compositing. 0 = a hard edge.
 * - Blend Edges OFF: the raw pipeline frame is used as-is, so Feather has
 *   nothing to soften (the panel disables it and says so).
 *
 * The math below is pure (typed arrays in, typed arrays out) so it is exact
 * and testable without a canvas; regionBlendRunner.ts does the pixel I/O.
 */

/** Feather slider bounds (RegionMask.featherRadius is 0-20 px). */
export const FEATHER_MAX = 20;

// Mirrors backend/guided/masks.py so the composite matches the area the
// backend actually repainted.
const DEFAULT_BRUSH_FRACTION = 0.02;
const MIN_BRUSH_RADIUS = 6;

function clampPoint(value: number, max: number): number {
  return Math.min(Math.max(Number.isFinite(value) ? value : 0, 0), max);
}

function brushRadius(mask: RegionMask, width: number, height: number): number {
  if (mask.brushSize) return Math.max(1, mask.brushSize / 2);
  return Math.max(MIN_BRUSH_RADIUS, DEFAULT_BRUSH_FRACTION * Math.hypot(width, height));
}

function fillRect(out: Float32Array, width: number, height: number, mask: RegionMask): void {
  const x1 = clampPoint(mask.bounds.x, width);
  const y1 = clampPoint(mask.bounds.y, height);
  const x2 = Math.min(x1 + Math.max(0, mask.bounds.width), width);
  const y2 = Math.min(y1 + Math.max(0, mask.bounds.height), height);
  for (let y = 0; y < height; y += 1) {
    const cy = y + 0.5;
    if (cy < y1 || cy > y2) continue;
    for (let x = 0; x < width; x += 1) {
      const cx = x + 0.5;
      if (cx >= x1 && cx <= x2) out[y * width + x] = 1;
    }
  }
}

/** Even-odd scanline fill at pixel centres. */
function fillPolygon(
  out: Float32Array,
  width: number,
  height: number,
  points: Array<{ x: number; y: number }>,
): void {
  const crossings: number[] = [];
  for (let y = 0; y < height; y += 1) {
    const cy = y + 0.5;
    crossings.length = 0;
    for (let i = 0; i < points.length; i += 1) {
      const a = points[i];
      const b = points[(i + 1) % points.length];
      if ((a.y <= cy && b.y > cy) || (b.y <= cy && a.y > cy)) {
        crossings.push(a.x + ((cy - a.y) / (b.y - a.y)) * (b.x - a.x));
      }
    }
    crossings.sort((left, right) => left - right);
    for (let i = 0; i + 1 < crossings.length; i += 2) {
      const start = Math.max(0, Math.ceil(crossings[i] - 0.5));
      const end = Math.min(width - 1, Math.floor(crossings[i + 1] - 0.5));
      for (let x = start; x <= end; x += 1) out[y * width + x] = 1;
    }
  }
}

/** Round-capped stroke: every pixel centre within `radius` of a segment. */
function fillStroke(
  out: Float32Array,
  width: number,
  height: number,
  points: Array<{ x: number; y: number }>,
  radius: number,
): void {
  const r2 = radius * radius;
  const segments = points.length === 1 ? [[points[0], points[0]]] : points.slice(1).map((p, i) => [points[i], p]);
  for (const [a, b] of segments) {
    const minX = Math.max(0, Math.floor(Math.min(a.x, b.x) - radius));
    const maxX = Math.min(width - 1, Math.ceil(Math.max(a.x, b.x) + radius));
    const minY = Math.max(0, Math.floor(Math.min(a.y, b.y) - radius));
    const maxY = Math.min(height - 1, Math.ceil(Math.max(a.y, b.y) + radius));
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lengthSq = dx * dx + dy * dy;
    for (let y = minY; y <= maxY; y += 1) {
      const cy = y + 0.5;
      for (let x = minX; x <= maxX; x += 1) {
        const cx = x + 0.5;
        const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((cx - a.x) * dx + (cy - a.y) * dy) / lengthSq));
        const ex = cx - (a.x + t * dx);
        const ey = cy - (a.y + t * dy);
        if (ex * ex + ey * ey <= r2) out[y * width + x] = 1;
      }
    }
  }
}

/**
 * Vector region mask -> per-pixel coverage (1 = inside) at the source size,
 * following the backend rasteriser's rules: rectangle from bounds, polygon
 * (a stroke when it has fewer than 3 points), brush as a round stroke, and
 * a standalone erase mask covering nothing.
 */
export function rasterizeRegionMask(mask: RegionMask, width: number, height: number): Float32Array {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  const out = new Float32Array(w * h);
  const points = mask.points.map((p) => ({ x: clampPoint(p.x, w), y: clampPoint(p.y, h) }));
  if (points.length === 0 || mask.type === 'erase') return out;

  if (mask.type === 'rectangle') {
    fillRect(out, w, h, mask);
  } else if (mask.type === 'polygon' && points.length >= 3) {
    fillPolygon(out, w, h, points);
  } else {
    fillStroke(out, w, h, points, brushRadius(mask, w, h));
  }
  return out;
}

/** In-place 1 - m: the region becomes everything outside it. */
export function invertCoverage(mask: Float32Array): Float32Array {
  for (let i = 0; i < mask.length; i += 1) mask[i] = 1 - mask[i];
  return mask;
}

function boxBlurPass(
  input: Float32Array,
  output: Float32Array,
  width: number,
  height: number,
  radius: number,
  horizontal: boolean,
): void {
  const lines = horizontal ? height : width;
  const length = horizontal ? width : height;
  const stride = horizontal ? 1 : width;
  const span = radius * 2 + 1;
  for (let line = 0; line < lines; line += 1) {
    const base = horizontal ? line * width : line;
    const at = (i: number) => input[base + Math.min(length - 1, Math.max(0, i)) * stride];
    let sum = 0;
    for (let i = -radius; i <= radius; i += 1) sum += at(i);
    for (let i = 0; i < length; i += 1) {
      output[base + i * stride] = sum / span;
      sum += at(i + radius + 1) - at(i - radius);
    }
  }
}

/**
 * Soft edge of `radius` px: three separable box blurs whose combined spread
 * is the radius (edges clamp, so a mask touching the frame stays solid).
 * Returns a new array; radius <= 0 returns an unblurred copy.
 */
export function featherCoverage(
  mask: Float32Array,
  width: number,
  height: number,
  radius: number,
): Float32Array {
  const result = Float32Array.from(mask);
  const r = Math.min(FEATHER_MAX, Math.max(0, Math.round(radius)));
  if (r === 0) return result;
  const passRadius = Math.max(1, Math.round(r / 3));
  const scratch = new Float32Array(mask.length);
  for (let pass = 0; pass < 3; pass += 1) {
    boxBlurPass(result, scratch, width, height, passRadius, true);
    boxBlurPass(scratch, result, width, height, passRadius, false);
  }
  return result;
}

/**
 * out = original + (generated - original) * coverage, per RGBA channel.
 * Both buffers are RGBA at the same size; returns a new buffer.
 */
export function compositeThroughMask(
  original: Uint8ClampedArray,
  generated: Uint8ClampedArray,
  coverage: Float32Array,
): Uint8ClampedArray {
  if (original.length !== generated.length || original.length !== coverage.length * 4) {
    throw new Error('Blend Edges: the source, result and mask sizes do not match.');
  }
  const out = new Uint8ClampedArray(original.length);
  for (let i = 0; i < coverage.length; i += 1) {
    const m = coverage[i];
    const o = i * 4;
    for (let c = 0; c < 4; c += 1) {
      out[o + c] = Math.round(original[o + c] + (generated[o + c] - original[o + c]) * m);
    }
  }
  return out;
}

export interface RegionBlendSpec {
  mask: RegionMask;
  invert: boolean;
  featherRadius: number;
}

/** The full blend for one result: rasterise, invert if asked, feather, composite. */
export function blendRegionPixels(
  original: Uint8ClampedArray,
  generated: Uint8ClampedArray,
  width: number,
  height: number,
  spec: RegionBlendSpec,
): Uint8ClampedArray {
  const coverage = rasterizeRegionMask(spec.mask, width, height);
  if (spec.invert) invertCoverage(coverage);
  return compositeThroughMask(original, generated, featherCoverage(coverage, width, height, spec.featherRadius));
}
