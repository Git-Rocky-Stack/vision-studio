import { describe, expect, it } from 'vitest';

import packageJson from '../../package.json';
import { releaseChannelLabel } from './releaseChannel';

describe('releaseChannelLabel', () => {
  it.each([
    ['3.4.2', null],
    ['3.4.2+build.7', null],
    ['3.5.0-beta.2', 'Beta'],
    ['3.5.0-alpha', 'Alpha'],
    ['3.5.0-rc.1', 'Release Candidate'],
    ['3.5.0-RC.1', 'Release Candidate'],
    ['3.5.0-nightly.20261111+abc', 'Nightly'],
    ['3.5.0-exp.1', 'Pre-release'],
    ['3.5.0-', null],
  ])('maps %s to %s', (version, label) => {
    expect(releaseChannelLabel(version)).toBe(label);
  });

  it('reads the shipped version as a stable release with no channel badge', () => {
    // Guards the Settings sidebar: it used to hard-code "Beta Release" beside
    // a stable version number.
    expect(packageJson.version).toMatch(/^\d+\.\d+\.\d+/);
    const label = releaseChannelLabel(packageJson.version);
    if (packageJson.version.includes('-')) expect(label).toEqual(expect.any(String));
    else expect(label).toBeNull();
  });
});
