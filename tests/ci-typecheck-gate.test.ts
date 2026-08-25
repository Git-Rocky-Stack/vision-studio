import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '..');
const read = (path: string) => readFileSync(resolve(ROOT, path), 'utf8');

/**
 * Workflows that gate a merge or a release. Both ran the same no-op command.
 */
const GATING_WORKFLOWS = ['.github/workflows/pr-gate.yml', '.github/workflows/release.yml'];

/**
 * A gate for the gate.
 *
 * `tsconfig.json` is a solution file: `"files": []` plus `references`. TypeScript
 * only follows references under `--build`, so a bare `tsc --noEmit` against it
 * compiles *zero* files and exits 0 no matter what the source says. Both CI
 * workflows ran exactly that, so the "TypeScript" job was green by construction.
 *
 * Measured rather than reasoned about - a deliberate type error was added to
 * `src/utils/electronBridge.ts` and both commands run against it:
 *
 *   $ npx tsc --noEmit --listFiles | wc -l
 *     0
 *   $ npx tsc --noEmit            # what CI ran
 *     exit=0
 *   $ npm run typecheck           # what CI runs now
 *     src/utils/electronBridge.ts(38,7): error TS2322: Type 'string' is not
 *       assignable to type 'number'.
 *     exit=2
 *
 * The third case below is the one that keeps this fixed rather than merely
 * fixed-once: adding a fifth project to `references` without adding it to the
 * `typecheck` script would reopen the same blind spot on a narrower surface.
 * That is not hypothetical either - `tsconfig.tests.json` was added to both in
 * the same change, and nothing but review would have noticed if it had not been.
 */
describe('CI type-check gate', () => {
  it('has a solution-style root tsconfig, so a bare `tsc --noEmit` compiles nothing', () => {
    const root = JSON.parse(read('tsconfig.json'));

    // If either of these stops holding, a bare `tsc --noEmit` may become
    // meaningful again and the rule below can be revisited on evidence.
    expect(root.files, 'root tsconfig no longer declares an empty file list').toEqual([]);
    expect(Array.isArray(root.references)).toBe(true);
    expect(root.references.length).toBeGreaterThan(0);
  });

  it('never type-checks CI with a bare `tsc --noEmit`', () => {
    for (const file of GATING_WORKFLOWS) {
      const commands = [...read(file).matchAll(/^\s*run:\s*(.+)$/gm)].map((match) =>
        (match[1] ?? '').trim()
      );
      const bare = commands.filter((command) => /^(?:npx\s+)?tsc\s+--noEmit\s*$/.test(command));

      expect(bare, `${file} runs a bare \`tsc --noEmit\`, which checks zero files`).toEqual([]);
    }
  });

  it('type-checks every project the solution tsconfig references', () => {
    const referenced: string[] = JSON.parse(read('tsconfig.json')).references.map(
      (reference: { path: string }) => reference.path.replace(/^\.\//, '')
    );
    const typecheck: string = JSON.parse(read('package.json')).scripts.typecheck;

    expect(referenced.length).toBeGreaterThan(0);
    for (const project of referenced) {
      expect(typecheck, `npm run typecheck does not cover ${project}`).toContain(project);
    }
  });

  it('runs the type-check script in every workflow that gates a merge or a release', () => {
    for (const file of GATING_WORKFLOWS) {
      expect(read(file), `${file} has no \`npm run typecheck\` step`).toContain(
        'npm run typecheck'
      );
    }
  });
});
