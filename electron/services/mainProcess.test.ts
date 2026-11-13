import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const backendFake = vi.hoisted(() => ({
  start: null as unknown as ReturnType<typeof vi.fn>,
  stop: null as unknown as ReturnType<typeof vi.fn>,
  isRunning: null as unknown as ReturnType<typeof vi.fn>,
  isReady: null as unknown as ReturnType<typeof vi.fn>,
  countActiveJobs: null as unknown as ReturnType<typeof vi.fn>,
  getLastFailure: null as unknown as ReturnType<typeof vi.fn>,
  getBundledBackendPath: null as unknown as ReturnType<typeof vi.fn>,
}));

vi.mock('electron-store', () => ({
  default: class FakeStore {
    private data: Record<string, unknown>;
    constructor(options: { defaults?: Record<string, unknown> }) {
      this.data = structuredClone(options.defaults ?? {});
    }
    get store() {
      return this.data;
    }
    set store(value: Record<string, unknown>) {
      this.data = value;
    }
    get(key: string) {
      return this.data[key];
    }
    set(key: string, value: unknown) {
      this.data[key] = value;
    }
    clear() {
      this.data = {};
    }
  },
}));

vi.mock('../ipc-handlers/generation', () => ({
  configureGenerationHandlerServices: () => undefined,
  kickBackendWebSocket: () => undefined,
  setupGenerationHandlers: () => undefined,
}));

vi.mock('./mainIpc', () => ({ registerMainIpcHandlers: () => undefined }));
vi.mock('./contentSecurityPolicy', () => ({ registerContentSecurityPolicy: () => undefined }));

vi.mock('./backendProcess', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./backendProcess')>()),
  createBackendProcessService: () => backendFake,
}));

const {
  QUIT_BACKEND_STOP_TIMEOUT_MS,
  createMainProcessServices,
  createQuitCoordinator,
  installProcessErrorHandlers,
} = await import('./mainProcess');

class FakeWindow extends EventEmitter {
  static instances: FakeWindow[] = [];
  webContents = Object.assign(new EventEmitter(), { setWindowOpenHandler: vi.fn(), openDevTools: vi.fn(), send: vi.fn() });
  destroyed = false;
  constructor() {
    super();
    FakeWindow.instances.push(this);
  }
  loadURL() {
    return Promise.resolve();
  }
  loadFile() {
    return Promise.resolve();
  }
  isDestroyed() {
    return this.destroyed;
  }
  close() {
    let prevented = false;
    this.emit('close', { preventDefault: () => (prevented = true) });
    if (!prevented) {
      this.destroyed = true;
      this.emit('closed');
    }
  }
}

let userData: string;

async function createServices({ ready = true }: { ready?: boolean } = {}) {
  const app = {
    isReady: () => ready,
    isPackaged: false,
    getPath: () => userData,
    getVersion: () => '0.0.0',
    getName: () => 'Vision Studio',
    quit: vi.fn(),
  };
  const dialog = {
    showMessageBox: vi.fn(async () => ({ response: 0, checkboxChecked: false })),
    showErrorBox: vi.fn(),
  };
  const session = {
    defaultSession: {
      setPermissionRequestHandler: vi.fn(),
      setPermissionCheckHandler: vi.fn(),
    },
  };
  const services = await createMainProcessServices({
    app: app as never,
    BrowserWindow: FakeWindow as never,
    ipcMain: {} as never,
    dialog: dialog as never,
    shell: {} as never,
    Notification: {} as never,
    session: session as never,
    safeStorage: {
      isAsyncEncryptionAvailable: async () => false,
      encryptStringAsync: async () => Buffer.alloc(0),
      decryptStringAsync: async () => ({ result: '', shouldReEncrypt: false }),
    } as never,
    dirname: path.join(userData, 'dist-electron'),
    resourcesPath: path.join(userData, 'resources'),
    autoUpdater: { autoDownload: false, autoInstallOnAppQuit: false, checkForUpdates: vi.fn(), downloadUpdate: vi.fn(async () => []), quitAndInstall: vi.fn(), on: vi.fn() },
    logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() } as unknown as Console,
  });
  return { services, app, dialog, session };
}

beforeEach(() => {
  userData = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-main-'));
  FakeWindow.instances = [];
  backendFake.start = vi.fn(async () => true);
  backendFake.stop = vi.fn(async () => undefined);
  backendFake.isRunning = vi.fn(() => false);
  backendFake.isReady = vi.fn(() => false);
  backendFake.countActiveJobs = vi.fn(async () => 0);
  backendFake.getLastFailure = vi.fn(() => null);
  backendFake.getBundledBackendPath = vi.fn(() => null);
  delete process.env.VISION_STUDIO_SKIP_BACKEND;
});

afterEach(() => {
  vi.useRealTimers();
  fs.rmSync(userData, { recursive: true, force: true });
});

describe('createMainProcessServices', () => {
  it('refuses to build the secure store before the app is ready (L8)', async () => {
    await expect(createServices({ ready: false })).rejects.toThrow(/after the app is ready/);
  });

  it('installs the deny-by-default permission policy on start (L7)', async () => {
    const { services, session } = await createServices();
    await services.start();
    expect(session.defaultSession.setPermissionRequestHandler).toHaveBeenCalledOnce();
    expect(session.defaultSession.setPermissionCheckHandler).toHaveBeenCalledOnce();
  });

  it('explains a port conflict instead of the generic timeout text (L3)', async () => {
    backendFake.start = vi.fn(async () => false);
    backendFake.getLastFailure = vi.fn(() => ({ kind: 'port-in-use', message: 'Port 8000 is in use by another application.' }));
    const { services, dialog } = await createServices();

    await services.start();

    expect(dialog.showMessageBox).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ detail: 'Port 8000 is in use by another application.' }),
    );
  });

  describe('quitting (L1, L10)', () => {
    it('stops the backend and waits for it when nothing is running', async () => {
      const { services, dialog } = await createServices();
      await services.start();

      await expect(services.prepareToQuit()).resolves.toBe(true);
      expect(backendFake.stop).toHaveBeenCalledOnce();
      expect(dialog.showMessageBox).not.toHaveBeenCalled();
    });

    it('asks before killing running generations and honours Keep Working', async () => {
      backendFake.countActiveJobs = vi.fn(async () => 2);
      const { services, dialog } = await createServices();
      await services.start();
      dialog.showMessageBox.mockResolvedValueOnce({ response: 0, checkboxChecked: false });

      await expect(services.prepareToQuit()).resolves.toBe(false);
      expect(dialog.showMessageBox).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ message: '2 generations are still running.', buttons: ['Keep Working', 'Close Anyway'] }),
      );
      expect(backendFake.stop).not.toHaveBeenCalled();
    });

    it('quits after Close Anyway', async () => {
      backendFake.countActiveJobs = vi.fn(async () => 1);
      const { services, dialog } = await createServices();
      await services.start();
      dialog.showMessageBox.mockResolvedValueOnce({ response: 1, checkboxChecked: false });

      await expect(services.prepareToQuit()).resolves.toBe(true);
      expect(backendFake.stop).toHaveBeenCalledOnce();
    });

    it('does not wait forever for a backend that will not stop', async () => {
      vi.useFakeTimers();
      backendFake.stop = vi.fn(() => new Promise<void>(() => undefined));
      const { services } = await createServices();
      await services.start();

      const quitting = services.prepareToQuit();
      await vi.advanceTimersByTimeAsync(QUIT_BACKEND_STOP_TIMEOUT_MS);
      await expect(quitting).resolves.toBe(true);
    });
  });

  describe('closing the window (L10)', () => {
    it('confirms before closing while the backend runs generations, and asks only once per window', async () => {
      backendFake.isReady = vi.fn(() => true);
      backendFake.countActiveJobs = vi.fn(async () => 1);
      const { services, dialog } = await createServices();
      await services.start();
      const window = FakeWindow.instances[0];

      dialog.showMessageBox.mockResolvedValueOnce({ response: 0, checkboxChecked: false });
      window.close();
      await vi.waitFor(() => expect(dialog.showMessageBox).toHaveBeenCalledOnce());
      expect(window.isDestroyed()).toBe(false);

      dialog.showMessageBox.mockResolvedValueOnce({ response: 1, checkboxChecked: false });
      window.close();
      await vi.waitFor(() => expect(window.isDestroyed()).toBe(true));

      // The quit that follows does not ask again.
      await expect(services.prepareToQuit()).resolves.toBe(true);
      expect(dialog.showMessageBox).toHaveBeenCalledTimes(2);
    });

    it('closes without asking when the backend is not running', async () => {
      const { services, dialog } = await createServices();
      await services.start();
      FakeWindow.instances[0].close();
      expect(FakeWindow.instances[0].isDestroyed()).toBe(true);
      expect(dialog.showMessageBox).not.toHaveBeenCalled();
      expect(backendFake.countActiveJobs).not.toHaveBeenCalled();
    });
  });

  describe('macOS activate (L5)', () => {
    it('recreates the window and restarts the backend the last window close stopped', async () => {
      const { services } = await createServices();
      await services.start();
      expect(backendFake.start).toHaveBeenCalledTimes(1);

      FakeWindow.instances[0].close();
      await services.stopBackend();
      services.activate();

      expect(FakeWindow.instances).toHaveLength(2);
      expect(backendFake.start).toHaveBeenCalledTimes(2);
    });

    it('does not start a second backend when one is running', async () => {
      backendFake.isRunning = vi.fn(() => true);
      const { services } = await createServices();
      await services.start();

      services.activate();
      expect(FakeWindow.instances).toHaveLength(1);
      expect(backendFake.start).toHaveBeenCalledTimes(1);
    });

    it('respects VISION_STUDIO_SKIP_BACKEND', async () => {
      process.env.VISION_STUDIO_SKIP_BACKEND = '1';
      const { services } = await createServices();
      await services.start();
      services.activate();
      expect(backendFake.start).not.toHaveBeenCalled();
    });
  });

  it('focuses the existing window for a second instance (L4)', async () => {
    const { services } = await createServices();
    await services.start();
    const window = FakeWindow.instances[0] as FakeWindow & Record<string, unknown>;
    Object.assign(window, {
      isMinimized: () => true,
      restore: vi.fn(),
      isVisible: () => true,
      show: vi.fn(),
      focus: vi.fn(),
    });

    services.focusMainWindow();

    expect(window.restore).toHaveBeenCalled();
    expect(window.focus).toHaveBeenCalled();
    expect(FakeWindow.instances).toHaveLength(1);
  });
});

describe('createQuitCoordinator (L1)', () => {
  it('holds the first quit, prepares once, then re-issues it', async () => {
    let finish!: (proceed: boolean) => void;
    const prepare = vi.fn(() => new Promise<boolean>((resolve) => (finish = resolve)));
    const quit = vi.fn();
    const onBeforeQuit = createQuitCoordinator({ prepare, quit });

    const first = { preventDefault: vi.fn() };
    onBeforeQuit(first);
    const repeat = { preventDefault: vi.fn() };
    onBeforeQuit(repeat);

    expect(first.preventDefault).toHaveBeenCalled();
    expect(repeat.preventDefault).toHaveBeenCalled();
    expect(prepare).toHaveBeenCalledOnce();

    finish(true);
    await vi.waitFor(() => expect(quit).toHaveBeenCalledOnce());

    // The re-issued quit passes straight through.
    const final = { preventDefault: vi.fn() };
    onBeforeQuit(final);
    expect(final.preventDefault).not.toHaveBeenCalled();
  });

  it('stays running when preparation is declined, and can quit later', async () => {
    const prepare = vi.fn(async () => false);
    const quit = vi.fn();
    const onBeforeQuit = createQuitCoordinator({ prepare, quit });

    onBeforeQuit({ preventDefault: vi.fn() });
    await vi.waitFor(() => expect(prepare).toHaveBeenCalledOnce());
    await Promise.resolve();
    expect(quit).not.toHaveBeenCalled();

    prepare.mockResolvedValueOnce(true);
    onBeforeQuit({ preventDefault: vi.fn() });
    await vi.waitFor(() => expect(quit).toHaveBeenCalledOnce());
  });

  it('quits anyway when preparation throws', async () => {
    const quit = vi.fn();
    const onBeforeQuit = createQuitCoordinator({
      prepare: async () => {
        throw new Error('boom');
      },
      quit,
      logger: { error: vi.fn() },
    });

    onBeforeQuit({ preventDefault: vi.fn() });
    await vi.waitFor(() => expect(quit).toHaveBeenCalledOnce());
  });
});

describe('installProcessErrorHandlers (L6)', () => {
  it('logs unhandled rejections and uncaught exceptions', () => {
    const target = new EventEmitter();
    const logger = { error: vi.fn() };
    installProcessErrorHandlers(target as never, logger);

    const reason = new Error('rejected');
    target.emit('unhandledRejection', reason);
    target.emit('uncaughtException', new Error('thrown'), 'uncaughtException');

    expect(logger.error).toHaveBeenCalledWith('[main] Unhandled promise rejection:', reason);
    expect(logger.error).toHaveBeenCalledWith('[main] Uncaught exception (uncaughtException):', expect.any(Error));
  });
});
