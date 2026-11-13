import type { StateStorage } from 'zustand/middleware';

/**
 * IndexedDB-backed persistence for the app store (#J3).
 *
 * localStorage caps an origin at roughly 5 MB and throws QuotaExceededError
 * once projects, timeline clips, reference sets and the asset library outgrow
 * it - after which every later write failed silently. IndexedDB has a quota
 * measured in a share of the disk, and stores the same JSON string.
 *
 * Kept dependency-free: a two-method key/value wrapper over the raw IDB API,
 * plus a StateStorage that migrates the legacy localStorage copy on first read.
 */

export interface KeyValueBackend {
  get: (key: string) => Promise<string | null>;
  set: (key: string, value: string) => Promise<void>;
  remove: (key: string) => Promise<void>;
}

export const PERSIST_DB_NAME = 'vision-studio';
export const PERSIST_DB_VERSION = 1;
export const PERSIST_OBJECT_STORE = 'persist';

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed'));
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted'));
  });
}

/**
 * A key/value store over one IndexedDB object store. The connection is opened
 * lazily and reused; a connection the browser closes (version change, storage
 * eviction) is reopened on the next call.
 */
export function createIndexedDbBackend(
  factory: IDBFactory,
  dbName: string = PERSIST_DB_NAME,
  storeName: string = PERSIST_OBJECT_STORE,
): KeyValueBackend {
  let connection: Promise<IDBDatabase> | null = null;

  const open = (): Promise<IDBDatabase> => {
    if (connection) return connection;
    connection = new Promise<IDBDatabase>((resolve, reject) => {
      const request = factory.open(dbName, PERSIST_DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(storeName)) {
          db.createObjectStore(storeName);
        }
      };
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => {
          db.close();
          connection = null;
        };
        db.onclose = () => {
          connection = null;
        };
        resolve(db);
      };
      request.onerror = () => reject(request.error ?? new Error('Could not open IndexedDB'));
      request.onblocked = () => reject(new Error('IndexedDB open was blocked by another connection'));
    }).catch((error) => {
      connection = null;
      throw error;
    });
    return connection;
  };

  const run = async <T>(
    mode: IDBTransactionMode,
    action: (store: IDBObjectStore) => IDBRequest<T>,
  ): Promise<T> => {
    const db = await open();
    const transaction = db.transaction(storeName, mode);
    const done = transactionDone(transaction);
    const result = requestToPromise(action(transaction.objectStore(storeName)));
    // Commit now rather than when the event loop next idles: a write issued
    // from pagehide must reach disk before the renderer goes away.
    if (mode === 'readwrite' && typeof transaction.commit === 'function') {
      transaction.commit();
    }
    const [value] = await Promise.all([result, done]);
    return value;
  };

  return {
    get: async (key) => {
      const value = await run<unknown>('readonly', (store) => store.get(key));
      return typeof value === 'string' ? value : null;
    },
    set: async (key, value) => {
      await run('readwrite', (store) => store.put(value, key));
    },
    remove: async (key) => {
      await run('readwrite', (store) => store.delete(key));
    },
  };
}

/**
 * A zustand StateStorage over `backend` that moves the legacy localStorage
 * copy across on first read: when IndexedDB has no value for a key but
 * `legacy` does, the legacy value is written to IndexedDB, removed from
 * `legacy` only once that write succeeded, and returned. If IndexedDB cannot
 * be read at all, the legacy value is returned so the session still starts
 * with the user's data.
 */
export function createMigratingStateStorage({
  backend,
  legacy,
}: {
  backend: KeyValueBackend;
  legacy: StateStorage | null;
}): StateStorage {
  const readLegacy = (name: string): string | null => {
    try {
      const raw = legacy?.getItem(name);
      return typeof raw === 'string' ? raw : null;
    } catch {
      return null;
    }
  };

  return {
    getItem: async (name) => {
      let stored: string | null;
      try {
        stored = await backend.get(name);
      } catch (error) {
        console.warn('[persist] IndexedDB read failed; using the localStorage copy', error);
        return readLegacy(name);
      }
      if (stored !== null) return stored;

      const legacyValue = readLegacy(name);
      if (legacyValue === null) return null;
      try {
        await backend.set(name, legacyValue);
        try {
          await legacy?.removeItem(name);
        } catch {
          // The IndexedDB copy is authoritative from here; a stale legacy copy
          // is only read again if IndexedDB is later empty.
        }
      } catch (error) {
        console.warn('[persist] could not migrate localStorage state to IndexedDB', error);
      }
      return legacyValue;
    },
    setItem: (name, value) => backend.set(name, value),
    removeItem: (name) => backend.remove(name),
  };
}

/** The browser's IndexedDB factory, or null where there is none (node, jsdom). */
export function resolveIndexedDbFactory(): IDBFactory | null {
  try {
    return typeof indexedDB !== 'undefined' && indexedDB ? indexedDB : null;
  } catch {
    return null;
  }
}
