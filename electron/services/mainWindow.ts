import { join } from 'path';
import type { BrowserWindow as BrowserWindowInstance, BrowserWindowConstructorOptions } from 'electron';

type BrowserWindowConstructor = new (options: BrowserWindowConstructorOptions) => BrowserWindowInstance;

type RendererLoadTarget =
  | { kind: 'url'; value: string }
  | { kind: 'file'; value: string };

type MainWindowServiceOptions = {
  BrowserWindow: BrowserWindowConstructor;
  dirname: string;
  devServerUrl?: string;
  onReadyToShow?: () => void | Promise<void>;
};

export function createBrowserWindowOptions(preloadPath: string): BrowserWindowConstructorOptions {
  return {
    width: 1600,
    height: 1000,
    minWidth: 1200,
    minHeight: 800,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      // Not the chassis colour: the strip sits over the right end of the
      // header, whose top edge is lit 4% above the void (Header.tsx).
      color: '#0a0a0a',
      symbolColor: '#e5e5e5',
      height: 56,
    },
    // Painted before the renderer's first frame: the void token, true black.
    backgroundColor: '#000000',
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
    show: true,
  };
}

export function resolveRendererLoadTarget({
  dirname: electronDirname,
  devServerUrl,
}: {
  dirname: string;
  devServerUrl?: string;
}): RendererLoadTarget {
  if (devServerUrl) {
    return { kind: 'url', value: devServerUrl };
  }

  return { kind: 'file', value: join(electronDirname, '../dist/index.html') };
}

export function createMainWindowService({
  BrowserWindow,
  dirname: electronDirname,
  devServerUrl,
  onReadyToShow,
}: MainWindowServiceOptions) {
  let mainWindow: BrowserWindowInstance | null = null;

  function createWindow() {
    mainWindow = new BrowserWindow(
      createBrowserWindowOptions(join(electronDirname, 'preload.cjs'))
    );

    const target = resolveRendererLoadTarget({
      dirname: electronDirname,
      devServerUrl,
    });

    if (target.kind === 'url') {
      void mainWindow.loadURL(target.value);
      mainWindow.webContents.openDevTools();
    } else {
      void mainWindow.loadFile(target.value);
    }

    mainWindow.webContents.on('will-navigate', (event) => {
      event.preventDefault();
    });
    mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

    mainWindow.once('ready-to-show', () => {
      void onReadyToShow?.();
    });

    mainWindow.on('closed', () => {
      mainWindow = null;
    });

    return mainWindow;
  }

  return {
    createWindow,
    getWindow: () => mainWindow,
  };
}
