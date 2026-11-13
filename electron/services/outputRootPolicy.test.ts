import { describe, expect, it } from 'vitest';

import { getSystemDirectories, validateOutputRoot, type OutputRootPolicyContext } from './outputRootPolicy';

const windows: OutputRootPolicyContext = {
  homeDir: 'C:\\Users\\User',
  userDataPath: 'C:\\Users\\User\\AppData\\Roaming\\Vision Studio',
  platform: 'win32',
  env: {
    SystemRoot: 'C:\\Windows',
    ProgramFiles: 'C:\\Program Files',
    'ProgramFiles(x86)': 'C:\\Program Files (x86)',
    ProgramData: 'C:\\ProgramData',
  },
};

const linux: OutputRootPolicyContext = {
  homeDir: '/home/user',
  userDataPath: '/home/user/.config/Vision Studio',
  platform: 'linux',
  env: {},
};

describe('validateOutputRoot (S3)', () => {
  it('accepts ordinary folders and returns the canonical path', () => {
    expect(validateOutputRoot('D:\\Renders\\Vision', windows)).toEqual({ ok: true, path: 'D:/Renders/Vision' });
    expect(validateOutputRoot('C:/Users/User/Pictures/Vision Studio', windows)).toEqual({
      ok: true,
      path: 'C:/Users/User/Pictures/Vision Studio',
    });
    expect(validateOutputRoot('/home/user/Pictures/vision', linux)).toEqual({ ok: true, path: '/home/user/Pictures/vision' });
    expect(validateOutputRoot('/mnt/data/renders', linux).ok).toBe(true);
  });

  it.each([
    ['empty', ''],
    ['relative', 'renders\\out'],
    ['drive root', 'D:\\'],
    ['drive root without slash', 'D:'],
    ['profile root', 'C:\\Users\\User'],
    ['profile root, other case', 'c:/users/user/'],
    ['ancestor of the profile', 'C:\\Users'],
    ['app data folder', 'C:\\Users\\User\\AppData\\Roaming\\Vision Studio'],
    ['ancestor of app data', 'C:\\Users\\User\\AppData'],
    ['Windows directory', 'C:\\Windows'],
    ['inside Windows', 'C:\\Windows\\Temp\\out'],
    ['Program Files', 'C:\\Program Files\\Vision Studio'],
    ['Program Files (x86)', 'c:\\program files (x86)\\x'],
    ['ProgramData', 'C:\\ProgramData\\x'],
    ['UNC share', '\\\\nas\\share\\renders'],
    ['device path', '\\\\?\\D:\\Renders'],
    ['traversal into Windows', 'C:\\Renders\\..\\..\\Windows\\System32'],
  ])('refuses a %s on Windows', (_label, candidate) => {
    expect(validateOutputRoot(candidate, windows).ok).toBe(false);
  });

  it.each([
    ['filesystem root', '/'],
    ['home', '/home/user'],
    ['home parent', '/home'],
    ['etc', '/etc/vision'],
    ['usr', '/usr/local/share'],
    ['var', '/var/tmp/out'],
    ['config dir', '/home/user/.config/Vision Studio'],
  ])('refuses %s on Linux', (_label, candidate) => {
    expect(validateOutputRoot(candidate, linux).ok).toBe(false);
  });

  it('gives a UNC-specific hint', () => {
    const verdict = validateOutputRoot('\\\\nas\\share', windows);
    expect(verdict.ok).toBe(false);
    expect(!verdict.ok && verdict.reason).toMatch(/drive letter/);
  });

  it('lists the Windows system folders from the environment, with fallbacks', () => {
    expect(getSystemDirectories({ platform: 'win32', env: { SystemRoot: 'E:\\WIN' } })).toEqual(
      expect.arrayContaining(['E:\\WIN', 'C:\\Windows', 'C:\\Program Files']),
    );
    expect(getSystemDirectories({ platform: 'darwin', env: {} })).toContain('/System');
  });
});
