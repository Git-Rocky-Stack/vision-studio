import { readFileSync } from 'fs';
import { resolve } from 'path';
import { afterEach, describe, expect, it } from 'vitest';

import { civitaiTokenHeaders, hfTokenHeaders, setCivitaiToken, setHfToken } from './backendAuth';
import { createDownloadTokensService, registerDownloadTokenIpc } from './downloadTokens';

/**
 * The Foundry's Hugging Face and CivitAI tokens are what model downloads send
 * (X-HF-Token / X-Civitai-Token, backendAuth.ts). The Foundry said "Tokens are
 * stored securely", but auth:setHfToken only held them in memory: after a
 * restart every gated download failed until the token was pasted again.
 */

function createSafeStorage(available = true) {
  return {
    isEncryptionAvailable: () => available,
    encryptString: (plainText: string) => Buffer.from(`secure:${plainText}`, 'utf8'),
    decryptString: (encrypted: Buffer) => {
      const text = encrypted.toString('utf8');
      if (!text.startsWith('secure:')) throw new Error('Error while decrypting the ciphertext');
      return text.replace(/^secure:/, '');
    },
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

/** A relaunch: the main process starts with no tokens in memory. */
function restartProcess() {
  setHfToken(undefined);
  setCivitaiToken(undefined);
}

afterEach(restartProcess);

describe('download tokens', () => {
  it('saves the Hugging Face token encrypted and applies it to downloads', () => {
    const store = createStore();
    const service = createDownloadTokensService({ store, safeStorage: createSafeStorage() });

    expect(service.setHfToken('hf_secret')).toEqual({ success: true, persisted: true });

    expect(hfTokenHeaders()).toEqual({ 'X-HF-Token': 'hf_secret' });
    expect(JSON.stringify(store.peek())).not.toContain('hf_secret');
  });

  it('restores both tokens on the next launch', () => {
    const store = createStore();
    const first = createDownloadTokensService({ store, safeStorage: createSafeStorage() });
    first.setHfToken('hf_secret');
    first.setCivitaiToken('civ_key');
    restartProcess();

    createDownloadTokensService({ store, safeStorage: createSafeStorage() }).restore();

    expect(hfTokenHeaders()).toEqual({ 'X-HF-Token': 'hf_secret' });
    expect(civitaiTokenHeaders()).toEqual({ 'X-Civitai-Token': 'civ_key' });
  });

  it('forgets a cleared token on disk as well as in memory', () => {
    const store = createStore();
    const service = createDownloadTokensService({ store, safeStorage: createSafeStorage() });
    service.setHfToken('hf_secret');

    service.setHfToken('   ');
    restartProcess();
    createDownloadTokensService({ store, safeStorage: createSafeStorage() }).restore();

    expect(hfTokenHeaders()).toEqual({});
  });

  it('keeps a token for this session only when OS encryption is unavailable', () => {
    const store = createStore();
    const service = createDownloadTokensService({ store, safeStorage: createSafeStorage(false) });

    expect(service.setHfToken('hf_secret')).toEqual({ success: true, persisted: false });

    expect(hfTokenHeaders()).toEqual({ 'X-HF-Token': 'hf_secret' });
    expect(JSON.stringify(store.peek())).not.toContain('hf_secret');
  });

  it('drops a stored token it can no longer decrypt instead of failing the launch', () => {
    const store = createStore();
    store.set('downloadTokens', { huggingFace: Buffer.from('garbage').toString('base64') });
    const warnings: unknown[] = [];

    createDownloadTokensService({
      store,
      safeStorage: createSafeStorage(),
      logger: { warn: (...args: unknown[]) => warnings.push(args) },
    }).restore();

    expect(hfTokenHeaders()).toEqual({});
    expect(warnings).toHaveLength(1);
  });

  it('answers the renderer on the auth IPC channels', async () => {
    const handlers = new Map<string, (event: unknown, token: unknown) => unknown>();
    const ipcMain = { handle: (channel: string, fn: (event: unknown, token: unknown) => unknown) => handlers.set(channel, fn) };
    const service = createDownloadTokensService({ store: createStore(), safeStorage: createSafeStorage() });

    registerDownloadTokenIpc(ipcMain, service);

    expect(await handlers.get('auth:setHfToken')!({}, 'hf_ipc')).toEqual({ success: true, persisted: true });
    expect(hfTokenHeaders()).toEqual({ 'X-HF-Token': 'hf_ipc' });
    expect(await handlers.get('auth:setCivitaiToken')!({}, 'civ_ipc')).toEqual({ success: true, persisted: true });
    expect(civitaiTokenHeaders()).toEqual({ 'X-Civitai-Token': 'civ_ipc' });
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
});
