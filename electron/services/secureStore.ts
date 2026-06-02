import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const KEY_FILE_NAME = 'store-encryption-key';
const DEFAULT_STORE_NAME = 'config';
const DEFAULT_FILE_EXTENSION = 'json';

type SafeStorageLike = {
  isEncryptionAvailable: () => boolean;
  encryptString: (plainText: string) => Buffer;
  decryptString: (encrypted: Buffer) => string;
};

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
  safeStorage: SafeStorageLike;
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

function backupPlaintextConfig(configPath: string) {
  const backupPath = `${configPath}.plaintext-backup-${Date.now()}`;
  fs.copyFileSync(configPath, backupPath, fs.constants.COPYFILE_EXCL);
  return backupPath;
}

function getOrCreateEncryptionKey(
  userDataPath: string,
  safeStorage: SafeStorageLike,
  logger: LoggerLike
) {
  if (!safeStorage.isEncryptionAvailable()) {
    logger.warn('[Store] OS encryption is unavailable; keeping electron-store plaintext for this launch.');
    return null;
  }

  fs.mkdirSync(userDataPath, { recursive: true });
  const keyPath = path.join(userDataPath, KEY_FILE_NAME);

  if (fs.existsSync(keyPath)) {
    try {
      const encryptedKey = Buffer.from(fs.readFileSync(keyPath, 'utf8'), 'base64');
      return Buffer.from(safeStorage.decryptString(encryptedKey), 'base64');
    } catch {
      logger.warn('[Store] Could not decrypt the existing store encryption key; keeping electron-store plaintext for this launch.');
      return null;
    }
  }

  const key = crypto.randomBytes(32);
  const encryptedKey = safeStorage.encryptString(key.toString('base64'));
  fs.writeFileSync(keyPath, encryptedKey.toString('base64'), { mode: 0o600 });
  return key;
}

export function createSecureStore<T extends object>({
  Store,
  options,
  safeStorage,
  userDataPath,
  logger = noopLogger,
}: CreateSecureStoreParams<T>) {
  const configPath = getConfigPath(userDataPath, options);
  const encryptionKey = getOrCreateEncryptionKey(userDataPath, safeStorage, logger);
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

  return store;
}
