// Must load before any module registers ipcMain handlers.
import './ipc-guard';
import { app, BrowserWindow, ipcMain, dialog, shell, Notification, session, safeStorage } from 'electron';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

import { createMainProcessServices } from './services/mainProcess';
import { setHfToken, setCivitaiToken } from './services/backendAuth';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

ipcMain.handle('auth:setHfToken', async (_event, token: string) => {
  // Hold the token in the main process for the session. It is injected per
  // download request as X-HF-Token and never returned to the renderer, never
  // logged. (safeStorage-backed persistence can be layered via secureStore.)
  setHfToken(typeof token === 'string' ? token : undefined);
  return { success: true };
});

ipcMain.handle('auth:setCivitaiToken', async (_event, token: string) => {
  // Hold the token in the main process for the session. It is injected per
  // search/download request as X-Civitai-Token and never returned to the
  // renderer, never logged.
  setCivitaiToken(typeof token === 'string' ? token : undefined);
  return { success: true };
});

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
