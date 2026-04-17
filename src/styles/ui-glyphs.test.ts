import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const appSourceRoot = join(process.cwd(), 'src');
const appSourceExtensions = new Set(['.css', '.ts', '.tsx']);
const emojiPattern = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;

describe('app UI glyph policy', () => {
  it('does not ship emoji glyphs in app source', () => {
    const filesWithEmoji = listAppSourceFiles(appSourceRoot)
      .filter((filePath) => emojiPattern.test(readFileSync(filePath, 'utf8')))
      .map((filePath) => relative(process.cwd(), filePath));

    expect(filesWithEmoji).toEqual([]);
  });
});

function listAppSourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const entryPath = join(directory, entry);
    const stats = statSync(entryPath);

    if (stats.isDirectory()) {
      return listAppSourceFiles(entryPath);
    }

    if (!appSourceExtensions.has(extname(entryPath))) {
      return [];
    }

    return [entryPath];
  });
}
