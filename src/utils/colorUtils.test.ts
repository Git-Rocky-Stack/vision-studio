import { describe, expect, it } from 'vitest';
import { hexToRgba, withAlpha } from './colorUtils';

describe('hexToRgba', () => {
  it('converts a standard hex color with full opacity', () => {
    expect(hexToRgba('#ff0000', 1)).toBe('rgba(255, 0, 0, 1)');
  });

  it('converts a hex color with partial opacity', () => {
    expect(hexToRgba('#00b894', 0.08)).toBe('rgba(0, 184, 148, 0.08)');
  });

  it('handles hex without the # prefix', () => {
    expect(hexToRgba('4ecdc4', 0.5)).toBe('rgba(78, 205, 196, 0.5)');
  });

  it('converts black correctly', () => {
    expect(hexToRgba('#000000', 1)).toBe('rgba(0, 0, 0, 1)');
  });

  it('converts white correctly', () => {
    expect(hexToRgba('#ffffff', 0)).toBe('rgba(255, 255, 255, 0)');
  });

  it('handles uppercase hex values', () => {
    expect(hexToRgba('#FF6B9D', 1)).toBe('rgba(255, 107, 157, 1)');
  });
});

describe('withAlpha', () => {
  it('tints a token colour without parsing it', () => {
    expect(withAlpha('var(--color-feature-03)', 0.09)).toBe(
      'color-mix(in srgb, var(--color-feature-03) 9%, transparent)',
    );
  });

  it('works for hex and clamps opacity', () => {
    expect(withAlpha('#ff0000', 0.125)).toBe('color-mix(in srgb, #ff0000 12.5%, transparent)');
    expect(withAlpha('#ff0000', 2)).toBe('color-mix(in srgb, #ff0000 100%, transparent)');
  });

  it('never produces NaN the way hexToRgba does for tokens', () => {
    expect(hexToRgba('var(--color-feature-03)', 0.1)).toContain('NaN');
    expect(withAlpha('var(--color-feature-03)', 0.1)).not.toContain('NaN');
  });
});
