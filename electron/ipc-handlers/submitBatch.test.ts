import { describe, expect, it, vi } from 'vitest';
import { submitBatch } from './submitBatch';

describe('submitBatch', () => {
  it('preserves input order in the results array', async () => {
    const items = ['a', 'b', 'c', 'd', 'e'];
    const results = await submitBatch(items, async (item) => item.toUpperCase(), {
      concurrency: 2,
    });
    expect(results).toEqual(['A', 'B', 'C', 'D', 'E']);
  });

  it('caps concurrent in-flight calls at the configured concurrency', async () => {
    const items = Array.from({ length: 10 }, (_, index) => index);
    let inFlight = 0;
    let observedMax = 0;

    const results = await submitBatch(
      items,
      async (item) => {
        inFlight += 1;
        observedMax = Math.max(observedMax, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 5));
        inFlight -= 1;
        return item;
      },
      { concurrency: 3 },
    );

    expect(results).toEqual(items);
    expect(observedMax).toBeLessThanOrEqual(3);
    expect(observedMax).toBeGreaterThan(1);
  });

  it('rejects with the first error and stops launching new work', async () => {
    const items = ['a', 'b', 'c', 'd', 'e'];
    const submit = vi.fn(async (item: string) => {
      if (item === 'b') {
        throw new Error('boom');
      }
      await new Promise((resolve) => setTimeout(resolve, 5));
      return item;
    });

    await expect(submitBatch(items, submit, { concurrency: 2 })).rejects.toThrow('boom');
    // 'a' and 'b' are launched together (concurrency 2); 'b' rejects, batch aborts.
    // 'c'..'e' may or may not have started depending on scheduling, but not all five.
    expect(submit.mock.calls.length).toBeLessThan(items.length);
  });

  it('returns an empty array for an empty input', async () => {
    const results = await submitBatch([], async () => 'never', { concurrency: 4 });
    expect(results).toEqual([]);
  });

  it('falls back to sequential when concurrency is 1', async () => {
    const items = [1, 2, 3];
    let inFlight = 0;
    let observedMax = 0;
    await submitBatch(
      items,
      async (item) => {
        inFlight += 1;
        observedMax = Math.max(observedMax, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 2));
        inFlight -= 1;
        return item;
      },
      { concurrency: 1 },
    );
    expect(observedMax).toBe(1);
  });
});
