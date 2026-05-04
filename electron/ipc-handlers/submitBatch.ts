/**
 * Submit a batch of items with bounded concurrency.
 *
 * Preserves input order in the returned results array. Rejects with the first
 * error and stops launching new work (in-flight calls are not aborted; for
 * cancellation pass an AbortSignal through your `submit` closure).
 */
export async function submitBatch<TInput, TOutput>(
  items: readonly TInput[],
  submit: (item: TInput, index: number) => Promise<TOutput>,
  { concurrency }: { concurrency: number },
): Promise<TOutput[]> {
  if (items.length === 0) {
    return [];
  }

  const effectiveConcurrency = Math.max(1, Math.floor(concurrency));
  const results = new Array<TOutput>(items.length);
  let nextIndex = 0;
  let aborted = false;
  let firstError: unknown = null;

  async function worker() {
    while (!aborted) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) {
        return;
      }
      try {
        results[index] = await submit(items[index], index);
      } catch (error) {
        if (!aborted) {
          aborted = true;
          firstError = error;
        }
        return;
      }
    }
  }

  const workers = Array.from(
    { length: Math.min(effectiveConcurrency, items.length) },
    () => worker(),
  );
  await Promise.all(workers);

  if (firstError !== null) {
    throw firstError;
  }

  return results;
}
