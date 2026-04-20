import { spawn } from 'child_process';
import type { BrowserWindow, Dialog } from 'electron';

type FirstRunStore = {
  get: (key: 'firstRun') => boolean;
  set: (key: 'firstRun', value: boolean) => void;
};

type FirstRunServiceOptions = {
  store: FirstRunStore;
  dialog: Pick<Dialog, 'showMessageBox'>;
  getMainWindow: () => BrowserWindow | null;
  checkGPU?: () => Promise<boolean>;
  logger?: Pick<Console, 'log'>;
};

export function checkGPU(): Promise<boolean> {
  return new Promise((resolve) => {
    const check = spawn('nvidia-smi', ['--query-gpu=name', '--format=csv,noheader']);
    let hasGPU = false;

    check.stdout?.on('data', (data) => {
      if (data.toString().trim()) {
        hasGPU = true;
        console.log('GPU detected:', data.toString().trim());
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

export function createFirstRunService({
  store,
  dialog,
  getMainWindow,
  checkGPU: checkGPUImpl = checkGPU,
  logger = console,
}: FirstRunServiceOptions) {
  async function checkFirstRun() {
    const isFirstRun = store.get('firstRun');
    if (!isFirstRun) {
      return;
    }

    logger.log('First run detected.');
    const mainWindow = getMainWindow();
    if (!mainWindow) {
      return;
    }

    const result = await dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Welcome to Vision Studio',
      message: 'Welcome to Vision Studio!',
      detail: `This is your first time running the app. AI models will be downloaded on first use.\n\nGPU detected: ${await checkGPUImpl() ? 'Yes' : 'No'}`,
      buttons: ['Get Started', 'Open Settings'],
      defaultId: 0,
    });

    if (result.response === 1) {
      mainWindow.webContents.send('navigate', 'settings');
    }

    store.set('firstRun', false);
  }

  return { checkFirstRun };
}
