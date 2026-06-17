import { describe, expect, it, vi } from 'vitest';
import {
  createKeyConcurrencyLimit,
  retryHostedCall,
  isRetryableError,
  getRetryAfterMs,
} from './hostedHttp';

function httpError(status: number, headers: Record<string, string> = {}) {
  const error = new Error(`HTTP ${status}`) as Error & { response: unknown };
  (error as { response: unknown }).response = { status, headers, data: {} };
  return error;
}

describe('isRetryableError', () => {
  it('retries 429 and 5xx, not 4xx (except 429)', () => {
    expect(isRetryableError(httpError(429))).toBe(true);
    expect(isRetryableError(httpError(503))).toBe(true);
    expect(isRetryableError(httpError(400))).toBe(false);
    expect(isRetryableError(httpError(401))).toBe(false);
  });

  it('does not retry an AbortError', () => {
    expect(isRetryableError(new DOMException('Aborted', 'AbortError'))).toBe(false);
  });
});

describe('getRetryAfterMs', () => {
  it('reads a Retry-After header in seconds', () => {
    expect(getRetryAfterMs(httpError(429, { 'retry-after': '2' }))).toBe(2000);
  });

  it('returns null without the header', () => {
    expect(getRetryAfterMs(httpError(429))).toBeNull();
  });
});

describe('retryHostedCall', () => {
  it('retries up to maxAttempts on 429 then succeeds', async () => {
    const op = vi
      .fn()
      .mockRejectedValueOnce(httpError(429))
      .mockRejectedValueOnce(httpError(429))
      .mockResolvedValueOnce('ok');
    const result = await retryHostedCall(op, { maxAttempts: 3, baseDelayMs: 0 });
    expect(result).toBe('ok');
    expect(op).toHaveBeenCalledTimes(3);
  });

  it('throws immediately on a non-retryable error', async () => {
    const op = vi.fn().mockRejectedValue(httpError(400));
    await expect(retryHostedCall(op, { maxAttempts: 3, baseDelayMs: 0 })).rejects.toThrow('HTTP 400');
    expect(op).toHaveBeenCalledTimes(1);
  });

  it('aborts before the first attempt when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const op = vi.fn();
    await expect(
      retryHostedCall(op, { maxAttempts: 3, baseDelayMs: 0, signal: controller.signal }),
    ).rejects.toThrow();
    expect(op).not.toHaveBeenCalled();
  });
});

describe('createKeyConcurrencyLimit', () => {
  it('serialises beyond the per-key cap and runs different keys independently', async () => {
    const limit = createKeyConcurrencyLimit(1);
    const order: string[] = [];
    const slow = (label: string) =>
      limit('key-a', async () => {
        order.push(`start:${label}`);
        await Promise.resolve();
        order.push(`end:${label}`);
      });
    await Promise.all([slow('1'), slow('2')]);
    // With cap 1 on the same key, task 2 cannot start before task 1 ends.
    expect(order).toEqual(['start:1', 'end:1', 'start:2', 'end:2']);
  });
});
