import { setCivitaiToken, setHfToken } from './backendAuth';
import { secureStorageRefusal } from './userAccounts';
import {
  createSerialQueue,
  decryptFromBase64,
  encryptToBase64,
  type AsyncSafeStorageLike,
} from './asyncSafeStorage';
import { handleIpc, type HandleIpcOptions, type IpcMainLike } from '../ipc-handlers/ipcHandle';
import type { DownloadTokenSetResult } from '../../shared/ipcTypes';

/**
 * The Foundry's Hugging Face and CivitAI access tokens, which model downloads
 * send as X-HF-Token / X-Civitai-Token (backendAuth.ts). Each token is
 * encrypted with the OS (safeStorage) and kept in the app's secure store, then
 * restored into backendAuth on the next launch. When OS encryption is
 * unavailable - including Linux's `basic_text` fallback, which "encrypts" with
 * a fixed key - a token is held for this session only, never written to disk,
 * and the IPC reply says so (`persisted: false`).
 */

export type DownloadTokenProvider = 'huggingFace' | 'civitai';

/** Encrypted (safeStorage, base64) token per provider. */
export type DownloadTokensState = Partial<Record<DownloadTokenProvider, string>>;

export type SetTokenResult = DownloadTokenSetResult;

type StoreLike = {
  get: (key: 'downloadTokens') => DownloadTokensState | undefined;
  set: (key: 'downloadTokens', value: DownloadTokensState) => void;
};

type LoggerLike = { warn: (...args: unknown[]) => void };

const PROVIDERS: DownloadTokenProvider[] = ['huggingFace', 'civitai'];

const APPLY: Record<DownloadTokenProvider, (token: string | undefined) => void> = {
  huggingFace: setHfToken,
  civitai: setCivitaiToken,
};

function normalize(token: unknown): string | undefined {
  return typeof token === 'string' && token.trim() ? token.trim() : undefined;
}

export function createDownloadTokensService({
  store,
  safeStorage,
  logger = console,
  platform = process.platform,
}: {
  store: StoreLike;
  safeStorage: AsyncSafeStorageLike;
  logger?: LoggerLike;
  platform?: NodeJS.Platform;
}) {
  const read = (): DownloadTokensState => ({ ...(store.get('downloadTokens') ?? {}) });

  // Every write to the downloadTokens key goes through this queue: encryption
  // is asynchronous, and two saves (HF and CivitAI from the same Foundry
  // form) must not each read the old state and drop the other's token.
  const serialize = createSerialQueue();

  // Bumped on every set, so a restore still decrypting never overwrites a
  // token the user entered in the meantime.
  const generation: Record<DownloadTokenProvider, number> = { huggingFace: 0, civitai: 0 };

  async function setToken(provider: DownloadTokenProvider, token: unknown): Promise<SetTokenResult> {
    const value = normalize(token);
    // In memory at once, in call order: downloads use the newest token even
    // while the encrypted copy is still being written.
    APPLY[provider](value);
    generation[provider] += 1;

    return serialize(async () => {
      const persisted = value === undefined || (await secureStorageRefusal(safeStorage, platform)) === null;
      const encrypted = value !== undefined && persisted ? await encryptToBase64(safeStorage, value) : undefined;

      const saved = read();
      delete saved[provider];
      if (encrypted !== undefined) {
        saved[provider] = encrypted;
      }
      store.set('downloadTokens', saved);
      return { success: true, persisted };
    });
  }

  /**
   * Re-encrypt a restored token under the OS's current key, unless it was
   * replaced or cleared since it was read, or secure storage is now refused.
   */
  async function reEncrypt(provider: DownloadTokenProvider, previous: string, plainText: string): Promise<void> {
    try {
      await serialize(async () => {
        if ((await secureStorageRefusal(safeStorage, platform)) !== null) {
          return;
        }
        const reEncrypted = await encryptToBase64(safeStorage, plainText);
        const saved = read();
        if (saved[provider] !== previous) {
          return;
        }
        saved[provider] = reEncrypted;
        store.set('downloadTokens', saved);
      });
    } catch {
      logger.warn(`[DownloadTokens] Could not re-encrypt the saved ${provider} token; it stays readable with the previous key.`);
    }
  }

  async function restoreOne(provider: DownloadTokenProvider, encrypted: string): Promise<void> {
    const startedAt = generation[provider];
    let decrypted: { result: string; shouldReEncrypt: boolean };
    try {
      decrypted = await decryptFromBase64(safeStorage, encrypted);
    } catch {
      logger.warn(`[DownloadTokens] Could not decrypt the saved ${provider} token; add it again in the Foundry.`);
      return;
    }
    if (generation[provider] !== startedAt) {
      return;
    }
    APPLY[provider](normalize(decrypted.result));
    if (decrypted.shouldReEncrypt) {
      await reEncrypt(provider, encrypted, decrypted.result);
    }
  }

  /** Load the saved tokens into backendAuth. Awaited once at startup. */
  async function restore(): Promise<void> {
    const saved = read();
    await Promise.all(
      PROVIDERS.map((provider) => {
        const encrypted = saved[provider];
        return encrypted ? restoreOne(provider, encrypted) : Promise.resolve();
      }),
    );
  }

  return {
    setHfToken: (token: unknown) => setToken('huggingFace', token),
    setCivitaiToken: (token: unknown) => setToken('civitai', token),
    restore,
  };
}

export type DownloadTokensService = ReturnType<typeof createDownloadTokensService>;

/** The renderer never reads a token back; these channels only set or clear one. */
export function registerDownloadTokenIpc(
  ipcMain: IpcMainLike,
  service: DownloadTokensService,
  options: HandleIpcOptions = {},
): void {
  handleIpc(ipcMain, 'auth:setHfToken', (_event, token) => service.setHfToken(token), options);
  handleIpc(ipcMain, 'auth:setCivitaiToken', (_event, token) => service.setCivitaiToken(token), options);
}
