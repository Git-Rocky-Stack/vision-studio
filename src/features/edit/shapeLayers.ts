import type { Layer, ShapeKind, ShapeLayerData, ShapeStyle } from '@/types/editor';

/**
 * Canvas shape and path layers: pure factories and geometry shared by the
 * Shape and Pen tools (EditCanvas) and the tool options (ToolOptions).
 * Coordinates are intrinsic image pixels.
 */

export const SHAPE_KIND_LABELS: Record<Exclude<ShapeKind, 'path'>, string> = {
  rectangle: 'Rectangle',
  ellipse: 'Ellipse',
  line: 'Line',
  arrow: 'Arrow',
};

/** Smooth-curve tension the Pen tool uses when "Smooth" is on. */
export const PEN_SMOOTH_TENSION = 0.4;

/** Screen pixels within which a Pen click on the first anchor closes the path. */
export const PEN_CLOSE_DISTANCE_PX = 10;

/** Drags shorter than this (image pixels) are clicks and draw nothing. */
export const MIN_SHAPE_DRAG = 2;

export type ShapeLayer = Layer & { type: 'shape'; data: ShapeLayerData };

export function isShapeLayer(layer: Layer): layer is ShapeLayer {
  return layer.type === 'shape';
}

/** Snap a vector to the nearest 45 degrees, keeping its length. */
export function snapTo45(dx: number, dy: number): { dx: number; dy: number } {
  const length = Math.hypot(dx, dy);
  if (length === 0) return { dx: 0, dy: 0 };
  const angle = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
  return { dx: Math.cos(angle) * length, dy: Math.sin(angle) * length };
}

function baseData(style: ShapeStyle): Omit<ShapeLayerData, 'kind' | 'x' | 'y' | 'width' | 'height' | 'points'> {
  return { ...style, closed: false, tension: 0, rotation: 0, scaleX: 1, scaleY: 1 };
}

/**
 * Geometry for a drag from `start` to `end`. `constrain` (Shift) makes
 * rectangles and ellipses square and snaps lines and arrows to 45 degrees.
 * Returns null for a drag too short to draw.
 */
export function shapeDataFromDrag(
  kind: Exclude<ShapeKind, 'path'>,
  start: { x: number; y: number },
  end: { x: number; y: number },
  style: ShapeStyle,
  constrain = false,
): ShapeLayerData | null {
  let dx = end.x - start.x;
  let dy = end.y - start.y;
  if (Math.hypot(dx, dy) < MIN_SHAPE_DRAG) return null;

  if (kind === 'line' || kind === 'arrow') {
    if (constrain) ({ dx, dy } = snapTo45(dx, dy));
    return {
      ...baseData(style),
      // Lines have no interior.
      fillEnabled: kind === 'arrow' ? style.fillEnabled : false,
      kind,
      x: start.x,
      y: start.y,
      width: Math.abs(dx),
      height: Math.abs(dy),
      points: [0, 0, dx, dy],
    };
  }

  if (constrain) {
    const side = Math.max(Math.abs(dx), Math.abs(dy));
    dx = Math.sign(dx || 1) * side;
    dy = Math.sign(dy || 1) * side;
  }
  const width = Math.abs(dx);
  const height = Math.abs(dy);
  const left = Math.min(start.x, start.x + dx);
  const top = Math.min(start.y, start.y + dy);
  return {
    ...baseData(style),
    kind,
    // Ellipses are positioned by their centre (Konva's Ellipse origin).
    x: kind === 'ellipse' ? left + width / 2 : left,
    y: kind === 'ellipse' ? top + height / 2 : top,
    width,
    height,
    points: [],
  };
}

/** Path layer data from Pen anchors (absolute image pixels). Null below two anchors. */
export function pathDataFromAnchors(
  anchors: number[],
  closed: boolean,
  smooth: boolean,
  style: ShapeStyle,
): ShapeLayerData | null {
  if (anchors.length < 4) return null;
  const isClosed = closed && anchors.length >= 6;
  const originX = anchors[0];
  const originY = anchors[1];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const points = anchors.map((value, index) => {
    if (index % 2 === 0) {
      minX = Math.min(minX, value);
      maxX = Math.max(maxX, value);
      return value - originX;
    }
    minY = Math.min(minY, value);
    maxY = Math.max(maxY, value);
    return value - originY;
  });
  return {
    ...baseData(style),
    // Only a closed path has an inside to fill.
    fillEnabled: isClosed && style.fillEnabled,
    kind: 'path',
    x: originX,
    y: originY,
    width: maxX - minX,
    height: maxY - minY,
    points,
    closed: isClosed,
    tension: smooth ? PEN_SMOOTH_TENSION : 0,
  };
}

const LAYER_NAMES: Record<ShapeKind, string> = {
  ...SHAPE_KIND_LABELS,
  path: 'Path',
};

export function createShapeLayer(data: ShapeLayerData): ShapeLayer {
  return {
    id: crypto.randomUUID(),
    name: LAYER_NAMES[data.kind],
    type: 'shape',
    visible: true,
    opacity: 1,
    blendMode: 'Normal',
    locked: false,
    data,
  };
}

/** Whether `point` is close enough to the first anchor to close the path. */
export function closesPath(anchors: number[], point: { x: number; y: number }, stageScale: number): boolean {
  if (anchors.length < 6) return false;
  const distance = Math.hypot(point.x - anchors[0], point.y - anchors[1]);
  return distance * Math.max(stageScale, 1e-6) <= PEN_CLOSE_DISTANCE_PX;
}
