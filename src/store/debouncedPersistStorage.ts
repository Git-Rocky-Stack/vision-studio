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
 */
export interface DebouncedPersistStorage<S> extends PersistStorage<S, void> {
  /** Write every pending value now. */
  flush: () => void;
  /** True while a value is waiting to be written. */
  hasPending: () => boolean;
}

export const DEFAULT_PERSIST_DEBOUNCE_MS = 400;

export function createDebouncedJSONStorage<S>(
  getStorage: () => StateStorage,
  delayMs: number = DEFAULT_PERSIST_DEBOUNCE_MS,
): DebouncedPersistStorage<S> {
  const pending = new Map<string, StorageValue<S>>();
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

  const flush = () => {
    clearTimer();
    if (pending.size === 0) return;
    const storage = resolveStorage();
    const entries = Array.from(pending.entries());
    pending.clear();
    if (!storage) return;
    for (const [name, value] of entries) {
      try {
        void storage.setItem(name, JSON.stringify(value));
      } catch (error) {
        // Quota exceeded or storage denied: keep the app running, as the
        // synchronous JSON storage would have thrown into the caller's set().
        console.warn('[persist] failed to write state', error);
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
      if (raw instanceof Promise) return raw.then(parse);
      return parse(raw);
    },
    setItem: (name, value) => {
      pending.set(name, value);
      schedule();
    },
    removeItem: (name) => {
      pending.delete(name);
      if (pending.size === 0) clearTimer();
      const storage = resolveStorage();
      if (storage) void storage.removeItem(name);
    },
    flush,
    hasPending: () => pending.size > 0,
  };
}
