import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Carbon Pro is a single-accent design system: true-black AMOLED neutrals plus
 * one chrome accent (see DESIGN.md). Reaching for Tailwind's stock palette
 * (`bg-blue-500`, `text-emerald-300`, ...) imports a second, uncoordinated
 * colour system that no token controls - it will not follow a theme change and
 * it does not respect the contrast pairings the tokens guarantee.
 *
 * Semantic colour belongs to the `--color-status-*` tokens; category and state
 * differentiation belongs to surface depth and weight. Genuinely data-driven
 * colour (a user-picked region tint) belongs in an inline style, not a class.
 */

const appSourceRoot = join(process.cwd(), 'src');
const sourceExtensions = new Set(['.ts', '.tsx']);

const TAILWIND_HUES = [
  'slate', 'gray', 'zinc', 'neutral', 'stone',
  'red', 'orange', 'amber', 'yellow', 'lime', 'green', 'emerald', 'teal',
  'cyan', 'sky', 'blue', 'indigo', 'violet', 'purple', 'fuchsia', 'pink', 'rose',
].join('|');

/** e.g. `bg-blue-500/15`, `text-emerald-300`, `border-gray-200`. */
const stockPalettePattern = new RegExp(
  String.raw`\b(?:bg|text|border|ring|from|via|to|decoration|outline|shadow|fill|stroke|divide|accent|caret|placeholder)-(?:${TAILWIND_HUES})-\d{2,3}(?:/\d{1,3})?\b`,
  'g',
);

function collectSourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      collectSourceFiles(full, out);
      continue;
    }
    if (!sourceExtensions.has(extname(entry))) continue;
    if (/\.(test|spec)\.tsx?$/.test(entry)) continue;
    out.push(full);
  }
  return out;
}

describe('Carbon Pro palette discipline', () => {
  it('uses no stock Tailwind palette colours anywhere in src', () => {
    const offenders: string[] = [];

    for (const file of collectSourceFiles(appSourceRoot)) {
      const matches = readFileSync(file, 'utf8').match(stockPalettePattern);
      if (!matches) continue;
      offenders.push(
        `${relative(process.cwd(), file).replace(/\\/g, '/')}: ${[...new Set(matches)].join(', ')}`,
      );
    }

    expect(offenders).toEqual([]);
  });

  it('detects a stock palette class when one is present', () => {
    // Guards the guard: a pattern that silently matches nothing is worthless.
    expect('bg-blue-500/15 text-emerald-300'.match(stockPalettePattern)).toEqual([
      'bg-blue-500/15',
      'text-emerald-300',
    ]);
  });

  it('does not flag the design system\'s own token-backed classes', () => {
    const sample =
      'bg-accent-primary-muted text-text-primary border-border-hover text-status-error ' +
      'bg-surface bg-elevated text-silver ring-accent-primary/30 bg-status-warning-muted';
    expect(sample.match(stockPalettePattern)).toBeNull();
  });
});
