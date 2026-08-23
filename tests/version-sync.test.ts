import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(__dirname, '..');
const read = (p: string) => JSON.parse(readFileSync(resolve(ROOT, p), 'utf8'));

const packageVersion: string = read('package.json').version;

/**
 * Version numbers duplicated by hand drift, and they drift silently: the
 * backend carried its own literal and spent two releases reporting 3.1.1 from a
 * 3.2.0 install - in its OpenAPI spec, on its root endpoint, and in the
 * User-Agent it sent to Hugging Face and CivitAI. The runtime now resolves one
 * number (backend/version.py); these are the checked-in copies that cannot.
 */
describe('version sync', () => {
  it('uses a valid semver in package.json', () => {
    expect(packageVersion).toMatch(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/);
  });

  it('publishes the same version in the checked-in OpenAPI spec', () => {
    // Hand-maintained: nothing regenerates it, so nothing else would notice.
    expect(read('docs/api/openapi.json').info.version).toBe(packageVersion);
  });

  it('keeps the OpenAPI root-endpoint example honest', () => {
    const spec = readFileSync(resolve(ROOT, 'docs/api/openapi.json'), 'utf8');
    const examples = [...spec.matchAll(/"version":\s*"(\d+\.\d+\.\d+[^"]*)"/g)].map((m) => m[1]);
    expect(examples.length).toBeGreaterThan(0);
    for (const found of examples) {
      expect(found, 'a version literal in the spec disagrees with package.json').toBe(packageVersion);
    }
  });

  it('names the current release in the README', () => {
    const readme = readFileSync(resolve(ROOT, 'README.md'), 'utf8');
    expect(readme).toContain(`Current release: v${packageVersion}`);
  });

  it('has a changelog entry for the current release', () => {
    const headings = readFileSync(resolve(ROOT, 'CHANGELOG.md'), 'utf8')
      .split(/\r?\n/)
      .filter((line) => line.startsWith('## '));

    expect(headings.some((line) => line.startsWith(`## [${packageVersion}]`))).toBe(true);
    // The newest release heads the file; a stale "Unreleased" above it means
    // the promotion never happened.
    expect(headings[0]).toBe(`## [${packageVersion}] - 2026-08-23`);
  });

  it('never hardcodes a version in the Inno Setup installer script', () => {
    // scripts/installer.iss stamps AppVersion AND the output filename
    // (Vision-Studio-{version}-Setup). Left as a literal it silently went two
    // releases stale, so `npm run build:windows` would have produced a
    // 3.2.0-named installer from a 3.3.0 tree. The version arrives as an ISCC
    // /D define instead, sourced from package.json.
    const iss = readFileSync(resolve(ROOT, 'scripts/installer.iss'), 'utf8');

    expect(iss).not.toMatch(/#define\s+MyAppVersion\s+"\d+\.\d+\.\d+/);
    expect(iss, 'installer.iss must refuse to build without the define').toContain('#ifndef MyAppVersion');
  });

  it('passes the package version into the Inno Setup build', () => {
    const script = readFileSync(resolve(ROOT, 'scripts/build-windows.cjs'), 'utf8');
    expect(script).toContain('/DMyAppVersion=');
  });

  it('states a supported version range covering the current release in SECURITY.md', () => {
    const [major, minor] = packageVersion.split('.');
    const policy = readFileSync(resolve(ROOT, 'SECURITY.md'), 'utf8');
    expect(policy, 'SECURITY.md still names an older supported line').toContain(`${major}.${minor}.x`);
  });
});
