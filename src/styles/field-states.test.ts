import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * .recessed-well declares its border unlayered, so it outranks every Tailwind
 * utility: a field's focus:border-accent-primary or border-status-error never
 * drew. The well's focus and error borders therefore live in index.css.
 */
const css = readFileSync(join(process.cwd(), 'src/index.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

describe('recessed-well field states', () => {
  it('draws a focus border on the well, or on a well holding the focused field', () => {
    const rule = /(\.recessed-well:focus[^{]*)\{([^}]*)\}/.exec(css);
    const selectors = (rule?.[1] ?? '').split(',').map((selector) => selector.trim());

    expect(selectors).toEqual(
      expect.arrayContaining([
        '.recessed-well:focus',
        '.recessed-well:focus-visible',
        '.recessed-well:focus-within',
      ]),
    );
    expect(rule?.[2]).toContain('border-color: var(--color-accent-primary-border)');
  });

  it('draws an error border on an invalid well', () => {
    expect(css).toMatch(/\.recessed-well\[aria-invalid='true'\]\s*\{\s*border-color:\s*var\(--color-status-error\);/);
  });

  it('sets UI labels in the mono-label recipe', () => {
    const rule = /\.text-label\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(rule).toContain('font-family: var(--font-mono)');
    expect(rule).toContain('text-transform: uppercase');
    expect(rule).toContain('letter-spacing: 0.66px');
  });
});
