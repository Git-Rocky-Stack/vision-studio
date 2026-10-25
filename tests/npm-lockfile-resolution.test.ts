import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '..');
const pkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8'));
const lock = JSON.parse(readFileSync(resolve(ROOT, 'package-lock.json'), 'utf8')) as {
  packages: Record<string, { version?: string }>;
};

/**
 * npm 10 crashed on any full re-resolution of this tree (`npm update`, or
 * `npm install` once the lockfile drifted from package.json):
 *
 *   TypeError: Cannot read properties of null (reading 'edgesOut')
 *       at #loadPeerSet (@npmcli/arborist/lib/arborist/build-ideal-tree.js)
 *
 * The chain: vitest 4 and @vitest/mocker peer on `vite ^6 || ^7 || ^8`, and
 * npm resolved that peer set to the newest match, vite 8. vite 8's optional
 * peer @vitejs/devtools leads to @vitejs/devtools-vitest, whose optional peer
 * `vitest: *` pulled vitest 5. Mid-way through vitest 5's peers,
 * @vitest/browser-playwright pinned vitest back to 4 and replaced the node, and
 * npm 10's arborist then read `edgesOut` on the detached vitest 5. Arborist
 * 9.1.4 (npm >= 11.6.0) guards that loop; npm 10 never got the fix, which is
 * why only `npx npm@11 install` worked.
 *
 * `overrides.vite: "$vite"` pins every vite in the tree to the project's own
 * range, so the vite 8 branch - and the whole chain - never starts. The
 * resolved tree is unchanged (one vite 6, one vitest 4), and npm 10 and npm 11
 * now write byte-identical lockfiles. CI's "Lockfile" job re-resolves from
 * scratch on npm 10 and fails if the committed lockfile differs.
 */
describe('npm lockfile resolution', () => {
  it('pins every vite to the project range', () => {
    expect(pkg.overrides?.vite).toBe('$vite');
    expect(pkg.devDependencies?.vite ?? pkg.dependencies?.vite).toBeDefined();
  });

  const versionsOf = (name: string) =>
    Object.entries(lock.packages)
      .filter(([path]) => path === `node_modules/${name}` || path.endsWith(`/node_modules/${name}`))
      .map(([, entry]) => entry.version);

  it('resolves one vite, on the declared major', () => {
    const declared = String(pkg.devDependencies?.vite ?? pkg.dependencies?.vite);
    const major = /(\d+)/.exec(declared)?.[1];
    const versions = versionsOf('vite');
    expect(versions).toHaveLength(1);
    expect(versions[0]?.split('.')[0]).toBe(major);
  });

  it('never pulls the vite 8 devtools chain that crashed npm 10', () => {
    expect(versionsOf('@vitejs/devtools')).toEqual([]);
    expect(versionsOf('@vitejs/devtools-vitest')).toEqual([]);
    expect(new Set(versionsOf('vitest')).size).toBe(1);
  });
});
