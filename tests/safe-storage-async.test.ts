import { readdirSync, readFileSync } from 'fs';
import path from 'path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

/**
 * Electron 45 deprecates safeStorage's synchronous API and Electron 46
 * removes it: every encrypt / decrypt / availability probe in the main
 * process must use the async variants (electron/services/asyncSafeStorage.ts).
 *
 * The scan walks the TypeScript AST of every non-test source under electron/,
 * so a mention in a comment is fine while any identifier, property access or
 * bracket access (`safeStorage['encryptString']`) of a sync name fails.
 */

const repoRoot = path.resolve(__dirname, '..');
const electronRoot = path.join(repoRoot, 'electron');

const SYNC_SAFE_STORAGE_NAMES = new Set(['isEncryptionAvailable', 'encryptString', 'decryptString']);

function isTestFile(file: string) {
  return /\.test\.tsx?$/.test(file) || /[\\/]__tests__[\\/]/.test(file) || /TestHarness\.ts$/.test(file);
}

function listSources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return entry.name === 'node_modules' ? [] : listSources(full);
    }
    return /\.(ts|tsx|mts|cts)$/.test(entry.name) && !isTestFile(full) ? [full] : [];
  });
}

/** `file:line name` for every sync safeStorage name used in code (not comments). */
function findSyncSafeStorageUses(file: string, source: string): string[] {
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const hits: string[] = [];
  const visit = (node: ts.Node) => {
    const name =
      ts.isIdentifier(node) || ts.isPrivateIdentifier(node)
        ? node.text
        : ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)
          ? node.text
          : null;
    if (name !== null && SYNC_SAFE_STORAGE_NAMES.has(name)) {
      const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
      hits.push(`${path.relative(repoRoot, file).replace(/\\/g, '/')}:${line + 1} ${name}`);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return hits;
}

describe('safeStorage async migration (Electron 45 deprecation, Electron 46 removal)', () => {
  const sources = listSources(electronRoot);

  it('scans the main-process sources, including the secret stores', () => {
    const relative = sources.map((file) => path.relative(repoRoot, file).replace(/\\/g, '/'));
    expect(relative).toEqual(
      expect.arrayContaining([
        'electron/main.ts',
        'electron/services/secureStore.ts',
        'electron/services/userAccounts.ts',
        'electron/services/downloadTokens.ts',
        'electron/services/asyncSafeStorage.ts',
      ]),
    );
    expect(relative.some((file) => file.endsWith('.test.ts'))).toBe(false);
  });

  it('uses no synchronous safeStorage API anywhere in electron/ (tests excluded)', () => {
    const hits = sources.flatMap((file) => findSyncSafeStorageUses(file, readFileSync(file, 'utf8')));
    expect(hits).toEqual([]);
  });

  it('catches the sync API in code, in any access form, but not in comments', () => {
    const offending = [
      'safeStorage.encryptString(value);',
      "safeStorage['decryptString'](buffer);",
      'const { isEncryptionAvailable } = safeStorage;',
    ];
    for (const snippet of offending) {
      expect(findSyncSafeStorageUses('probe.ts', snippet), snippet).toHaveLength(1);
    }
    const allowed = [
      '// safeStorage.encryptString is removed in Electron 46',
      '/* decryptString -> decryptStringAsync */ await safeStorage.decryptStringAsync(buffer);',
      'await safeStorage.isAsyncEncryptionAvailable(); await safeStorage.encryptStringAsync(value);',
    ];
    for (const snippet of allowed) {
      expect(findSyncSafeStorageUses('probe.ts', snippet), snippet).toEqual([]);
    }
  });
});
