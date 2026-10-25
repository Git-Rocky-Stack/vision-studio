import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { BUILT_IN_STYLE_PRESETS } from './generation';

/**
 * Built-in style presets carried a private palette (#a29bfe, #fd79a8, #00cec9,
 * slate greys and three off-palette feature tokens). Each colour must now be a
 * Carbon Pro value: a feature token, or the hex of an LED / capability hue or a
 * Carbon neutral (hex because StylePresetsBar tints with hexToRgba).
 */
const css = readFileSync(join(process.cwd(), 'src/index.css'), 'utf8').toLowerCase();
const themeHex = (token: string) => new RegExp(`${token}:\\s*(#[0-9a-f]{6})`).exec(css)?.[1];

const allowedHexes = new Set(
  [
    '--color-status-error',
    '--color-status-warning',
    '--color-status-success',
    '--color-status-info',
    '--color-capability-edit',
    '--color-capability-video',
    '--color-capability-cloud',
    '--color-accent-primary',
    '--color-text-body',
    '--color-text-muted',
  ].map((token) => themeHex(token)),
);
const allowedTokens = new Set([
  'var(--color-feature-01)',
  'var(--color-feature-03)',
  'var(--color-feature-04)',
  'var(--color-feature-05)',
  'var(--color-feature-06)',
]);

describe('built-in style preset colours', () => {
  it('resolves every token hex it allows', () => {
    expect([...allowedHexes].every(Boolean)).toBe(true);
  });

  it('uses only Carbon Pro palette values', () => {
    const offenders = BUILT_IN_STYLE_PRESETS.filter(
      (preset) => !allowedTokens.has(preset.color) && !allowedHexes.has(preset.color.toLowerCase()),
    ).map((preset) => `${preset.id}: ${preset.color}`);

    expect(offenders).toEqual([]);
  });
});
