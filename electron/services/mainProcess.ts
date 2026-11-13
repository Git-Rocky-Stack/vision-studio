import fs from 'fs';
import Store from 'electron-store';
import type {
  App,
  BrowserWindow,
  BrowserWindowConstructorOptions,
  Dialog,
  IpcMain,
  Menu as MenuType,
  MessageBoxOptions,
  SafeStorage,
  Session,
  Shell,
} from 'electron';

type NotificationConstructor = typeof import('electron').Notification;

import { createSecureStore } from './secureStore';
import { createOutputRootService, DEFAULT_SETTINGS, type StoreSchema } from './outputRoots';
import { createBackendProcessService, isSkipBackendEnabled } from './backendProcess';
import { createMainWindowService, installSessionPermissionPolicy } from './mainWindow';
import { registerMainIpcHandlers } from './mainIpc';
import { registerContentSecurityPolicy } from './contentSecurityPolicy';
import {
  configureGenerationHandlerServices,
  kickBackendWebSocket,
  setupGenerationHandlers,
} from '../ipc-handlers/generation';
import { createUserAccountsService, DEFAULT_USER_ACCOUNTS_STATE } from './userAccounts';
import { createDownloadTokensService } from './downloadTokens';
import { createOpenRouterService } from './openRouter';
import { createHuggingFaceInferenceService } from './huggingfaceInference';
import { createUpdaterService, type AutoUpdaterLike } from './updater';
import { installApplicationMenu } from './applicationMenu';

type BrowserWindowConstructor = new (options: BrowserWindowConstructorOptions) => BrowserWindow;

/** Upper bound on how long quitting waits for the backend to exit. */
export const QUIT_BACKEND_STOP_TIMEOUT_MS = 10_000;

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
  /** Packaged builds replace the default menu (see applicationMenu.ts). */
  Menu?: Pick<typeof MenuType, 'buildFromTemplate' | 'setApplicationMenu'>;
  logger?: Console;
};

/**
 * Logs what would otherwise vanish (a rejected promise nobody awaited) or be
 * reported only through a modal (an uncaught exception) in the main process.
 */
export function installProcessErrorHandlers(
  target: Pick<NodeJS.Process, 'on'>,
  logger: Pick<Console, 'error'> = console,
): void {
  target.on('unhandledRejection', (reason) => {
    logger.error('[main] Unhandled promise rejection:', reason);
  });
  target.on('uncaughtException', (error, origin) => {
    logger.error(`[main] Uncaught exception (${origin}):`, error);
  });
}

type QuitEvent = { preventDefault: () => void };

/**
 * Drives the app's 'before-quit': the first quit is held back while
 * `prepare` runs (confirm running jobs, stop the backend and wait for it to
 * exit), then re-issued. Repeated quits while preparing are absorbed; a
 * declined `prepare` leaves the app running and allows a later quit.
 */
export function createQuitCoordinator({
  prepare,
  quit,
  logger = console,
}: {
  prepare: () => Promise<boolean>;
  quit: () => void;
  logger?: Pick<Console, 'error'>;
}) {
  let phase: 'idle' | 'preparing' | 'ready' = 'idle';

  return function onBeforeQuit(event: QuitEvent): void {
    if (phase === 'ready') {
      return;
    }
    event.preventDefault();
    if (phase === 'preparing') {
      return;
    }
    phase = 'preparing';
    void prepare()
      .catch((error: unknown) => {
        // Never trap the user in an app that cannot quit.
        logger.error('[main] Quit preparation failed; quitting anyway:', error);
        return true;
      })
      .then((proceed) => {
        if (!proceed) {
          phase = 'idle';
          return;
        }
        phase = 'ready';
        quit();
      });
  };
}

/** Resolves when `promise` settles or after `timeoutMs`, whichever is first. */
function settleWithin(promise: Promise<unknown>, timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, timeoutMs);
    void promise.catch(() => undefined).then(() => {
      clearTimeout(timer);
      resolve();
    });
  });
}

export async function createMainProcessServices({
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
  Menu,
  logger = console,
}: MainProcessDependencies) {
  // safeStorage reports encryption as unavailable before 'ready' on Windows
  // and Linux, which used to leave the store plaintext for good. Refuse to
  // build the store - or anything that reads it - any earlier.
  if (!app.isReady()) {
    throw new Error('createMainProcessServices must run after the app is ready (secure store encryption).');
  }

  // Async since Electron 45: the store key is unwrapped with
  // safeStorage.decryptStringAsync (the sync API is removed in Electron 46).
  const store = await createSecureStore<StoreSchema>({
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
        downloadTokens: {},
      },
    },
  });

  // The Foundry's download tokens, restored in start().
  const downloadTokens = createDownloadTokensService({ store, safeStorage, logger });

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

  /**
   * Set once the user agreed to discard running jobs, so the window close and
   * the quit that follows do not ask twice. Reset with each new window.
   */
  let jobDiscardConfirmed = false;

  // getMainWindow is only called after the window service below exists.
  const backend = createBackendProcessService({
    appPaths: {
      getPath: (name) => app.getPath(name),
      resourcesPath,
      getVersion: () => app.getVersion(),
    },
    dialog,
    getMainWindow: () => mainWindow.getWindow(),
    getResolvedOutputDirectory: outputRoots.getResolvedOutputDirectory,
    rememberOutputRoot: outputRoots.rememberOutputRoot,
    getManagedOutputRoots: outputRoots.getManagedOutputRoots,
    isDev: () => Boolean(devServerUrl),
    dirname,
    logger,
    onReady: kickBackendWebSocket,
  });

  async function showMessageBox(options: MessageBoxOptions) {
    const window = mainWindow.getWindow();
    return window && !window.isDestroyed()
      ? dialog.showMessageBox(window, options)
      : dialog.showMessageBox(options);
  }

  /**
   * Closing the window or quitting stops the backend, which cancels every
   * running generation. Ask first when there are any. A failed job query
   * counts as none: a broken backend must never block closing.
   */
  async function confirmDiscardActiveJobs(): Promise<boolean> {
    if (jobDiscardConfirmed) {
      return true;
    }
    const active = await backend.countActiveJobs();
    if (active === 0) {
      return true;
    }
    const { response } = await showMessageBox({
      type: 'warning',
      title: 'Generation in Progress',
      message: active === 1
        ? '1 generation is still running.'
        : `${active} generations are still running.`,
      detail: 'Closing Vision Studio stops the AI backend and cancels them.',
      buttons: ['Keep Working', 'Close Anyway'],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
    });
    jobDiscardConfirmed = response === 1;
    return jobDiscardConfirmed;
  }

  // #34 installer PR3: the old native 'Welcome to Vision Studio' messageBox
  // (firstRun service) is replaced by the in-app, Carbon Pro-styled first-run
  // provisioning overlay - native dialogs cannot be themed to the app.
  const mainWindow = createMainWindowService({
    BrowserWindow,
    dirname,
    devServerUrl,
    blockReloadShortcuts: app.isPackaged,
    // Nothing to lose unless our verified backend may be running jobs.
    canCloseImmediately: () => jobDiscardConfirmed || !backend.isReady(),
    confirmClose: confirmDiscardActiveJobs,
    onRendererCrashLoop: (details) => {
      void showMessageBox({
        type: 'error',
        title: 'Vision Studio',
        message: 'The Vision Studio window keeps crashing',
        detail: `The renderer stopped (${details.reason}, exit code ${details.exitCode}) several times in a row.`,
        buttons: ['Reload', 'Quit'],
        defaultId: 0,
        cancelId: 1,
        noLink: true,
      })
        .then(({ response }) => {
          if (response === 0) {
            mainWindow.reloadRenderer();
          } else {
            app.quit();
          }
        })
        .catch((error: unknown) => {
          logger.error('Could not show the renderer crash notice:', error);
        });
    },
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
    // The installer starts before the app quits and stops every process.
    confirmInstall: confirmDiscardActiveJobs,
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

  function shouldAutostartBackend() {
    return outputRoots.getAppSettings().backendAutostart && !isSkipBackendEnabled();
  }

  function openWindow() {
    jobDiscardConfirmed = false;
    const window = mainWindow.createWindow();
    setupGenerationHandlers(window);
    return window;
  }

  async function start() {
    // Before the window or backend exist, so no download can go out without them.
    await downloadTokens.restore();
    registerContentSecurityPolicy(session.defaultSession);
    installSessionPermissionPolicy(session.defaultSession, { devServerUrl, logger });
    if (Menu) {
      installApplicationMenu({
        Menu,
        isPackaged: app.isPackaged,
        platform: process.platform,
        appName: app.getName(),
      });
    }
    outputRoots.rememberOutputRoot(outputRoots.getInternalOutputDirectory());
    outputRoots.rememberOutputRoot(outputRoots.getResolvedOutputDirectory());

    openWindow();

    if (shouldAutostartBackend()) {
      const started = await backend.start();

      if (!started) {
        const failure = backend.getLastFailure();
        const bundledPath = backend.getBundledBackendPath();
        const specific = failure && failure.kind !== 'startup-timeout' && failure.kind !== 'not-found';
        const detail = specific
          ? failure.message
          : bundledPath
            ? `The backend was found at:\n${bundledPath}\n\nbut failed to start within the timeout. On first launch, the backend may need several minutes to extract. Try restarting the app.\n\nYou can also try starting it manually from Settings.`
            : 'No backend executable was found. Please reinstall the application.\n\nRunning from source? Install the backend with `node scripts/setup-dev-backend.cjs`, then start it from Settings > AI & Models > Start Backend.';

        void showMessageBox({
          type: 'warning',
          title: 'Backend Not Started',
          message: 'Could not start the AI backend',
          detail,
          buttons: ['OK'],
        }).catch((error: unknown) => {
          logger.error('Could not show the backend start notice:', error);
        });
      }
    }

    // After the backend autostart settles - the updater's own initial delay
    // additionally keeps the first check clear of launch I/O.
    updater.start();
  }

  /**
   * macOS 'activate': the dock icon brings back a window - and the backend,
   * which 'window-all-closed' stopped to free the GPU and port 8000.
   */
  function activate() {
    if (mainWindow.getWindow() === null) {
      openWindow();
    }
    if (shouldAutostartBackend() && !backend.isRunning()) {
      void backend.start().then((started) => {
        if (!started) {
          logger.error(`[backend] Restart on activate failed: ${backend.getLastFailure()?.message ?? 'unknown reason'}`);
        }
      });
    }
  }

  /** 'second-instance': surface the window this instance already has. */
  function focusMainWindow() {
    if (!mainWindow.focusWindow()) {
      activate();
    }
  }

  /** User-initiated stop (macOS last window closed): no automatic restart. */
  function stopBackend(): Promise<void> {
    return backend.stop();
  }

  /**
   * The app is about to quit: confirm running jobs, then stop the backend and
   * wait - bounded - for it to exit, so no Python process outlives the app
   * holding the GPU and port 8000. Resolves false when the user keeps working.
   */
  async function prepareToQuit(): Promise<boolean> {
    if (!(await confirmDiscardActiveJobs())) {
      return false;
    }
    jobDiscardConfirmed = true;
    updater.dispose();
    await settleWithin(backend.stop(), QUIT_BACKEND_STOP_TIMEOUT_MS);
    return true;
  }

  return {
    registerIpc,
    start,
    activate,
    focusMainWindow,
    stopBackend,
    prepareToQuit,
    disposeUpdater: () => updater.dispose(),
    downloadTokens,
  };
}

export type MainProcessServices = Awaited<ReturnType<typeof createMainProcessServices>>;
