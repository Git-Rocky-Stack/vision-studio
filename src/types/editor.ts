export type EditTool =
  | 'move' | 'scale' | 'crop' | 'rotate'
  | 'brush' | 'eraser' | 'clone' | 'heal'
  | 'text' | 'shape' | 'pen'
  | 'hand' | 'zoom' | 'eyedropper';

export interface Layer {
  id: string;
  name: string;
  type: 'image' | 'text' | 'shape' | 'adjustment';
  visible: boolean;
  opacity: number;
  blendMode: string;
  locked: boolean;
  data: Record<string, any>;
}

/** Styling shared by every canvas text layer; also the panel's draft style. */
export interface TextStyle {
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  italic: boolean;
  underline: boolean;
  align: 'left' | 'center' | 'right';
  fill: string;
  shadowEnabled: boolean;
  shadowOffsetX: number;
  shadowOffsetY: number;
  shadowBlur: number;
  shadowColor: string;
  strokeEnabled: boolean;
  strokeWidth: number;
  strokeColor: string;
  letterSpacing: number;
  lineHeight: number;
}

/** `Layer.data` payload for `type: 'text'` layers (#32). */
export interface TextLayerData extends TextStyle {
  text: string;
  x: number;
  y: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
}

/** One committed brush or eraser stroke, in intrinsic image pixels. */
export interface EditStroke {
  id: string;
  tool: 'brush' | 'eraser';
  points: number[];
  color: string;
  size: number;
}

/**
 * One committed Clone Stamp or Heal stroke, in intrinsic image pixels. It is
 * burned into the base image's pixels (features/edit/retouch.ts), under the
 * adjustments, filters and vector layers.
 */
export interface RetouchStroke {
  id: string;
  tool: 'clone' | 'heal';
  points: number[];
  /** Brush diameter in image pixels. */
  size: number;
  /** 0-1: share of the radius painted at full strength before the soft edge. */
  hardness: number;
  /** 0-1. */
  opacity: number;
  /**
   * Source minus destination, in image pixels. Clone always has one; a Heal
   * stroke without one is a spot heal and picks its source automatically.
   */
  offset: { x: number; y: number } | null;
}

/** Shape tool kinds. `path` is what the Pen tool draws. */
export type ShapeKind = 'rectangle' | 'ellipse' | 'line' | 'arrow' | 'path';

/** Styling shared by shape and path layers; also the tool's draft style. */
export interface ShapeStyle {
  stroke: string;
  strokeWidth: number;
  fill: string;
  fillEnabled: boolean;
}

/**
 * `Layer.data` payload for `type: 'shape'` layers. `x`/`y` is the node
 * origin: the top-left corner for rectangles, the centre for ellipses, and
 * the first point for lines, arrows and paths (whose `points` are relative
 * to it).
 */
export interface ShapeLayerData extends ShapeStyle {
  kind: ShapeKind;
  x: number;
  y: number;
  width: number;
  height: number;
  points: number[];
  /** Paths only: joins the last point back to the first and allows a fill. */
  closed: boolean;
  /** Paths only: 0 draws straight segments, higher values smooth curves. */
  tension: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
}

/** Look filters chosen in the Filters tab; applied to the base image. */
export interface EditFilterState {
  selected: string[];
  /** 0-100 blend of each filter over the unfiltered pixel. */
  intensity: number;
  stackMode: boolean;
}

export const DEFAULT_EDIT_FILTERS: EditFilterState = {
  selected: [],
  intensity: 100,
  stackMode: false,
};

/** Everything undo/redo restores. Layer objects are immutable, so sharing them is safe. */
export interface EditStateSnapshot {
  layers: Layer[];
  adjustments: ImageAdjustments;
  strokes: EditStroke[];
  /** Absent in entries recorded before retouch existed: read as none. */
  retouch?: RetouchStroke[];
  filters: EditFilterState;
}

export interface EditHistoryEntry {
  id: string;
  action: string;
  timestamp: Date;
  snapshot?: string; // base64 canvas snapshot for undo
  /** Edit state after this action; undo/redo restore it. */
  state?: EditStateSnapshot;
  /** Continuous edits (slider drags, transforms) with the same key coalesce. */
  coalesceKey?: string;
}

export interface ImageAdjustments {
  brightness: number;
  contrast: number;
  saturation: number;
  exposure: number;
  temperature: number;
  tint: number;
  highlights: number;
  shadows: number;
  whites: number;
  blacks: number;
  sharpness: number;
  blur: number;
  noiseReduction: number;
  vignette: number;
  grain: number;
}

export const DEFAULT_ADJUSTMENTS: ImageAdjustments = {
  brightness: 0, contrast: 0, saturation: 0, exposure: 0,
  temperature: 0, tint: 0, highlights: 0, shadows: 0,
  whites: 0, blacks: 0, sharpness: 0, blur: 0,
  noiseReduction: 0, vignette: 0, grain: 0,
};
