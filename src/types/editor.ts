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
