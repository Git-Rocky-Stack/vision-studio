import { spawn, type ChildProcess } from 'child_process';
import fs from 'fs';
import { dirname, join } from 'path';
import type { BrowserWindow, Dialog, WebContents } from 'electron';

import {
  getBackendStatusSnapshot,
  waitForBackendReady,
} from './backend';
import { getBackendAuthToken, backendAuthHeaders } from './backendAuth';
import { isSafePythonCommand } from './security';
import type { AppSettings } from './settings';

type Logger = Pick<Console, 'error' | 'log'>;
type Platform = NodeJS.Platform;

type ResolveBundledBackendPathOptions = {
  dirname: string;
  resourcesPath: string;
  platform: Platform;
  isDev: boolean;
  exists: (candidatePath: string) => boolean;
  logger?: Logger;
};

type ResolveBackendCommandOptions = {
  bundledBackendPath: string | null;
  dirname: string;
  resourcesPath: string;
  isDev: boolean;
  pythonPath: string;
  exists: (candidatePath: string) => boolean;
  logger: Logger;
};

type BackendCommand = {
  command: string;
  args: string[];
  cwd: string;
};

type BackendEnvironmentOptions = {
  baseEnv: NodeJS.ProcessEnv;
  userDataPath: string;
  outputDirectory: string;
  backendAuthToken: string;
};

export function resolveBundledBackendPath({
  dirname: electronDirname,
  resourcesPath,
  platform,
  isDev,
  exists,
  logger = console,
}: ResolveBundledBackendPathOptions): string | null {
  const exeName = platform === 'win32' ? 'VisionStudio-Backend.exe' : 'VisionStudio-Backend';

  if (isDev) {
    const devPath = join(electronDirname, '../backend/dist', exeName);
    if (exists(devPath)) {
      return devPath;
    }

    const resourcesDevPath = join(electronDirname, '../resources', exeName);
    if (exists(resourcesDevPath)) {
      return resourcesDevPath;
    }

    return null;
  }

  const prodPath = join(resourcesPath, exeName);
  logger.log(`Looking for backend at: ${prodPath} (exists: ${exists(prodPath)})`);
  return exists(prodPath) ? prodPath : null;
}

export function resolveBackendCommand({
  bundledBackendPath,
  dirname: electronDirname,
  resourcesPath,
  isDev,
  pythonPath,
  exists,
  logger,
}: ResolveBackendCommandOptions): BackendCommand | null {
  if (bundledBackendPath) {
    logger.log('Using bundled Python backend:', bundledBackendPath);
    return {
      command: bundledBackendPath,
      args: [],
      cwd: dirname(bundledBackendPath),
    };
  }

  const backendPath = isDev
    ? join(electronDirname, '../backend')
    : join(resourcesPath, 'backend-source');

  if (!isSafePythonCommand(pythonPath)) {
    logger.error(`Invalid pythonPath rejected: ${pythonPath}`);
    return null;
  }

  const mainPy = join(backendPath, 'main.py');
  logger.log(`Fallback to system Python: ${pythonPath}, main.py at: ${mainPy} (exists: ${exists(mainPy)})`);

  if (!exists(mainPy)) {
    logger.error('Neither bundled backend nor backend source found');
    return null;
  }

  return {
    command: pythonPath,
    args: ['main.py'],
    cwd: backendPath,
  };
}

export function buildBackendEnvironment({
  baseEnv,
  userDataPath,
  outputDirectory,
  backendAuthToken,
}: BackendEnvironmentOptions): NodeJS.ProcessEnv {
  return {
    ...baseEnv,
    PYTHONUNBUFFERED: '1',
    MODELS_DIR: join(userDataPath, 'models'),
    OUTPUT_DIR: outputDirectory,
    DATABASE_PATH: join(userDataPath, 'data', 'vision_studio.db'),
    LOG_FILE: join(userDataPath, 'logs', 'backend.log'),
    VISION_STUDIO_BACKEND_AUTH_TOKEN: backendAuthToken,
  };
}

type BackendProcessServiceOptions = {
  appPaths: {
    getPath: (name: 'userData') => string;
    resourcesPath: string;
  };
  dialog: Pick<Dialog, 'showErrorBox' | 'showMessageBox'>;
  getMainWindow: () => BrowserWindow | null;
  getSettings: () => AppSettings;
  getResolvedOutputDirectory: () => string;
  rememberOutputRoot: (outputRoot: string) => void;
  isDev: () => boolean;
  dirname: string;
  logger?: Logger;
};

export function createBackendProcessService({
  appPaths,
  dialog,
  getMainWindow,
  getSettings,
  getResolvedOutputDirectory,
  rememberOutputRoot,
  isDev,
  dirname: electronDirname,
  logger = console,
}: BackendProcessServiceOptions) {
  let pythonBackend: ChildProcess | null = null;
  let backendReady = false;

  function sendStatus(webContents?: Pick<WebContents, 'send'>) {
    webContents?.send('backend:status', getBackendStatusSnapshot(pythonBackend, backendReady));
  }

  function getBundledBackendPath(): string | null {
    return resolveBundledBackendPath({
      dirname: electronDirname,
      resourcesPath: appPaths.resourcesPath,
      platform: process.platform,
      isDev: isDev(),
      exists: (candidatePath) => fs.existsSync(candidatePath),
      logger,
    });
  }

  function getBackendCommand(): BackendCommand | null {
    return resolveBackendCommand({
      bundledBackendPath: getBundledBackendPath(),
      dirname: electronDirname,
      resourcesPath: appPaths.resourcesPath,
      isDev: isDev(),
      pythonPath: getSettings().pythonPath || 'python',
      exists: (candidatePath) => fs.existsSync(candidatePath),
      logger,
    });
  }

  async function restart() {
    if (!pythonBackend) {
      return start();
    }

    const backendProcess = pythonBackend;
    const exitPromise = new Promise<void>((resolve) => {
      const timeout = setTimeout(resolve, 5000);
      backendProcess.once('close', () => {
        clearTimeout(timeout);
        resolve();
      });
    });

    stop();
    await exitPromise;
    return start();
  }

  async function restartIfRunning() {
    if (!pythonBackend || pythonBackend.exitCode !== null) {
      return true;
    }

    const restarted = await restart();
    return restarted || Boolean(pythonBackend && pythonBackend.exitCode === null);
  }

  function start(): Promise<boolean> {
    return new Promise((resolve) => {
      const backendConfig = getBackendCommand();

      if (!backendConfig) {
        logger.error('No backend found!');
        dialog.showErrorBox(
          'Backend Not Found',
          'Could not find the Python backend. Please reinstall the application.'
        );
        resolve(false);
        return;
      }

      logger.log('Starting Python backend...');
      logger.log(`   Command: ${backendConfig.command}`);
      logger.log(`   Args: ${backendConfig.args.join(' ')}`);
      logger.log(`   CWD: ${backendConfig.cwd}`);

      const outputDirectory = getResolvedOutputDirectory();
      fs.mkdirSync(outputDirectory, { recursive: true });
      rememberOutputRoot(outputDirectory);

      pythonBackend = spawn(backendConfig.command, backendConfig.args, {
        cwd: backendConfig.cwd,
        env: buildBackendEnvironment({
          baseEnv: process.env,
          userDataPath: appPaths.getPath('userData'),
          outputDirectory,
          backendAuthToken: getBackendAuthToken(),
        }),
        detached: false,
      });

      let hasStarted = false;
      backendReady = false;

      const finishStartup = (started: boolean) => {
        if (hasStarted) {
          return;
        }

        hasStarted = true;
        backendReady = started;
        sendStatus(getMainWindow()?.webContents);
        resolve(started);
      };

      void waitForBackendReady({
        timeoutMs: 300000,
        intervalMs: 1000,
      }).then((status) => {
        if (status.ready) {
          logger.log(`Backend health check passed via ${status.origin}`);
          finishStartup(true);
        }
      }).catch((error) => {
        logger.error('Backend health check failed:', error);
        finishStartup(false);
      });

      pythonBackend.stdout?.on('data', (data) => {
        const output = data.toString().trim();
        logger.log(`[Python] ${output}`);
      });

      pythonBackend.stderr?.on('data', (data) => {
        const output = data.toString().trim();
        logger.error(`[Python Error] ${output}`);
      });

      pythonBackend.on('error', (err) => {
        logger.error('Failed to start Python backend:', err);
        backendReady = false;

        dialog.showErrorBox(
          'Backend Error',
          `Failed to start Python backend:\n${err.message}\n\nPlease ensure you have the required dependencies installed.`
        );

        finishStartup(false);
      });

      pythonBackend.on('close', (code) => {
        logger.log(`Python backend exited with code ${code}`);
        pythonBackend = null;
        backendReady = false;
        sendStatus(getMainWindow()?.webContents);
        if (!hasStarted) {
          finishStartup(false);
        }
      });
    });
  }

  function stop() {
    if (!pythonBackend) {
      return;
    }

    logger.log('Stopping Python backend...');

    if (process.platform === 'win32') {
      try {
        spawn('taskkill', ['/pid', pythonBackend.pid?.toString() || '', '/f', '/t']);
      } catch {
        pythonBackend.kill('SIGTERM');
      }
    } else {
      pythonBackend.kill('SIGTERM');
    }

    pythonBackend = null;
    backendReady = false;
  }

  async function startOrRecover() {
    if (!pythonBackend || pythonBackend.exitCode !== null) {
      pythonBackend = null;
      const started = await start();
      return { success: started };
    }

    const status = await waitForBackendReady({
      timeoutMs: 0,
      intervalMs: 0,
      requestTimeoutMs: 1000,
    });
    backendReady = status.ready;

    if (!status.ready) {
      const restarted = await restart();
      return { success: restarted, restarted: true };
    }

    return { success: false, error: 'Backend already running' };
  }

  async function getStatus() {
    if (pythonBackend && pythonBackend.exitCode === null) {
      const status = await waitForBackendReady({
        timeoutMs: 0,
        intervalMs: 0,
        requestTimeoutMs: 1000,
      });
      backendReady = status.ready;
    } else {
      backendReady = false;
    }

    return {
      ...getBackendStatusSnapshot(pythonBackend, backendReady),
      bundled: getBundledBackendPath() !== null,
    };
  }

  async function getSystemInfo() {
    if (pythonBackend && pythonBackend.exitCode === null) {
      try {
        const response = await fetch('http://127.0.0.1:8000/api/system/info', {
          headers: backendAuthHeaders(),
          signal: AbortSignal.timeout(3000),
        });
        if (response.ok) {
          return { ...await response.json(), backendConnected: true };
        }
      } catch {
        // Backend process is running but not responding.
      }
    }

    return {
      backendConnected: false,
      gpu_available: false,
      gpu_name: undefined,
      gpu_vram: undefined,
      cuda_version: undefined,
      comfyui_connected: false,
      models_count: 0,
    };
  }

  return {
    start,
    stop,
    restart,
    restartIfRunning,
    startOrRecover,
    getStatus,
    getSystemInfo,
    getBundledBackendPath,
  };
}
