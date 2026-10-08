import { readFileSync } from 'fs';
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
      titleBarOverlay: {
        color: '#0a0a0a',
        symbolColor: '#e5e5e5',
        height: 56,
      },
      backgroundColor: '#000000',
      show: true,
      webPreferences: {
        preload: 'C:/vision-studio/dist-electron/preload.cjs',
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
  });

  // The window paints this colour before the renderer's first frame and at the
  // edge of a live resize. It has to be the chassis colour, or the app flashes
  // a near-black that is not on the palette (DESIGN.md: true black).
  it('paints the window in the void token before the renderer does', () => {
    const css = readFileSync(path.resolve(process.cwd(), 'src/index.css'), 'utf8');
    const voidToken = /--color-void:\s*(#[0-9a-fA-F]{6});/.exec(css)?.[1];

    expect(voidToken).toBe('#000000');
    expect(createBrowserWindowOptions('preload.cjs').backgroundColor).toBe(voidToken);
  });

  // The caption-button strip is not chassis: it sits over the right end of the
  // header, which is lit 4% above the void at its top edge. The strip matches
  // that edge so the window controls read as part of the header.
  it('colours the caption-button strip as the header top edge it sits over', () => {
    const header = readFileSync(
      path.resolve(process.cwd(), 'src/components/layout/Header.tsx'),
      'utf8',
    );
    const topStop = /bg-\[linear-gradient\(180deg,rgba\(255,255,255,(0?\.\d+)\)/.exec(header)?.[1];
    expect(topStop).toBeDefined();

    const level = Math.round(255 * Number(topStop)).toString(16).padStart(2, '0');
    const overlay = createBrowserWindowOptions('preload.cjs').titleBarOverlay;

    expect(overlay).toMatchObject({ color: `#${level}${level}${level}` });
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
