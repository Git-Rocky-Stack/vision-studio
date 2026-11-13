/**
 * The release channel a build belongs to, read from its semver version.
 *
 * Vision Studio has no separate update-channel setting: a pre-release build is
 * versioned `x.y.z-<tag>[.n]` (e.g. `3.5.0-beta.2`), and a stable build is a
 * plain `x.y.z`. The channel badge therefore follows the version itself, so it
 * can never claim "Beta" on a stable release (or the reverse).
 */
const PRERELEASE_LABELS: Record<string, string> = {
  alpha: 'Alpha',
  beta: 'Beta',
  rc: 'Release Candidate',
  canary: 'Canary',
  dev: 'Development',
  nightly: 'Nightly',
  preview: 'Preview',
};

/**
 * Human label for a pre-release channel, or null for a stable release (which
 * needs no badge). Build metadata (`+sha`) never makes a build pre-release.
 */
export function releaseChannelLabel(version: string): string | null {
  const core = version.trim().split('+', 1)[0];
  const dash = core.indexOf('-');
  if (dash === -1) return null;
  const tag = core.slice(dash + 1).split('.', 1)[0].toLowerCase();
  if (!tag) return null;
  return PRERELEASE_LABELS[tag] ?? 'Pre-release';
}
