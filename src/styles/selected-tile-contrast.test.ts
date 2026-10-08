import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Captions on a selected tile.
 *
 * A selected tile (resolution tier, provider card, active dropdown row) is
 * filled with --color-accent-primary-muted: the accent at 10% over whatever
 * surface the tile sits on. That lifts the background under the tile's
 * caption. The muted text token is tuned against the bare surfaces, and on the
 * lifted fill it measured 4.14:1 in the real app (3.7:1 on the raised
 * surface) - under the 4.5:1 AA floor.
 *
 * index.css therefore re-points the muted tone inside a selected tile. This
 * test computes the contrast from the tokens for every surface in both themes,
 * so a retuned token or a new surface cannot quietly reopen the gap.
 */

const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8').replace(
  /\/\*[\s\S]*?\*\//g,
  '',
);

function ruleBody(marker: string): string | null {
  const start = css.indexOf(marker);
  if (start === -1) return null;
  const open = css.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < css.length; i += 1) {
    if (css[i] === '{') depth += 1;
    if (css[i] === '}') depth -= 1;
    if (depth === 0) return css.slice(open + 1, i);
  }
  return null;
}

function declarations(body: string | null): Map<string, string> {
  const found = new Map<string, string>();
  for (const match of (body ?? '').matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    found.set(match[1], match[2].trim());
  }
  return found;
}

type Rgba = [number, number, number, number];

function parseColor(value: string): Rgba {
  const hex = /^#([0-9a-f]{6})$/i.exec(value);
  if (hex) {
    const n = parseInt(hex[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
  }
  const rgba = /^rgba?\(([^)]+)\)$/.exec(value);
  if (rgba) {
    const [r, g, b, a = '1'] = rgba[1].split(',').map((part) => part.trim());
    return [Number(r), Number(g), Number(b), Number(a)];
  }
  throw new Error(`unsupported colour: ${value}`);
}

function resolveToken(name: string, tokens: Map<string, string>): Rgba {
  let value = tokens.get(name);
  for (let hops = 0; value && hops < 8; hops += 1) {
    const reference = /^var\((--[\w-]+)\)$/.exec(value);
    if (!reference) return parseColor(value);
    value = tokens.get(reference[1]);
  }
  throw new Error(`cannot resolve ${name}`);
}

const over = (top: Rgba, bottom: Rgba): Rgba => [
  top[0] * top[3] + bottom[0] * (1 - top[3]),
  top[1] * top[3] + bottom[1] * (1 - top[3]),
  top[2] * top[3] + bottom[2] * (1 - top[3]),
  1,
];

function luminance([r, g, b]: Rgba): number {
  const channel = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(a: Rgba, b: Rgba): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const SURFACES = [
  '--color-void',
  '--color-canvas',
  '--color-surface',
  '--color-panel',
  '--color-elevated',
  '--color-panel-raised',
];

const dark = declarations(ruleBody('@theme {'));
const light = new Map([...dark, ...declarations(ruleBody("body[data-theme='light'] {"))]);
// What the selected-tile rule re-points, if it exists.
const tileOverrides = declarations(ruleBody('.bg-accent-primary-muted {'));

function captionContrasts(tokens: Map<string, string>): string[] {
  const inTile = new Map([...tokens, ...tileOverrides]);
  const caption = resolveToken('--color-text-muted', inTile);
  const fill = resolveToken('--color-accent-primary-muted', tokens);
  return SURFACES.map((surface) => {
    const ratio = contrast(caption, over(fill, resolveToken(surface, tokens)));
    return `${surface} ${ratio.toFixed(2)}`;
  });
}

describe('captions on a selected tile', () => {
  it('reads the tokens it computes from', () => {
    // Guards the guard: an empty map would make every comparison vacuous.
    expect(dark.get('--color-text-muted')).toBe('#888888');
    expect(dark.get('--color-accent-primary-muted')).toBe('rgba(230, 230, 230, 0.1)');
    expect(light.get('--color-text-muted')).toBe('#616161');
  });

  it.each([
    ['dark', dark],
    ['light', light],
  ])('clear 4.5:1 on every surface in the %s theme', (_theme, tokens) => {
    const failing = captionContrasts(tokens).filter((entry) => Number(entry.split(' ')[1]) < 4.5);

    expect(failing).toEqual([]);
  });
});
