import type { EditFilterState, ImageAdjustments } from '@/types/editor';

/**
 * Pixel pipeline for the Edit canvas: every Adjust slider and every Filters
 * look is applied here, to real pixels, so what the canvas shows is exactly
 * what Export flattens. Konva runs it as a custom filter on the base image
 * node (EditCanvas), and it is a pure function so it is unit-testable.
 *
 * Colour primitives follow the CSS Filter Effects matrices, so the Filters
 * tab previews (rendered with CSS) match the canvas result.
 */

export type FilterOp =
  | { kind: 'brightness'; amount: number }
  | { kind: 'contrast'; amount: number }
  | { kind: 'saturate'; amount: number }
  | { kind: 'sepia'; amount: number }
  | { kind: 'grayscale'; amount: number }
  | { kind: 'hue-rotate'; degrees: number };

export interface LookFilterDef {
  id: string;
  name: string;
  category: string;
  ops: FilterOp[];
}

export const LOOK_FILTERS: LookFilterDef[] = [
  { id: 'cinematic-warm', name: 'Cinematic Warm', category: 'cinematic', ops: [{ kind: 'contrast', amount: 1.1 }, { kind: 'saturate', amount: 1.3 }, { kind: 'sepia', amount: 0.15 }] },
  { id: 'cinematic-cool', name: 'Cinematic Cool', category: 'cinematic', ops: [{ kind: 'contrast', amount: 1.15 }, { kind: 'saturate', amount: 0.9 }, { kind: 'hue-rotate', degrees: 10 }] },
  { id: 'vintage-film', name: 'Vintage Film', category: 'vintage', ops: [{ kind: 'sepia', amount: 0.4 }, { kind: 'contrast', amount: 1.1 }, { kind: 'brightness', amount: 0.95 }] },
  { id: 'vintage-fade', name: 'Vintage Fade', category: 'vintage', ops: [{ kind: 'sepia', amount: 0.2 }, { kind: 'contrast', amount: 0.9 }, { kind: 'brightness', amount: 1.1 }, { kind: 'saturate', amount: 0.8 }] },
  { id: 'noir', name: 'Noir', category: 'bw', ops: [{ kind: 'grayscale', amount: 1 }, { kind: 'contrast', amount: 1.3 }, { kind: 'brightness', amount: 0.9 }] },
  { id: 'bw-classic', name: 'B&W Classic', category: 'bw', ops: [{ kind: 'grayscale', amount: 1 }, { kind: 'contrast', amount: 1.1 }] },
  { id: 'portrait-soft', name: 'Portrait Soft', category: 'portrait', ops: [{ kind: 'contrast', amount: 0.95 }, { kind: 'brightness', amount: 1.05 }, { kind: 'saturate', amount: 1.1 }] },
  { id: 'landscape-vivid', name: 'Landscape Vivid', category: 'landscape', ops: [{ kind: 'saturate', amount: 1.5 }, { kind: 'contrast', amount: 1.1 }, { kind: 'brightness', amount: 1.05 }] },
  { id: 'dreamy', name: 'Dreamy', category: 'creative', ops: [{ kind: 'brightness', amount: 1.1 }, { kind: 'contrast', amount: 0.9 }, { kind: 'saturate', amount: 1.2 }] },
  { id: 'cyberpunk', name: 'Cyberpunk', category: 'creative', ops: [{ kind: 'contrast', amount: 1.3 }, { kind: 'saturate', amount: 1.5 }, { kind: 'hue-rotate', degrees: -10 }] },
  { id: 'vibrant', name: 'Vibrant', category: 'creative', ops: [{ kind: 'saturate', amount: 1.8 }, { kind: 'contrast', amount: 1.1 }] },
  { id: 'matte', name: 'Matte', category: 'creative', ops: [{ kind: 'contrast', amount: 0.85 }, { kind: 'brightness', amount: 1.1 }, { kind: 'saturate', amount: 0.9 }] },
];

/** CSS equivalent of a look, for the Filters-tab preview thumbnails. */
export function lookFilterCss(ops: FilterOp[]): string {
  return ops
    .map((op) => (op.kind === 'hue-rotate' ? `hue-rotate(${op.degrees}deg)` : `${op.kind}(${op.amount})`))
    .join(' ');
}

type Matrix3 = [number, number, number, number, number, number, number, number, number];

function saturateMatrix(s: number): Matrix3 {
  return [
    0.213 + 0.787 * s, 0.715 - 0.715 * s, 0.072 - 0.072 * s,
    0.213 - 0.213 * s, 0.715 + 0.285 * s, 0.072 - 0.072 * s,
    0.213 - 0.213 * s, 0.715 - 0.715 * s, 0.072 + 0.928 * s,
  ];
}

function grayscaleMatrix(a: number): Matrix3 {
  const g = 1 - Math.min(1, Math.max(0, a));
  return [
    0.2126 + 0.7874 * g, 0.7152 - 0.7152 * g, 0.0722 - 0.0722 * g,
    0.2126 - 0.2126 * g, 0.7152 + 0.2848 * g, 0.0722 - 0.0722 * g,
    0.2126 - 0.2126 * g, 0.7152 - 0.7152 * g, 0.0722 + 0.9278 * g,
  ];
}

function sepiaMatrix(a: number): Matrix3 {
  const g = 1 - Math.min(1, Math.max(0, a));
  return [
    0.393 + 0.607 * g, 0.769 - 0.769 * g, 0.189 - 0.189 * g,
    0.349 - 0.349 * g, 0.686 + 0.314 * g, 0.168 - 0.168 * g,
    0.272 - 0.272 * g, 0.534 - 0.534 * g, 0.131 + 0.869 * g,
  ];
}

function hueRotateMatrix(degrees: number): Matrix3 {
  const rad = (degrees * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return [
    0.213 + c * 0.787 - s * 0.213, 0.715 - c * 0.715 - s * 0.715, 0.072 - c * 0.072 + s * 0.928,
    0.213 - c * 0.213 + s * 0.143, 0.715 + c * 0.285 + s * 0.14, 0.072 - c * 0.072 - s * 0.283,
    0.213 - c * 0.213 - s * 0.787, 0.715 - c * 0.715 + s * 0.715, 0.072 + c * 0.928 + s * 0.072,
  ];
}

function applyOp(op: FilterOp, rgb: [number, number, number]): void {
  let m: Matrix3 | null = null;
  switch (op.kind) {
    case 'brightness':
      rgb[0] *= op.amount;
      rgb[1] *= op.amount;
      rgb[2] *= op.amount;
      return;
    case 'contrast':
      rgb[0] = (rgb[0] - 0.5) * op.amount + 0.5;
      rgb[1] = (rgb[1] - 0.5) * op.amount + 0.5;
      rgb[2] = (rgb[2] - 0.5) * op.amount + 0.5;
      return;
    case 'saturate':
      m = saturateMatrix(op.amount);
      break;
    case 'grayscale':
      m = grayscaleMatrix(op.amount);
      break;
    case 'sepia':
      m = sepiaMatrix(op.amount);
      break;
    case 'hue-rotate':
      m = hueRotateMatrix(op.degrees);
      break;
  }
  const [r, g, b] = rgb;
  rgb[0] = m[0] * r + m[1] * g + m[2] * b;
  rgb[1] = m[3] * r + m[4] * g + m[5] * b;
  rgb[2] = m[6] * r + m[7] * g + m[8] * b;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

/** Separable box blur of RGB channels (alpha untouched). Returns a new buffer. */
export function boxBlur(src: Uint8ClampedArray, width: number, height: number, radius: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(src);
  if (radius < 1 || width === 0 || height === 0) return out;
  const tmp = new Float32Array(src.length);
  const span = radius * 2 + 1;
  // Horizontal pass.
  for (let y = 0; y < height; y += 1) {
    for (let c = 0; c < 3; c += 1) {
      let sum = 0;
      for (let k = -radius; k <= radius; k += 1) {
        const x = Math.min(width - 1, Math.max(0, k));
        sum += src[(y * width + x) * 4 + c];
      }
      for (let x = 0; x < width; x += 1) {
        tmp[(y * width + x) * 4 + c] = sum / span;
        const outX = Math.max(0, x - radius);
        const inX = Math.min(width - 1, x + radius + 1);
        sum += src[(y * width + inX) * 4 + c] - src[(y * width + outX) * 4 + c];
      }
    }
  }
  // Vertical pass.
  for (let x = 0; x < width; x += 1) {
    for (let c = 0; c < 3; c += 1) {
      let sum = 0;
      for (let k = -radius; k <= radius; k += 1) {
        const y = Math.min(height - 1, Math.max(0, k));
        sum += tmp[(y * width + x) * 4 + c];
      }
      for (let y = 0; y < height; y += 1) {
        out[(y * width + x) * 4 + c] = sum / span;
        const outY = Math.max(0, y - radius);
        const inY = Math.min(height - 1, y + radius + 1);
        sum += tmp[(inY * width + x) * 4 + c] - tmp[(outY * width + x) * 4 + c];
      }
    }
  }
  return out;
}

/** Stable per-pixel noise in [-0.5, 0.5]: grain must not crawl between renders. */
function hashNoise(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return ((h >>> 0) / 4294967295) - 0.5;
}

export function isIdentityEdit(adjustments: ImageAdjustments, filters: EditFilterState): boolean {
  const neutral = Object.values(adjustments).every((v) => v === 0);
  const noLook = filters.selected.length === 0 || filters.intensity <= 0;
  return neutral && noLook;
}

/**
 * Apply adjustments then look filters to RGBA pixels in place.
 * Order: spatial (blur, noise reduction, sharpen) -> tone/colour -> looks ->
 * vignette -> grain.
 */
export function applyEditPipeline(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  adjustments: ImageAdjustments,
  filters: EditFilterState,
): void {
  if (isIdentityEdit(adjustments, filters)) return;
  const a = adjustments;

  // --- Spatial -----------------------------------------------------------
  if (a.blur > 0) {
    const radius = Math.max(1, Math.round(a.blur / 5));
    data.set(boxBlur(data, width, height, radius));
  }
  if (a.noiseReduction > 0) {
    const smoothed = boxBlur(data, width, height, 1);
    const t = a.noiseReduction / 100;
    for (let i = 0; i < data.length; i += 4) {
      data[i] = data[i] + (smoothed[i] - data[i]) * t;
      data[i + 1] = data[i + 1] + (smoothed[i + 1] - data[i + 1]) * t;
      data[i + 2] = data[i + 2] + (smoothed[i + 2] - data[i + 2]) * t;
    }
  }
  if (a.sharpness > 0) {
    // Unsharp mask: push each pixel away from its local mean.
    const soft = boxBlur(data, width, height, 1);
    const amount = (a.sharpness / 100) * 1.5;
    for (let i = 0; i < data.length; i += 4) {
      data[i] = data[i] + (data[i] - soft[i]) * amount;
      data[i + 1] = data[i + 1] + (data[i + 1] - soft[i + 1]) * amount;
      data[i + 2] = data[i + 2] + (data[i + 2] - soft[i + 2]) * amount;
    }
  }

  // --- Per pixel ---------------------------------------------------------
  const exposure = Math.pow(2, a.exposure / 50);
  const brightness = 1 + a.brightness / 100;
  const contrast = 1 + a.contrast / 100;
  const satMatrix = a.saturation !== 0 ? saturateMatrix(1 + a.saturation / 100) : null;
  const whitePoint = 1 - (a.whites / 100) * 0.25;
  const blackPoint = -(a.blacks / 100) * 0.25;
  const levelsActive = a.whites !== 0 || a.blacks !== 0;
  const warm = (a.temperature / 100) * 0.1;
  const tint = (a.tint / 100) * 0.1;
  const lookIntensity = Math.max(0, Math.min(100, filters.intensity)) / 100;
  const looks = filters.selected
    .map((id) => LOOK_FILTERS.find((f) => f.id === id))
    .filter((f): f is LookFilterDef => Boolean(f));
  const vignette = a.vignette / 100;
  const grain = (a.grain / 100) * 0.2;
  const cx = width / 2;
  const cy = height / 2;
  const maxDist = Math.sqrt(cx * cx + cy * cy) || 1;
  const rgb: [number, number, number] = [0, 0, 0];

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      rgb[0] = data[i] / 255;
      rgb[1] = data[i + 1] / 255;
      rgb[2] = data[i + 2] / 255;

      if (exposure !== 1 || brightness !== 1) {
        const k = exposure * brightness;
        rgb[0] *= k;
        rgb[1] *= k;
        rgb[2] *= k;
      }
      if (contrast !== 1) {
        rgb[0] = (rgb[0] - 0.5) * contrast + 0.5;
        rgb[1] = (rgb[1] - 0.5) * contrast + 0.5;
        rgb[2] = (rgb[2] - 0.5) * contrast + 0.5;
      }
      if (a.highlights !== 0 || a.shadows !== 0) {
        const lum = clamp01(0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]);
        const lift =
          (a.highlights / 100) * 0.3 * smoothstep(0.5, 1, lum) +
          (a.shadows / 100) * 0.3 * (1 - smoothstep(0, 0.5, lum));
        rgb[0] += lift;
        rgb[1] += lift;
        rgb[2] += lift;
      }
      if (levelsActive) {
        const range = whitePoint - blackPoint || 1;
        rgb[0] = (rgb[0] - blackPoint) / range;
        rgb[1] = (rgb[1] - blackPoint) / range;
        rgb[2] = (rgb[2] - blackPoint) / range;
      }
      if (satMatrix) {
        const [r, g, b] = rgb;
        rgb[0] = satMatrix[0] * r + satMatrix[1] * g + satMatrix[2] * b;
        rgb[1] = satMatrix[3] * r + satMatrix[4] * g + satMatrix[5] * b;
        rgb[2] = satMatrix[6] * r + satMatrix[7] * g + satMatrix[8] * b;
      }
      if (warm !== 0 || tint !== 0) {
        rgb[0] += warm + tint * 0.5;
        rgb[1] -= tint;
        rgb[2] += -warm + tint * 0.5;
      }
      if (looks.length > 0 && lookIntensity > 0) {
        const r0 = clamp01(rgb[0]);
        const g0 = clamp01(rgb[1]);
        const b0 = clamp01(rgb[2]);
        rgb[0] = r0;
        rgb[1] = g0;
        rgb[2] = b0;
        for (const look of looks) {
          for (const op of look.ops) {
            applyOp(op, rgb);
            rgb[0] = clamp01(rgb[0]);
            rgb[1] = clamp01(rgb[1]);
            rgb[2] = clamp01(rgb[2]);
          }
        }
        rgb[0] = r0 + (rgb[0] - r0) * lookIntensity;
        rgb[1] = g0 + (rgb[1] - g0) * lookIntensity;
        rgb[2] = b0 + (rgb[2] - b0) * lookIntensity;
      }
      if (vignette > 0) {
        const dx = x - cx;
        const dy = y - cy;
        const dist = Math.sqrt(dx * dx + dy * dy) / maxDist;
        const k = 1 - vignette * smoothstep(0.35, 1, dist);
        rgb[0] *= k;
        rgb[1] *= k;
        rgb[2] *= k;
      }
      if (grain > 0) {
        const n = hashNoise(x, y) * grain;
        rgb[0] += n;
        rgb[1] += n;
        rgb[2] += n;
      }

      data[i] = clamp01(rgb[0]) * 255;
      data[i + 1] = clamp01(rgb[1]) * 255;
      data[i + 2] = clamp01(rgb[2]) * 255;
    }
  }
}

/** Toggle a look: stack mode adds/removes, single mode replaces. */
export function toggleLookFilter(filters: EditFilterState, id: string): string[] {
  if (filters.stackMode) {
    return filters.selected.includes(id)
      ? filters.selected.filter((f) => f !== id)
      : [...filters.selected, id];
  }
  return filters.selected.includes(id) && filters.selected.length === 1 ? [] : [id];
}
