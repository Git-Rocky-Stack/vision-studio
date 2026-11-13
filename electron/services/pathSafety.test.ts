import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, expect, it } from 'vitest';

import {
  canonicalizePath,
  hasForbiddenPathSyntax,
  isPathWithinRoots,
  realpathThroughExisting,
  resolveWithinRoots,
  toNativePath,
} from './pathSafety';

const ROOT = 'D:/Vision Studio/Outputs';

describe('canonicalizePath', () => {
  it('resolves dot segments and mixed separators with Windows semantics on any host', () => {
    expect(canonicalizePath('D:\\Vision Studio\\Outputs\\job\\..\\x.png')).toBe('D:/Vision Studio/Outputs/x.png');
    expect(canonicalizePath('D:/Vision Studio/Outputs/./a/../../Outputs/b.png')).toBe('D:/Vision Studio/Outputs/b.png');
    expect(canonicalizePath('D:/Vision Studio/Outputs/')).toBe('D:/Vision Studio/Outputs');
    expect(canonicalizePath('C:/')).toBe('C:/');
  });

  it('rejects relative, UNC, device and NT-namespace paths', () => {
    for (const bad of [
      'relative/out.png',
      '\\\\server\\share\\x.png',
      '//server/share/x.png',
      '\\\\?\\C:\\Windows\\x',
      '\\\\.\\PhysicalDrive0',
      '\\??\\C:\\Windows',
      'C:relative.png',
      'C:/a/b.png:hidden',
      'C:/a\0/b.png',
      '',
    ]) {
      expect(canonicalizePath(bad), JSON.stringify(bad)).toBeNull();
    }
  });

  it('treats a colon as a plain name character on POSIX only', () => {
    expect(hasForbiddenPathSyntax('/home/u/out/12:30.png', 'linux')).toBe(false);
    expect(hasForbiddenPathSyntax('C:/out/12:30.png', 'linux')).toBe(true);
    expect(hasForbiddenPathSyntax('/home/u/out/12:30.png', 'win32')).toBe(true);
  });
});

describe('isPathWithinRoots', () => {
  const noRealpath = (candidate: string): string => {
    throw Object.assign(new Error(`ENOENT ${candidate}`), { code: 'ENOENT' });
  };
  const opts = { realpath: noRealpath };

  it('accepts a file under the root, whatever the separator or case on Windows', () => {
    expect(isPathWithinRoots('D:/Vision Studio/Outputs/job/x.png', [ROOT], opts)).toBe(true);
    expect(isPathWithinRoots('D:\\Vision Studio\\Outputs\\job\\x.png', [ROOT], opts)).toBe(true);
    expect(isPathWithinRoots('d:/vision studio/outputs/JOB/x.png', [ROOT], opts)).toBe(true);
    expect(isPathWithinRoots('D:/Vision Studio/Outputs', [ROOT], opts)).toBe(true);
  });

  it('refuses traversal, sibling-prefix, other-drive and UNC escapes', () => {
    for (const escape of [
      'D:/Vision Studio/Outputs/../../Windows/System32/config/SAM',
      'D:/Vision Studio/Outputs/..\\..\\secrets.json',
      'D:\\Vision Studio\\Outputs\\job\\..\\..\\..\\x',
      'D:/Vision Studio/Outputs-evil/x.png',
      'D:/Vision Studio/OutputsX/x.png',
      'E:/Vision Studio/Outputs/x.png',
      '\\\\attacker\\Vision Studio\\Outputs\\x.png',
      '//attacker/share/x.png',
      '\\\\?\\D:\\Vision Studio\\Outputs\\x.png',
      'D:/Vision Studio/Outputs/x.png::$DATA',
    ]) {
      expect(isPathWithinRoots(escape, [ROOT], opts), escape).toBe(false);
    }
  });

  it('is case-sensitive for POSIX roots', () => {
    expect(isPathWithinRoots('/srv/out/x.png', ['/srv/out'], { ...opts, platform: 'linux' })).toBe(true);
    expect(isPathWithinRoots('/srv/OUT/x.png', ['/srv/out'], { ...opts, platform: 'linux' })).toBe(false);
    expect(isPathWithinRoots('/srv/out/../etc/passwd', ['/srv/out'], { ...opts, platform: 'linux' })).toBe(false);
  });

  it('returns the canonical path from resolveWithinRoots', () => {
    expect(resolveWithinRoots('D:\\Vision Studio\\Outputs\\a\\..\\b.png', [ROOT], opts)).toBe(
      'D:/Vision Studio/Outputs/b.png',
    );
  });

  it('refuses a symlink (junction) inside the root that points outside it', () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-pathsafety-'));
    try {
      const root = path.join(base, 'outputs');
      const outside = path.join(base, 'outside');
      fs.mkdirSync(root);
      fs.mkdirSync(outside);
      fs.writeFileSync(path.join(outside, 'secret.txt'), 'x');
      fs.writeFileSync(path.join(root, 'ok.png'), 'x');
      // 'junction' needs no privilege on Windows; it is ignored elsewhere.
      fs.symlinkSync(outside, path.join(root, 'link'), 'junction');

      expect(isPathWithinRoots(path.join(root, 'ok.png'), [root])).toBe(true);
      expect(isPathWithinRoots(path.join(root, 'link', 'secret.txt'), [root])).toBe(false);
      // A not-yet-existing file under the escaping link is refused too.
      expect(isPathWithinRoots(path.join(root, 'link', 'new.png'), [root])).toBe(false);
      // A root that is itself reached through a link still contains its files.
      expect(isPathWithinRoots(path.join(root, 'link', 'secret.txt'), [path.join(root, 'link')])).toBe(true);
    } finally {
      fs.rmSync(base, { recursive: true, force: true });
    }
  });
});

describe('realpathThroughExisting', () => {
  it('resolves through the nearest existing ancestor', () => {
    const realpath = (candidate: string) => {
      if (candidate === 'D:/a') return 'E:\\real\\a';
      throw new Error('ENOENT');
    };
    expect(realpathThroughExisting('D:/a/b/c.png', 'win32', realpath)).toBe('E:/real/a/b/c.png');
    expect(realpathThroughExisting('Z:/none/x', 'win32', () => {
      throw new Error('ENOENT');
    })).toBe('Z:/none/x');
  });
});

describe('toNativePath', () => {
  it('uses backslashes for Windows paths and leaves POSIX paths alone', () => {
    expect(toNativePath('C:/Users/U/x.png')).toBe('C:\\Users\\U\\x.png');
    expect(toNativePath('/home/u/x.png', 'linux')).toBe('/home/u/x.png');
  });
});
