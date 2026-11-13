import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createUpdaterService,
  resolveUpdaterDisabledReason,
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
    downloadUpdate: vi.fn().mockResolvedValue([]),
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
  platform?: NodeJS.Platform;
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
    platform: overrides.platform ?? 'win32',
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

    // The mac builds are ad-hoc signed; Squirrel.Mac rejects them, so a check
    // could only ever end in an error status - every 4 hours.
    it('is disabled on macOS unless explicitly enabled', () => {
      const { service, fake, logger } = createHarness({ platform: 'darwin' });
      service.start();
      vi.advanceTimersByTime(UPDATE_INITIAL_DELAY_MS + UPDATE_RECHECK_INTERVAL_MS);

      expect(service.getStatus().state).toBe('disabled');
      expect(fake.checkForUpdates).not.toHaveBeenCalled();
      expect(logger.log).toHaveBeenCalledWith(expect.stringContaining('VISION_STUDIO_ENABLE_MAC_UPDATES'));
    });

    it('runs on macOS with VISION_STUDIO_ENABLE_MAC_UPDATES=1', () => {
      const { service, fake } = createHarness({
        platform: 'darwin',
        env: { VISION_STUDIO_ENABLE_MAC_UPDATES: '1' },
      });
      service.start();
      vi.advanceTimersByTime(UPDATE_INITIAL_DELAY_MS);

      expect(fake.checkForUpdates).toHaveBeenCalledTimes(1);
    });

    it('explains every disabled reason', () => {
      expect(resolveUpdaterDisabledReason({ isPackaged: false, env: {}, platform: 'win32' })).toBe('dev build');
      expect(
        resolveUpdaterDisabledReason({ isPackaged: true, env: { VISION_STUDIO_DISABLE_UPDATES: '1' }, platform: 'win32' }),
      ).toBe('VISION_STUDIO_DISABLE_UPDATES');
      expect(resolveUpdaterDisabledReason({ isPackaged: true, env: {}, platform: 'linux' })).toBeNull();
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

    it('registers its listeners and timers once even if started twice', () => {
      const { service, fake } = createHarness();
      service.start();
      service.start();
      vi.advanceTimersByTime(UPDATE_INITIAL_DELAY_MS);

      expect(fake.checkForUpdates).toHaveBeenCalledTimes(1);
      expect(fake.on.mock.calls.filter(([event]) => event === 'error')).toHaveLength(1);
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

    // Installers are multi-GB: a check must never start a download on its own.
    it('turns automatic downloads off, keeping install-on-quit for a downloaded update', () => {
      const { service, fake } = createHarness();
      fake.autoDownload = true;
      service.start();
      expect(fake.autoDownload).toBe(false);
      expect(fake.autoInstallOnAppQuit).toBe(true);
    });

    it('never downloads as a side effect of a check finding an update', async () => {
      const { service, fake, emit } = createHarness();
      service.start();
      fake.checkForUpdates.mockImplementationOnce(async () => {
        emit('checking-for-update');
        emit('update-available', { version: '3.2.0' });
      });

      await service.check();

      expect(service.getStatus()).toMatchObject({ state: 'available', version: '3.2.0' });
      expect(fake.downloadUpdate).not.toHaveBeenCalled();
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

    // The installer launches before the app quits and stops every process,
    // so running generations are confirmed before anything starts.
    it('asks before installing over running work, and respects a no', async () => {
      const { fake, emit } = createFakeAutoUpdater();
      const confirmInstall = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
      const service = createUpdaterService({
        autoUpdater: fake,
        isPackaged: true,
        env: {},
        platform: 'win32',
        confirmInstall,
        getMainWindow: () => null,
        logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
      });
      service.start();
      emit('update-downloaded', { version: '3.2.0' });

      await service.install();
      expect(fake.quitAndInstall).not.toHaveBeenCalled();

      await service.install();
      expect(fake.quitAndInstall).toHaveBeenCalledTimes(1);
      expect(confirmInstall).toHaveBeenCalledTimes(2);
    });
  });

  describe('feed configuration', () => {
    // The updater only runs packaged, where an environment variable must not
    // be able to point the installer download at another host.
    it('ignores the VISION_STUDIO_UPDATE_URL override in packaged builds', () => {
      const { service, fake, logger } = createHarness({
        env: { VISION_STUDIO_UPDATE_URL: 'https://attacker.example/win/' },
      });
      service.start();
      expect(fake.setFeedURL).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('VISION_STUDIO_UPDATE_URL is ignored'));
    });

    it('leaves the packaged app-update.yml feed untouched without an override', () => {
      const { service, fake } = createHarness();
      service.start();
      expect(fake.setFeedURL).not.toHaveBeenCalled();
    });
  });

  describe('download()', () => {
    function availableHarness() {
      const harness = createHarness();
      harness.service.start();
      harness.emit('checking-for-update');
      harness.emit('update-available', { version: '3.2.0' });
      harness.send.mockClear();
      return harness;
    }

    it('reports available -> downloading (real progress) -> downloaded, pushing each step', async () => {
      const { service, fake, emit, send } = availableHarness();

      const reply = await service.download();

      expect(fake.downloadUpdate).toHaveBeenCalledTimes(1);
      expect(reply).toEqual({ state: 'downloading', version: '3.2.0', percent: 0 });
      expect(send).toHaveBeenLastCalledWith('updater:status', { state: 'downloading', version: '3.2.0', percent: 0 });

      emit('download-progress', { percent: 42.5, bytesPerSecond: 1048576, transferred: 425, total: 1000 });
      expect(service.getStatus()).toEqual({
        state: 'downloading',
        version: '3.2.0',
        percent: 42.5,
        bytesPerSecond: 1048576,
        transferred: 425,
        total: 1000,
      });

      emit('update-downloaded', { version: '3.2.0' });
      expect(service.getStatus()).toEqual({ state: 'downloaded', version: '3.2.0' });
      expect(send.mock.calls.map(([, status]) => (status as UpdaterStatus).state)).toEqual([
        'downloading',
        'downloading',
        'downloaded',
      ]);
    });

    it('does nothing when no update is available', async () => {
      const { service, fake, logger } = createHarness();
      service.start();

      await expect(service.download()).resolves.toEqual({ state: 'idle' });

      expect(fake.downloadUpdate).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('no update available'));
    });

    it('does nothing after a check that found no update', async () => {
      const { service, fake, emit } = createHarness();
      service.start();
      emit('update-available', { version: '3.2.0' });
      emit('checking-for-update');
      emit('update-not-available', { version: '3.1.1' });

      await service.download();

      expect(fake.downloadUpdate).not.toHaveBeenCalled();
      expect(service.getStatus().state).toBe('not-available');
    });

    it('is a no-op in dev builds', async () => {
      const { service, fake } = createHarness({ isPackaged: false });
      service.start();

      await expect(service.download()).resolves.toEqual({ state: 'disabled' });
      expect(fake.downloadUpdate).not.toHaveBeenCalled();
    });

    it('starts one download however often it is asked', async () => {
      const { service, fake, emit } = availableHarness();

      await service.download();
      await service.download();
      emit('update-downloaded', { version: '3.2.0' });
      await service.download();

      expect(fake.downloadUpdate).toHaveBeenCalledTimes(1);
      expect(service.getStatus().state).toBe('downloaded');
    });

    it('surfaces a failed download as an error that keeps the version, and allows a retry', async () => {
      const { service, fake } = availableHarness();
      fake.downloadUpdate.mockRejectedValueOnce(new Error('net::ERR_CONNECTION_RESET'));

      await service.download();
      await vi.waitFor(() => expect(service.getStatus().state).toBe('error'));
      expect(service.getStatus()).toEqual({
        state: 'error',
        version: '3.2.0',
        message: 'net::ERR_CONNECTION_RESET',
      });

      await expect(service.download()).resolves.toMatchObject({ state: 'downloading', version: '3.2.0' });
      expect(fake.downloadUpdate).toHaveBeenCalledTimes(2);
    });

    it('maps an error event during the download the same way', async () => {
      const { service, emit } = availableHarness();
      await service.download();

      emit('error', new Error('sha512 checksum mismatch'));

      expect(service.getStatus()).toEqual({ state: 'error', version: '3.2.0', message: 'sha512 checksum mismatch' });
    });

    it('survives a downloadUpdate that throws synchronously', async () => {
      const { service, fake } = availableHarness();
      fake.downloadUpdate.mockImplementationOnce(() => {
        throw new Error('Please check update first');
      });

      await expect(service.download()).resolves.toMatchObject({ state: 'error', message: 'Please check update first' });
    });

    it('does not let a late rejection overwrite a newer status', async () => {
      const { service, fake, emit } = availableHarness();
      let reject!: (error: Error) => void;
      fake.downloadUpdate.mockImplementationOnce(() => new Promise((_resolve, rejectIt) => (reject = rejectIt)));

      await service.download();
      emit('update-downloaded', { version: '3.2.0' });
      reject(new Error('cancelled'));
      await Promise.resolve();
      await Promise.resolve();

      expect(service.getStatus()).toEqual({ state: 'downloaded', version: '3.2.0' });
    });

    it('skips scheduled and manual checks while downloading or ready to install', async () => {
      const { service, fake, emit } = availableHarness();
      vi.advanceTimersByTime(UPDATE_INITIAL_DELAY_MS);
      expect(fake.checkForUpdates).toHaveBeenCalledTimes(1);

      await service.download();
      vi.advanceTimersByTime(UPDATE_RECHECK_INTERVAL_MS);
      await expect(service.check()).resolves.toMatchObject({ state: 'downloading' });

      emit('update-downloaded', { version: '3.2.0' });
      vi.advanceTimersByTime(UPDATE_RECHECK_INTERVAL_MS);
      await expect(service.check()).resolves.toMatchObject({ state: 'downloaded' });

      expect(fake.checkForUpdates).toHaveBeenCalledTimes(1);
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
