import { describe, expect, it, vi } from 'vitest';
import type { StateStorage } from 'zustand/middleware';

import {
  createIndexedDbBackend,
  createMigratingStateStorage,
  type KeyValueBackend,
} from './indexedDbStorage';

/**
 * A minimal in-memory IDBFactory: enough of open / transaction / objectStore
 * get-put-delete, with the async success callbacks the real API fires.
 */
function createFakeIndexedDb(options: { failPut?: () => boolean } = {}) {
  const stores = new Map<string, Map<string, unknown>>();
  let opens = 0;

  const request = <T>(run: () => T, fail = false) => {
    const req: Partial<IDBRequest<T>> & { result?: T; error?: DOMException | null } = { error: null };
    queueMicrotask(() => {
      if (fail) {
        req.error = new DOMException('Quota exceeded', 'QuotaExceededError');
        (req.onerror as ((e: Event) => void) | null)?.(new Event('error'));
        return;
      }
      req.result = run();
      (req.onsuccess as ((e: Event) => void) | null)?.(new Event('success'));
    });
    return req as IDBRequest<T>;
  };

  const db = {
    objectStoreNames: { contains: (name: string) => stores.has(name) },
    createObjectStore: (name: string) => {
      stores.set(name, new Map());
    },
    transaction: (name: string) => {
      const tx: Partial<IDBTransaction> & { error: DOMException | null } = { error: null };
      let failed = false;
      const finish = () =>
        queueMicrotask(() =>
          queueMicrotask(() => {
            if (failed) {
              tx.error = new DOMException('Quota exceeded', 'QuotaExceededError');
              (tx.onerror as ((e: Event) => void) | null)?.(new Event('error'));
            } else {
              (tx.oncomplete as ((e: Event) => void) | null)?.(new Event('complete'));
            }
          }),
        );
      const data = stores.get(name)!;
      tx.objectStore = (() => ({
        get: (key: string) => {
          finish();
          return request(() => data.get(key));
        },
        put: (value: unknown, key: string) => {
          failed = options.failPut?.() ?? false;
          finish();
          return request(() => {
            data.set(key, value);
            return key;
          }, failed);
        },
        delete: (key: string) => {
          finish();
          return request(() => {
            data.delete(key);
            return undefined;
          });
        },
      })) as unknown as IDBTransaction['objectStore'];
      tx.commit = vi.fn();
      return tx as IDBTransaction;
    },
  };

  const factory = {
    open: () => {
      opens += 1;
      const req: Record<string, unknown> = { result: db };
      queueMicrotask(() => {
        if (!stores.size) (req.onupgradeneeded as (() => void) | undefined)?.();
        (req.onsuccess as (() => void) | undefined)?.();
      });
      return req as unknown as IDBOpenDBRequest;
    },
  } as unknown as IDBFactory;

  return { factory, stores, opens: () => opens };
}

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    storage: {
      getItem: vi.fn((name: string) => data.get(name) ?? null),
      setItem: vi.fn((name: string, value: string) => {
        data.set(name, value);
      }),
      removeItem: vi.fn((name: string) => {
        data.delete(name);
      }),
    } satisfies StateStorage,
  };
}

describe('createIndexedDbBackend (#J3)', () => {
  it('round-trips values through one reused connection', async () => {
    const fake = createFakeIndexedDb();
    const backend = createIndexedDbBackend(fake.factory);

    expect(await backend.get('key')).toBeNull();
    await backend.set('key', '{"n":1}');
    expect(await backend.get('key')).toBe('{"n":1}');
    await backend.remove('key');
    expect(await backend.get('key')).toBeNull();
    expect(fake.opens()).toBe(1);
  });

  it('rejects a failed write so the caller can report it', async () => {
    const fake = createFakeIndexedDb({ failPut: () => true });
    const backend = createIndexedDbBackend(fake.factory);
    await expect(backend.set('key', 'value')).rejects.toMatchObject({ name: 'QuotaExceededError' });
  });
});

describe('createMigratingStateStorage (#J3)', () => {
  it('moves the legacy localStorage copy into IndexedDB once, then reads IndexedDB', async () => {
    const fake = createFakeIndexedDb();
    const legacy = memoryStorage({ 'vision-studio-storage': '{"state":{"n":7},"version":0}' });
    const storage = createMigratingStateStorage({ backend: createIndexedDbBackend(fake.factory), legacy: legacy.storage });

    expect(await storage.getItem('vision-studio-storage')).toBe('{"state":{"n":7},"version":0}');
    expect(legacy.data.has('vision-studio-storage')).toBe(false);
    expect(fake.stores.get('persist')?.get('vision-studio-storage')).toBe('{"state":{"n":7},"version":0}');

    legacy.storage.getItem.mockClear();
    expect(await storage.getItem('vision-studio-storage')).toBe('{"state":{"n":7},"version":0}');
    expect(legacy.storage.getItem).not.toHaveBeenCalled();
  });

  it('keeps the legacy copy when the migration write fails', async () => {
    const fake = createFakeIndexedDb({ failPut: () => true });
    const legacy = memoryStorage({ key: 'legacy' });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const storage = createMigratingStateStorage({ backend: createIndexedDbBackend(fake.factory), legacy: legacy.storage });

    expect(await storage.getItem('key')).toBe('legacy');
    expect(legacy.data.get('key')).toBe('legacy');
    warn.mockRestore();
  });

  it('falls back to the legacy copy when IndexedDB cannot be read', async () => {
    const backend: KeyValueBackend = {
      get: vi.fn().mockRejectedValue(new Error('IDB broken')),
      set: vi.fn(),
      remove: vi.fn(),
    };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const storage = createMigratingStateStorage({ backend, legacy: memoryStorage({ key: 'legacy' }).storage });
    expect(await storage.getItem('key')).toBe('legacy');
    warn.mockRestore();
  });

  it('returns null on a first run with nothing stored anywhere', async () => {
    const storage = createMigratingStateStorage({
      backend: createIndexedDbBackend(createFakeIndexedDb().factory),
      legacy: memoryStorage().storage,
    });
    expect(await storage.getItem('key')).toBeNull();
  });
});
