import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import Store from 'electron-store';
import { spawn, ChildProcess } from 'child_process';
import fs from 'fs';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Store for app data
interface StoreSchema {
  recentProjects: string[];
  settings: {
    theme: 'dark' | 'light';
    autoSave: boolean;
    defaultOutputPath: string;
    backendAutostart: boolean;
    pythonPath?: string;
  };
  firstRun: boolean;
  modelsDownloaded: string[];
}

const store = new Store<StoreSchema>({
  defaults: {
    recentProjects: [],
    settings: {
      theme: 'dark',
      autoSave: true,
      defaultOutputPath: '',
      backendAutostart: true,
    },
    firstRun: true,
    modelsDownloaded: [],
  },
});

let mainWindow: BrowserWindow | null = null;
let pythonBackend: ChildProcess | null = null;

/**
 * Get the path to the bundled Python backend executable
 */
function getBundledBackendPath(): string | null {
  const isDev = !!process.env.VITE_DEV_SERVER_URL;
  const isWindows = process.platform === 'win32';
  const exeName = isWindows ? 'VisionStudio-Backend.exe' : 'VisionStudio-Backend';
  
  if (isDev) {
    // Development: Look in backend/dist
    const devPath = join(__dirname, '../../backend/dist', exeName);
    if (fs.existsSync(devPath)) {
      return devPath;
    }
    return null;
  } else {
    // Production: Look in resources
    const prodPath = join(process.resourcesPath, exeName);
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
  const backendPath = join(__dirname, '../../backend');
  const pythonPath = store.get('settings').pythonPath || 'python';
  
  console.log('🐍 Using system Python:', pythonPath);
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
    
    pythonBackend = spawn(backendConfig.command, backendConfig.args, {
      cwd: backendConfig.cwd,
      env: {
        ...process.env,
        PYTHONUNBUFFERED: '1',
        // Set models directory to app data
        MODELS_DIR: join(app.getPath('userData'), 'models'),
        OUTPUT_DIR: join(app.getPath('userData'), 'outputs'),
      },
      detached: false,
    });
    
    let hasStarted = false;
    
    pythonBackend.stdout?.on('data', (data) => {
      const output = data.toString().trim();
      console.log(`[Python] ${output}`);
      
      // Check for successful startup
      if (output.includes('Uvicorn running') || output.includes('Application startup complete')) {
        if (!hasStarted) {
          hasStarted = true;
          console.log('✅ Backend started successfully');
          resolve(true);
        }
      }
    });
    
    pythonBackend.stderr?.on('data', (data) => {
      const output = data.toString().trim();
      console.error(`[Python Error] ${output}`);
      
      // Show error to user on first failure
      if (!hasStarted && output.includes('Error')) {
        // Don't fail immediately, wait to see if it recovers
      }
    });
    
    pythonBackend.on('error', (err) => {
      console.error('❌ Failed to start Python backend:', err);
      
      dialog.showErrorBox(
        'Backend Error',
        `Failed to start Python backend:\n${err.message}\n\nPlease ensure you have the required dependencies installed.`
      );
      
      if (!hasStarted) {
        hasStarted = true;
        resolve(false);
      }
    });
    
    pythonBackend.on('close', (code) => {
      console.log(`Python backend exited with code ${code}`);
      pythonBackend = null;
      
      // Notify renderer
      mainWindow?.webContents.send('backend:status', { running: false });
    });
    
    // Timeout after 30 seconds
    setTimeout(() => {
      if (!hasStarted) {
        console.error('❌ Backend startup timeout');
        resolve(false);
      }
    }, 30000);
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
      sandbox: false,
    },
    show: false,
  });

  // Load the app
  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(join(__dirname, '../dist/index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
    
    // Check first run after window is shown
    checkFirstRun();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// App lifecycle
app.whenReady().then(async () => {
  createWindow();
  
  // Start Python backend if autostart is enabled
  if (store.get('settings').backendAutostart) {
    const started = await startPythonBackend();
    
    if (!started) {
      dialog.showMessageBox(mainWindow!, {
        type: 'warning',
        title: 'Backend Not Started',
        message: 'Could not start the AI backend',
        detail: 'Some features may not work. You can try starting it manually from Settings.',
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
  shell.openExternal(url);
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

// Store handlers
ipcMain.handle('store:get', (_event, key: keyof StoreSchema) => {
  return store.get(key);
});

ipcMain.handle('store:set', (_event, key: keyof StoreSchema, value: any) => {
  store.set(key, value);
});

ipcMain.handle('store:reset', () => {
  store.clear();
});

// Backend control
ipcMain.handle('backend:start', async () => {
  if (!pythonBackend) {
    const started = await startPythonBackend();
    return { success: started };
  }
  return { success: false, error: 'Backend already running' };
});

ipcMain.handle('backend:stop', () => {
  stopPythonBackend();
  return { success: true };
});

ipcMain.handle('backend:status', () => {
  return {
    running: pythonBackend !== null && pythonBackend.exitCode === null,
    pid: pythonBackend?.pid,
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
