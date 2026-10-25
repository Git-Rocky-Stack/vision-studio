import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, expect, it, vi } from 'vitest';

import {
  getAllowedExportRoots,
  readTakenFileNames,
  reserveUniqueFileName,
  resolveShellPath,
} from './mainIpc';

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

describe('import / export collision naming', () => {
  it('reads the destination once and resolves every collision against it, never existsSync', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-collide-'));
    try {
      fs.writeFileSync(path.join(dir, 'shot.png'), '');
      fs.writeFileSync(path.join(dir, 'shot-1.png'), '');
      const existsSync = vi.spyOn(fs, 'existsSync');

      const taken = await readTakenFileNames(dir, false);
      const names = ['shot', 'shot', 'other'].map((name) => reserveUniqueFileName(name, '.png', taken, false));

      expect(names).toEqual(['shot-2.png', 'shot-3.png', 'other.png']);
      expect(existsSync).not.toHaveBeenCalled();
      existsSync.mockRestore();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('treats a missing destination as empty', async () => {
    const taken = await readTakenFileNames(path.join(os.tmpdir(), 'vs-does-not-exist-xyz'), false);
    expect(taken.size).toBe(0);
  });

  it('matches case-insensitively where the filesystem does', () => {
    const taken = new Set(['shot.png']);
    expect(reserveUniqueFileName('Shot', '.PNG', new Set(taken), true)).toBe('Shot-1.PNG');
    expect(reserveUniqueFileName('Shot', '.PNG', new Set(taken), false)).toBe('Shot.PNG');
  });
});
