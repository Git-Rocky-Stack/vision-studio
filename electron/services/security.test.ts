import path from 'path';
import { describe, expect, it } from 'vitest';

import {
  isAllowedStoreKey,
  isExecutablePath,
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

  it('flags executable and script file types so app:open-path never launches them', () => {
    expect(isExecutablePath('C:/Users/User/Downloads/tool.exe')).toBe(true);
    expect(isExecutablePath('C:\\Users\\User\\Downloads\\install.MSI')).toBe(true);
    expect(isExecutablePath('payload.bat')).toBe(true);
    expect(isExecutablePath('script.ps1')).toBe(true);
    expect(isExecutablePath('shortcut.lnk')).toBe(true);
    expect(isExecutablePath('C:/Users/User/Pictures/render.png')).toBe(false);
    expect(isExecutablePath('C:/Users/User/Videos/clip.mp4')).toBe(false);
    expect(isExecutablePath('report.pdf')).toBe(false);
    expect(isExecutablePath('C:/Users/User/no-extension-file')).toBe(false);
  });

  it('limits generic store IPC access to known keys', () => {
    expect(isAllowedStoreKey('settings')).toBe(true);
    expect(isAllowedStoreKey('recentProjects')).toBe(true);
    expect(isAllowedStoreKey('authToken')).toBe(false);
  });

  it('restricts asset exports to user-selected safe roots', () => {
    const userRoot = path.resolve('C:/Users/User');

    expect(resolveSafeExportDestination('C:/Users/User/Downloads/out.png', [userRoot])).toBe(
      path.resolve('C:/Users/User/Downloads/out.png')
    );
    expect(resolveSafeExportDestination('C:/Windows/System32/out.png', [userRoot])).toBeNull();
    expect(resolveSafeExportDestination('relative/out.png', [userRoot])).toBeNull();
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
