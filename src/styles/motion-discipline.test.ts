import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Motion discipline: a transition names the properties it animates.
 *
 * `transition: all` (Tailwind's `transition-all`) animates whatever happens to
 * change, which is rarely what was meant. Measured in the real app it sat on
 * 635 elements, and it had three visible costs:
 *
 *  - layout properties animated: a dragged workflow node lagged its pointer
 *    because `left` and `top` were being eased, and a scene card slid its
 *    padding open when selected;
 *  - the focus ring faded in, since `outline-color` and `outline-offset` are
 *    properties too - a keyboard user saw the ring arrive late;
 *  - every style recalculation had to consider every property.
 *
 * Use `transition` (colour, opacity, shadow, transform), `transition-colors`,
 * `transition-opacity`, `transition-transform`, or an explicit list such as
 * `transition-[width]` for the rare property outside that set.
 */

const appSourceRoot = join(process.cwd(), 'src');
const scanExtensions = new Set(['.ts', '.tsx', '.css']);

// This file names the banned forms in order to forbid them.
const guardFiles = new Set(['src/styles/motion-discipline.test.ts']);

// \x27 \x22 \x60 are the quote characters an inline style value can open with.
const transitionAllPattern = /\btransition-all\b|transition\s*:\s*[\x27\x22\x60]?\s*all\b|transition-property\s*:\s*all\b|transitionProperty\s*:\s*[\x27\x22\x60]all\b/;

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

describe('motion discipline', () => {
  it('never transitions every property', () => {
    const offenders = listSourceFiles(appSourceRoot)
      .filter((filePath) => !guardFiles.has(toPosix(filePath)))
      .flatMap((filePath) =>
        readFileSync(filePath, 'utf8')
          .split(/\r?\n/)
          .flatMap((line, index) =>
            transitionAllPattern.test(line) ? [`${toPosix(filePath)}:${index + 1}`] : [],
          ),
      );

    expect(offenders).toEqual([]);
  });
});
