import { describe, expect, it } from 'vitest';
import { computeDimensions, ASPECT_RATIOS, TIER_LONG_EDGE } from './resolution';

describe('computeDimensions', () => {
  it('computes 1:1 square at ultra tier', () => {
    const { width, height } = computeDimensions('1:1', 'ultra');
    expect(width).toBe(1024);
    expect(height).toBe(1024);
  });

  it('computes 16:9 landscape at ultra tier', () => {
    const { width, height } = computeDimensions('16:9', 'ultra');
    expect(width).toBe(1024);
    expect(height).toBe(576);
  });

  it('computes 9:16 portrait at high tier', () => {
    const { width, height } = computeDimensions('9:16', 'high');
    expect(height).toBe(768);
    expect(width).toBe(432);
  });

  it('computes 21:9 ultrawide at standard tier', () => {
    const { width, height } = computeDimensions('21:9', 'standard');
    expect(width).toBe(512);
    // 512 / (21/9) = 219.4 -> rounds to 219, but clamped to min 256
    expect(height).toBe(256);
  });

  it('uses custom dimensions when aspect ratio is custom', () => {
    const { width, height } = computeDimensions('custom', 'ultra', 800, 600);
    expect(width).toBe(800);
    expect(height).toBe(600);
  });

  it('clamps custom dimensions to 256-2048', () => {
    const { width, height } = computeDimensions('custom', 'ultra', 100, 9999);
    expect(width).toBe(256);
    expect(height).toBe(2048);
  });

  it('every built-in ratio produces valid dimensions at every tier', () => {
    const tiers: Array<keyof typeof TIER_LONG_EDGE> = ['standard', 'high', 'ultra'];
    for (const ratio of ASPECT_RATIOS) {
      for (const tier of tiers) {
        const { width, height } = computeDimensions(ratio.id, tier);
        expect(width).toBeGreaterThanOrEqual(256);
        expect(height).toBeGreaterThanOrEqual(256);
        expect(width).toBeLessThanOrEqual(2048);
        expect(height).toBeLessThanOrEqual(2048);
      }
    }
  });
});
