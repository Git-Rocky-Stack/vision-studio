import { describe, expect, it } from 'vitest';

import {
  OPENABLE_FILE_EXTENSIONS,
  isOpenablePath,
  isSafeExternalUrl,
  isSafePythonCommand,
  resolveSafeExportDestination,
  toSafeRendererError,
} from './security';

describe('electron security helpers', () => {
  it('allows only http and https external URLs', () => {
    expect(isSafeExternalUrl('https://example.com/docs')).toBe(true);
    expect(isSafeExternalUrl('http://localhost:3000')).toBe(true);
    expect(isSafeExternalUrl('file:///C:/Windows/System32/calc.exe')).toBe(false);
    expect(isSafeExternalUrl('javascript:alert(1)')).toBe(false);
  });

  it('rejects non-Python executables for backend startup', () => {
    expect(isSafePythonCommand('python')).toBe(true);
    expect(isSafePythonCommand('py')).toBe(true);
    expect(isSafePythonCommand('C:\\Python311\\python.exe')).toBe(true);
    expect(isSafePythonCommand('cmd.exe')).toBe(false);
    expect(isSafePythonCommand('powershell.exe')).toBe(false);
    expect(isSafePythonCommand('C:\\Windows\\System32\\cmd.exe')).toBe(false);
  });

  it('rejects Python on network shares and device namespace paths', () => {
    expect(isSafePythonCommand('\\\\fileserver\\tools\\python.exe')).toBe(false);
    expect(isSafePythonCommand('//fileserver/tools/python.exe')).toBe(false);
    expect(isSafePythonCommand('\\\\?\\C:\\Python311\\python.exe')).toBe(false);
    expect(isSafePythonCommand('\\\\.\\C:\\Python311\\python.exe')).toBe(false);
    expect(isSafePythonCommand('  \\\\fileserver\\tools\\python.exe')).toBe(false);
    expect(isSafePythonCommand('/usr/bin/python3')).toBe(true);
  });

  it('opens only allow-listed media and document types, plus folders (S8)', () => {
    for (const allowed of [
      'C:/Users/User/Pictures/render.png',
      'C:\\Users\\User\\Pictures\\shot.JPEG',
      'C:/Users/User/Videos/clip.mp4',
      'C:/Users/User/Music/take.wav',
      'report.pdf',
      'notes.md',
      'params.json',
      'readme.txt',
    ]) {
      expect(isOpenablePath(allowed, false), allowed).toBe(true);
    }
    for (const refused of [
      'C:/Users/User/Downloads/tool.exe',
      'C:\\Users\\User\\Downloads\\install.MSI',
      'payload.bat',
      'script.ps1',
      'shortcut.lnk',
      'page.html',
      'page.svg',
      'macro.docm',
      'archive.zip',
      'library.dll',
      'C:/Users/User/no-extension-file',
      '.png',
    ]) {
      expect(isOpenablePath(refused, false), refused).toBe(false);
    }
    expect(isOpenablePath('C:/Users/User/Pictures/Vision Studio', true)).toBe(true);
    expect(OPENABLE_FILE_EXTENSIONS.has('.exe')).toBe(false);
  });

  it('restricts asset exports to user-selected safe roots', () => {
    const userRoot = 'C:/Users/User';

    expect(resolveSafeExportDestination('C:/Users/User/Downloads/out.png', [userRoot])).toBe(
      'C:/Users/User/Downloads/out.png'
    );
    expect(resolveSafeExportDestination('c:\\users\\user\\Downloads\\out.png', [userRoot])).toBe(
      'c:/users/user/Downloads/out.png'
    );
    expect(resolveSafeExportDestination('C:/Windows/System32/out.png', [userRoot])).toBeNull();
    expect(resolveSafeExportDestination('relative/out.png', [userRoot])).toBeNull();
  });

  it('refuses export destinations that escape the root by traversal, prefix or UNC', () => {
    const roots = ['C:/Users/User/Desktop'];
    for (const escape of [
      'C:/Users/User/Desktop/../AppData/Roaming/evil.png',
      'C:\\Users\\User\\Desktop\\..\\..\\..\\Windows\\evil.png',
      'C:/Users/User/Desktop-evil/out.png',
      '\\\\attacker\\share\\out.png',
      '//attacker/share/out.png',
      '\\\\?\\C:\\Users\\User\\Desktop\\out.png',
      '\\\\.\\pipe\\x',
      'C:/Users/User/Desktop/out.png:stream',
    ]) {
      expect(resolveSafeExportDestination(escape, roots), escape).toBeNull();
    }
  });

  it('maps an unverified backend to its own renderer message', () => {
    expect(toSafeRendererError({ code: 'BACKEND_UNVERIFIED' }, 'x')).toMatch(/identity has not been verified/);
  });

  it('sanitizes backend errors before returning them to the renderer', () => {
    const error = {
      message: 'connect ECONNREFUSED 127.0.0.1:8000',
      response: {
        data: {
          detail: 'Traceback: C:/Users/User/AppData/Roaming/secrets.txt',
        },
      },
    };

    expect(toSafeRendererError(error, 'Image generation failed')).toBe('Image generation failed');
  });
});
