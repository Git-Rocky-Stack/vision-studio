import { describe, expect, it } from 'vitest';

import {
  CANVAS_TEXT_FONTS,
  TEXT_LAYER_DEFAULT_STYLE,
  createTextLayer,
  isTextLayer,
  konvaBlendMode,
  konvaFontStyle,
} from './textLayers';
import type { Layer } from '@/types/editor';

describe('createTextLayer (#32)', () => {
  it('creates a text layer carrying the style and content in its data', () => {
    const layer = createTextLayer({
      text: 'Session One',
      position: { x: 320, y: 240 },
      style: { ...TEXT_LAYER_DEFAULT_STYLE, fontSize: 64, fill: '#ff0000' },
    });

    expect(layer.type).toBe('text');
    expect(layer.visible).toBe(true);
    expect(layer.locked).toBe(false);
    expect(layer.opacity).toBe(1);
    expect(layer.blendMode).toBe('Normal');
    expect(layer.data).toMatchObject({
      text: 'Session One',
      x: 320,
      y: 240,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      fontSize: 64,
      fill: '#ff0000',
    });
  });

  it('derives the layer name from the first line of content, truncated', () => {
    expect(
      createTextLayer({
        text: 'Second line follows\nnot in the name',
        position: { x: 0, y: 0 },
        style: TEXT_LAYER_DEFAULT_STYLE,
      }).name,
    ).toBe('Second line follows');

    expect(
      createTextLayer({
        text: 'An extremely long headline that keeps going well past the cap',
        position: { x: 0, y: 0 },
        style: TEXT_LAYER_DEFAULT_STYLE,
      }).name.length,
    ).toBeLessThanOrEqual(24);
  });

  it('falls back to a generic name for blank content', () => {
    expect(
      createTextLayer({ text: '   ', position: { x: 0, y: 0 }, style: TEXT_LAYER_DEFAULT_STYLE })
        .name,
    ).toBe('Text');
  });

  it('generates unique ids', () => {
    const a = createTextLayer({ text: 'a', position: { x: 0, y: 0 }, style: TEXT_LAYER_DEFAULT_STYLE });
    const b = createTextLayer({ text: 'b', position: { x: 0, y: 0 }, style: TEXT_LAYER_DEFAULT_STYLE });
    expect(a.id).not.toBe(b.id);
  });
});

describe('isTextLayer', () => {
  it('discriminates text layers from other layer types', () => {
    const text = createTextLayer({
      text: 'hello',
      position: { x: 0, y: 0 },
      style: TEXT_LAYER_DEFAULT_STYLE,
    });
    const image: Layer = {
      id: 'img',
      name: 'Base Image',
      type: 'image',
      visible: true,
      opacity: 1,
      blendMode: 'Normal',
      locked: false,
      data: {},
    };

    expect(isTextLayer(text)).toBe(true);
    expect(isTextLayer(image)).toBe(false);
  });
});

describe('konvaFontStyle', () => {
  it('composes italic and numeric weight into the Konva fontStyle string', () => {
    expect(konvaFontStyle({ ...TEXT_LAYER_DEFAULT_STYLE, italic: false, fontWeight: 400 })).toBe('400');
    expect(konvaFontStyle({ ...TEXT_LAYER_DEFAULT_STYLE, italic: true, fontWeight: 400 })).toBe('italic 400');
    expect(konvaFontStyle({ ...TEXT_LAYER_DEFAULT_STYLE, italic: true, fontWeight: 700 })).toBe('italic 700');
  });
});

describe('konvaBlendMode', () => {
  it('maps the layer blend-mode labels onto canvas composite operations', () => {
    expect(konvaBlendMode('Normal')).toBe('source-over');
    expect(konvaBlendMode('Multiply')).toBe('multiply');
    expect(konvaBlendMode('Screen')).toBe('screen');
    expect(konvaBlendMode('Overlay')).toBe('overlay');
    expect(konvaBlendMode('Soft Light')).toBe('soft-light');
    expect(konvaBlendMode('Hard Light')).toBe('hard-light');
    expect(konvaBlendMode('Difference')).toBe('difference');
  });

  it('falls back to source-over for unknown labels', () => {
    expect(konvaBlendMode('Definitely Not A Mode')).toBe('source-over');
  });
});

describe('CANVAS_TEXT_FONTS', () => {
  it('leads with the bundled IBM Plex families and never offers the removed fonts', () => {
    expect(CANVAS_TEXT_FONTS[0]).toBe('IBM Plex Sans');
    expect(CANVAS_TEXT_FONTS).toContain('IBM Plex Sans Condensed');
    expect(CANVAS_TEXT_FONTS).toContain('IBM Plex Mono');
    // DM Sans / Instrument Sans / JetBrains Mono were removed from the bundle
    // in the IBM Plex migration - offering them would silently render fallbacks.
    expect(CANVAS_TEXT_FONTS).not.toContain('DM Sans');
    expect(CANVAS_TEXT_FONTS).not.toContain('Instrument Sans');
    expect(CANVAS_TEXT_FONTS).not.toContain('JetBrains Mono');
  });
});
