import { describe, expect, it, vi } from 'vitest';
import {
  createKeyConcurrencyLimit,
  retryHostedCall,
  isRetryableError,
  isRetryableBilledError,
  getRetryAfterMs,
  parseRetryAfterMs,
} from './hostedHttp';

function networkError(code: string) {
  return Object.assign(new Error(code), { code });
}

function httpError(status: number, headers: Record<string, string> = {}) {
  const error = new Error(`HTTP ${status}`) as Error & { response: unknown };
  (error as { response: unknown }).response = { status, headers, data: {} };
  return error;
}

/**
 * The @huggingface/inference client's InferenceClientProviderApiError exposes
 * the status as httpResponse.status (not axios's response.status) - #42.
 */
function clientHttpError(status: number) {
  const error = new Error(`Provider HTTP ${status}`) as Error & { httpResponse: unknown };
  (error as { httpResponse: unknown }).httpResponse = { requestId: 'req-1', status, body: {} };
  return error;
}

describe('isRetryableError', () => {
  it('retries 429 and 5xx, not 4xx (except 429)', () => {
    expect(isRetryableError(httpError(429))).toBe(true);
    expect(isRetryableError(httpError(503))).toBe(true);
    expect(isRetryableError(httpError(400))).toBe(false);
    expect(isRetryableError(httpError(401))).toBe(false);
  });

  it('classifies inference-client errors by httpResponse.status the same way (#42)', () => {
    expect(isRetryableError(clientHttpError(429))).toBe(true);
    expect(isRetryableError(clientHttpError(503))).toBe(true);
    expect(isRetryableError(clientHttpError(400))).toBe(false);
    expect(isRetryableError(clientHttpError(401))).toBe(false);
  });

  it('does not retry an AbortError', () => {
    expect(isRetryableError(new DOMException('Aborted', 'AbortError'))).toBe(false);
  });

  it('never retries a timeout, but retries a transient connection failure', () => {
    expect(isRetryableError(networkError('ECONNABORTED'))).toBe(false);
    expect(isRetryableError(networkError('ETIMEDOUT'))).toBe(false);
    expect(isRetryableError(new DOMException('timed out', 'TimeoutError'))).toBe(false);
    expect(isRetryableError(networkError('ECONNRESET'))).toBe(true);
    expect(isRetryableError(new Error('something odd'))).toBe(false);
  });
});

describe('isRetryableBilledError', () => {
  it('retries a 429 and a 503 that carries Retry-After', () => {
    expect(isRetryableBilledError(httpError(429))).toBe(true);
    expect(isRetryableBilledError(httpError(503, { 'retry-after': '3' }))).toBe(true);
  });

  it('never retries a 500/502/504 or a bare 503 that may already have been billed', () => {
    for (const status of [500, 502, 504]) {
      expect(isRetryableBilledError(httpError(status))).toBe(false);
    }
    expect(isRetryableBilledError(httpError(503))).toBe(false);
  });

  it('never retries a timeout or a connection reset, only a request that never left', () => {
    expect(isRetryableBilledError(networkError('ECONNABORTED'))).toBe(false);
    expect(isRetryableBilledError(new DOMException('timed out', 'TimeoutError'))).toBe(false);
    expect(isRetryableBilledError(networkError('ECONNRESET'))).toBe(false);
    expect(isRetryableBilledError(networkError('ECONNREFUSED'))).toBe(true);
    expect(isRetryableBilledError(networkError('ENOTFOUND'))).toBe(true);
  });

  it('caps a billed call at one attempt on a 502', async () => {
    const op = vi.fn().mockRejectedValue(httpError(502));
    await expect(
      retryHostedCall(op, { maxAttempts: 3, baseDelayMs: 0, isRetryable: isRetryableBilledError }),
    ).rejects.toThrow('HTTP 502');
    expect(op).toHaveBeenCalledTimes(1);
  });
});

describe('getRetryAfterMs', () => {
  it('reads a Retry-After header in seconds', () => {
    expect(getRetryAfterMs(httpError(429, { 'retry-after': '2' }))).toBe(2000);
  });

  it('returns null without the header', () => {
    expect(getRetryAfterMs(httpError(429))).toBeNull();
  });

  it('reads an HTTP-date Retry-After as the delay until that moment', () => {
    const now = Date.parse('2026-10-25T12:00:00Z');
    expect(parseRetryAfterMs('Sun, 25 Oct 2026 12:00:05 GMT', now)).toBe(5000);
    expect(parseRetryAfterMs('Sun, 25 Oct 2026 11:59:00 GMT', now)).toBe(0);
  });

  it('rejects an unusable value', () => {
    expect(parseRetryAfterMs('soon')).toBeNull();
    expect(parseRetryAfterMs('-1')).toBeNull();
    expect(parseRetryAfterMs('')).toBeNull();
  });

  it('reads the header through a Headers-style get()', () => {
    const error = { response: { status: 429, headers: new Headers({ 'Retry-After': '2' }) } };
    expect(getRetryAfterMs(error)).toBe(2000);
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
