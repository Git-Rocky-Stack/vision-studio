// Must load before any module registers ipcMain handlers.
import './ipc-guard';
import { app, BrowserWindow, ipcMain, dialog, shell, Notification, session, safeStorage } from 'electron';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

import { createMainProcessServices } from './services/mainProcess';

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
});

services.registerIpc();

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
