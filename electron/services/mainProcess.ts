import fs from 'fs';
import Store from 'electron-store';
import type {
  App,
  BrowserWindow,
  BrowserWindowConstructorOptions,
  Dialog,
  IpcMain,
  NotificationConstructor,
  SafeStorage,
  Session,
  Shell,
} from 'electron';

import { createSecureStore } from './secureStore';
import { createOutputRootService, DEFAULT_SETTINGS, type StoreSchema } from './outputRoots';
import { createBackendProcessService } from './backendProcess';
import { createFirstRunService } from './firstRun';
import { createMainWindowService } from './mainWindow';
import { registerMainIpcHandlers } from './mainIpc';
import { registerContentSecurityPolicy } from './contentSecurityPolicy';
import { setupGenerationHandlers } from '../ipc-handlers/generation';

type BrowserWindowConstructor = new (options: BrowserWindowConstructorOptions) => BrowserWindow;

type MainProcessDependencies = {
  app: App;
  BrowserWindow: BrowserWindowConstructor;
  ipcMain: IpcMain;
  dialog: Dialog;
  shell: Shell;
  Notification: NotificationConstructor;
  session: { defaultSession: Session };
  safeStorage: SafeStorage;
  dirname: string;
  devServerUrl?: string;
  resourcesPath: string;
  logger?: Console;
};

export function createMainProcessServices({
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  shell,
  Notification,
  session,
  safeStorage,
  dirname,
  devServerUrl,
  resourcesPath,
  logger = console,
}: MainProcessDependencies) {
  const store = createSecureStore<StoreSchema>({
    Store,
    safeStorage,
    userDataPath: app.getPath('userData'),
    logger,
    options: {
      defaults: {
        recentProjects: [],
        settings: DEFAULT_SETTINGS,
        firstRun: true,
        modelsDownloaded: [],
        managedOutputRoots: [],
      },
    },
  });

  const outputRoots = createOutputRootService({
    userDataPath: app.getPath('userData'),
    store,
    exists: (candidatePath) => fs.existsSync(candidatePath),
  });

  const firstRun = createFirstRunService({
    store,
    dialog,
    getMainWindow: () => mainWindow.getWindow(),
    logger,
  });

  const mainWindow = createMainWindowService({
    BrowserWindow,
    dirname,
    devServerUrl,
    onReadyToShow: () => firstRun.checkFirstRun(),
  });

  const backend = createBackendProcessService({
    appPaths: {
      getPath: (name) => app.getPath(name),
      resourcesPath,
    },
    dialog,
    getMainWindow: () => mainWindow.getWindow(),
    getSettings: () => outputRoots.getAppSettings(),
    getResolvedOutputDirectory: outputRoots.getResolvedOutputDirectory,
    rememberOutputRoot: outputRoots.rememberOutputRoot,
    isDev: () => Boolean(devServerUrl),
    dirname,
    logger,
  });

  function registerIpc() {
    registerMainIpcHandlers({
      app,
      ipcMain,
      dialog,
      shell,
      Notification,
      store,
      outputRoots,
      backend,
      getMainWindow: () => mainWindow.getWindow(),
      logger,
    });
  }

  async function start() {
    registerContentSecurityPolicy(session.defaultSession);
    outputRoots.rememberOutputRoot(outputRoots.getInternalOutputDirectory());
    outputRoots.rememberOutputRoot(outputRoots.getResolvedOutputDirectory());

    const window = mainWindow.createWindow();
    setupGenerationHandlers(window);

    if (outputRoots.getAppSettings().backendAutostart && !process.env.VISION_STUDIO_SKIP_BACKEND) {
      const started = await backend.start();

      if (!started) {
        const bundledPath = backend.getBundledBackendPath();
        const detail = bundledPath
          ? `The backend was found at:\n${bundledPath}\n\nbut failed to start within the timeout. On first launch, the backend may need several minutes to extract. Try restarting the app.\n\nYou can also try starting it manually from Settings.`
          : 'No backend executable was found. Please reinstall the application or configure a Python path in Settings.';

        void dialog.showMessageBox(mainWindow.getWindow()!, {
          type: 'warning',
          title: 'Backend Not Started',
          message: 'Could not start the AI backend',
          detail,
          buttons: ['OK'],
        });
      }
    }
  }

  function createWindowIfNeeded() {
    if (mainWindow.getWindow() === null) {
      const window = mainWindow.createWindow();
      setupGenerationHandlers(window);
    }
  }

  return {
    registerIpc,
    start,
    createWindowIfNeeded,
    stopBackend: backend.stop,
  };
}
