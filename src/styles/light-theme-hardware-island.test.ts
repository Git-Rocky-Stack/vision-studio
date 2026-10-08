import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Light-theme hardware island contract.
 *
 * Hardware surfaces (.raised-panel, .recessed-well, .raised-control and the
 * rest) hard-code carbon backgrounds in both themes - see DESIGN.md, Theme
 * policy. The light theme flips the colour tokens at the root, so without a
 * correction every label on a faceplate becomes dark text on a dark plate.
 *
 * index.css corrects it by re-declaring the dark value of each overridden
 * token on the hardware surfaces. That block is a hand-written copy of the
 * @theme values, and a copy drifts: add a token to the light theme and forget
 * the island, and one more label silently disappears in light mode. These
 * tests hold the copy to its source.
 */

const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8').replace(
  /\/\*[\s\S]*?\*\//g,
  '',
);

/** Body of the first rule whose prelude contains `marker` (brace-matched). */
function ruleBody(marker: string): string {
  const start = css.indexOf(marker);
  if (start === -1) throw new Error(`index.css has no rule matching: ${marker}`);
  const open = css.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < css.length; i += 1) {
    if (css[i] === '{') depth += 1;
    if (css[i] === '}') depth -= 1;
    if (depth === 0) return css.slice(open + 1, i);
  }
  throw new Error(`unterminated rule: ${marker}`);
}

function declarations(body: string): Map<string, string> {
  const found = new Map<string, string>();
  for (const match of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    found.set(match[1], match[2].trim().replace(/\s+/g, ' '));
  }
  return found;
}

const theme = declarations(ruleBody('@theme {'));
const light = declarations(ruleBody("body[data-theme='light'] {"));
const island = declarations(ruleBody("[data-theme='light'] :is(.raised-panel"));

/** Theme tokens whose value resolves, through any chain of var(), to a token the light theme overrides. */
function aliasesOfOverriddenTokens(): string[] {
  const affected = new Set(light.keys());
  let grew = true;
  while (grew) {
    grew = false;
    for (const [name, value] of theme) {
      if (affected.has(name)) continue;
      const references = [...value.matchAll(/var\((--[\w-]+)/g)].map((m) => m[1]);
      if (references.some((ref) => affected.has(ref))) {
        affected.add(name);
        grew = true;
      }
    }
  }
  return [...affected].filter((name) => !light.has(name));
}

describe('light-theme hardware island', () => {
  it('reads all three blocks from index.css', () => {
    // Guards the guard: a parser that matches nothing would pass everything below.
    expect(theme.size).toBeGreaterThan(100);
    expect(light.size).toBeGreaterThan(30);
    expect(island.size).toBeGreaterThan(light.size);
    expect(aliasesOfOverriddenTokens().length).toBeGreaterThan(20);
  });

  it('restores the dark value of every token the light theme overrides', () => {
    const drifted = [...light.keys()]
      .filter((name) => island.get(name) !== theme.get(name))
      .map((name) => `${name}: island=${island.get(name) ?? 'MISSING'} theme=${theme.get(name) ?? 'MISSING'}`);

    expect(drifted).toEqual([]);
  });

  it('repeats every alias that resolves through an overridden token', () => {
    const stale = aliasesOfOverriddenTokens()
      .filter((name) => island.get(name) !== theme.get(name))
      .map((name) => `${name}: island=${island.get(name) ?? 'MISSING'} theme=${theme.get(name)}`);

    expect(stale).toEqual([]);
  });

  it('declares nothing the theme does not define', () => {
    const unknown = [...island.keys()].filter((name) => !theme.has(name));

    expect(unknown).toEqual([]);
  });
});
