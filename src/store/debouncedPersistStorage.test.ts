// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StateStorage } from 'zustand/middleware';
import { createDebouncedJSONStorage } from './debouncedPersistStorage';

function createSpyStorage() {
  const data = new Map<string, string>();
  const storage = {
    getItem: vi.fn((name: string) => data.get(name) ?? null),
    setItem: vi.fn((name: string, value: string) => {
      data.set(name, value);
    }),
    removeItem: vi.fn((name: string) => {
      data.delete(name);
    }),
  } satisfies StateStorage;
  return { data, storage };
}

describe('createDebouncedJSONStorage', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('coalesces a burst of writes into one setItem after the debounce', () => {
    const { storage, data } = createSpyStorage();
    const persist = createDebouncedJSONStorage<{ n: number }>(() => storage, 400);

    for (let n = 0; n < 50; n++) {
      persist.setItem('key', { state: { n }, version: 0 });
    }
    expect(storage.setItem).not.toHaveBeenCalled();

    vi.advanceTimersByTime(399);
    expect(storage.setItem).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(storage.setItem).toHaveBeenCalledTimes(1);
    expect(JSON.parse(data.get('key') ?? 'null')).toEqual({ state: { n: 49 }, version: 0 });
  });

  it('returns the pending value from getItem before it is written', () => {
    const { storage } = createSpyStorage();
    const persist = createDebouncedJSONStorage<{ n: number }>(() => storage, 400);

    persist.setItem('key', { state: { n: 7 }, version: 1 });
    expect(persist.getItem('key')).toEqual({ state: { n: 7 }, version: 1 });
    expect(storage.getItem).not.toHaveBeenCalled();
  });

  it('parses what is already stored when nothing is pending', () => {
    const { storage, data } = createSpyStorage();
    data.set('key', JSON.stringify({ state: { n: 3 }, version: 2 }));
    const persist = createDebouncedJSONStorage<{ n: number }>(() => storage, 400);

    expect(persist.getItem('key')).toEqual({ state: { n: 3 }, version: 2 });
    expect(persist.getItem('missing')).toBeNull();
  });

  it('flush writes immediately and clears the pending timer', () => {
    const { storage } = createSpyStorage();
    const persist = createDebouncedJSONStorage<{ n: number }>(() => storage, 400);

    persist.setItem('key', { state: { n: 1 }, version: 0 });
    expect(persist.hasPending()).toBe(true);
    persist.flush();
    expect(storage.setItem).toHaveBeenCalledTimes(1);
    expect(persist.hasPending()).toBe(false);

    vi.advanceTimersByTime(1000);
    expect(storage.setItem).toHaveBeenCalledTimes(1);
  });

  it('flushes when the document is hidden and on pagehide', () => {
    const { storage } = createSpyStorage();
    const persist = createDebouncedJSONStorage<{ n: number }>(() => storage, 400);

    persist.setItem('key', { state: { n: 1 }, version: 0 });
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    visibility.mockRestore();
    expect(storage.setItem).toHaveBeenCalledTimes(1);

    persist.setItem('key', { state: { n: 2 }, version: 0 });
    window.dispatchEvent(new Event('pagehide'));
    expect(storage.setItem).toHaveBeenCalledTimes(2);
  });

  it('removeItem drops a pending write and removes the stored value', () => {
    const { storage, data } = createSpyStorage();
    data.set('key', '{}');
    const persist = createDebouncedJSONStorage<{ n: number }>(() => storage, 400);

    persist.setItem('key', { state: { n: 1 }, version: 0 });
    persist.removeItem('key');
    vi.advanceTimersByTime(1000);

    expect(storage.setItem).not.toHaveBeenCalled();
    expect(data.has('key')).toBe(false);
  });
});
