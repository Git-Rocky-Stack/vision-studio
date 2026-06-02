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

function createSafeStorage(available = true) {
  return {
    isEncryptionAvailable: () => available,
    encryptString: (plainText: string) => Buffer.from(`safe:${plainText}`, 'utf8'),
    decryptString: (encrypted: Buffer) => encrypted.toString('utf8').replace(/^safe:/, ''),
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
  it('creates a safeStorage-protected encryption key and passes it to electron-store', () => {
    const userDataPath = createTempUserData();
    const { FakeStore, instances } = createFakeStore(userDataPath);

    createSecureStore({
      Store: FakeStore,
      safeStorage: createSafeStorage(),
      userDataPath,
      options: { defaults: { firstRun: true } },
    });

    expect(instances[0].options.encryptionKey).toBeInstanceOf(Buffer);
    expect(fs.existsSync(path.join(userDataPath, 'store-encryption-key'))).toBe(true);
  });

  it('backs up plaintext config before forcing an encrypted rewrite', () => {
    const userDataPath = createTempUserData();
    const configPath = path.join(userDataPath, 'config.json');
    fs.writeFileSync(configPath, JSON.stringify({ firstRun: false }));
    const { FakeStore, instances } = createFakeStore(userDataPath);

    createSecureStore({
      Store: FakeStore,
      safeStorage: createSafeStorage(),
      userDataPath,
      options: { defaults: { firstRun: true } },
    });

    const backupFiles = fs.readdirSync(userDataPath).filter((file) => file.startsWith('config.json.plaintext-backup-'));
    expect(backupFiles).toHaveLength(1);
    expect(fs.readFileSync(path.join(userDataPath, backupFiles[0]), 'utf8')).toBe('{"firstRun":false}');
    expect(instances[0].rewrites).toBe(1);
    expect(fs.readFileSync(configPath, 'utf8')).toBe('encrypted-store');
  });

  it('falls back to plaintext without rewriting when OS encryption is unavailable', () => {
    const userDataPath = createTempUserData();
    const configPath = path.join(userDataPath, 'config.json');
    fs.writeFileSync(configPath, JSON.stringify({ firstRun: false }));
    const { FakeStore, instances } = createFakeStore(userDataPath);

    createSecureStore({
      Store: FakeStore,
      safeStorage: createSafeStorage(false),
      userDataPath,
      options: { defaults: { firstRun: true } },
    });

    expect(instances[0].options.encryptionKey).toBeUndefined();
    expect(instances[0].rewrites).toBe(0);
    expect(fs.readFileSync(configPath, 'utf8')).toBe('{"firstRun":false}');
  });

  it('falls back to plaintext if backup cannot be created', () => {
    const userDataPath = createTempUserData();
    const configPath = path.join(userDataPath, 'config.json');
    fs.writeFileSync(configPath, JSON.stringify({ firstRun: false }));
    const { FakeStore, instances } = createFakeStore(userDataPath);
    const copyFileSync = vi.spyOn(fs, 'copyFileSync').mockImplementationOnce(() => {
      throw new Error('disk full');
    });

    try {
      createSecureStore({
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
});
