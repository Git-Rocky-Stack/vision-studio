import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createUpdaterService,
  UPDATE_INITIAL_DELAY_MS,
  UPDATE_RECHECK_INTERVAL_MS,
  type AutoUpdaterLike,
  type UpdaterStatus,
} from './updater';

type Listener = (...args: unknown[]) => void;

function createFakeAutoUpdater() {
  const listeners = new Map<string, Listener[]>();
  const fake = {
    autoDownload: false,
    autoInstallOnAppQuit: false,
    setFeedURL: vi.fn(),
    checkForUpdates: vi.fn().mockResolvedValue(undefined),
    quitAndInstall: vi.fn(),
    on: vi.fn((event: string, listener: Listener) => {
      listeners.set(event, [...(listeners.get(event) ?? []), listener]);
      return fake;
    }),
  };
  const emit = (event: string, ...args: unknown[]) => {
    for (const listener of listeners.get(event) ?? []) listener(...args);
  };
  return { fake: fake as unknown as AutoUpdaterLike & typeof fake, emit };
}

function createHarness(overrides: {
  isPackaged?: boolean;
  env?: NodeJS.ProcessEnv;
  window?: { webContents: { send: (channel: string, payload: unknown) => void } } | null;
} = {}) {
  const { fake, emit } = createFakeAutoUpdater();
  const send = vi.fn();
  const window = overrides.window !== undefined ? overrides.window : { webContents: { send } };
  const logger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const service = createUpdaterService({
    autoUpdater: fake,
    isPackaged: overrides.isPackaged ?? true,
    env: overrides.env ?? {},
    getMainWindow: () => window,
    logger,
  });
  return { service, fake, emit, send, logger };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('updater service', () => {
  describe('enablement', () => {
    it('is disabled in unpackaged (dev) builds and never touches the autoUpdater', async () => {
      const { service, fake } = createHarness({ isPackaged: false });
      service.start();
      vi.advanceTimersByTime(UPDATE_INITIAL_DELAY_MS + UPDATE_RECHECK_INTERVAL_MS);

      expect(service.getStatus().state).toBe('disabled');
      expect(fake.checkForUpdates).not.toHaveBeenCalled();
      expect(fake.setFeedURL).not.toHaveBeenCalled();

      const status = await service.check();
      expect(status.state).toBe('disabled');
      expect(fake.checkForUpdates).not.toHaveBeenCalled();
    });

    it('is disabled by VISION_STUDIO_DISABLE_UPDATES=1 even when packaged', () => {
      const { service, fake } = createHarness({
        env: { VISION_STUDIO_DISABLE_UPDATES: '1' },
      });
      service.start();
      vi.advanceTimersByTime(UPDATE_INITIAL_DELAY_MS);

      expect(service.getStatus().state).toBe('disabled');
      expect(fake.checkForUpdates).not.toHaveBeenCalled();
    });
  });

  describe('check policy timers', () => {
    it('checks after the initial delay and again every recheck interval', () => {
      const { service, fake } = createHarness();
      service.start();

      expect(fake.checkForUpdates).not.toHaveBeenCalled();
      vi.advanceTimersByTime(UPDATE_INITIAL_DELAY_MS);
      expect(fake.checkForUpdates).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(UPDATE_RECHECK_INTERVAL_MS);
      expect(fake.checkForUpdates).toHaveBeenCalledTimes(2);
      vi.advanceTimersByTime(UPDATE_RECHECK_INTERVAL_MS);
      expect(fake.checkForUpdates).toHaveBeenCalledTimes(3);
    });

    it('stops checking after dispose()', () => {
      const { service, fake } = createHarness();
      service.start();
      vi.advanceTimersByTime(UPDATE_INITIAL_DELAY_MS);
      expect(fake.checkForUpdates).toHaveBeenCalledTimes(1);

      service.dispose();
      vi.advanceTimersByTime(UPDATE_RECHECK_INTERVAL_MS * 3);
      expect(fake.checkForUpdates).toHaveBeenCalledTimes(1);
    });

    it('configures background download + install-on-quit on start', () => {
      const { service, fake } = createHarness();
      service.start();
      expect(fake.autoDownload).toBe(true);
      expect(fake.autoInstallOnAppQuit).toBe(true);
    });
  });

  describe('event -> status mapping (real event data only)', () => {
    it('maps update-available with its version and pushes to the renderer', () => {
      const { service, emit, send } = createHarness();
      service.start();

      emit('update-available', { version: '3.2.0' });

      expect(service.getStatus()).toMatchObject({ state: 'available', version: '3.2.0' });
      expect(send).toHaveBeenCalledWith(
        'updater:status',
        expect.objectContaining({ state: 'available', version: '3.2.0' }),
      );
    });

    it('maps download-progress with the exact reported numbers', () => {
      const { service, emit } = createHarness();
      service.start();

      emit('download-progress', {
        percent: 42.5,
        bytesPerSecond: 1048576,
        transferred: 10,
        total: 100,
      });

      expect(service.getStatus()).toMatchObject({
        state: 'downloading',
        percent: 42.5,
        bytesPerSecond: 1048576,
        transferred: 10,
        total: 100,
      });
    });

    it('maps checking, not-available, downloaded, and error states', () => {
      const { service, emit } = createHarness();
      service.start();

      emit('checking-for-update');
      expect(service.getStatus().state).toBe('checking');

      emit('update-not-available', { version: '3.1.1' });
      expect(service.getStatus().state).toBe('not-available');

      emit('update-downloaded', { version: '3.2.0' });
      expect(service.getStatus()).toMatchObject({ state: 'downloaded', version: '3.2.0' });

      emit('error', new Error('sig mismatch'));
      expect(service.getStatus()).toMatchObject({ state: 'error', message: 'sig mismatch' });
    });

    it('keeps updating status when no window exists (no crash)', () => {
      const { service, emit } = createHarness({ window: null });
      service.start();

      expect(() => emit('update-available', { version: '3.2.0' })).not.toThrow();
      expect(service.getStatus().state).toBe('available');
    });
  });

  describe('install()', () => {
    it('quits and installs only from the downloaded state', () => {
      const { service, emit, fake, logger } = createHarness();
      service.start();

      service.install();
      expect(fake.quitAndInstall).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalled();

      emit('update-downloaded', { version: '3.2.0' });
      service.install();
      expect(fake.quitAndInstall).toHaveBeenCalledTimes(1);
    });
  });

  describe('feed configuration', () => {
    it('honors the VISION_STUDIO_UPDATE_URL override', () => {
      const { service, fake } = createHarness({
        env: { VISION_STUDIO_UPDATE_URL: 'https://staging.example/win/' },
      });
      service.start();
      expect(fake.setFeedURL).toHaveBeenCalledWith({
        provider: 'generic',
        url: 'https://staging.example/win/',
      });
    });

    it('leaves the packaged app-update.yml feed untouched without an override', () => {
      const { service, fake } = createHarness();
      service.start();
      expect(fake.setFeedURL).not.toHaveBeenCalled();
    });
  });

  describe('check()', () => {
    it('triggers a real check and surfaces failures as an error status, not a throw', async () => {
      const { service, fake } = createHarness();
      service.start();
      fake.checkForUpdates.mockRejectedValueOnce(new Error('feed unreachable'));

      const status: UpdaterStatus = await service.check();

      expect(fake.checkForUpdates).toHaveBeenCalledTimes(1);
      expect(status.state).toBe('error');
      expect(status.message).toBe('feed unreachable');
    });
  });
});
