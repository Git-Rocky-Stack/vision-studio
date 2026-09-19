// Must load before any module registers ipcMain handlers.
import './ipc-guard';
import { app, BrowserWindow, ipcMain, dialog, shell, Notification, session, safeStorage } from 'electron';
// electron-updater is CJS; default-import interop is required under the ESM
// main bundle (named imports break at runtime).
import electronUpdater from 'electron-updater';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

import { createMainProcessServices } from './services/mainProcess';
import { registerDownloadTokenIpc } from './services/downloadTokens';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const services = createMainProcessServices({
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
});

services.registerIpc();
// Foundry download tokens: encrypted, kept across launches (downloadTokens.ts).
registerDownloadTokenIpc(ipcMain, services.downloadTokens);

app.whenReady().then(() => services.start());

app.on('window-all-closed', () => {
  services.stopBackend();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  services.createWindowIfNeeded();
});

app.on('before-quit', () => {
  services.stopBackend();
});
