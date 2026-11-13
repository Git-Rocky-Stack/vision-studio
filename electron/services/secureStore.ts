import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { isAsyncEncryptionAvailable, type AsyncSafeStorageLike } from './asyncSafeStorage';

const KEY_FILE_NAME = 'store-encryption-key';
const DEFAULT_STORE_NAME = 'config';
const DEFAULT_FILE_EXTENSION = 'json';

type LoggerLike = {
  warn: (...args: unknown[]) => void;
};

type StoreInstance<T extends object> = {
  store: T;
  get: <K extends keyof T>(key: K) => T[K];
  set: <K extends keyof T>(key: K, value: T[K]) => void;
  clear: () => void;
};

type StoreConstructor<T extends object> = new (
  options: Record<string, unknown>
) => StoreInstance<T>;

type SecureStoreOptions<T extends object> = Record<string, unknown> & {
  defaults?: T;
  fileExtension?: string;
  name?: string;
};

type CreateSecureStoreParams<T extends object> = {
  Store: StoreConstructor<T>;
  options: SecureStoreOptions<T>;
  safeStorage: AsyncSafeStorageLike;
  userDataPath: string;
  logger?: LoggerLike;
};

const noopLogger: LoggerLike = {
  warn: () => undefined,
};

function getConfigPath(userDataPath: string, options: SecureStoreOptions<object>) {
  const storeName = options.name ?? DEFAULT_STORE_NAME;
  const extension = options.fileExtension ?? DEFAULT_FILE_EXTENSION;
  return path.join(userDataPath, `${storeName}.${extension}`);
}

function isProbablyPlainJson(configPath: string) {
  if (!fs.existsSync(configPath)) {
    return false;
  }

  const raw = fs.readFileSync(configPath);
  const text = raw.toString('utf8').trimStart();
  return text.startsWith('{') || text.startsWith('[');
}

const PLAINTEXT_BACKUP_MARKER = '.plaintext-backup-';

function backupPlaintextConfig(configPath: string) {
  const backupPath = `${configPath}${PLAINTEXT_BACKUP_MARKER}${Date.now()}`;
  fs.copyFileSync(configPath, backupPath, fs.constants.COPYFILE_EXCL);
  return backupPath;
}

/**
 * Whether the config on disk is encrypted AND readable with this launch's key:
 * not plain JSON, and the store reads back without throwing (electron-store's
 * `store` getter re-reads and decrypts the file on every access).
 */
function isEncryptedAndReadable<T extends object>(configPath: string, store: StoreInstance<T>) {
  if (!fs.existsSync(configPath) || isProbablyPlainJson(configPath)) {
    return false;
  }
  try {
    void store.store;
    return true;
  } catch {
    return false;
  }
}

/**
 * The plaintext backups hold every secret the store had before encryption.
 * Once the encrypted store is verified readable they are only a liability, so
 * they are removed - including any left behind by an earlier launch.
 */
function removePlaintextBackups(configPath: string, logger: LoggerLike) {
  const directory = path.dirname(configPath);
  const prefix = `${path.basename(configPath)}${PLAINTEXT_BACKUP_MARKER}`;
  let entries: string[];
  try {
    entries = fs.readdirSync(directory);
  } catch {
    return;
  }
  for (const entry of entries) {
    if (!entry.startsWith(prefix)) {
      continue;
    }
    try {
      fs.rmSync(path.join(directory, entry), { force: true });
    } catch {
      logger.warn(`[Store] Could not remove the plaintext config backup ${entry}; delete it manually.`);
    }
  }
}

/**
 * Replace the key file without ever leaving a truncated one behind: a torn
 * key file would make the encrypted store unreadable on the next launch.
 */
function writeKeyFileAtomically(keyPath: string, encryptedKey: Buffer) {
  const tempPath = `${keyPath}.tmp-${process.pid}-${Date.now()}`;
  try {
    fs.writeFileSync(tempPath, encryptedKey.toString('base64'), { mode: 0o600 });
    fs.renameSync(tempPath, keyPath);
  } catch (error) {
    fs.rmSync(tempPath, { force: true });
    throw error;
  }
}

async function getOrCreateEncryptionKey(
  userDataPath: string,
  safeStorage: AsyncSafeStorageLike,
  logger: LoggerLike
): Promise<Buffer | null> {
  if (!(await isAsyncEncryptionAvailable(safeStorage))) {
    logger.warn('[Store] OS encryption is unavailable; keeping electron-store plaintext for this launch.');
    return null;
  }

  fs.mkdirSync(userDataPath, { recursive: true });
  const keyPath = path.join(userDataPath, KEY_FILE_NAME);

  if (fs.existsSync(keyPath)) {
    let decrypted: { result: string; shouldReEncrypt: boolean };
    try {
      const encryptedKey = Buffer.from(fs.readFileSync(keyPath, 'utf8'), 'base64');
      decrypted = await safeStorage.decryptStringAsync(encryptedKey);
    } catch {
      logger.warn('[Store] Could not decrypt the existing store encryption key; keeping electron-store plaintext for this launch.');
      return null;
    }

    // The OS rotated its key (or offers a stronger one): re-wrap the same
    // store key so the next launch reads it with the current one. The store
    // key itself never changes, so a failure here costs nothing this launch.
    if (decrypted.shouldReEncrypt) {
      try {
        writeKeyFileAtomically(keyPath, await safeStorage.encryptStringAsync(decrypted.result));
      } catch {
        logger.warn('[Store] Could not re-encrypt the store encryption key; it stays readable with the previous OS key.');
      }
    }
    return Buffer.from(decrypted.result, 'base64');
  }

  const key = crypto.randomBytes(32);
  const encryptedKey = await safeStorage.encryptStringAsync(key.toString('base64'));
  writeKeyFileAtomically(keyPath, encryptedKey);
  return key;
}

/**
 * electron-store encrypted with a random key that the OS keychain protects
 * (safeStorage). Call only after the app's 'ready' event: before it,
 * safeStorage.isAsyncEncryptionAvailable() resolves false on Windows and
 * Linux and the store silently stays plaintext.
 */
export async function createSecureStore<T extends object>({
  Store,
  options,
  safeStorage,
  userDataPath,
  logger = noopLogger,
}: CreateSecureStoreParams<T>): Promise<StoreInstance<T>> {
  const configPath = getConfigPath(userDataPath, options);
  const encryptionKey = await getOrCreateEncryptionKey(userDataPath, safeStorage, logger);
  let shouldRewritePlaintextConfig = false;

  if (encryptionKey && isProbablyPlainJson(configPath)) {
    try {
      backupPlaintextConfig(configPath);
      shouldRewritePlaintextConfig = true;
    } catch {
      logger.warn('[Store] Could not back up plaintext config; keeping electron-store plaintext for this launch.');
      const store = new Store(options);
      return store;
    }
  }

  const store = new Store({
    ...options,
    ...(encryptionKey ? { encryptionKey } : {}),
  });

  if (encryptionKey && shouldRewritePlaintextConfig) {
    store.store = { ...store.store };
  }

  if (encryptionKey && isEncryptedAndReadable(configPath, store)) {
    removePlaintextBackups(configPath, logger);
  }

  return store;
}
