import { describe, expect, it } from 'vitest';

import {
  isTrustedIpcSender,
  isTrustedRendererUrl,
  resolveDefaultRendererLocation,
} from './ipcSenderPolicy';

const windowsPackaged = {
  rendererEntryFile: 'C:\\Program Files\\Vision Studio\\resources\\app.asar\\dist\\index.html',
  platform: 'win32' as const,
};
const linuxPackaged = { rendererEntryFile: '/opt/Vision Studio/resources/app.asar/dist/index.html', platform: 'linux' as const };
const dev = { devServerUrl: 'http://localhost:5173/', rendererEntryFile: '/repo/dist/index.html', platform: 'linux' as const };

describe('isTrustedRendererUrl', () => {
  it('trusts the packaged entry page, with any hash route, case-insensitively on Windows', () => {
    expect(
      isTrustedRendererUrl('file:///C:/Program%20Files/Vision%20Studio/resources/app.asar/dist/index.html', windowsPackaged),
    ).toBe(true);
    expect(
      isTrustedRendererUrl('file:///c:/program files/vision studio/resources/app.asar/dist/index.html#/studio', windowsPackaged),
    ).toBe(true);
    expect(isTrustedRendererUrl('file:///opt/Vision%20Studio/resources/app.asar/dist/index.html?x=1', linuxPackaged)).toBe(true);
  });

  it('refuses other files, UNC file URLs, other schemes and origins', () => {
    for (const url of [
      'file:///C:/Users/User/Downloads/evil.html',
      'file:///C:/Program%20Files/Vision%20Studio/resources/app.asar/dist/other.html',
      'file://attacker/share/dist/index.html',
      'https://evil.example/',
      'http://localhost:5174/',
      'data:text/html,hi',
      'about:blank',
      'not a url',
    ]) {
      expect(isTrustedRendererUrl(url, windowsPackaged), url).toBe(false);
    }
    expect(isTrustedRendererUrl('file:///opt/vision studio/resources/app.asar/dist/index.html', linuxPackaged)).toBe(false);
  });

  it('trusts the dev server origin only in development', () => {
    expect(isTrustedRendererUrl('http://localhost:5173/#/studio', dev)).toBe(true);
    expect(isTrustedRendererUrl('http://localhost:5173/src/main.tsx', dev)).toBe(true);
    expect(isTrustedRendererUrl('http://127.0.0.1:5173/', dev)).toBe(false);
    expect(isTrustedRendererUrl('http://localhost:5173/', linuxPackaged)).toBe(false);
  });
});

describe('isTrustedIpcSender', () => {
  it('requires the top-level frame', () => {
    const url = 'file:///opt/Vision%20Studio/resources/app.asar/dist/index.html';
    expect(isTrustedIpcSender({ senderFrame: { url, parent: null } }, linuxPackaged)).toBe(true);
    expect(isTrustedIpcSender({ senderFrame: { url, parent: {} } }, linuxPackaged)).toBe(false);
    expect(isTrustedIpcSender({ senderFrame: null }, linuxPackaged)).toBe(false);
    expect(isTrustedIpcSender({}, linuxPackaged)).toBe(false);
  });
});

describe('resolveDefaultRendererLocation', () => {
  it('mirrors mainWindow: <bundle dir>/../dist/index.html, plus the dev server', () => {
    expect(
      resolveDefaultRendererLocation('C:\\App\\resources\\app.asar\\dist-electron', { VITE_DEV_SERVER_URL: '' }, 'win32'),
    ).toEqual({
      devServerUrl: undefined,
      rendererEntryFile: 'C:\\App\\resources\\app.asar\\dist\\index.html',
      platform: 'win32',
    });
    expect(resolveDefaultRendererLocation('/repo/dist-electron', { VITE_DEV_SERVER_URL: 'http://localhost:5173/' }, 'linux'))
      .toMatchObject({ devServerUrl: 'http://localhost:5173/', rendererEntryFile: '/repo/dist/index.html' });
  });
});
