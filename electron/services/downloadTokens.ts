import { setCivitaiToken, setHfToken } from './backendAuth';

/**
 * The Foundry's Hugging Face and CivitAI access tokens, which model downloads
 * send as X-HF-Token / X-Civitai-Token (backendAuth.ts). Each token is
 * encrypted with the OS (safeStorage) and kept in the app's secure store, then
 * restored into backendAuth on the next launch. When OS encryption is
 * unavailable a token is held for this session only - never written in plain
 * text - and the IPC reply says so (`persisted: false`).
 */

export type DownloadTokenProvider = 'huggingFace' | 'civitai';

/** Encrypted (safeStorage, base64) token per provider. */
export type DownloadTokensState = Partial<Record<DownloadTokenProvider, string>>;

export type SetTokenResult = { success: true; persisted: boolean };

type StoreLike = {
  get: (key: 'downloadTokens') => DownloadTokensState | undefined;
  set: (key: 'downloadTokens', value: DownloadTokensState) => void;
};

type SafeStorageLike = {
  isEncryptionAvailable: () => boolean;
  encryptString: (plainText: string) => Buffer;
  decryptString: (encrypted: Buffer) => string;
};

type LoggerLike = { warn: (...args: unknown[]) => void };

type IpcMainLike = {
  handle: (channel: string, listener: (event: unknown, token: unknown) => unknown) => void;
};

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
}: {
  store: StoreLike;
  safeStorage: SafeStorageLike;
  logger?: LoggerLike;
}) {
  const read = (): DownloadTokensState => ({ ...(store.get('downloadTokens') ?? {}) });

  function setToken(provider: DownloadTokenProvider, token: unknown): SetTokenResult {
    const value = normalize(token);
    APPLY[provider](value);

    const saved = read();
    delete saved[provider];
    const persisted = value === undefined || safeStorage.isEncryptionAvailable();
    if (value !== undefined && persisted) {
      saved[provider] = safeStorage.encryptString(value).toString('base64');
    }
    store.set('downloadTokens', saved);
    return { success: true, persisted };
  }

  /** Load the saved tokens into backendAuth. Called once at startup. */
  function restore(): void {
    const saved = read();
    for (const provider of Object.keys(APPLY) as DownloadTokenProvider[]) {
      const encrypted = saved[provider];
      if (!encrypted) continue;
      try {
        APPLY[provider](normalize(safeStorage.decryptString(Buffer.from(encrypted, 'base64'))));
      } catch {
        logger.warn(`[DownloadTokens] Could not decrypt the saved ${provider} token; add it again in the Foundry.`);
      }
    }
  }

  return {
    setHfToken: (token: unknown) => setToken('huggingFace', token),
    setCivitaiToken: (token: unknown) => setToken('civitai', token),
    restore,
  };
}

export type DownloadTokensService = ReturnType<typeof createDownloadTokensService>;

/** The renderer never reads a token back; these channels only set or clear one. */
export function registerDownloadTokenIpc(ipcMain: IpcMainLike, service: DownloadTokensService): void {
  ipcMain.handle('auth:setHfToken', (_event, token) => service.setHfToken(token));
  ipcMain.handle('auth:setCivitaiToken', (_event, token) => service.setCivitaiToken(token));
}
