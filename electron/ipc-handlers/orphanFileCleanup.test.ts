import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { deleteOrphanedFiles } from './orphanFileCleanup';

describe('deleteOrphanedFiles', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'orphan-cleanup-'));
  });

  afterEach(async () => {
    await fs.promises.rm(tempDir, { recursive: true, force: true });
  });

  it('deletes every file in the supplied list', async () => {
    const files = [
      path.join(tempDir, 'orphan-a.png'),
      path.join(tempDir, 'orphan-b.png'),
      path.join(tempDir, 'orphan-c.png'),
    ];
    await Promise.all(files.map((f) => fs.promises.writeFile(f, Buffer.from([1, 2, 3]))));
    const logger = { warn: vi.fn() };

    await deleteOrphanedFiles(files, logger);

    for (const file of files) {
      await expect(fs.promises.access(file)).rejects.toThrow();
    }
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('does not throw when files are missing -- it just warns', async () => {
    const missing = path.join(tempDir, 'never-existed.png');
    const logger = { warn: vi.fn() };

    await expect(deleteOrphanedFiles([missing], logger)).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn.mock.calls[0][0]).toMatch(/orphan-cleanup/i);
  });

  it('deletes the survivors and warns about the missing ones in mixed input', async () => {
    const existing = path.join(tempDir, 'real.png');
    const missing = path.join(tempDir, 'never-existed.png');
    await fs.promises.writeFile(existing, Buffer.from([7]));
    const logger = { warn: vi.fn() };

    await deleteOrphanedFiles([existing, missing], logger);

    await expect(fs.promises.access(existing)).rejects.toThrow();
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });

  it('no-ops on an empty list without invoking the logger', async () => {
    const logger = { warn: vi.fn() };
    await expect(deleteOrphanedFiles([], logger)).resolves.toBeUndefined();
    expect(logger.warn).not.toHaveBeenCalled();
  });
});
