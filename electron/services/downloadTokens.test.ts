import { readFileSync } from 'fs';
import { resolve } from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { civitaiTokenHeaders, hfTokenHeaders, setCivitaiToken, setHfToken } from './backendAuth';
import { createDownloadTokensService, registerDownloadTokenIpc } from './downloadTokens';
import { createFakeIpcMain } from '../ipc-handlers/ipcTestHarness';

/**
 * The Foundry's Hugging Face and CivitAI tokens are what model downloads send
 * (X-HF-Token / X-Civitai-Token, backendAuth.ts). The Foundry said "Tokens are
 * stored securely", but auth:setHfToken only held them in memory: after a
 * restart every gated download failed until the token was pasted again.
 */

/** An async safeStorage (Electron 45+); `legacy:` ciphertext asks to be re-encrypted. */
function createSafeStorage(available = true) {
  return {
    isAsyncEncryptionAvailable: vi.fn(async () => available),
    encryptStringAsync: vi.fn(async (plainText: string) => Buffer.from(`secure:${plainText}`, 'utf8')),
    decryptStringAsync: vi.fn(async (encrypted: Buffer) => {
      const text = encrypted.toString('utf8');
      const match = /^(secure|legacy):/.exec(text);
      if (!match) throw new Error('Error while decrypting the ciphertext');
      return { result: text.slice(match[0].length), shouldReEncrypt: match[1] === 'legacy' };
    }),
  };
}

function createStore() {
  let state: Record<string, unknown> = {};
  return {
    get: (key: string) => state[key] as any,
    set: (key: string, value: unknown) => {
      state = { ...state, [key]: value };
    },
    peek: () => state,
  };
}

function deferred<T>() {
  let resolveIt!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolveIt = done;
  });
  return { promise, resolve: resolveIt };
}

const encode = (text: string) => Buffer.from(text, 'utf8').toString('base64');
const decode = (value: unknown) => (typeof value === 'string' ? Buffer.from(value, 'base64').toString('utf8') : value);
const savedTokens = (store: ReturnType<typeof createStore>) =>
  (store.peek().downloadTokens ?? {}) as Record<string, string | undefined>;

/** A relaunch: the main process starts with no tokens in memory. */
function restartProcess() {
  setHfToken(undefined);
  setCivitaiToken(undefined);
}

afterEach(restartProcess);

describe('download tokens', () => {
  it('saves the Hugging Face token encrypted and applies it to downloads', async () => {
    const store = createStore();
    const service = createDownloadTokensService({ store, safeStorage: createSafeStorage() });

    await expect(service.setHfToken('hf_secret')).resolves.toEqual({ success: true, persisted: true });

    expect(hfTokenHeaders()).toEqual({ 'X-HF-Token': 'hf_secret' });
    expect(JSON.stringify(store.peek())).not.toContain('hf_secret');
  });

  it('restores both tokens on the next launch', async () => {
    const store = createStore();
    const first = createDownloadTokensService({ store, safeStorage: createSafeStorage() });
    await first.setHfToken('hf_secret');
    await first.setCivitaiToken('civ_key');
    restartProcess();

    await createDownloadTokensService({ store, safeStorage: createSafeStorage() }).restore();

    expect(hfTokenHeaders()).toEqual({ 'X-HF-Token': 'hf_secret' });
    expect(civitaiTokenHeaders()).toEqual({ 'X-Civitai-Token': 'civ_key' });
  });

  it('restores a token the deprecated sync encryptString saved', async () => {
    const store = createStore();
    // Same base64 framing the sync implementation wrote.
    store.set('downloadTokens', { huggingFace: encode('secure:hf_from_sync_api') });

    await createDownloadTokensService({ store, safeStorage: createSafeStorage() }).restore();

    expect(hfTokenHeaders()).toEqual({ 'X-HF-Token': 'hf_from_sync_api' });
  });

  it('forgets a cleared token on disk as well as in memory', async () => {
    const store = createStore();
    const service = createDownloadTokensService({ store, safeStorage: createSafeStorage() });
    await service.setHfToken('hf_secret');

    await service.setHfToken('   ');
    restartProcess();
    await createDownloadTokensService({ store, safeStorage: createSafeStorage() }).restore();

    expect(hfTokenHeaders()).toEqual({});
  });

  it('keeps a token for this session only when OS encryption is unavailable', async () => {
    const store = createStore();
    const safeStorage = createSafeStorage(false);
    const service = createDownloadTokensService({ store, safeStorage });

    await expect(service.setHfToken('hf_secret')).resolves.toEqual({ success: true, persisted: false });

    expect(hfTokenHeaders()).toEqual({ 'X-HF-Token': 'hf_secret' });
    expect(JSON.stringify(store.peek())).not.toContain('hf_secret');
    expect(safeStorage.encryptStringAsync).not.toHaveBeenCalled();
  });

  it('drops a stored token it can no longer decrypt instead of failing the launch', async () => {
    const store = createStore();
    store.set('downloadTokens', { huggingFace: encode('garbage') });
    const warnings: unknown[] = [];

    await createDownloadTokensService({
      store,
      safeStorage: createSafeStorage(),
      logger: { warn: (...args: unknown[]) => warnings.push(args) },
    }).restore();

    expect(hfTokenHeaders()).toEqual({});
    expect(warnings).toHaveLength(1);
  });

  it('answers the renderer on the auth IPC channels', async () => {
    const { ipcMain, invoke } = createFakeIpcMain();
    const service = createDownloadTokensService({ store: createStore(), safeStorage: createSafeStorage() });

    registerDownloadTokenIpc(ipcMain, service, { isTrustedSender: () => true });

    expect(await invoke('auth:setHfToken', 'hf_ipc')).toEqual({ success: true, persisted: true });
    expect(hfTokenHeaders()).toEqual({ 'X-HF-Token': 'hf_ipc' });
    expect(await invoke('auth:setCivitaiToken', 'civ_ipc')).toEqual({ success: true, persisted: true });
    expect(civitaiTokenHeaders()).toEqual({ 'X-Civitai-Token': 'civ_ipc' });
  });

  it('refuses a non-string token over IPC before touching the service', async () => {
    const { ipcMain, invoke } = createFakeIpcMain();
    const service = createDownloadTokensService({ store: createStore(), safeStorage: createSafeStorage() });
    registerDownloadTokenIpc(ipcMain, service, { isTrustedSender: () => true, logger: { warn: () => undefined, error: () => undefined } });

    await expect(invoke('auth:setHfToken', { token: 'x' })).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
    expect(hfTokenHeaders()).toEqual({});
  });

  it('keeps a token session-only on Linux basic_text storage (fixed-key "encryption")', async () => {
    const store = createStore();
    const service = createDownloadTokensService({
      store,
      safeStorage: { ...createSafeStorage(), getSelectedStorageBackend: () => 'basic_text' },
      platform: 'linux',
    });

    await expect(service.setHfToken('hf_secret')).resolves.toEqual({ success: true, persisted: false });
    expect(hfTokenHeaders()).toEqual({ 'X-HF-Token': 'hf_secret' });
    expect(JSON.stringify(store.peek())).not.toContain('hf_secret');
  });

  it('is registered by the Electron entry point', () => {
    // main.ts imports Electron and cannot run under the test runner; the
    // channels exist only if it calls the registration with the live service.
    const mainSource = readFileSync(resolve(__dirname, '..', 'main.ts'), 'utf8');

    expect(mainSource).toMatch(/registerDownloadTokenIpc\(ipcMain, services\.downloadTokens\)/);
    expect(mainSource, 'a second auth handler would throw at startup').not.toMatch(
      /ipcMain\.handle\('auth:set/,
    );
  });

  describe('re-encryption (decryptStringAsync shouldReEncrypt)', () => {
    it('re-encrypts and persists a restored token the OS asked to re-encrypt', async () => {
      const store = createStore();
      store.set('downloadTokens', { huggingFace: encode('legacy:hf_rotated'), civitai: encode('secure:civ_current') });
      const safeStorage = createSafeStorage();

      await createDownloadTokensService({ store, safeStorage }).restore();

      expect(hfTokenHeaders()).toEqual({ 'X-HF-Token': 'hf_rotated' });
      expect(decode(savedTokens(store).huggingFace)).toBe('secure:hf_rotated');
      // Only the token that asked for it was rewritten.
      expect(safeStorage.encryptStringAsync).toHaveBeenCalledTimes(1);
      expect(decode(savedTokens(store).civitai)).toBe('secure:civ_current');
    });

    it('keeps the old ciphertext, and the token in memory, when re-encryption fails', async () => {
      const store = createStore();
      store.set('downloadTokens', { huggingFace: encode('legacy:hf_rotated') });
      const safeStorage = createSafeStorage();
      safeStorage.encryptStringAsync.mockRejectedValueOnce(new Error('keychain locked'));
      const logger = { warn: vi.fn() };

      await createDownloadTokensService({ store, safeStorage, logger }).restore();

      expect(hfTokenHeaders()).toEqual({ 'X-HF-Token': 'hf_rotated' });
      expect(decode(savedTokens(store).huggingFace)).toBe('legacy:hf_rotated');
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Could not re-encrypt'));
    });

    it('never overwrites a token saved while the restore was decrypting', async () => {
      const store = createStore();
      store.set('downloadTokens', { huggingFace: encode('legacy:hf_old') });
      const safeStorage = createSafeStorage();
      const gate = deferred<void>();
      safeStorage.decryptStringAsync.mockImplementationOnce(async (encrypted: Buffer) => {
        await gate.promise;
        return { result: encrypted.toString('utf8').replace(/^legacy:/, ''), shouldReEncrypt: true };
      });
      const service = createDownloadTokensService({ store, safeStorage });

      const restoring = service.restore();
      await service.setHfToken('hf_new');
      gate.resolve();
      await restoring;

      expect(hfTokenHeaders()).toEqual({ 'X-HF-Token': 'hf_new' });
      expect(decode(savedTokens(store).huggingFace)).toBe('secure:hf_new');
    });
  });

  describe('serialized writes', () => {
    it('keeps both tokens when HF and CivitAI are saved at once', async () => {
      const store = createStore();
      const safeStorage = createSafeStorage();
      // The HF encryption finishes last: without the queue its write would drop CivitAI's token.
      const gate = deferred<void>();
      safeStorage.encryptStringAsync.mockImplementationOnce(async (plainText: string) => {
        await gate.promise;
        return Buffer.from(`secure:${plainText}`, 'utf8');
      });
      const service = createDownloadTokensService({ store, safeStorage });

      const hf = service.setHfToken('hf_secret');
      const civitai = service.setCivitaiToken('civ_key');
      setTimeout(() => gate.resolve(), 5);
      await Promise.all([hf, civitai]);

      expect(decode(savedTokens(store).huggingFace)).toBe('secure:hf_secret');
      expect(decode(savedTokens(store).civitai)).toBe('secure:civ_key');
    });

    it('persists the last of two quick saves of the same token', async () => {
      const store = createStore();
      const safeStorage = createSafeStorage();
      const gate = deferred<void>();
      safeStorage.encryptStringAsync.mockImplementationOnce(async (plainText: string) => {
        await gate.promise;
        return Buffer.from(`secure:${plainText}`, 'utf8');
      });
      const service = createDownloadTokensService({ store, safeStorage });

      const older = service.setHfToken('hf_older');
      const newer = service.setHfToken('hf_newer');
      gate.resolve();
      await Promise.all([older, newer]);

      expect(hfTokenHeaders()).toEqual({ 'X-HF-Token': 'hf_newer' });
      expect(decode(savedTokens(store).huggingFace)).toBe('secure:hf_newer');
    });

    it('keeps saving after an encryption failure', async () => {
      const store = createStore();
      const safeStorage = createSafeStorage();
      safeStorage.encryptStringAsync.mockRejectedValueOnce(new Error('keychain locked'));
      const service = createDownloadTokensService({ store, safeStorage });

      await expect(service.setHfToken('hf_secret')).rejects.toThrow('keychain locked');
      await expect(service.setCivitaiToken('civ_key')).resolves.toEqual({ success: true, persisted: true });
      expect(decode(savedTokens(store).civitai)).toBe('secure:civ_key');
    });
  });
});
