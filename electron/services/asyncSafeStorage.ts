/**
 * The asynchronous safeStorage surface every secret store in the main process
 * uses. Electron 45 deprecates the synchronous isEncryptionAvailable /
 * encryptString / decryptString and Electron 46 removes them; the async
 * versions read data the sync ones wrote, so stored secrets carry over.
 *
 * isAsyncEncryptionAvailable() initialises the async encryptor lazily and is
 * only meaningful after the app's 'ready' event (Windows and Linux report no
 * encryption before it).
 *
 * decryptStringAsync() also reports `shouldReEncrypt` when the OS rotated the
 * key or a stronger one became available. Every store re-encrypts and
 * persists the value when it sees that flag (see reEncrypt helpers in the
 * stores), through its write queue so the rewrite never clobbers a newer
 * value.
 */

/** Structural subset of Electron's SafeStorage (async API only). */
export type AsyncSafeStorageLike = {
  isAsyncEncryptionAvailable: () => Promise<boolean>;
  encryptStringAsync: (plainText: string) => Promise<Buffer>;
  decryptStringAsync: (encrypted: Buffer) => Promise<{ result: string; shouldReEncrypt: boolean }>;
  /** Linux only in Electron; absent elsewhere. */
  getSelectedStorageBackend?: () => string;
};

/** Encrypt with the OS and encode for a JSON store. */
export async function encryptToBase64(safeStorage: AsyncSafeStorageLike, plainText: string): Promise<string> {
  return (await safeStorage.encryptStringAsync(plainText)).toString('base64');
}

/** Decode a value written by encryptToBase64 (or the old sync encryptString) and decrypt it. */
export async function decryptFromBase64(
  safeStorage: AsyncSafeStorageLike,
  encoded: string,
): Promise<{ result: string; shouldReEncrypt: boolean }> {
  const decrypted = await safeStorage.decryptStringAsync(Buffer.from(encoded, 'base64'));
  return { result: decrypted.result, shouldReEncrypt: Boolean(decrypted.shouldReEncrypt) };
}

/**
 * Whether the async encryptor is usable. A rejection (no keyring service, a
 * call before 'ready') counts as unavailable rather than crashing the caller.
 */
export async function isAsyncEncryptionAvailable(
  safeStorage: Pick<AsyncSafeStorageLike, 'isAsyncEncryptionAvailable'>,
): Promise<boolean> {
  try {
    return (await safeStorage.isAsyncEncryptionAvailable()) === true;
  } catch {
    return false;
  }
}

export type SerialQueue = <T>(task: () => T | Promise<T>) => Promise<T>;

/**
 * A promise-chain mutex. Each task starts only after every task queued before
 * it has settled, so a read-modify-write that awaits encryption cannot
 * interleave with another one and lose its update. A failed task rejects its
 * own caller and does not stall the queue.
 *
 * Never queue a task from inside another task of the same queue: the inner
 * one waits for the outer one, which waits for the inner one.
 */
export function createSerialQueue(): SerialQueue {
  let tail: Promise<unknown> = Promise.resolve();
  return <T>(task: () => T | Promise<T>): Promise<T> => {
    const run = tail.then(task);
    tail = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  };
}
