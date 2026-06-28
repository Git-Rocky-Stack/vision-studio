import path from 'path';
import { describe, expect, it } from 'vitest';

import { getAllowedExportRoots, resolveShellPath } from './mainIpc';

const HOME = 'C:/Users/User';

const fakeApp = {
  getPath: (name: string) => {
    const map: Record<string, string> = {
      home: HOME,
      desktop: `${HOME}/Desktop`,
      documents: `${HOME}/Documents`,
      downloads: `${HOME}/Downloads`,
      pictures: `${HOME}/Pictures`,
      videos: `${HOME}/Videos`,
    };
    return map[name] ?? HOME;
  },
} as unknown as Parameters<typeof getAllowedExportRoots>[0];

// A managed-asset resolver that always rejects, forcing resolveShellPath down
// its export-root fallback - the branch the home-root narrowing protects.
const throwingRoots = {
  resolveManagedAssetPath: () => {
    throw new Error('not a managed asset');
  },
} as unknown as Parameters<typeof resolveShellPath>[1];

describe('shell-open allow-roots (P1 hardening)', () => {
  it('excludes the broad home root, keeping only standard content dirs', () => {
    const roots = getAllowedExportRoots(fakeApp).map((root) => path.resolve(root));

    expect(roots).not.toContain(path.resolve(HOME));
    expect(roots).toContain(path.resolve(`${HOME}/Desktop`));
    expect(roots).toContain(path.resolve(`${HOME}/Documents`));
    expect(roots).toContain(path.resolve(`${HOME}/Downloads`));
    expect(roots).toContain(path.resolve(`${HOME}/Pictures`));
    expect(roots).toContain(path.resolve(`${HOME}/Videos`));
  });

  it('refuses a non-managed path inside the profile but outside content dirs', () => {
    const roots = getAllowedExportRoots(fakeApp);

    expect(() => resolveShellPath(`${HOME}/.ssh/id_rsa`, throwingRoots, roots)).toThrow(
      /outside managed or export locations/i
    );
    expect(() =>
      resolveShellPath(`${HOME}/AppData/Roaming/Vision Studio/secrets.json`, throwingRoots, roots)
    ).toThrow(/outside managed or export locations/i);
  });

  it('still allows opening a file exported into a standard content dir', () => {
    const roots = getAllowedExportRoots(fakeApp);

    expect(resolveShellPath(`${HOME}/Desktop/render.png`, throwingRoots, roots)).toBe(
      path.resolve(`${HOME}/Desktop/render.png`)
    );
  });
});
