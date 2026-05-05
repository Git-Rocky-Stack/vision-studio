import fs from 'node:fs';

type CleanupLogger = Pick<Console, 'warn'>;

/**
 * Best-effort delete of files that are orphaned because their owning job
 * was cancelled after the files landed on disk but before the job record
 * could be marked complete.
 *
 * Failures are warned, not thrown -- the caller is on a cleanup path that
 * already decided the job is done, and a stuck unlink should not surface
 * a new error to the user. ENOENT in particular is benign (file vanished
 * before we got there) and only deserves a warning.
 */
export async function deleteOrphanedFiles(
  filePaths: string[],
  logger: CleanupLogger,
): Promise<void> {
  if (filePaths.length === 0) {
    return;
  }

  const results = await Promise.allSettled(
    filePaths.map((filePath) => fs.promises.unlink(filePath)),
  );

  results.forEach((result, index) => {
    if (result.status === 'rejected') {
      logger.warn(
        `[orphan-cleanup] failed to delete ${filePaths[index]}:`,
        result.reason instanceof Error ? result.reason.message : result.reason,
      );
    }
  });
}
