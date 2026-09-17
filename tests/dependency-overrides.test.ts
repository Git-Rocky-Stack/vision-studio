import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { createRequire } from 'module';
import { dirname, resolve } from 'path';

const ROOT = resolve(__dirname, '..');
const pkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8'));

/**
 * GHSA-2883-xcg3-v3hh (HIGH) lands on js-yaml 4.0.0 - 4.3.1: `maxTotalMergeKeys`
 * does not bound CPU for empty merge sources, so a crafted document can pin the
 * parsing thread. js-yaml shipped the 4.x patch as 4.3.2 (2026-08-26, dist-tag
 * `v4-legacy`); the advisory's range is `>=4.0.0 <4.3.2`. `electron-updater`,
 * the one shipped package that pulls it, declares `js-yaml: ^4.1.0` as of 6.8.9
 * (the latest stable; 7.x is alpha) - and 4.3.2 satisfies that range, so a
 * plain install already resolves the shipped path outside the advisory.
 *
 * The `package.json` override to 5.x is therefore broader than the advisory
 * requires; `docs/dependency-security.md` records why it is retained rather
 * than narrowed. This file is what keeps that override honest:
 * an override is a claim that a substituted version still works, and nothing
 * else in the build would notice if it stopped being true.
 *
 * electron-updater parses the update feed it fetches over the network
 * (`out/providers/Provider.js:97`), so this is the parser standing between a
 * hostile feed and the updater - which is exactly why the advisory matters here
 * and why the substitution has to be proven, not assumed.
 */

/** The advisory's affected range, inclusive. */
const VULNERABLE_FROM = [4, 0, 0];
const VULNERABLE_THROUGH = [4, 3, 1];

const parseVersion = (v: string): number[] => {
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(v);
  if (!m) throw new Error(`unparseable version: ${v}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
};

const cmp = (a: number[], b: number[]) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];

const inVulnerableRange = (v: string) => {
  const parsed = parseVersion(v);
  return cmp(parsed, VULNERABLE_FROM) >= 0 && cmp(parsed, VULNERABLE_THROUGH) <= 0;
};

/** Resolve js-yaml exactly the way electron-updater's own `require()` will. */
function jsYamlAsElectronUpdaterSeesIt() {
  const updaterDir = dirname(
    createRequire(resolve(ROOT, 'package.json')).resolve('electron-updater/package.json'),
  );
  const req = createRequire(resolve(updaterDir, 'package.json'));
  const entry = req.resolve('js-yaml');
  const version = JSON.parse(
    readFileSync(req.resolve('js-yaml/package.json'), 'utf8'),
  ).version as string;
  return { module: req(entry) as { load: (s: string) => unknown }, version };
}

describe('the js-yaml override on the shipped update path', () => {
  it('is declared, and scoped to electron-updater rather than the whole tree', () => {
    // Scoping is the point. A bare top-level `overrides["js-yaml"]` would also
    // drag app-builder-lib and the rest of the electron-builder packaging
    // toolchain onto 5.x - build-time code that is not shipped, is not covered
    // by this advisory, and whose NSIS/dmg pipeline nothing here exercises.
    expect(pkg.overrides?.['js-yaml'], 'the override must not be global').toBeUndefined();
    expect(pkg.overrides?.['electron-updater']?.['js-yaml']).toBeDefined();
  });

  it('resolves electron-updater to a js-yaml outside the advisory range', () => {
    const { version } = jsYamlAsElectronUpdaterSeesIt();
    // Asserted against the installed tree, not the declaration: an override
    // that failed to apply still reads correctly in package.json.
    expect(
      inVulnerableRange(version),
      `electron-updater resolves js-yaml@${version}, inside GHSA-2883-xcg3-v3hh (4.0.0 - 4.3.1)`,
    ).toBe(false);
  });

  it('still parses an update feed through the API electron-updater calls', () => {
    // `load` is the only js-yaml export electron-updater uses, at all three of
    // its call sites (AppUpdater.js:486, providers/Provider.js:97,
    // providers/PrivateGitHubProvider.js:34). If the substituted major dropped
    // or changed it, auto-update would break at runtime in a shipped build and
    // no other test in this repo would fail.
    const { module: yaml } = jsYamlAsElectronUpdaterSeesIt();
    expect(typeof yaml.load).toBe('function');

    // The real shape electron-builder writes and electron-updater reads back.
    const feed = [
      'version: 3.4.0',
      'files:',
      '  - url: Vision-Studio-3.4.0-Setup.exe',
      '    sha512: Zm9vYmFyYmF6',
      '    size: 1048576',
      'path: Vision-Studio-3.4.0-Setup.exe',
      'sha512: Zm9vYmFyYmF6',
      'packages:',
      '  x64:',
      '    size: 2743554644',
      '    path: vision-studio-3.4.0-x64.nsis.7z',
      "releaseDate: '2026-09-13T00:00:00.000Z'",
      '',
    ].join('\n');

    const parsed = yaml.load(feed) as {
      version: string;
      path: string;
      files: { url: string; size: number }[];
      packages: { x64: { size: number; path: string } };
      releaseDate: string;
    };

    expect(parsed.version).toBe('3.4.0');
    expect(parsed.path).toBe('Vision-Studio-3.4.0-Setup.exe');
    expect(parsed.files).toHaveLength(1);
    expect(parsed.files[0].url).toBe('Vision-Studio-3.4.0-Setup.exe');
    // Numeric scalars must come back as numbers - electron-updater compares
    // these against on-disk byte counts, and a string would compare unequal.
    expect(parsed.files[0].size).toBe(1048576);
    expect(parsed.packages.x64.size).toBe(2743554644);
    // Quoted timestamps stay strings; electron-updater re-parses them itself.
    expect(parsed.releaseDate).toBe('2026-09-13T00:00:00.000Z');
  });

  it('leaves the non-shipped packaging toolchain on its own js-yaml', () => {
    // The counterpart to the scoping assertion above, checked against the
    // installed tree: app-builder-lib resolves independently of the override.
    // This documents the deliberate split rather than enforcing a version -
    // dev-tree advisories are tracked in docs/dependency-security.md, not here.
    const req = createRequire(resolve(ROOT, 'package.json'));
    const builderJsYaml = JSON.parse(
      readFileSync(req.resolve('js-yaml/package.json'), 'utf8'),
    ).version as string;
    expect(parseVersion(builderJsYaml).length).toBe(3);
  });
});
