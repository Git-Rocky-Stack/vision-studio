import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'fs';
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

  /** The CHANGELOG release headings, and whether the newest is still marked Unreleased. */
  function changelogHeadings(): { headings: string[]; unreleased: boolean } {
    const headings = readFileSync(resolve(ROOT, 'CHANGELOG.md'), 'utf8')
      .split(/\r?\n/)
      .filter((line) => line.startsWith('## '));
    return { headings, unreleased: headings[0] === `## [${packageVersion}] - Unreleased` };
  }

  it('names the package version in the README as released or upcoming, matching the changelog', () => {
    // package.json carries the version being built, which is not always the one
    // users can download: 3.4.2 sat in testing while every update feed still
    // served 3.4.1, and a README calling it the current release sent people
    // looking for a build that did not exist. While the changelog marks the
    // version Unreleased, the README must call it upcoming and name the latest
    // published release; once the changelog dates it, the README must call it
    // the current release.
    const readme = readFileSync(resolve(ROOT, 'README.md'), 'utf8');
    if (changelogHeadings().unreleased) {
      expect(readme).toContain(`Upcoming release: v${packageVersion}`);
      expect(readme).not.toContain(`Current release: v${packageVersion}`);
      expect(readme).toMatch(/Latest published release: v\d+\.\d+\.\d+/);
    } else {
      expect(readme).toContain(`Current release: v${packageVersion}`);
    }
  });

  it('has a changelog entry for the current release', () => {
    const { headings, unreleased } = changelogHeadings();

    expect(headings.some((line) => line.startsWith(`## [${packageVersion}]`))).toBe(true);

    // A version that is built but not yet published heads the file as
    // `## [x.y.z] - Unreleased`; the README test above keeps the README in
    // step. A bare `## [Unreleased]`, a stale version or a missing date still
    // fail below.
    if (unreleased) return;

    // The newest release heads the file; a stale "Unreleased" above it means
    // the promotion never happened.
    //
    // The date is matched by shape, not by literal. Pinning it made this test a
    // hand-edit on every release -- and one that fails for the wrong reason: a
    // release that slips a day is not a version-sync defect, but it failed here
    // as one. What must hold is that the top heading names the current version
    // and carries a real ISO date, so `## [Unreleased]`, a stale version, or a
    // heading with no date all still fail.
    const [newest] = headings;
    const match = /^## \[(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)\] - (\d{4}-\d{2}-\d{2})$/.exec(newest ?? '');
    expect(match, `the newest changelog heading is not a dated release heading: ${newest}`).not.toBeNull();
    expect(match?.[1], 'the newest changelog heading is not the current release').toBe(packageVersion);

    // A shape-matching date can still be nonsense (2026-13-45). Round-tripping
    // through Date rejects that without pinning a value.
    const released = new Date(`${match?.[2]}T00:00:00Z`);
    expect(Number.isNaN(released.getTime()), `not a real calendar date: ${match?.[2]}`).toBe(false);
    expect(released.toISOString().slice(0, 10)).toBe(match?.[2]);
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

  it('has curated GitHub release notes for the package version', () => {
    // The Release workflow publishes docs/release-notes/v<version>.md as the
    // release body and fails the tag build without it. Catch the gap here, at
    // the version bump, rather than after a two-hour signed Windows build.
    const notes = resolve(ROOT, `docs/release-notes/v${packageVersion}.md`);
    expect(existsSync(notes), `missing docs/release-notes/v${packageVersion}.md`).toBe(true);
    const body = readFileSync(notes, 'utf8');
    expect(body.trim().length).toBeGreaterThan(200);
    expect(body, 'release notes must state the install and signing state').toMatch(/^## Install$/m);
  });
});
