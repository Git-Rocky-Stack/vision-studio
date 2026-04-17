import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const repositoryRoot = process.cwd();
const scannedExtensions = new Set(['.css', '.md', '.ts', '.tsx']);
const ignoredDirectories = new Set([
  '.git',
  '.gstack',
  '.superpowers',
  '.worktrees',
  'backend/build',
  'backend/venv',
  'dist',
  'dist-electron',
  'node_modules',
  'playwright-report',
  'test-results',
  'worktrees',
]);
const placeholderArbitraryUtilityPattern = /\b[a-z][\w:-]*-\[[^\]]*\.\.\.[^\]]*\]/;

describe('Tailwind source scanning hygiene', () => {
  it('does not include placeholder arbitrary utilities that compile to invalid CSS', () => {
    const matches = listScannedFiles(repositoryRoot).flatMap((filePath) => {
      const relativePath = relative(repositoryRoot, filePath);

      return readFileSync(filePath, 'utf8')
        .split(/\r?\n/)
        .flatMap((line, lineIndex) =>
          placeholderArbitraryUtilityPattern.test(line) ? [`${relativePath}:${lineIndex + 1}`] : []
        );
    });

    expect(matches).toEqual([]);
  });
});

function listScannedFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const entryPath = join(directory, entry);
    const relativePath = relative(repositoryRoot, entryPath).replace(/\\/g, '/');
    const stats = statSync(entryPath);

    if (stats.isDirectory()) {
      return ignoredDirectories.has(relativePath) ? [] : listScannedFiles(entryPath);
    }

    return scannedExtensions.has(extname(entryPath)) ? [entryPath] : [];
  });
}
