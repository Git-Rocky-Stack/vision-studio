// Must load before any module registers ipcMain handlers.
import './ipc-guard';
import { app, BrowserWindow, ipcMain, dialog, shell, Notification, session, safeStorage } from 'electron';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import Store from 'electron-store';
import { spawn, ChildProcess } from 'child_process';
import fs from 'fs';
import path from 'path';
import {
  resolveOutputPath,
  shouldRestartBackend,
  type AppSettings,
} from './services/settings';
import { isPathInsideRoots, resolveAssetPathFromRoots } from './services/assets';
import {
  getBackendStatusSnapshot,
  waitForBackendReady,
} from './services/backend';
import { BACKEND_AUTH_TOKEN, backendAuthHeaders } from './services/backendAuth';
import {
  isAllowedStoreKey,
  isSafeExternalUrl,
  isSafePythonCommand,
  resolveSafeExportDestination,
} from './services/security';
import { createSecureStore } from './services/secureStore';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Store for app data
interface StoreSchema {
  recentProjects: string[];
  settings: AppSettings;
  firstRun: boolean;
  modelsDownloaded: string[];
  managedOutputRoots: string[];
}

const DEFAULT_SETTINGS: Required<Omit<AppSettings, 'pythonPath'>> = {
  theme: 'dark',
  autoSave: true,
  defaultOutputPath: '',
  backendAutostart: true,
  notifyOnGenerationComplete: true,
  notifyOnGenerationFailed: true,
  notifyOnModelDownloads: true,
};

const store = createSecureStore<StoreSchema>({
  Store,
  safeStorage,
  userDataPath: app.getPath('userData'),
  logger: console,
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

let mainWindow: BrowserWindow | null = null;
let pythonBackend: ChildProcess | null = null;
let backendReady = false;

const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob:",
  "connect-src 'self' http://localhost:* http://127.0.0.1:* ws://localhost:* ws://127.0.0.1:*",
  "media-src 'self' blob:",
].join('; ');

function getAppSettings() {
  return {
    ...DEFAULT_SETTINGS,
    ...store.get('settings'),
  };
}

function getResolvedOutputDirectory() {
  return resolveOutputPath(getAppSettings(), app.getPath('userData'));
}

function getInternalOutputDirectory() {
  return resolveOutputPath({ defaultOutputPath: '' }, app.getPath('userData'));
}

function getManagedOutputRoots() {
  return Array.from(
    new Set([
      getInternalOutputDirectory(),
      getResolvedOutputDirectory(),
      ...store.get('managedOutputRoots'),
    ])
  );
}

function rememberOutputRoot(outputRoot: string) {
  const normalizedRoot = outputRoot.replace(/\\/g, '/').replace(/\/$/, '');
  const nextRoots = Array.from(
    new Set([...store.get('managedOutputRoots'), normalizedRoot])
  );
  store.set('managedOutputRoots', nextRoots);
}

async function restartPythonBackend() {
  if (!pythonBackend) {
    return startPythonBackend();
  }

  const backendProcess = pythonBackend;
  const exitPromise = new Promise<void>((resolve) => {
    const timeout = setTimeout(resolve, 5000);
    backendProcess.once('close', () => {
      clearTimeout(timeout);
      resolve();
    });
  });

  stopPythonBackend();
  await exitPromise;
  return startPythonBackend();
}

function resolveManagedAssetPath(assetPath: string) {
  const resolvedPath = resolveAssetPathFromRoots(
    assetPath,
    getResolvedOutputDirectory(),
    getManagedOutputRoots(),
    (candidatePath) => fs.existsSync(candidatePath)
  );
  if (!isPathInsideRoots(resolvedPath, getManagedOutputRoots())) {
    throw new Error('Asset path is outside managed output directories');
  }

  return resolvedPath;
}

function getAllowedExportRoots() {
  return [
    app.getPath('home'),
    app.getPath('desktop'),
    app.getPath('documents'),
    app.getPath('downloads'),
    app.getPath('pictures'),
    app.getPath('videos'),
  ];
}

/**
 * Get the path to the bundled Python backend executable
 */
function getBundledBackendPath(): string | null {
  const isDev = !!process.env.VITE_DEV_SERVER_URL;
  const isWindows = process.platform === 'win32';
  const exeName = isWindows ? 'VisionStudio-Backend.exe' : 'VisionStudio-Backend';

  if (isDev) {
    // Development: Look in backend/dist first, then resources/
    // __dirname = dist-electron/, so ../ = project root
    const devPath = join(__dirname, '../backend/dist', exeName);
    if (fs.existsSync(devPath)) {
      return devPath;
    }
    const resourcesPath = join(__dirname, '../resources', exeName);
    if (fs.existsSync(resourcesPath)) {
      return resourcesPath;
    }
    return null;
  } else {
    // Production: Look in resources (extraResources copies here)
    const prodPath = join(process.resourcesPath, exeName);
    console.log(`🔍 Looking for backend at: ${prodPath} (exists: ${fs.existsSync(prodPath)})`);
    if (fs.existsSync(prodPath)) {
      return prodPath;
    }
    return null;
  }
}

/**
 * Check if we should use bundled backend or system Python
 */
function getBackendCommand(): { command: string; args: string[]; cwd: string } | null {
  // First, try bundled executable
  const bundledPath = getBundledBackendPath();
  if (bundledPath) {
    console.log('📦 Using bundled Python backend:', bundledPath);
    return {
      command: bundledPath,
      args: [],
      cwd: dirname(bundledPath)
    };
  }
  
  // Fallback: Try to use system Python with backend source
  const isDev = !!process.env.VITE_DEV_SERVER_URL;
  // __dirname = dist-electron/, so ../ = project root
  const backendPath = isDev
    ? join(__dirname, '../backend')
    : join(process.resourcesPath, 'backend-source');
  const rawPythonPath = store.get('settings').pythonPath || 'python';
  if (!isSafePythonCommand(rawPythonPath)) {
    console.error(`❌ Invalid pythonPath rejected: ${rawPythonPath}`);
    return null;
  }
  const pythonPath = rawPythonPath;

  const mainPy = join(backendPath, 'main.py');
  console.log(`🐍 Fallback to system Python: ${pythonPath}, main.py at: ${mainPy} (exists: ${fs.existsSync(mainPy)})`);

  if (!fs.existsSync(mainPy)) {
    console.error('❌ Neither bundled backend nor backend source found');
    return null;
  }

  return {
    command: pythonPath,
    args: ['main.py'],
    cwd: backendPath
  };
}

/**
 * Start the Python backend
 */
function startPythonBackend(): Promise<boolean> {
  return new Promise((resolve) => {
    const backendConfig = getBackendCommand();
    
    if (!backendConfig) {
      console.error('❌ No backend found!');
      dialog.showErrorBox(
        'Backend Not Found',
        'Could not find the Python backend. Please reinstall the application.'
      );
      resolve(false);
      return;
    }
    
    console.log('🚀 Starting Python backend...');
    console.log(`   Command: ${backendConfig.command}`);
    console.log(`   Args: ${backendConfig.args.join(' ')}`);
    console.log(`   CWD: ${backendConfig.cwd}`);

    const outputDirectory = getResolvedOutputDirectory();
    fs.mkdirSync(outputDirectory, { recursive: true });
    rememberOutputRoot(outputDirectory);
    
    pythonBackend = spawn(backendConfig.command, backendConfig.args, {
      cwd: backendConfig.cwd,
      env: {
        ...process.env,
        PYTHONUNBUFFERED: '1',
        // Set models directory to app data
        MODELS_DIR: join(app.getPath('userData'), 'models'),
        OUTPUT_DIR: outputDirectory,
        // Persist database in app data (not PyInstaller temp dir)
        DATABASE_PATH: join(app.getPath('userData'), 'data', 'vision_studio.db'),
        // Write backend logs to app data for diagnostics
        LOG_FILE: join(app.getPath('userData'), 'logs', 'backend.log'),
        // Per-launch token that prevents unrelated local processes from using the backend API.
        VISION_STUDIO_BACKEND_AUTH_TOKEN: BACKEND_AUTH_TOKEN,
      },
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
      mainWindow?.webContents.send('backend:status', getBackendStatusSnapshot(pythonBackend, backendReady));
      resolve(started);
    };

    // PyInstaller first-run extracts ~2.4GB to temp — allow up to 5 minutes
    void waitForBackendReady({
      timeoutMs: 300000,
      intervalMs: 1000,
    }).then((status) => {
      if (status.ready) {
        console.log(`✅ Backend health check passed via ${status.origin}`);
        finishStartup(true);
      }
    }).catch((error) => {
      console.error('❌ Backend health check failed:', error);
      finishStartup(false);
    });
    
    pythonBackend.stdout?.on('data', (data) => {
      const output = data.toString().trim();
      console.log(`[Python] ${output}`);
      
    });
    
    pythonBackend.stderr?.on('data', (data) => {
      const output = data.toString().trim();
      console.error(`[Python Error] ${output}`);
    });
    
    pythonBackend.on('error', (err) => {
      console.error('❌ Failed to start Python backend:', err);
      backendReady = false;
      
      dialog.showErrorBox(
        'Backend Error',
        `Failed to start Python backend:\n${err.message}\n\nPlease ensure you have the required dependencies installed.`
      );
      
      finishStartup(false);
    });
    
    pythonBackend.on('close', (code) => {
      console.log(`Python backend exited with code ${code}`);
      pythonBackend = null;
      backendReady = false;
      
      // Notify renderer
      mainWindow?.webContents.send('backend:status', getBackendStatusSnapshot(null, false));
      if (!hasStarted) {
        finishStartup(false);
      }
    });
    
  });
}

/**
 * Stop the Python backend
 */
function stopPythonBackend() {
  if (pythonBackend) {
    console.log('🛑 Stopping Python backend...');
    
    if (process.platform === 'win32') {
      // On Windows, we need to kill the process tree
      try {
        spawn('taskkill', ['/pid', pythonBackend.pid?.toString() || '', '/f', '/t']);
      } catch (e) {
        pythonBackend.kill('SIGTERM');
      }
    } else {
      pythonBackend.kill('SIGTERM');
    }
    
    pythonBackend = null;
    backendReady = false;
  }
}

/**
 * Check if first run and show setup wizard
 */
async function checkFirstRun() {
  const isFirstRun = store.get('firstRun');
  
  if (isFirstRun) {
    console.log('🎉 First run detected!');
    
    // Show welcome/setup dialog
    const result = await dialog.showMessageBox(mainWindow!, {
      type: 'info',
      title: 'Welcome to Vision Studio',
      message: 'Welcome to Vision Studio!',
      detail: 'This is your first time running the app. AI models will be downloaded on first use.\n\nGPU detected: ' + (await checkGPU() ? 'Yes' : 'No'),
      buttons: ['Get Started', 'Open Settings'],
      defaultId: 0,
    });
    
    if (result.response === 1) {
      // Open settings
      mainWindow?.webContents.send('navigate', 'settings');
    }
    
    store.set('firstRun', false);
  }
}

/**
 * Check if GPU is available
 */
async function checkGPU(): Promise<boolean> {
  return new Promise((resolve) => {
    const check = spawn('nvidia-smi', ['--query-gpu=name', '--format=csv,noheader']);
    
    let hasGPU = false;
    
    check.stdout?.on('data', (data) => {
      if (data.toString().trim()) {
        hasGPU = true;
        console.log('✅ GPU detected:', data.toString().trim());
      }
    });
    
    check.on('close', () => {
      resolve(hasGPU);
    });
    
    check.on('error', () => {
      resolve(false);
    });
  });
}

/**
 * Create the main window
 */
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1600,
    height: 1000,
    minWidth: 1200,
    minHeight: 800,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#0a0a0a',
      symbolColor: '#e5e5e5',
      height: 40,
    },
    backgroundColor: '#0a0a0a',
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
    show: true,
  });

  // Load the app
  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(join(__dirname, '../dist/index.html'));
  }

  // Navigation security: prevent the renderer from navigating away from the app
  mainWindow.webContents.on('will-navigate', (event) => {
    event.preventDefault();
  });
  mainWindow.webContents.setWindowOpenHandler(() => {
    return { action: 'deny' };
  });

  mainWindow.once('ready-to-show', () => {
    // Check first run after window is shown
    checkFirstRun();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function registerContentSecurityPolicy() {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [CONTENT_SECURITY_POLICY],
      },
    });
  });
}

// App lifecycle
app.whenReady().then(async () => {
  registerContentSecurityPolicy();
  rememberOutputRoot(getInternalOutputDirectory());
  rememberOutputRoot(getResolvedOutputDirectory());
  createWindow();
  
  // Start Python backend if autostart is enabled (skip in E2E test mode)
  if (store.get('settings').backendAutostart && !process.env.VISION_STUDIO_SKIP_BACKEND) {
    const started = await startPythonBackend();
    
    if (!started) {
      const bundledPath = getBundledBackendPath();
      const detail = bundledPath
        ? `The backend was found at:\n${bundledPath}\n\nbut failed to start within the timeout. On first launch, the backend may need several minutes to extract. Try restarting the app.\n\nYou can also try starting it manually from Settings.`
        : 'No backend executable was found. Please reinstall the application or configure a Python path in Settings.';

      dialog.showMessageBox(mainWindow!, {
        type: 'warning',
        title: 'Backend Not Started',
        message: 'Could not start the AI backend',
        detail,
        buttons: ['OK'],
      });
    }
  }
});

app.on('window-all-closed', () => {
  stopPythonBackend();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

app.on('before-quit', () => {
  stopPythonBackend();
});

// IPC Handlers
ipcMain.handle('app:get-version', () => app.getVersion());

ipcMain.handle('app:open-external', (_event, url: string) => {
  if (!isSafeExternalUrl(url)) {
    console.warn('Blocked open-external for unsafe URL:', url);
    return;
  }
  shell.openExternal(url);
});

ipcMain.handle('app:open-path', async (_event, filePath: string) => {
  const error = await shell.openPath(resolveManagedAssetPath(filePath));
  return error ? { success: false, error } : { success: true };
});

ipcMain.handle('dialog:select-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openDirectory'],
  });
  return result.filePaths[0] || null;
});

ipcMain.handle('dialog:save-file', async (_event, options: { defaultPath?: string; filters?: any[] }) => {
  const result = await dialog.showSaveDialog(mainWindow!, {
    defaultPath: options.defaultPath,
    filters: options.filters,
  });
  return result.filePath || null;
});

ipcMain.handle('store:get', (_event, key: string) => {
  if (!isAllowedStoreKey(key)) {
    console.warn(`Blocked store:get for unknown key: ${key}`);
    return undefined;
  }
  return store.get(key as keyof StoreSchema);
});

ipcMain.handle('store:set', (_event, key: string, value: unknown) => {
  if (!isAllowedStoreKey(key)) {
    console.warn(`Blocked store:set for unknown key: ${key}`);
    return;
  }
  store.set(key as keyof StoreSchema, value);
});

ipcMain.handle('store:reset', () => {
  store.clear();
});

ipcMain.handle('settings:get', () => {
  return getAppSettings();
});

ipcMain.handle('settings:update', async (_event, patch: Partial<AppSettings>) => {
  const currentSettings = getAppSettings();
  const nextSettings = {
    ...currentSettings,
    ...patch,
  };

  store.set('settings', nextSettings);
  rememberOutputRoot(resolveOutputPath(nextSettings, app.getPath('userData')));

  if (
    pythonBackend &&
    shouldRestartBackend(currentSettings, nextSettings)
  ) {
    const restarted = await restartPythonBackend();
    if (!restarted && !(pythonBackend && pythonBackend.exitCode === null)) {
      throw new Error('Backend restart failed after settings update');
    }
  }

  return nextSettings;
});

ipcMain.handle('settings:reset', async () => {
  const currentSettings = getAppSettings();
  store.set('settings', DEFAULT_SETTINGS);
  rememberOutputRoot(getInternalOutputDirectory());

  if (pythonBackend && shouldRestartBackend(currentSettings, DEFAULT_SETTINGS)) {
    const restarted = await restartPythonBackend();
    if (!restarted && !(pythonBackend && pythonBackend.exitCode === null)) {
      throw new Error('Backend restart failed after settings reset');
    }
  }

  return getAppSettings();
});

ipcMain.handle('assets:export', async (_event, sourcePath: string, destinationPath: string) => {
  try {
    const resolvedSource = resolveManagedAssetPath(sourcePath);
    const resolvedDest = resolveSafeExportDestination(destinationPath, getAllowedExportRoots());
    if (!resolvedDest) {
      return { success: false, error: 'Invalid destination path' };
    }
    await fs.promises.mkdir(path.dirname(resolvedDest), { recursive: true });
    await fs.promises.copyFile(resolvedSource, resolvedDest);
    return { success: true, destinationPath: resolvedDest };
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
    };
  }
});

ipcMain.handle('assets:export-many', async (_event, sourcePaths: string[], destinationDir: string) => {
  try {
    const resolvedDestDir = resolveSafeExportDestination(destinationDir, getAllowedExportRoots());
    if (!resolvedDestDir) {
      return { success: false, error: 'Invalid destination directory' };
    }
    await fs.promises.mkdir(resolvedDestDir, { recursive: true });
    const usedNames = new Set<string>();

    for (const sourcePath of sourcePaths) {
      const resolvedSource = resolveManagedAssetPath(sourcePath);
      const parsed = path.parse(resolvedSource);
      let candidateName = `${parsed.name}${parsed.ext}`;
      let counter = 1;

      while (usedNames.has(candidateName) || fs.existsSync(path.join(destinationDir, candidateName))) {
        candidateName = `${parsed.name}-${counter}${parsed.ext}`;
        counter += 1;
      }

      usedNames.add(candidateName);
      await fs.promises.copyFile(resolvedSource, path.join(resolvedDestDir, candidateName));
    }

    return { success: true, exportedCount: sourcePaths.length };
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
    };
  }
});

ipcMain.handle('assets:delete', async (_event, sourcePath: string) => {
  try {
    const resolvedSource = resolveManagedAssetPath(sourcePath);
    await fs.promises.rm(resolvedSource, { force: true });
    return { success: true };
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
    };
  }
});

ipcMain.handle('assets:reveal', async (_event, sourcePath: string) => {
  try {
    shell.showItemInFolder(resolveManagedAssetPath(sourcePath));
    return { success: true };
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
    };
  }
});

ipcMain.handle('assets:clear-cache', async () => {
  try {
    const outputDirectory = getInternalOutputDirectory();
    await fs.promises.rm(outputDirectory, { recursive: true, force: true });
    await fs.promises.mkdir(outputDirectory, { recursive: true });
    return { success: true };
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
    };
  }
});

ipcMain.handle(
  'notifications:notify',
  async (
    _event,
    type: 'generation_complete' | 'generation_failed' | 'model_download',
    payload: { title: string; body: string }
  ) => {
    const settings = getAppSettings();
    const enabled =
      (type === 'generation_complete' && settings.notifyOnGenerationComplete) ||
      (type === 'generation_failed' && settings.notifyOnGenerationFailed) ||
      (type === 'model_download' && settings.notifyOnModelDownloads);

    if (!enabled) {
      return { success: true, skipped: true };
    }

    if (Notification.isSupported()) {
      new Notification({
        title: payload.title,
        body: payload.body,
      }).show();
    }

    return { success: true };
  }
);

// System info
ipcMain.handle('system:get-info', async () => {
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
      // Backend process is running but not responding
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
});

// Backend control
ipcMain.handle('backend:start', async () => {
    if (!pythonBackend || pythonBackend.exitCode !== null) {
      pythonBackend = null;
      const started = await startPythonBackend();
      return { success: started };
    }

    const status = await waitForBackendReady({
      timeoutMs: 0,
      intervalMs: 0,
      requestTimeoutMs: 1000,
    });
    backendReady = status.ready;

    if (!status.ready) {
      const restarted = await restartPythonBackend();
      return { success: restarted, restarted: true };
    }

    return { success: false, error: 'Backend already running' };
  });

ipcMain.handle('backend:stop', () => {
  stopPythonBackend();
  return { success: true };
});

  ipcMain.handle('backend:status', async () => {
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
      bundled: getBundledBackendPath() !== null
    };
  });

// Check if bundled backend exists
ipcMain.handle('backend:check-bundled', () => {
  const bundledPath = getBundledBackendPath();
  return {
    exists: bundledPath !== null,
    path: bundledPath
  };
});

// Get app data path (for models, outputs)
ipcMain.handle('app:get-path', (_event, name: 'userData' | 'documents' | 'downloads' | 'pictures') => {
  return app.getPath(name);
});

// Import generation handlers
import './ipc-handlers/generation';
