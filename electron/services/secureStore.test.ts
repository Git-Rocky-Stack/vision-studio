import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSecureStore } from './secureStore';

type StoreOptions = {
  defaults?: Record<string, unknown>;
  encryptionKey?: Buffer;
  name?: string;
};

const tmpDirs: string[] = [];

function createTempUserData() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vision-store-'));
  tmpDirs.push(dir);
  return dir;
}

function createSafeStorage(available = true, { shouldReEncrypt = false } = {}) {
  return {
    isAsyncEncryptionAvailable: vi.fn(async () => available),
    encryptStringAsync: vi.fn(async (plainText: string) => Buffer.from(`safe:${plainText}`, 'utf8')),
    decryptStringAsync: vi.fn(async (encrypted: Buffer) => ({
      result: encrypted.toString('utf8').replace(/^safe:/, ''),
      shouldReEncrypt,
    })),
  };
}

function createFakeStore(userDataPath: string) {
  const instances: Array<{
    options: StoreOptions;
    rewrites: number;
  }> = [];

  class FakeStore {
    options: StoreOptions;
    path: string;
    private currentStore: Record<string, unknown>;
    rewrites = 0;

    constructor(options: StoreOptions) {
      this.options = options;
      this.path = path.join(userDataPath, `${options.name ?? 'config'}.json`);
      this.currentStore = { ...(options.defaults ?? {}) };
      instances.push(this);
    }

    get store() {
      return this.currentStore;
    }

    set store(value: Record<string, unknown>) {
      this.rewrites += 1;
      this.currentStore = value;
      fs.writeFileSync(
        this.path,
        this.options.encryptionKey ? Buffer.from('encrypted-store') : JSON.stringify(value)
      );
    }

    get(key: string): unknown {
      return this.currentStore[key];
    }

    set(key: string, value: unknown): void {
      this.currentStore[key] = value;
    }

    clear(): void {
      this.currentStore = {};
    }
  }

  return { FakeStore, instances };
}

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('createSecureStore', () => {
  it('creates a safeStorage-protected encryption key and passes it to electron-store', async () => {
    const userDataPath = createTempUserData();
    const { FakeStore, instances } = createFakeStore(userDataPath);

    await createSecureStore({
      Store: FakeStore,
      safeStorage: createSafeStorage(),
      userDataPath,
      options: { defaults: { firstRun: true } },
    });

    expect(instances[0].options.encryptionKey).toBeInstanceOf(Buffer);
    expect(fs.existsSync(path.join(userDataPath, 'store-encryption-key'))).toBe(true);
  });

  const backupsIn = (dir: string) =>
    fs.readdirSync(dir).filter((file) => file.startsWith('config.json.plaintext-backup-'));

  it('backs up plaintext config before the encrypted rewrite, then removes the backup once verified', async () => {
    const userDataPath = createTempUserData();
    const configPath = path.join(userDataPath, 'config.json');
    fs.writeFileSync(configPath, JSON.stringify({ firstRun: false }));
    const { FakeStore, instances } = createFakeStore(userDataPath);
    const backupsAtRewrite: string[] = [];
    const descriptor = Object.getOwnPropertyDescriptor(FakeStore.prototype, 'store')!;
    Object.defineProperty(FakeStore.prototype, 'store', {
      ...descriptor,
      set(value: Record<string, unknown>) {
        for (const file of backupsIn(userDataPath)) {
          backupsAtRewrite.push(fs.readFileSync(path.join(userDataPath, file), 'utf8'));
        }
        descriptor.set!.call(this, value);
      },
    });

    await createSecureStore({
      Store: FakeStore,
      safeStorage: createSafeStorage(),
      userDataPath,
      options: { defaults: { firstRun: true } },
    });

    // The backup existed while the rewrite ran...
    expect(backupsAtRewrite).toEqual(['{"firstRun":false}']);
    expect(instances[0].rewrites).toBe(1);
    expect(fs.readFileSync(configPath, 'utf8')).toBe('encrypted-store');
    // ...and the plaintext copy of every secret is gone once the encrypted store reads back.
    expect(backupsIn(userDataPath)).toEqual([]);
  });

  it('removes plaintext backups an earlier launch left behind once the store is encrypted', async () => {
    const userDataPath = createTempUserData();
    fs.writeFileSync(path.join(userDataPath, 'config.json'), Buffer.from('encrypted-store'));
    fs.writeFileSync(path.join(userDataPath, 'config.json.plaintext-backup-1700000000000'), '{"secret":1}');
    fs.writeFileSync(path.join(userDataPath, 'unrelated.json'), '{}');
    const { FakeStore } = createFakeStore(userDataPath);

    await createSecureStore({
      Store: FakeStore,
      safeStorage: createSafeStorage(),
      userDataPath,
      options: { defaults: { firstRun: true } },
    });

    expect(backupsIn(userDataPath)).toEqual([]);
    expect(fs.existsSync(path.join(userDataPath, 'unrelated.json'))).toBe(true);
  });

  it('keeps the backups when the encrypted store cannot be read back', async () => {
    const userDataPath = createTempUserData();
    fs.writeFileSync(path.join(userDataPath, 'config.json'), Buffer.from('encrypted-store'));
    fs.writeFileSync(path.join(userDataPath, 'config.json.plaintext-backup-1700000000000'), '{"secret":1}');
    const { FakeStore } = createFakeStore(userDataPath);
    Object.defineProperty(FakeStore.prototype, 'store', {
      configurable: true,
      get() {
        throw new SyntaxError('Unexpected token in JSON');
      },
    });

    await createSecureStore({
      Store: FakeStore,
      safeStorage: createSafeStorage(),
      userDataPath,
      options: { defaults: { firstRun: true } },
    });

    expect(backupsIn(userDataPath)).toHaveLength(1);
  });

  it('keeps the backups while OS encryption is unavailable', async () => {
    const userDataPath = createTempUserData();
    fs.writeFileSync(path.join(userDataPath, 'config.json'), JSON.stringify({ firstRun: false }));
    fs.writeFileSync(path.join(userDataPath, 'config.json.plaintext-backup-1700000000000'), '{"secret":1}');
    const { FakeStore } = createFakeStore(userDataPath);

    await createSecureStore({
      Store: FakeStore,
      safeStorage: createSafeStorage(false),
      userDataPath,
      options: { defaults: { firstRun: true } },
    });

    expect(backupsIn(userDataPath)).toHaveLength(1);
  });

  it('falls back to plaintext without rewriting when OS encryption is unavailable', async () => {
    const userDataPath = createTempUserData();
    const configPath = path.join(userDataPath, 'config.json');
    fs.writeFileSync(configPath, JSON.stringify({ firstRun: false }));
    const { FakeStore, instances } = createFakeStore(userDataPath);

    await createSecureStore({
      Store: FakeStore,
      safeStorage: createSafeStorage(false),
      userDataPath,
      options: { defaults: { firstRun: true } },
    });

    expect(instances[0].options.encryptionKey).toBeUndefined();
    expect(instances[0].rewrites).toBe(0);
    expect(fs.readFileSync(configPath, 'utf8')).toBe('{"firstRun":false}');
  });

  it('falls back to plaintext if backup cannot be created', async () => {
    const userDataPath = createTempUserData();
    const configPath = path.join(userDataPath, 'config.json');
    fs.writeFileSync(configPath, JSON.stringify({ firstRun: false }));
    const { FakeStore, instances } = createFakeStore(userDataPath);
    const copyFileSync = vi.spyOn(fs, 'copyFileSync').mockImplementationOnce(() => {
      throw new Error('disk full');
    });

    try {
      await createSecureStore({
        Store: FakeStore,
        safeStorage: createSafeStorage(),
        userDataPath,
        options: { defaults: { firstRun: true } },
      });
    } finally {
      copyFileSync.mockRestore();
    }

    expect(instances[0].options.encryptionKey).toBeUndefined();
    expect(instances[0].rewrites).toBe(0);
    expect(fs.readFileSync(configPath, 'utf8')).toBe('{"firstRun":false}');
  });
  describe('async safeStorage (Electron 45+)', () => {
    const keyPathIn = (dir: string) => path.join(dir, 'store-encryption-key');

    it('reads back a key the deprecated sync encryptString wrote, with the same bytes', async () => {
      const userDataPath = createTempUserData();
      const key = Buffer.alloc(32, 7);
      // Same on-disk format the sync API produced: base64 of the encrypted base64 key.
      fs.writeFileSync(keyPathIn(userDataPath), Buffer.from(`safe:${key.toString('base64')}`).toString('base64'));
      const { FakeStore, instances } = createFakeStore(userDataPath);

      await createSecureStore({ Store: FakeStore, safeStorage: createSafeStorage(), userDataPath, options: {} });

      expect(instances[0].options.encryptionKey).toEqual(key);
    });

    it('re-encrypts and persists the store key when the OS asks for it, keeping the same key', async () => {
      const userDataPath = createTempUserData();
      const key = Buffer.alloc(32, 9);
      fs.writeFileSync(keyPathIn(userDataPath), Buffer.from(`legacy:${key.toString('base64')}`).toString('base64'));
      const safeStorage = {
        isAsyncEncryptionAvailable: vi.fn(async () => true),
        encryptStringAsync: vi.fn(async (plainText: string) => Buffer.from(`safe:${plainText}`, 'utf8')),
        decryptStringAsync: vi.fn(async (encrypted: Buffer) => {
          const text = encrypted.toString('utf8');
          return { result: text.replace(/^(legacy|safe):/, ''), shouldReEncrypt: text.startsWith('legacy:') };
        }),
      };
      const { FakeStore, instances } = createFakeStore(userDataPath);

      await createSecureStore({ Store: FakeStore, safeStorage, userDataPath, options: {} });

      expect(instances[0].options.encryptionKey).toEqual(key);
      expect(safeStorage.encryptStringAsync).toHaveBeenCalledWith(key.toString('base64'));
      expect(Buffer.from(fs.readFileSync(keyPathIn(userDataPath), 'utf8'), 'base64').toString('utf8')).toBe(
        `safe:${key.toString('base64')}`,
      );
      // No temp file is left beside the key.
      expect(fs.readdirSync(userDataPath).filter((file) => file.includes('.tmp-'))).toEqual([]);
    });

    it('keeps using the key for this launch when re-encrypting it fails', async () => {
      const userDataPath = createTempUserData();
      const key = Buffer.alloc(32, 3);
      const original = Buffer.from(`safe:${key.toString('base64')}`).toString('base64');
      fs.writeFileSync(keyPathIn(userDataPath), original);
      const safeStorage = createSafeStorage(true, { shouldReEncrypt: true });
      safeStorage.encryptStringAsync.mockRejectedValueOnce(new Error('keychain locked'));
      const logger = { warn: vi.fn() };
      const { FakeStore, instances } = createFakeStore(userDataPath);

      await createSecureStore({ Store: FakeStore, safeStorage, userDataPath, logger, options: {} });

      expect(instances[0].options.encryptionKey).toEqual(key);
      expect(fs.readFileSync(keyPathIn(userDataPath), 'utf8')).toBe(original);
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Could not re-encrypt'));
    });

    it('does not rewrite the key file when no re-encryption is requested', async () => {
      const userDataPath = createTempUserData();
      const { FakeStore } = createFakeStore(userDataPath);
      const safeStorage = createSafeStorage();
      await createSecureStore({ Store: FakeStore, safeStorage, userDataPath, options: {} });
      safeStorage.encryptStringAsync.mockClear();

      await createSecureStore({ Store: FakeStore, safeStorage, userDataPath, options: {} });

      expect(safeStorage.decryptStringAsync).toHaveBeenCalledTimes(1);
      expect(safeStorage.encryptStringAsync).not.toHaveBeenCalled();
    });

    it('stays plaintext when the availability probe rejects', async () => {
      const userDataPath = createTempUserData();
      const safeStorage = createSafeStorage();
      safeStorage.isAsyncEncryptionAvailable.mockRejectedValueOnce(new Error('no keyring'));
      const { FakeStore, instances } = createFakeStore(userDataPath);

      await createSecureStore({ Store: FakeStore, safeStorage, userDataPath, options: {} });

      expect(instances[0].options.encryptionKey).toBeUndefined();
      expect(fs.existsSync(keyPathIn(userDataPath))).toBe(false);
    });

    it('stays plaintext when the existing key cannot be decrypted', async () => {
      const userDataPath = createTempUserData();
      fs.writeFileSync(keyPathIn(userDataPath), 'garbage');
      const safeStorage = createSafeStorage();
      safeStorage.decryptStringAsync.mockRejectedValueOnce(new Error('bad key'));
      const { FakeStore, instances } = createFakeStore(userDataPath);

      await createSecureStore({ Store: FakeStore, safeStorage, userDataPath, options: {} });

      expect(instances[0].options.encryptionKey).toBeUndefined();
    });
  });
});
