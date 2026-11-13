import { describe, expect, it, vi } from 'vitest';

import {
  createSerialQueue,
  decryptFromBase64,
  encryptToBase64,
  isAsyncEncryptionAvailable,
} from './asyncSafeStorage';

function createSafeStorage() {
  return {
    isAsyncEncryptionAvailable: vi.fn(async () => true),
    encryptStringAsync: vi.fn(async (plainText: string) => Buffer.from(`enc:${plainText}`, 'utf8')),
    decryptStringAsync: vi.fn(async (encrypted: Buffer) => ({
      result: encrypted.toString('utf8').replace(/^enc:/, ''),
      shouldReEncrypt: false,
    })),
  };
}

describe('createSerialQueue', () => {
  it('runs tasks one at a time, in call order, even when earlier ones are slower', async () => {
    const serialize = createSerialQueue();
    const events: string[] = [];
    const task = (name: string, delayMs: number) => async () => {
      events.push(`start ${name}`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      events.push(`end ${name}`);
      return name;
    };

    const results = await Promise.all([serialize(task('a', 20)), serialize(task('b', 0)), serialize(task('c', 5))]);

    expect(results).toEqual(['a', 'b', 'c']);
    expect(events).toEqual(['start a', 'end a', 'start b', 'end b', 'start c', 'end c']);
  });

  it('prevents the lost update a bare read-await-write would cause', async () => {
    const serialize = createSerialQueue();
    let stored: string[] = [];
    const append = (value: string) =>
      serialize(async () => {
        const snapshot = [...stored];
        await new Promise((resolve) => setTimeout(resolve, value === 'first' ? 10 : 0));
        stored = [...snapshot, value];
      });

    await Promise.all([append('first'), append('second')]);

    expect(stored).toEqual(['first', 'second']);
  });

  it('rejects only the failing caller and keeps serving the queue', async () => {
    const serialize = createSerialQueue();

    const failing = serialize(() => {
      throw new Error('boom');
    });
    const next = serialize(() => 'still running');

    await expect(failing).rejects.toThrow('boom');
    await expect(next).resolves.toBe('still running');
  });

  it('keeps separate queues independent', async () => {
    const first = createSerialQueue();
    const second = createSerialQueue();
    let release!: () => void;
    const blocked = first(() => new Promise<void>((resolve) => (release = resolve)));

    await expect(second(() => 'not blocked')).resolves.toBe('not blocked');
    release();
    await blocked;
  });
});

describe('safeStorage helpers', () => {
  it('round-trips through base64 and reports shouldReEncrypt as a boolean', async () => {
    const safeStorage = createSafeStorage();

    const encoded = await encryptToBase64(safeStorage, 'secret');

    expect(Buffer.from(encoded, 'base64').toString('utf8')).toBe('enc:secret');
    await expect(decryptFromBase64(safeStorage, encoded)).resolves.toEqual({ result: 'secret', shouldReEncrypt: false });
  });

  it('treats a rejected or non-true availability probe as unavailable', async () => {
    const safeStorage = createSafeStorage();
    await expect(isAsyncEncryptionAvailable(safeStorage)).resolves.toBe(true);

    safeStorage.isAsyncEncryptionAvailable.mockRejectedValueOnce(new Error('no keyring'));
    await expect(isAsyncEncryptionAvailable(safeStorage)).resolves.toBe(false);

    safeStorage.isAsyncEncryptionAvailable.mockResolvedValueOnce(false);
    await expect(isAsyncEncryptionAvailable(safeStorage)).resolves.toBe(false);
  });
});
