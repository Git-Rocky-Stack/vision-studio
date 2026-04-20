import path from 'path';
import { describe, expect, it } from 'vitest';

import { createBrowserWindowOptions, resolveRendererLoadTarget } from './mainWindow';

describe('mainWindow service helpers', () => {
  it('creates the main BrowserWindow with the hardened renderer defaults', () => {
    const options = createBrowserWindowOptions('C:/vision-studio/dist-electron/preload.cjs');

    expect(options).toMatchObject({
      width: 1600,
      height: 1000,
      minWidth: 1200,
      minHeight: 800,
      titleBarStyle: 'hidden',
      backgroundColor: '#0a0a0a',
      show: true,
      webPreferences: {
        preload: 'C:/vision-studio/dist-electron/preload.cjs',
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
  });

  it('loads the dev server when Vite provides one', () => {
    expect(
      resolveRendererLoadTarget({
        dirname: 'C:/vision-studio/dist-electron',
        devServerUrl: 'http://localhost:5173',
      })
    ).toEqual({ kind: 'url', value: 'http://localhost:5173' });
  });

  it('loads the packaged renderer from dist when no dev server is present', () => {
    expect(
      resolveRendererLoadTarget({
        dirname: 'C:/vision-studio/dist-electron',
        devServerUrl: undefined,
      })
    ).toEqual({
      kind: 'file',
      value: path.join('C:/vision-studio/dist-electron', '../dist/index.html'),
    });
  });
});
