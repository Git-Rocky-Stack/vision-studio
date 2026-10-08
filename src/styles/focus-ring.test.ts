import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * One focus indicator, one recipe.
 *
 * index.css draws the keyboard focus ring for every focusable element: a 2px
 * chrome outline, 2px off the control. That rule is unlayered, so it outranks
 * every Tailwind utility - which means a component cannot switch it off with
 * `focus-visible:outline-none`, and a component that adds its own
 * `focus-visible:ring-2` does not replace the outline, it stacks a second ring
 * inside it. Walking the tab order of the real app found 19 of 211 stops
 * drawing both (every Button, Input, Textarea and Slider).
 *
 * So focus-conditional ring utilities are banned outright: they can only ever
 * double the indicator. A border or background change on focus is still fine -
 * that is a field saying it is active, not a second ring.
 */

const appSourceRoot = join(process.cwd(), 'src');
const scanExtensions = new Set(['.ts', '.tsx']);
// \x27 \x22 \x60 are the three quote characters that can end a class string.
const privateFocusRingPattern = /\b(?:group-)?focus(?:-visible|-within)?:(?:ring(?:-[^\s\x27\x22\x60]+)?|outline-none)(?![\w-])/g;

const toPosix = (filePath: string) => relative(process.cwd(), filePath).split(/[\\/]/).join('/');

function listSourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      listSourceFiles(full, out);
      continue;
    }
    if (!scanExtensions.has(extname(entry))) continue;
    // Specs name the banned utilities to assert their absence.
    if (/\.(test|spec)\.tsx?$/.test(entry)) continue;
    out.push(full);
  }
  return out;
}

describe('focus ring', () => {
  it('draws no private focus ring beside the system outline', () => {
    const offenders = listSourceFiles(appSourceRoot).flatMap((filePath) =>
      readFileSync(filePath, 'utf8')
        .split(/\r?\n/)
        .flatMap((line, index) => {
          const matches = line.match(privateFocusRingPattern);
          return matches ? [`${toPosix(filePath)}:${index + 1} ${[...new Set(matches)].join(' ')}`] : [];
        }),
    );

    expect(offenders).toEqual([]);
  });

  it('keeps the system outline at 2px chrome, 2px off the control', () => {
    const css = readFileSync(join(appSourceRoot, 'index.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const rule = /button:focus-visible,[^{]*\{([^}]*)\}/.exec(css);

    expect(rule?.[1].replace(/\s+/g, ' ').trim()).toBe(
      'outline: 2px solid var(--color-accent-primary); outline-offset: 2px;',
    );
  });

  // tabindex="-1" takes an element out of the tab order: it can only be focused
  // from script. A dialog panel is focused that way so the keyboard lands
  // inside it, and its own frame already shows where focus is - ringing the
  // whole panel just draws a heavy border around the first-run setup.
  it('does not ring a container that only script can focus', () => {
    const css = readFileSync(join(appSourceRoot, 'index.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const selectors = (/([^{}]*button:focus-visible,[^{]*)\{/.exec(css)?.[1] ?? '')
      .split(',')
      .map((selector) => selector.trim());

    expect(selectors).toContain('[tabindex]:not([tabindex="-1"]):focus-visible');
    expect(selectors).not.toContain('[tabindex]:focus-visible');
  });

  // Roving-tabindex widgets hold tabindex="-1" on the items the arrow keys
  // move between. Those are keyboard targets and must keep the ring, so each
  // such role is named rather than left to the tabindex selector.
  it.each(['button', '[role="tab"]', '[role="option"]', '[role="menuitem"]', '[role="radio"]', '[role="slider"]'])(
    'still rings %s when it holds tabindex -1',
    (target) => {
      const css = readFileSync(join(appSourceRoot, 'index.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
      const selectors = (/([^{}]*button:focus-visible,[^{]*)\{/.exec(css)?.[1] ?? '')
        .split(',')
        .map((selector) => selector.trim());

      expect(selectors).toContain(`${target}:focus-visible`);
    },
  );
});
