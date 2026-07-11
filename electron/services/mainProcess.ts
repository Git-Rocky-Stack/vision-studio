import fs from 'fs';
import Store from 'electron-store';
import type {
  App,
  BrowserWindow,
  BrowserWindowConstructorOptions,
  Dialog,
  IpcMain,
  SafeStorage,
  Session,
  Shell,
} from 'electron';

type NotificationConstructor = typeof import('electron').Notification;

import { createSecureStore } from './secureStore';
import { createOutputRootService, DEFAULT_SETTINGS, type StoreSchema } from './outputRoots';
import { createBackendProcessService } from './backendProcess';
import { createMainWindowService } from './mainWindow';
import { registerMainIpcHandlers } from './mainIpc';
import { registerContentSecurityPolicy } from './contentSecurityPolicy';
import {
  configureGenerationHandlerServices,
  setupGenerationHandlers,
} from '../ipc-handlers/generation';
import { createUserAccountsService, DEFAULT_USER_ACCOUNTS_STATE } from './userAccounts';
import { createOpenRouterService } from './openRouter';
import { createHuggingFaceInferenceService } from './huggingfaceInference';
import { createUpdaterService, type AutoUpdaterLike } from './updater';

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
  autoUpdater: AutoUpdaterLike;
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
  autoUpdater,
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
        userAccounts: DEFAULT_USER_ACCOUNTS_STATE,
      },
    },
  });

  const outputRoots = createOutputRootService({
    userDataPath: app.getPath('userData'),
    store,
    exists: (candidatePath) => fs.existsSync(candidatePath),
  });

  const userAccounts = createUserAccountsService({
    store,
    safeStorage,
    logger,
  });

  const openRouter = createOpenRouterService();
  const huggingFace = createHuggingFaceInferenceService();

  // #34 installer PR3: the old native 'Welcome to Vision Studio' messageBox
  // (firstRun service) is replaced by the in-app, Carbon Pro-styled first-run
  // provisioning overlay - native dialogs cannot be themed to the app.
  const mainWindow = createMainWindowService({
    BrowserWindow,
    dirname,
    devServerUrl,
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

  configureGenerationHandlerServices({
    userAccounts,
    openRouter,
    huggingFace,
    outputRoots,
  });

  // #34 installer PR4: auto-update over the R2 generic feed. Disabled in dev
  // builds; every status it reports is a real electron-updater event.
  const updater = createUpdaterService({
    autoUpdater,
    isPackaged: app.isPackaged,
    env: process.env,
    getMainWindow: () => mainWindow.getWindow(),
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
      userAccounts,
      openRouter,
      updater,
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

    // After the backend autostart settles - the updater's own initial delay
    // additionally keeps the first check clear of launch I/O.
    updater.start();
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
