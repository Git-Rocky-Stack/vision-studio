import type { Layer, TextLayerData, TextStyle } from '@/types/editor';

/**
 * Canvas text-layer model (#32). Pure factory + Konva mapping helpers shared by
 * TextControls (add/edit/delete) and EditCanvas (render/select/transform).
 */

/**
 * Fonts offered for canvas text. IBM Plex families are bundled via
 * `src/fonts.ts`; the rest are OS-provided stacks that render everywhere the
 * app ships. The pre-Plex families (DM Sans, Instrument Sans, JetBrains Mono)
 * were removed from the bundle and must not be offered - they would silently
 * render fallbacks.
 */
export const CANVAS_TEXT_FONTS: readonly string[] = [
  'IBM Plex Sans',
  'IBM Plex Sans Condensed',
  'IBM Plex Mono',
  'Arial',
  'Georgia',
  'Impact',
  'Times New Roman',
  'Courier New',
  'Verdana',
  'Trebuchet MS',
];

export const TEXT_LAYER_DEFAULT_STYLE: TextStyle = {
  fontFamily: 'IBM Plex Sans',
  fontSize: 48,
  fontWeight: 400,
  italic: false,
  underline: false,
  align: 'center',
  fill: '#FFFFFF',
  shadowEnabled: false,
  shadowOffsetX: 2,
  shadowOffsetY: 2,
  shadowBlur: 4,
  shadowColor: '#000000',
  strokeEnabled: false,
  strokeWidth: 1,
  strokeColor: '#000000',
  letterSpacing: 0,
  lineHeight: 1.4,
};

const LAYER_NAME_MAX_LENGTH = 24;

/** Layer-list name for a text layer: first line of content, truncated. */
export function textLayerName(text: string): string {
  const firstLine = text.split('\n', 1)[0].trim();
  if (!firstLine) return 'Text';
  return firstLine.length > LAYER_NAME_MAX_LENGTH
    ? firstLine.slice(0, LAYER_NAME_MAX_LENGTH).trimEnd()
    : firstLine;
}

export function createTextLayer({
  text,
  position,
  style,
  opacity = 1,
}: {
  text: string;
  position: { x: number; y: number };
  style: TextStyle;
  opacity?: number;
}): Layer {
  const data: TextLayerData = {
    ...style,
    text,
    x: position.x,
    y: position.y,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
  };

  return {
    id: crypto.randomUUID(),
    name: textLayerName(text),
    type: 'text',
    visible: true,
    opacity,
    blendMode: 'Normal',
    locked: false,
    data,
  };
}

export function isTextLayer(layer: Layer): layer is Layer & { type: 'text'; data: TextLayerData } {
  return layer.type === 'text';
}

/** Konva `fontStyle` string: optional italic + numeric weight. */
export function konvaFontStyle(style: Pick<TextStyle, 'italic' | 'fontWeight'>): string {
  return style.italic ? `italic ${style.fontWeight}` : `${style.fontWeight}`;
}

/** Layer-panel blend-mode labels mapped onto canvas composite operations. */
const BLEND_MODE_COMPOSITE: Record<string, GlobalCompositeOperation> = {
  Normal: 'source-over',
  Multiply: 'multiply',
  Screen: 'screen',
  Overlay: 'overlay',
  'Soft Light': 'soft-light',
  'Hard Light': 'hard-light',
  Difference: 'difference',
};

export function konvaBlendMode(blendMode: string): GlobalCompositeOperation {
  return BLEND_MODE_COMPOSITE[blendMode] ?? 'source-over';
}
