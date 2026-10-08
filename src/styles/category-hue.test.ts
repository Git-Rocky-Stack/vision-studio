import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Carbon Pro has one accent, chrome, and keeps chromatic energy for the
 * semantic LED and capability palettes (DESIGN.md section Color). Category
 * differentiation belongs to icon, label, depth and weight - see
 * carbon-pro-palette.test.ts - never to a private hue.
 *
 * The retired --color-category-* family broke that twice over: its violet
 * (#8b5cf6), pink (#f472b6) and teal (#2dd4bf) are not on the palette, and the
 * template category pads used them for selected text and glow, which the LED
 * rule forbids outright. The timeline borrowed the same tokens to colour clips
 * by media type, which is what the capability palette is for.
 */

const appSourceRoot = join(process.cwd(), 'src');
const scanExtensions = new Set(['.ts', '.tsx', '.css']);
const categoryHuePattern = /(?:--color-|\b(?:bg|text|border|ring|fill|stroke|shadow|from|via|to)-)category-[a-z]+/g;

// This file names the retired tokens in order to forbid them.
const guardFiles = new Set(['src/styles/category-hue.test.ts']);

const toPosix = (filePath: string) => relative(process.cwd(), filePath).split(/[\\/]/).join('/');

function listSourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      listSourceFiles(full, out);
      continue;
    }
    if (scanExtensions.has(extname(entry))) out.push(full);
  }
  return out;
}

describe('category hues', () => {
  it('defines and references no category hue anywhere in app source', () => {
    const offenders = listSourceFiles(appSourceRoot)
      .filter((filePath) => !guardFiles.has(toPosix(filePath)))
      .flatMap((filePath) => {
        const matches = readFileSync(filePath, 'utf8').match(categoryHuePattern);
        return matches ? [`${toPosix(filePath)}: ${[...new Set(matches)].join(', ')}`] : [];
      });

    expect(offenders).toEqual([]);
  });

  it('keeps the off-palette category hexes out of the stylesheet', () => {
    const css = readFileSync(join(appSourceRoot, 'index.css'), 'utf8').toLowerCase();
    const uses = (hex: string) => css.split(hex).length - 1;

    // Pink existed only as a category hue. Teal and violet are still the sixth
    // and second feature colours, so each is pinned to that one declaration.
    expect({ pink: uses('#f472b6'), teal: uses('#2dd4bf'), violet: uses('#8b5cf6') }).toEqual({
      pink: 0,
      teal: 1,
      violet: 1,
    });
  });
});
