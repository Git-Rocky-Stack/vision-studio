import type { PersistStorage, StateStorage, StorageValue } from 'zustand/middleware';

/**
 * A zustand PersistStorage that coalesces writes.
 *
 * createJSONStorage stringifies the whole partialized state and calls
 * localStorage.setItem synchronously on every set(). With projects, timeline
 * clips, the asset library and the iteration graph in that payload, a drag or
 * a progress tick paid for a multi-hundred-kilobyte JSON.stringify per frame.
 *
 * This keeps only the latest value per key and writes it once, `delayMs` after
 * the last set. Pending writes are flushed when the page is hidden or unloaded
 * so a quit never loses the final state. getItem reads a pending value first,
 * so a read straight after a write sees what was written.
 *
 * Three further guarantees (#J3/#J4):
 * - A set whose partialized state is the very object last handed over (the
 *   store's partialize is memoized, so a playhead tick or a progress update
 *   that touches nothing persisted returns the previous object) schedules
 *   nothing at all.
 * - While an asynchronous getItem (IndexedDB hydration) is in flight, writes
 *   for that key are dropped: they carry pre-hydration defaults, and the
 *   pending value would otherwise be served back as the "stored" state.
 * - A failed write (quota, storage denied, IndexedDB error) is reported to
 *   `onWriteError` instead of only reaching the console; the next successful
 *   write reports `onWriteRecovered`.
 */
export interface DebouncedPersistStorage<S> extends PersistStorage<S, void> {
  /** Write every pending value now. */
  flush: () => void;
  /** True while a value is waiting to be written. */
  hasPending: () => boolean;
}

export interface DebouncedPersistStorageOptions {
  delayMs?: number;
  /** Called once per failed write with the key and the error. */
  onWriteError?: (name: string, error: unknown) => void;
  /** Called after a successful write that followed a failed one. */
  onWriteRecovered?: (name: string) => void;
}

export const DEFAULT_PERSIST_DEBOUNCE_MS = 400;

export function createDebouncedJSONStorage<S>(
  getStorage: () => StateStorage,
  delayOrOptions: number | DebouncedPersistStorageOptions = DEFAULT_PERSIST_DEBOUNCE_MS,
): DebouncedPersistStorage<S> {
  const options: DebouncedPersistStorageOptions =
    typeof delayOrOptions === 'number' ? { delayMs: delayOrOptions } : delayOrOptions;
  const delayMs = options.delayMs ?? DEFAULT_PERSIST_DEBOUNCE_MS;
  const pending = new Map<string, StorageValue<S>>();
  /** The last value handed over per key (pending or written), by reference. */
  const lastAccepted = new Map<string, StorageValue<S>>();
  /** Keys whose asynchronous getItem has not settled yet. */
  const loading = new Set<string>();
  /** Keys whose most recent write failed. */
  const failing = new Set<string>();
  let timer: ReturnType<typeof setTimeout> | null = null;

  const resolveStorage = (): StateStorage | null => {
    try {
      return getStorage();
    } catch {
      return null;
    }
  };

  const clearTimer = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const reportFailure = (name: string, error: unknown) => {
    console.warn('[persist] failed to write state', error);
    failing.add(name);
    options.onWriteError?.(name, error);
  };

  const reportSuccess = (name: string) => {
    if (failing.delete(name)) options.onWriteRecovered?.(name);
  };

  const flush = () => {
    clearTimer();
    if (pending.size === 0) return;
    const storage = resolveStorage();
    const entries = Array.from(pending.entries());
    pending.clear();
    if (!storage) return;
    for (const [name, value] of entries) {
      try {
        const result = storage.setItem(name, JSON.stringify(value));
        if (result instanceof Promise) {
          result.then(
            () => reportSuccess(name),
            (error: unknown) => reportFailure(name, error),
          );
        } else {
          reportSuccess(name);
        }
      } catch (error) {
        // Quota exceeded or storage denied: keep the app running, as the
        // synchronous JSON storage would have thrown into the caller's set().
        reportFailure(name, error);
      }
    }
  };

  const schedule = () => {
    clearTimer();
    timer = setTimeout(flush, delayMs);
  };

  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('pagehide', flush);
    window.addEventListener('beforeunload', flush);
  }
  if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flush();
    });
  }

  return {
    getItem: (name) => {
      const queued = pending.get(name);
      if (queued) return queued;
      const storage = resolveStorage();
      if (!storage) return null;
      const parse = (raw: string | null): StorageValue<S> | null =>
        raw === null ? null : (JSON.parse(raw) as StorageValue<S>);
      const raw = storage.getItem(name);
      if (isThenable(raw)) {
        // zustand's StateStorage may hand back any PromiseLike (IndexedDB,
        // custom adapters), not only native Promises: normalise before
        // chaining so `.finally` always exists.
        loading.add(name);
        return Promise.resolve(raw)
          .then(parse)
          .finally(() => {
            loading.delete(name);
          });
      }
      return parse(raw);
    },
    setItem: (name, value) => {
      if (loading.has(name)) return;
      const previous = lastAccepted.get(name);
      if (previous && previous.state === value.state && previous.version === value.version) return;
      lastAccepted.set(name, value);
      pending.set(name, value);
      schedule();
    },
    removeItem: (name) => {
      pending.delete(name);
      lastAccepted.delete(name);
      if (pending.size === 0) clearTimer();
      const storage = resolveStorage();
      if (!storage) return;
      try {
        const result = storage.removeItem(name);
        if (result instanceof Promise) {
          result.catch((error: unknown) => console.warn('[persist] failed to remove state', error));
        }
      } catch (error) {
        console.warn('[persist] failed to remove state', error);
      }
    },
    flush,
    hasPending: () => pending.size > 0,
  };
}

function isThenable<T>(value: T | PromiseLike<T>): value is PromiseLike<T> {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { then?: unknown }).then === 'function'
  );
}
