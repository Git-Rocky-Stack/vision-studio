import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Carbon Pro sets type in solid tokens. Gradient-filled text is decoration
 * (DESIGN.md section Anti-Slop Validation), and the two `.gradient-text`
 * utilities that used to sit in index.css were never applied to any element:
 * dead rules that a static scan of the stylesheet still reported on every
 * surface of the app.
 */

const appSourceRoot = join(process.cwd(), 'src');
const scanExtensions = new Set(['.ts', '.tsx', '.css']);

// This file names the banned forms in order to forbid them.
const guardFiles = new Set(['src/styles/gradient-text.test.ts']);

const gradientTextPattern = /background-clip\s*:\s*text|\bbg-clip-text\b|backgroundClip\s*:\s*['"`]text|\bgradient-text(?!\.test)(?![\w|])/;

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

describe('gradient text', () => {
  it('fills no text with a gradient and ships no rule that would', () => {
    const offenders = listSourceFiles(appSourceRoot)
      .filter((filePath) => !guardFiles.has(toPosix(filePath)))
      .flatMap((filePath) =>
        readFileSync(filePath, 'utf8')
          .split(/\r?\n/)
          .flatMap((line, index) =>
            gradientTextPattern.test(line) ? [`${toPosix(filePath)}:${index + 1}`] : [],
          ),
      );

    expect(offenders).toEqual([]);
  });
});
