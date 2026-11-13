import { EventEmitter } from 'events';
import { readFileSync } from 'fs';
import path from 'path';
import { describe, expect, it, vi } from 'vitest';

import {
  RENDERER_CRASH_LIMIT,
  createBrowserWindowOptions,
  createMainWindowService,
  hardenWebContents,
  installSessionPermissionPolicy,
  isPermissionAllowed,
  isTrustedRendererUrl,
  resolveRendererLoadTarget,
} from './mainWindow';

/** A BrowserWindow double that records loads and replays window / webContents events. */
function createFakeBrowserWindow() {
  const instances: FakeWindow[] = [];

  class FakeWebContents extends EventEmitter {
    windowOpenHandler: (() => { action: string }) | null = null;
    setWindowOpenHandler(handler: () => { action: string }) {
      this.windowOpenHandler = handler;
    }
    openDevTools = vi.fn();
  }

  class FakeWindow extends EventEmitter {
    webContents = new FakeWebContents();
    loads: string[] = [];
    destroyed = false;
    minimized = false;
    visible = true;
    focus = vi.fn();
    restore = vi.fn(() => {
      this.minimized = false;
    });
    show = vi.fn();
    constructor() {
      super();
      instances.push(this);
    }
    loadURL(url: string) {
      this.loads.push(url);
      return Promise.resolve();
    }
    loadFile(file: string) {
      this.loads.push(file);
      return Promise.resolve();
    }
    isDestroyed() {
      return this.destroyed;
    }
    isMinimized() {
      return this.minimized;
    }
    isVisible() {
      return this.visible;
    }
    /** Mirrors Electron: 'close' first; a cancelled close keeps the window. */
    close() {
      let prevented = false;
      this.emit('close', { preventDefault: () => (prevented = true) });
      if (!prevented) {
        this.destroyed = true;
        this.emit('closed');
      }
      return prevented;
    }
  }

  return { BrowserWindow: FakeWindow as never, instances };
}

const logger = { error: vi.fn(), warn: vi.fn() };

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
    // The header gradient starts at the sheen-lift token; its canonical (dark,
    // first-declared) value is the top edge the caption strip must match.
    expect(header).toContain('from-sheen-lift');
    const css = readFileSync(path.resolve(process.cwd(), 'src/index.css'), 'utf8');
    const topStop = /--color-sheen-lift:\s*rgba\(255,\s*255,\s*255,\s*(0?\.\d+)\)/.exec(css)?.[1];
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

describe('renderer security policy (L7)', () => {
  it('trusts only the packaged file:// renderer and the dev server origin', () => {
    expect(isTrustedRendererUrl('file:///C:/Program%20Files/Vision%20Studio/resources/app.asar/dist/index.html')).toBe(true);
    expect(isTrustedRendererUrl('file://')).toBe(true);
    expect(isTrustedRendererUrl('http://localhost:5173/#/generate', 'http://localhost:5173')).toBe(true);
    expect(isTrustedRendererUrl('http://localhost:5173/')).toBe(false);
    expect(isTrustedRendererUrl('https://evil.example/', 'http://localhost:5173')).toBe(false);
    expect(isTrustedRendererUrl(undefined)).toBe(false);
    expect(isTrustedRendererUrl('not a url')).toBe(false);
  });

  it('allows clipboard writes and notifications, and nothing else', () => {
    const app = 'file:///app/dist/index.html';
    expect(isPermissionAllowed('clipboard-sanitized-write', app)).toBe(true);
    expect(isPermissionAllowed('notifications', app)).toBe(true);
    for (const permission of ['media', 'geolocation', 'clipboard-read', 'hid', 'serial', 'usb', 'fileSystem', 'openExternal', 'midi']) {
      expect(isPermissionAllowed(permission, app)).toBe(false);
    }
    expect(isPermissionAllowed('notifications', 'https://evil.example/')).toBe(false);
  });

  it('installs both a request and a check handler that deny by default', () => {
    let requestHandler: ((...args: unknown[]) => void) | null = null;
    let checkHandler: ((...args: unknown[]) => boolean) | null = null;
    installSessionPermissionPolicy(
      {
        setPermissionRequestHandler: (handler: never) => {
          requestHandler = handler;
        },
        setPermissionCheckHandler: (handler: never) => {
          checkHandler = handler;
        },
      } as never,
      { logger },
    );

    const contents = { getURL: () => 'file:///app/dist/index.html' };
    const answers: boolean[] = [];
    requestHandler!(contents, 'media', (granted: boolean) => answers.push(granted), { requestingUrl: 'file:///app/dist/index.html' });
    requestHandler!(contents, 'clipboard-sanitized-write', (granted: boolean) => answers.push(granted), {});
    expect(answers).toEqual([false, true]);

    expect(checkHandler!(contents, 'notifications', 'file://', { requestingUrl: 'file:///app/dist/index.html' })).toBe(true);
    expect(checkHandler!(contents, 'geolocation', 'file://', {})).toBe(false);
  });

  it('hardens any webContents: no webview, no popups, no navigation', () => {
    const contents = new EventEmitter() as EventEmitter & { setWindowOpenHandler: ReturnType<typeof vi.fn> };
    contents.setWindowOpenHandler = vi.fn();
    hardenWebContents(contents as never, logger);

    const attach = { preventDefault: vi.fn() };
    contents.emit('will-attach-webview', attach);
    const navigate = { preventDefault: vi.fn() };
    contents.emit('will-navigate', navigate, 'https://evil.example/');

    expect(attach.preventDefault).toHaveBeenCalled();
    expect(navigate.preventDefault).toHaveBeenCalled();
    const handler = contents.setWindowOpenHandler.mock.calls[0][0] as () => { action: string };
    expect(handler()).toEqual({ action: 'deny' });
  });
});

describe('main window lifecycle', () => {
  function service(options: Partial<Parameters<typeof createMainWindowService>[0]> = {}) {
    const fake = createFakeBrowserWindow();
    const windows = createMainWindowService({
      BrowserWindow: fake.BrowserWindow,
      dirname: 'C:/vision-studio/dist-electron',
      logger,
      ...options,
    });
    return { windows, fake };
  }

  it('hardens the main window itself', () => {
    const { windows, fake } = service();
    windows.createWindow();
    const contents = fake.instances[0].webContents;
    expect(contents.windowOpenHandler?.()).toEqual({ action: 'deny' });
    expect(contents.listenerCount('will-navigate')).toBeGreaterThan(0);
    expect(contents.listenerCount('will-attach-webview')).toBeGreaterThan(0);
  });

  describe('renderer crash recovery (L6)', () => {
    it('reloads the renderer after a crash', () => {
      const { windows, fake } = service();
      windows.createWindow();
      const window = fake.instances[0];

      window.webContents.emit('render-process-gone', {}, { reason: 'crashed', exitCode: 1 });

      expect(window.loads).toHaveLength(2);
    });

    it('ignores a clean exit', () => {
      const { windows, fake } = service();
      windows.createWindow();
      fake.instances[0].webContents.emit('render-process-gone', {}, { reason: 'clean-exit', exitCode: 0 });
      expect(fake.instances[0].loads).toHaveLength(1);
    });

    it(`stops reloading after ${RENDERER_CRASH_LIMIT} crashes in a minute and reports the loop`, () => {
      const onRendererCrashLoop = vi.fn();
      let clock = 0;
      const { windows, fake } = service({ onRendererCrashLoop, now: () => clock });
      windows.createWindow();
      const window = fake.instances[0];

      for (let crash = 0; crash <= RENDERER_CRASH_LIMIT; crash += 1) {
        clock += 1000;
        window.webContents.emit('render-process-gone', {}, { reason: 'oom', exitCode: -1 });
      }

      expect(window.loads).toHaveLength(1 + RENDERER_CRASH_LIMIT);
      expect(onRendererCrashLoop).toHaveBeenCalledOnce();

      // The user chose to reload: the budget starts over.
      windows.reloadRenderer();
      expect(window.loads).toHaveLength(2 + RENDERER_CRASH_LIMIT);
      window.webContents.emit('render-process-gone', {}, { reason: 'oom', exitCode: -1 });
      expect(window.loads).toHaveLength(3 + RENDERER_CRASH_LIMIT);
    });

    it('forgets crashes older than the window', () => {
      const onRendererCrashLoop = vi.fn();
      let clock = 0;
      const { windows, fake } = service({ onRendererCrashLoop, now: () => clock });
      windows.createWindow();
      for (let crash = 0; crash < 10; crash += 1) {
        clock += 61_000;
        fake.instances[0].webContents.emit('render-process-gone', {}, { reason: 'crashed', exitCode: 1 });
      }
      expect(onRendererCrashLoop).not.toHaveBeenCalled();
    });
  });

  describe('close confirmation (L10)', () => {
    it('closes at once when there is nothing to lose', () => {
      const confirmClose = vi.fn(async () => true);
      const { windows, fake } = service({ canCloseImmediately: () => true, confirmClose });
      windows.createWindow();

      expect(fake.instances[0].close()).toBe(false);
      expect(confirmClose).not.toHaveBeenCalled();
      expect(windows.getWindow()).toBeNull();
    });

    it('keeps the window open when the user cancels', async () => {
      const confirmClose = vi.fn(async () => false);
      const { windows, fake } = service({ canCloseImmediately: () => false, confirmClose });
      windows.createWindow();

      expect(fake.instances[0].close()).toBe(true);
      await vi.waitFor(() => expect(confirmClose).toHaveBeenCalledOnce());
      await Promise.resolve();
      expect(fake.instances[0].isDestroyed()).toBe(false);
      expect(windows.getWindow()).toBe(fake.instances[0]);
    });

    it('closes after the user confirms, asking only once', async () => {
      let answer!: (value: boolean) => void;
      const confirmClose = vi.fn(() => new Promise<boolean>((resolve) => (answer = resolve)));
      const { windows, fake } = service({ canCloseImmediately: () => false, confirmClose });
      windows.createWindow();
      const window = fake.instances[0];

      window.close();
      window.close(); // a second Alt+F4 while the dialog is up
      expect(confirmClose).toHaveBeenCalledOnce();

      answer(true);
      await vi.waitFor(() => expect(window.isDestroyed()).toBe(true));
      expect(windows.getWindow()).toBeNull();
    });

    it('closes anyway when the confirmation itself fails', async () => {
      const confirmClose = vi.fn(async () => {
        throw new Error('dialog failed');
      });
      const { windows, fake } = service({ canCloseImmediately: () => false, confirmClose });
      windows.createWindow();

      fake.instances[0].close();
      await vi.waitFor(() => expect(fake.instances[0].isDestroyed()).toBe(true));
    });
  });

  describe('second instance (L4)', () => {
    it('restores, shows and focuses the existing window', () => {
      const { windows, fake } = service();
      windows.createWindow();
      const window = fake.instances[0];
      window.minimized = true;
      window.visible = false;

      expect(windows.focusWindow()).toBe(true);
      expect(window.restore).toHaveBeenCalled();
      expect(window.show).toHaveBeenCalled();
      expect(window.focus).toHaveBeenCalled();
    });

    it('reports when there is no window to focus', () => {
      const { windows } = service();
      expect(windows.focusWindow()).toBe(false);
    });
  });
});
