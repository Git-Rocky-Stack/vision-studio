import type { Point, RegionMask } from '@/types/project';

/**
 * Region Lock "Invert Mask": regenerate everything EXCEPT the drawn region.
 *
 * The backend only accepts vector masks (rectangle / polygon / brush), which
 * it rasterizes at the source image's intrinsic size with PIL's even-odd
 * polygon fill (backend/guided/masks.py). The inverse of a drawn region is
 * therefore expressed as ONE polygon: the image frame with the region cut out
 * as a hole, joined to the frame by a zero-width "keyhole" bridge. The bridge
 * runs straight down from the top edge to the hole's topmost vertex, so it
 * lies entirely in the inverted (filled) area and never touches the region
 * being protected.
 *
 * - rectangle / polygon (3+ points): the hole is the exact region outline.
 * - brush (and degenerate polygons, which the backend also strokes): the
 *   stroke is rasterized on a coarse grid mirroring the backend's stroke
 *   radius, inflated by one cell so the hole never undercuts the stroke, and
 *   its outer outline is traced. Pockets fully enclosed by a brush loop stay
 *   protected: a loop drawn around a subject protects the subject.
 * - erase (or an empty region): nothing is protected, so the whole frame is
 *   regenerated.
 */

/** Mirrors backend/guided/masks.py so the traced stroke matches the backend's. */
const DEFAULT_BRUSH_FRACTION = 0.02;
const MIN_BRUSH_RADIUS = 6;
/** Longest grid side when tracing a brush stroke (outline precision ~ side/512). */
const TRACE_GRID_CELLS = 512;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function brushRadius(mask: RegionMask, width: number, height: number): number {
  if (mask.brushSize && mask.brushSize > 0) return Math.max(1, mask.brushSize / 2);
  return Math.max(MIN_BRUSH_RADIUS, DEFAULT_BRUSH_FRACTION * Math.hypot(width, height));
}

function distanceToSegmentSq(px: number, py: number, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  const t = lengthSq === 0 ? 0 : clamp(((px - a.x) * dx + (py - a.y) * dy) / lengthSq, 0, 1);
  const cx = a.x + t * dx - px;
  const cy = a.y + t * dy - py;
  return cx * cx + cy * cy;
}

/** Removes repeated and collinear vertices from a closed contour. */
function simplifyContour(points: Point[]): Point[] {
  const deduped = points.filter(
    (point, index) => index === 0 || point.x !== points[index - 1].x || point.y !== points[index - 1].y,
  );
  if (deduped.length > 1) {
    const first = deduped[0];
    const last = deduped[deduped.length - 1];
    if (first.x === last.x && first.y === last.y) deduped.pop();
  }
  if (deduped.length < 3) return deduped;
  const result: Point[] = [];
  for (let i = 0; i < deduped.length; i += 1) {
    const prev = deduped[(i - 1 + deduped.length) % deduped.length];
    const current = deduped[i];
    const next = deduped[(i + 1) % deduped.length];
    const cross = (current.x - prev.x) * (next.y - current.y) - (current.y - prev.y) * (next.x - current.x);
    if (cross !== 0) result.push(current);
  }
  return result;
}

/**
 * Outer outline(s) of a brush stroke, in image pixels. Exported for tests.
 */
export function traceStrokeOutlines(mask: RegionMask, width: number, height: number): Point[][] {
  const points = mask.points.map((point) => ({
    x: clamp(point.x, 0, width),
    y: clamp(point.y, 0, height),
  }));
  if (points.length === 0) return [];

  const cell = Math.max(1, Math.ceil(Math.max(width, height) / TRACE_GRID_CELLS));
  const cols = Math.ceil(width / cell);
  const rows = Math.ceil(height / cell);
  // One-cell padding on every side keeps the exterior flood connected.
  const gridCols = cols + 2;
  const gridRows = rows + 2;
  const solid = new Uint8Array(gridCols * gridRows);

  // Inflate by half a cell diagonal: a cell is solid when ANY part of it may
  // be painted, so the traced hole always contains the whole stroke.
  const reach = brushRadius(mask, width, height) + cell * Math.SQRT1_2;
  const reachSq = reach * reach;
  const segments: [Point, Point][] =
    points.length === 1 ? [[points[0], points[0]]] : points.slice(1).map((point, i) => [points[i], point]);

  for (const [a, b] of segments) {
    const minCol = clamp(Math.floor((Math.min(a.x, b.x) - reach) / cell), 0, cols - 1);
    const maxCol = clamp(Math.floor((Math.max(a.x, b.x) + reach) / cell), 0, cols - 1);
    const minRow = clamp(Math.floor((Math.min(a.y, b.y) - reach) / cell), 0, rows - 1);
    const maxRow = clamp(Math.floor((Math.max(a.y, b.y) + reach) / cell), 0, rows - 1);
    for (let row = minRow; row <= maxRow; row += 1) {
      const cy = (row + 0.5) * cell;
      for (let col = minCol; col <= maxCol; col += 1) {
        const index = (row + 1) * gridCols + (col + 1);
        if (solid[index]) continue;
        if (distanceToSegmentSq((col + 0.5) * cell, cy, a, b) <= reachSq) solid[index] = 1;
      }
    }
  }

  // Flood the exterior; anything it cannot reach (stroke + enclosed pockets)
  // is part of the protected shape.
  const outside = new Uint8Array(gridCols * gridRows);
  const queue = new Int32Array(gridCols * gridRows);
  let head = 0;
  let tail = 0;
  outside[0] = 1;
  queue[tail++] = 0;
  while (head < tail) {
    const index = queue[head++];
    const col = index % gridCols;
    const row = (index - col) / gridCols;
    const neighbours = [
      col > 0 ? index - 1 : -1,
      col < gridCols - 1 ? index + 1 : -1,
      row > 0 ? index - gridCols : -1,
      row < gridRows - 1 ? index + gridCols : -1,
    ];
    for (const next of neighbours) {
      if (next < 0 || outside[next] || solid[next]) continue;
      outside[next] = 1;
      queue[tail++] = next;
    }
  }
  const isShape = (col: number, row: number) =>
    col >= 0 && row >= 0 && col < gridCols && row < gridRows && !outside[row * gridCols + col];

  // Directed boundary edges, clockwise on screen (shape on the right).
  type Edge = { from: string; to: Point; dir: number; used: boolean };
  const edgesByStart = new Map<string, Edge[]>();
  const key = (x: number, y: number) => `${x},${y}`;
  const addEdge = (fx: number, fy: number, tx: number, ty: number, dir: number) => {
    const from = key(fx, fy);
    const list = edgesByStart.get(from) ?? [];
    list.push({ from, to: { x: tx, y: ty }, dir, used: false });
    edgesByStart.set(from, list);
  };
  // dir: 0 right, 1 down, 2 left, 3 up
  for (let row = 0; row < gridRows; row += 1) {
    for (let col = 0; col < gridCols; col += 1) {
      if (!isShape(col, row)) continue;
      if (!isShape(col, row - 1)) addEdge(col, row, col + 1, row, 0);
      if (!isShape(col + 1, row)) addEdge(col + 1, row, col + 1, row + 1, 1);
      if (!isShape(col, row + 1)) addEdge(col + 1, row + 1, col, row + 1, 2);
      if (!isShape(col - 1, row)) addEdge(col, row + 1, col, row, 3);
    }
  }

  const toImage = (gridX: number, gridY: number): Point => ({
    x: clamp((gridX - 1) * cell, 0, width),
    y: clamp((gridY - 1) * cell, 0, height),
  });

  const outlines: Point[][] = [];
  for (const edges of edgesByStart.values()) {
    for (const start of edges) {
      if (start.used) continue;
      const [sx, sy] = start.from.split(',').map(Number);
      const loop: Point[] = [toImage(sx, sy)];
      let edge: Edge | undefined = start;
      while (edge && !edge.used) {
        edge.used = true;
        loop.push(toImage(edge.to.x, edge.to.y));
        const candidates: Edge[] = (edgesByStart.get(key(edge.to.x, edge.to.y)) ?? []).filter((c) => !c.used);
        // At a diagonal pinch prefer the right turn, keeping each loop tight.
        const currentDir: number = edge.dir;
        candidates.sort(
          (left, right) => ((left.dir - currentDir + 5) % 4) - ((right.dir - currentDir + 5) % 4),
        );
        edge = candidates[0];
      }
      const simplified = simplifyContour(loop);
      if (simplified.length >= 3) outlines.push(simplified);
    }
  }
  return outlines;
}

function holeContours(mask: RegionMask, width: number, height: number): Point[][] {
  if (mask.points.length === 0 || mask.type === 'erase') return [];
  if (mask.type === 'rectangle') {
    const x1 = clamp(mask.bounds.x, 0, width);
    const y1 = clamp(mask.bounds.y, 0, height);
    const x2 = clamp(mask.bounds.x + Math.max(0, mask.bounds.width), 0, width);
    const y2 = clamp(mask.bounds.y + Math.max(0, mask.bounds.height), 0, height);
    if (x2 <= x1 || y2 <= y1) return [];
    return [[{ x: x1, y: y1 }, { x: x2, y: y1 }, { x: x2, y: y2 }, { x: x1, y: y2 }]];
  }
  if (mask.type === 'polygon' && mask.points.length >= 3) {
    const contour = simplifyContour(
      mask.points.map((point) => ({ x: clamp(point.x, 0, width), y: clamp(point.y, 0, height) })),
    );
    return contour.length >= 3 ? [contour] : [];
  }
  return traceStrokeOutlines(mask, width, height);
}

function coversFrame(contour: Point[], width: number, height: number): boolean {
  const xs = contour.map((p) => p.x);
  const ys = contour.map((p) => p.y);
  return (
    contour.length === 4 &&
    Math.min(...xs) <= 0 &&
    Math.min(...ys) <= 0 &&
    Math.max(...xs) >= width &&
    Math.max(...ys) >= height
  );
}

/**
 * The inverse of `mask` within a `width` x `height` image, as one even-odd
 * polygon. An inverse that protects the whole frame comes back with no
 * points, which every consumer already treats as an empty mask.
 */
export function invertRegionMask(mask: RegionMask, width: number, height: number): RegionMask {
  const w = Math.max(1, width);
  const h = Math.max(1, height);
  const frameBounds = { x: 0, y: 0, width: w, height: h };
  const base: RegionMask = {
    ...mask,
    type: 'polygon',
    bounds: frameBounds,
    brushSize: undefined,
  };
  const holes = holeContours(mask, w, h);

  if (holes.length === 1 && coversFrame(holes[0], w, h)) {
    return { ...base, points: [], bounds: { x: 0, y: 0, width: 0, height: 0 } };
  }

  // Start each hole at its topmost (then leftmost) vertex: the vertical
  // bridge above it crosses only inverted area. Holes are visited left to
  // right so the walk along the top edge never doubles back.
  const anchored = holes
    .map((hole) => {
      let top = 0;
      hole.forEach((point, index) => {
        const best = hole[top];
        if (point.y < best.y || (point.y === best.y && point.x < best.x)) top = index;
      });
      return { hole, top };
    })
    .sort((left, right) => left.hole[left.top].x - right.hole[right.top].x);

  const points: Point[] = [{ x: 0, y: 0 }];
  for (const { hole, top } of anchored) {
    const anchor = hole[top];
    points.push({ x: anchor.x, y: 0 });
    for (let i = 0; i <= hole.length; i += 1) {
      const point = hole[(top + i) % hole.length];
      points.push({ x: point.x, y: point.y });
    }
    points.push({ x: anchor.x, y: 0 });
  }
  points.push({ x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h });

  return { ...base, points };
}
