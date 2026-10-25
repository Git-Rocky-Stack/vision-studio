import type { RetouchStroke } from '@/types/editor';

/**
 * Clone Stamp and Heal, applied to real pixels.
 *
 * Retouch strokes live in the store as vector paths (image pixels) plus the
 * sampling offset they were painted with, so undo/redo and a reload of the
 * same image replay them exactly. `applyRetouchStroke` burns one stroke into
 * an RGBA buffer; EditCanvas replays the list over the base image and shows
 * the result as the base layer, under adjustments, filters, text and shapes.
 *
 * - Clone copies the pixels at `point + offset` under a soft round brush.
 * - Heal solves a Poisson equation over the stroke: the texture (gradients)
 *   comes from the source and the colour and light come from the pixels
 *   around the stroke, so the patch melts into its surroundings. With no
 *   source set (spot heal) the source is picked automatically from the
 *   neighbourhood that best matches the area around the stroke.
 *
 * Everything here works on plain arrays so it runs, and is tested, without a
 * canvas.
 */

export interface RgbaBuffer {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

export interface PixelBounds {
  x0: number;
  y0: number;
  /** Exclusive. */
  x1: number;
  /** Exclusive. */
  y1: number;
}

export interface StrokeMask {
  bounds: PixelBounds;
  /** Coverage 0..1, row-major over `bounds`. */
  coverage: Float32Array;
}

export const RETOUCH_SIZE_MIN = 1;
export const RETOUCH_SIZE_MAX = 400;

/** Pixel bounds of a stroke, padded by its radius and clipped to the image. */
export function strokeBounds(points: number[], size: number, width: number, height: number): PixelBounds | null {
  if (points.length < 2) return null;
  const radius = Math.max(0.5, size / 2);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i + 1 < points.length; i += 2) {
    minX = Math.min(minX, points[i]);
    maxX = Math.max(maxX, points[i]);
    minY = Math.min(minY, points[i + 1]);
    maxY = Math.max(maxY, points[i + 1]);
  }
  const x0 = Math.max(0, Math.floor(minX - radius - 1));
  const y0 = Math.max(0, Math.floor(minY - radius - 1));
  const x1 = Math.min(width, Math.ceil(maxX + radius + 1));
  const y1 = Math.min(height, Math.ceil(maxY + radius + 1));
  if (x1 <= x0 || y1 <= y0) return null;
  return { x0, y0, x1, y1 };
}

/** Coverage of a round brush with a soft edge: 1 inside the hard core, 0 past the radius. */
function brushFalloff(distance: number, radius: number, hardness: number): number {
  if (distance >= radius) return 0;
  const core = radius * Math.min(1, Math.max(0, hardness));
  if (distance <= core) return 1;
  const t = (distance - core) / Math.max(1e-6, radius - core);
  // Smoothstep from 1 to 0 across the soft edge.
  return 1 - t * t * (3 - 2 * t);
}

/**
 * Rasterise a stroke into a coverage mask. Each segment only visits its own
 * padded bounding box, so the cost scales with the stroke's area, not with
 * points times pixels.
 */
export function rasterizeStrokeMask(
  points: number[],
  size: number,
  hardness: number,
  width: number,
  height: number,
): StrokeMask | null {
  const bounds = strokeBounds(points, size, width, height);
  if (!bounds) return null;
  const radius = Math.max(0.5, size / 2);
  const bw = bounds.x1 - bounds.x0;
  const bh = bounds.y1 - bounds.y0;
  const coverage = new Float32Array(bw * bh);

  const stamp = (ax: number, ay: number, bx: number, by: number) => {
    const sx0 = Math.max(bounds.x0, Math.floor(Math.min(ax, bx) - radius));
    const sy0 = Math.max(bounds.y0, Math.floor(Math.min(ay, by) - radius));
    const sx1 = Math.min(bounds.x1, Math.ceil(Math.max(ax, bx) + radius) + 1);
    const sy1 = Math.min(bounds.y1, Math.ceil(Math.max(ay, by) + radius) + 1);
    const dx = bx - ax;
    const dy = by - ay;
    const lengthSq = dx * dx + dy * dy;
    for (let y = sy0; y < sy1; y++) {
      const py = y + 0.5;
      for (let x = sx0; x < sx1; x++) {
        const px = x + 0.5;
        let t = lengthSq > 0 ? ((px - ax) * dx + (py - ay) * dy) / lengthSq : 0;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const cx = ax + t * dx - px;
        const cy = ay + t * dy - py;
        const value = brushFalloff(Math.sqrt(cx * cx + cy * cy), radius, hardness);
        if (value > 0) {
          const index = (y - bounds.y0) * bw + (x - bounds.x0);
          if (value > coverage[index]) coverage[index] = value;
        }
      }
    }
  };

  if (points.length < 4) {
    stamp(points[0], points[1], points[0], points[1]);
  } else {
    for (let i = 0; i + 3 < points.length; i += 2) {
      stamp(points[i], points[i + 1], points[i + 2], points[i + 3]);
    }
  }
  return { bounds, coverage };
}

function sampleChannel(src: Uint8ClampedArray, width: number, height: number, x: number, y: number, c: number): number {
  const cx = x < 0 ? 0 : x >= width ? width - 1 : x;
  const cy = y < 0 ? 0 : y >= height ? height - 1 : y;
  return src[(cy * width + cx) * 4 + c];
}

function roundOffset(offset: { x: number; y: number }): { x: number; y: number } {
  return { x: Math.round(offset.x), y: Math.round(offset.y) };
}

/** Clone: blend the pixels at `p + offset` over `p`, weighted by the mask. */
export function applyClone(
  target: RgbaBuffer,
  source: Uint8ClampedArray,
  mask: StrokeMask,
  offset: { x: number; y: number },
  opacity: number,
): void {
  const { data, width, height } = target;
  const { x0, y0, x1, y1 } = mask.bounds;
  const bw = x1 - x0;
  const { x: ox, y: oy } = roundOffset(offset);
  const strength = Math.min(1, Math.max(0, opacity));
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const weight = mask.coverage[(y - y0) * bw + (x - x0)] * strength;
      if (weight <= 0) continue;
      const i = (y * width + x) * 4;
      for (let c = 0; c < 4; c++) {
        const s = sampleChannel(source, width, height, x + ox, y + oy, c);
        data[i + c] = data[i + c] + (s - data[i + c]) * weight;
      }
    }
  }
}

const NEIGHBOURS: readonly [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/**
 * Pick a spot-heal source: of eight nearby offsets, the one whose
 * neighbourhood best matches the ring of pixels around the stroke. Returns
 * null when no candidate stays inside the image.
 */
export function findHealSource(
  source: Uint8ClampedArray,
  width: number,
  height: number,
  mask: StrokeMask,
): { x: number; y: number } | null {
  const { x0, y0, x1, y1 } = mask.bounds;
  const bw = x1 - x0;
  const bh = y1 - y0;
  const step = Math.max(bw, bh) + 2;
  const candidates: { x: number; y: number }[] = [];
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    const ox = dx * step;
    const oy = dy * step;
    if (x0 + ox >= 0 && y0 + oy >= 0 && x1 + ox <= width && y1 + oy <= height) {
      candidates.push({ x: ox, y: oy });
    }
  }
  if (candidates.length === 0) return null;

  // The context ring: pixels in the bounds the brush did not touch. A stroke
  // that fills its whole box scores on its outer edge instead.
  const ring: number[] = [];
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const outside = mask.coverage[(y - y0) * bw + (x - x0)] === 0;
      const edge = y === y0 || x === x0 || y === y1 - 1 || x === x1 - 1;
      if (outside || edge) ring.push(x, y);
    }
  }
  // Subsample big rings: the score only has to rank eight candidates.
  const stride = Math.max(1, Math.floor(ring.length / 2 / 4000)) * 2;

  let best: { x: number; y: number } | null = null;
  let bestScore = Infinity;
  for (const candidate of candidates) {
    let score = 0;
    for (let k = 0; k < ring.length; k += stride) {
      const x = ring[k];
      const y = ring[k + 1];
      const d = (y * width + x) * 4;
      const s = ((y + candidate.y) * width + (x + candidate.x)) * 4;
      for (let c = 0; c < 3; c++) {
        const diff = source[d + c] - source[s + c];
        score += diff * diff;
      }
    }
    if (score < bestScore) {
      bestScore = score;
      best = candidate;
    }
  }
  return best;
}

/** Iteration budget for the Poisson solve, by unknown count. */
export function healIterations(unknowns: number): number {
  return Math.max(60, Math.min(400, Math.round(Math.sqrt(unknowns) * 3)));
}

/** Above this many unknown pixels, the solve starts from a coarse-grid seed. */
export const HEAL_COARSE_THRESHOLD = 4000;
/** Fine iterations after a coarse seed: only the detail near the edges is left. */
const HEAL_REFINE_ITERATIONS = 30;

/**
 * Coarse seed for a large solve. The answer is the guide plus a smooth
 * (harmonic) correction that meets the fixed pixels around the stroke; that
 * correction is solved on a grid `factor` times coarser and sampled back up
 * bilinearly, so the fine solver only has to refine it. `fixed(x, y, c)` is
 * the correction a fixed pixel needs (target minus guide).
 */
function coarseCorrection(
  bounds: PixelBounds,
  isUnknown: (x: number, y: number) => boolean,
  fixed: (x: number, y: number, c: number) => number,
  factor: number,
): (x: number, y: number, c: number) => number {
  const { x0, y0, x1, y1 } = bounds;
  const cw = Math.ceil((x1 - x0) / factor);
  const ch = Math.ceil((y1 - y0) / factor);
  const values = new Float32Array(cw * ch * 4);
  const counts = new Int32Array(cw * ch);
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      if (isUnknown(x, y)) continue;
      const cell = Math.floor((y - y0) / factor) * cw + Math.floor((x - x0) / factor);
      counts[cell]++;
      for (let c = 0; c < 4; c++) values[cell * 4 + c] += fixed(x, y, c);
    }
  }
  const free: number[] = [];
  for (let cell = 0; cell < cw * ch; cell++) {
    if (counts[cell] > 0) {
      for (let c = 0; c < 4; c++) values[cell * 4 + c] /= counts[cell];
    } else {
      free.push(cell);
    }
  }

  // Laplace on the free cells. Grid edges reflect (a missing neighbour
  // counts as the cell itself), which never happens for the padded bounds
  // in practice but keeps the solve well defined.
  const iterations = Math.max(30, Math.min(300, Math.round(Math.sqrt(free.length) * 3)));
  for (let iteration = 0; iteration < iterations; iteration++) {
    let maxDelta = 0;
    for (const cell of free) {
      const cx = cell % cw;
      const cy = (cell - cx) / cw;
      const left = cx > 0 ? cell - 1 : cell;
      const right = cx < cw - 1 ? cell + 1 : cell;
      const up = cy > 0 ? cell - cw : cell;
      const down = cy < ch - 1 ? cell + cw : cell;
      for (let c = 0; c < 4; c++) {
        const average =
          (values[left * 4 + c] + values[right * 4 + c] + values[up * 4 + c] + values[down * 4 + c]) / 4;
        const current = values[cell * 4 + c];
        const next = current + 1.85 * (average - current);
        maxDelta = Math.max(maxDelta, Math.abs(next - current));
        values[cell * 4 + c] = next;
      }
    }
    if (maxDelta < 0.05) break;
  }

  return (x, y, c) => {
    const fx = Math.min(cw - 1, Math.max(0, (x - x0 + 0.5) / factor - 0.5));
    const fy = Math.min(ch - 1, Math.max(0, (y - y0 + 0.5) / factor - 0.5));
    const ax = Math.floor(fx);
    const ay = Math.floor(fy);
    const bx = Math.min(cw - 1, ax + 1);
    const by = Math.min(ch - 1, ay + 1);
    const tx = fx - ax;
    const ty = fy - ay;
    const top = values[(ay * cw + ax) * 4 + c] * (1 - tx) + values[(ay * cw + bx) * 4 + c] * tx;
    const bottom = values[(by * cw + ax) * 4 + c] * (1 - tx) + values[(by * cw + bx) * 4 + c] * tx;
    return top * (1 - ty) + bottom * ty;
  };
}

/**
 * Heal: Poisson blend of the source patch into the stroke. Unknowns are the
 * masked pixels; the pixels around them are fixed boundary values from the
 * target, and the source supplies the gradients (the texture). With a null
 * offset the gradients are zero, which fills the stroke smoothly from its
 * surroundings. The mask's soft edge then blends the solution in.
 */
export function applyHeal(
  target: RgbaBuffer,
  source: Uint8ClampedArray,
  mask: StrokeMask,
  offset: { x: number; y: number } | null,
  opacity: number,
): void {
  const { data, width, height } = target;
  const { x0, y0, x1, y1 } = mask.bounds;
  const bw = x1 - x0;
  const bh = y1 - y0;
  const strength = Math.min(1, Math.max(0, opacity));
  const off = offset ? roundOffset(offset) : null;

  // Unknown pixels: covered, and not on the image border (the solver needs
  // all four neighbours to exist).
  const unknownIndex = new Int32Array(bw * bh).fill(-1);
  const unknownXY: number[] = [];
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const local = (y - y0) * bw + (x - x0);
      if (mask.coverage[local] <= 0) continue;
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) continue;
      unknownIndex[local] = unknownXY.length / 2;
      unknownXY.push(x, y);
    }
  }
  const count = unknownXY.length / 2;
  if (count === 0) return;

  const guide = (x: number, y: number, c: number) =>
    off ? sampleChannel(source, width, height, x + off.x, y + off.y, c) : 0;

  // Seed with the source shifted to the boundary's mean level, so the solver
  // starts close to the answer and few iterations are needed.
  const boundaryMean = [0, 0, 0, 0];
  const guideMean = [0, 0, 0, 0];
  let boundaryCount = 0;
  for (let k = 0; k < count; k++) {
    const x = unknownXY[k * 2];
    const y = unknownXY[k * 2 + 1];
    for (const [dx, dy] of NEIGHBOURS) {
      const nx = x + dx;
      const ny = y + dy;
      const inBounds = nx >= x0 && nx < x1 && ny >= y0 && ny < y1;
      if (inBounds && unknownIndex[(ny - y0) * bw + (nx - x0)] >= 0) continue;
      for (let c = 0; c < 4; c++) {
        boundaryMean[c] += source[(ny * width + nx) * 4 + c];
        guideMean[c] += guide(nx, ny, c);
      }
      boundaryCount++;
    }
  }
  for (let c = 0; c < 4; c++) {
    boundaryMean[c] /= Math.max(1, boundaryCount);
    guideMean[c] /= Math.max(1, boundaryCount);
  }

  // Large strokes seed from a coarse solve of the smooth correction; the
  // fine iterations then only refine it. Small ones seed from the guide
  // shifted to the boundary's mean level.
  const coarse =
    count > HEAL_COARSE_THRESHOLD
      ? coarseCorrection(
          mask.bounds,
          (x, y) =>
            x >= x0 && x < x1 && y >= y0 && y < y1 && unknownIndex[(y - y0) * bw + (x - x0)] >= 0,
          (x, y, c) => source[(y * width + x) * 4 + c] - guide(x, y, c),
          Math.ceil(Math.sqrt(count / (HEAL_COARSE_THRESHOLD / 2))),
        )
      : null;
  const solution = new Float32Array(count * 4);
  for (let k = 0; k < count; k++) {
    const x = unknownXY[k * 2];
    const y = unknownXY[k * 2 + 1];
    for (let c = 0; c < 4; c++) {
      solution[k * 4 + c] = coarse
        ? guide(x, y, c) + coarse(x, y, c)
        : off
          ? guide(x, y, c) - guideMean[c] + boundaryMean[c]
          : boundaryMean[c];
    }
  }

  // Constant part of each equation: the guidance Laplacian plus the fixed
  // boundary neighbours. Neighbour links to other unknowns are kept apart.
  const constant = new Float32Array(count * 4);
  const links = new Int32Array(count * 4).fill(-1);
  for (let k = 0; k < count; k++) {
    const x = unknownXY[k * 2];
    const y = unknownXY[k * 2 + 1];
    NEIGHBOURS.forEach(([dx, dy], n) => {
      const nx = x + dx;
      const ny = y + dy;
      const inBounds = nx >= x0 && nx < x1 && ny >= y0 && ny < y1;
      const neighbour = inBounds ? unknownIndex[(ny - y0) * bw + (nx - x0)] : -1;
      links[k * 4 + n] = neighbour;
      for (let c = 0; c < 4; c++) {
        let value = guide(x, y, c) - guide(nx, ny, c);
        if (neighbour < 0) value += source[(ny * width + nx) * 4 + c];
        constant[k * 4 + c] += value;
      }
    });
  }

  // Successive over-relaxation, channels unrolled: this loop is the cost.
  const omega = 1.85;
  const iterations = coarse ? HEAL_REFINE_ITERATIONS : healIterations(count);
  for (let iteration = 0; iteration < iterations; iteration++) {
    let maxDelta = 0;
    for (let k = 0; k < count; k++) {
      const base = k * 4;
      const n0 = links[base];
      const n1 = links[base + 1];
      const n2 = links[base + 2];
      const n3 = links[base + 3];
      for (let c = 0; c < 4; c++) {
        let sum = constant[base + c];
        if (n0 >= 0) sum += solution[n0 * 4 + c];
        if (n1 >= 0) sum += solution[n1 * 4 + c];
        if (n2 >= 0) sum += solution[n2 * 4 + c];
        if (n3 >= 0) sum += solution[n3 * 4 + c];
        const current = solution[base + c];
        const step = omega * (sum * 0.25 - current);
        solution[base + c] = current + step;
        const delta = step < 0 ? -step : step;
        if (delta > maxDelta) maxDelta = delta;
      }
    }
    if (maxDelta < 0.05) break;
  }

  for (let k = 0; k < count; k++) {
    const x = unknownXY[k * 2];
    const y = unknownXY[k * 2 + 1];
    const weight = mask.coverage[(y - y0) * bw + (x - x0)] * strength;
    const i = (y * width + x) * 4;
    for (let c = 0; c < 4; c++) {
      data[i + c] = data[i + c] + (solution[k * 4 + c] - data[i + c]) * weight;
    }
  }
}

/**
 * Burn one retouch stroke into `target` in place. Source pixels are read
 * from a copy taken before the stroke, so a stroke never samples its own
 * output (no smearing when source and destination overlap).
 */
export function applyRetouchStroke(target: RgbaBuffer, stroke: RetouchStroke): void {
  const mask = rasterizeStrokeMask(stroke.points, stroke.size, stroke.hardness, target.width, target.height);
  if (!mask) return;
  const source = new Uint8ClampedArray(target.data);
  if (stroke.tool === 'clone') {
    if (!stroke.offset) return;
    applyClone(target, source, mask, stroke.offset, stroke.opacity);
    return;
  }
  const offset = stroke.offset ?? findHealSource(source, target.width, target.height, mask);
  applyHeal(target, source, mask, offset, stroke.opacity);
}

/** Replay strokes over a copy of `base`. */
export function renderRetouch(base: RgbaBuffer, strokes: readonly RetouchStroke[]): RgbaBuffer {
  const result: RgbaBuffer = { data: new Uint8ClampedArray(base.data), width: base.width, height: base.height };
  for (const stroke of strokes) applyRetouchStroke(result, stroke);
  return result;
}

/**
 * Incremental replay. Undo, redo and new strokes usually change only the
 * tail of the list, so the cache keeps the buffer after the strokes it last
 * applied and continues from there when the new list extends them; any other
 * change replays from the base image.
 */
export class RetouchCache {
  private applied: readonly RetouchStroke[] = [];
  private buffer: RgbaBuffer | null = null;

  constructor(private readonly base: RgbaBuffer) {}

  render(strokes: readonly RetouchStroke[]): RgbaBuffer {
    const extends_ =
      this.buffer !== null &&
      strokes.length >= this.applied.length &&
      this.applied.every((stroke, index) => strokes[index] === stroke);
    if (!extends_ || !this.buffer) {
      this.buffer = { data: new Uint8ClampedArray(this.base.data), width: this.base.width, height: this.base.height };
      this.applied = [];
    }
    for (let index = this.applied.length; index < strokes.length; index++) {
      applyRetouchStroke(this.buffer, strokes[index]);
    }
    this.applied = strokes.slice();
    return this.buffer;
  }
}
