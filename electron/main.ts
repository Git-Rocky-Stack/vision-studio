// Must load before any module registers ipcMain handlers.
import './ipc-guard';
import { app, BrowserWindow, ipcMain, dialog, shell, Menu, Notification, session, safeStorage } from 'electron';
// electron-updater is CJS; default-import interop is required under the ESM
// main bundle (named imports break at runtime).
import electronUpdater from 'electron-updater';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

import {
  createMainProcessServices,
  createQuitCoordinator,
  installProcessErrorHandlers,
  type MainProcessServices,
} from './services/mainProcess';
import { hardenWebContents } from './services/mainWindow';
import { registerDownloadTokenIpc } from './services/downloadTokens';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

installProcessErrorHandlers(process, console);

// One instance owns port 8000, the GPU and the store. A second launch hands
// focus to the first and exits before building anything.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  bootstrap();
}

function bootstrap() {
  let activeServices: MainProcessServices | null = null;

  // Every webContents - the main window, DevTools, anything a future feature
  // creates - gets the same guard: no <webview>, no popups, no navigation.
  app.on('web-contents-created', (_event, contents) => {
    hardenWebContents(contents);
  });

  app.on('second-instance', () => {
    activeServices?.focusMainWindow();
  });

  app.whenReady()
    .then(async () => {
      // Built after 'ready': safeStorage cannot encrypt the store any earlier
      // on Windows and Linux. Async: the store key is unwrapped with
      // safeStorage.decryptStringAsync.
      let services: MainProcessServices;
      try {
        services = await createMainProcessServices({
          app,
          BrowserWindow,
          ipcMain,
          dialog,
          shell,
          Notification,
          session,
          safeStorage,
          dirname: __dirname,
          devServerUrl: process.env.VITE_DEV_SERVER_URL,
          resourcesPath: process.resourcesPath,
          autoUpdater: electronUpdater.autoUpdater,
          Menu,
        });
      } catch (error) {
        console.error('[main] Vision Studio could not initialise:', error);
        dialog.showErrorBox(
          'Vision Studio could not start',
          `The app failed to initialise:\n${error instanceof Error ? error.message : String(error)}`,
        );
        app.exit(1);
        return;
      }

      activeServices = services;
      services.registerIpc();
      // Foundry download tokens: encrypted, kept across launches (downloadTokens.ts).
      registerDownloadTokenIpc(ipcMain, services.downloadTokens);

      await services.start();
    })
    .catch((error: unknown) => {
      console.error('[main] Startup failed:', error);
    });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      // before-quit stops the backend and waits for it to exit.
      app.quit();
      return;
    }
    // macOS keeps the app alive without windows: free the GPU and port 8000
    // until 'activate' brings the window - and the backend - back.
    void activeServices?.stopBackend();
  });

  app.on('activate', () => {
    activeServices?.activate();
  });

  const onBeforeQuit = createQuitCoordinator({
    prepare: () => activeServices?.prepareToQuit() ?? Promise.resolve(true),
    quit: () => app.quit(),
  });
  app.on('before-quit', onBeforeQuit);

  app.on('will-quit', () => {
    activeServices?.disposeUpdater();
  });
}
