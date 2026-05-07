import { describe, expect, it, vi } from 'vitest';

import {
  BACKEND_DOWN_MESSAGE,
  isBackendDownError,
  requestBackend,
} from './backendRequest';

// Background: requestBackend wraps every axios call to the local Python
// backend with a small retry loop. The retry budget is for transient
// upstream failures (timeout, 5xx). A backend-down state (Python process
// not listening on 127.0.0.1:8000) is terminal -- the user needs an
// actionable message about restarting the backend, not a 1-3s pause
// while we burn the budget on connections that will never connect.
//
// Tests cover both axes (retry vs short-circuit) plus the error-shape
// detection that drives the routing.

describe('isBackendDownError', () => {
  it('detects ECONNREFUSED in error message', () => {
    expect(isBackendDownError(new Error('connect ECONNREFUSED 127.0.0.1:8000'))).toBe(true);
  });

  it('detects ECONNREFUSED via the .code field (axios shape)', () => {
    const err = Object.assign(new Error('boom'), { code: 'ECONNREFUSED' });
    expect(isBackendDownError(err)).toBe(true);
  });

  it('returns false for unrelated errors', () => {
    expect(isBackendDownError(new Error('timeout of 30000ms'))).toBe(false);
  });

  it('returns false for null / undefined / non-error values', () => {
    expect(isBackendDownError(null)).toBe(false);
    expect(isBackendDownError(undefined)).toBe(false);
    expect(isBackendDownError('econnrefused string')).toBe(false);
  });

  it('does not match a benign substring like CONNREFUSED in arbitrary text', () => {
    // Sanity: the substring is `ECONNREFUSED`, not just `connection refused`.
    expect(isBackendDownError(new Error('connection refused by the firewall'))).toBe(false);
  });
});

describe('requestBackend', () => {
  it('returns the value on first success', async () => {
    const request = vi.fn(async () => 'ok');
    const result = await requestBackend(request);
    expect(result).toBe('ok');
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('retries up to the configured attempts then returns the success', async () => {
    let calls = 0;
    const request = vi.fn(async () => {
      calls += 1;
      if (calls < 3) {
        throw new Error('transient 500');
      }
      return 'ok';
    });
    const result = await requestBackend(request, 3, 1);
    expect(result).toBe('ok');
    expect(request).toHaveBeenCalledTimes(3);
  });

  it('throws the last error when all attempts fail with transient errors', async () => {
    let attempt = 0;
    const request = vi.fn(async () => {
      attempt += 1;
      throw new Error(`attempt ${attempt}`);
    });
    await expect(requestBackend(request, 3, 1)).rejects.toThrow(/attempt 3/);
    expect(request).toHaveBeenCalledTimes(3);
  });

  it('short-circuits on backend-down (no retries) with the friendly message', async () => {
    const downError = Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:8000'), {
      code: 'ECONNREFUSED',
    });
    const request = vi.fn(async () => {
      throw downError;
    });

    await expect(requestBackend(request, 3, 1000)).rejects.toThrow(BACKEND_DOWN_MESSAGE);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('attaches the BACKEND_DOWN code to the friendly error so callers can branch on it', async () => {
    const downError = Object.assign(new Error('boom'), { code: 'ECONNREFUSED' });
    const request = vi.fn(async () => {
      throw downError;
    });

    try {
      await requestBackend(request, 3, 1);
      expect.unreachable('requestBackend should have thrown');
    } catch (caught) {
      expect((caught as { code?: string }).code).toBe('BACKEND_DOWN');
      expect((caught as Error).message).toBe(BACKEND_DOWN_MESSAGE);
    }
  });

  it('waits the configured delay between attempts', async () => {
    vi.useFakeTimers();
    try {
      const request = vi
        .fn()
        .mockRejectedValueOnce(new Error('transient'))
        .mockResolvedValueOnce('ok');

      const promise = requestBackend(request, 3, 250);
      // First attempt resolves synchronously, the catch path schedules a setTimeout(250).
      await Promise.resolve();
      await Promise.resolve();
      expect(request).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(249);
      // Still in the delay window.
      expect(request).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(1);
      const result = await promise;
      expect(result).toBe('ok');
      expect(request).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('uses default attempts=3 and delayMs=1000 when not supplied', async () => {
    vi.useFakeTimers();
    try {
      const request = vi.fn(async () => {
        throw new Error('always-fails');
      });
      const promise = requestBackend(request);
      // Drive forward enough virtual time for both retry waits (2 * 1000ms).
      const settled = expect(promise).rejects.toThrow(/always-fails/);
      await vi.runAllTimersAsync();
      await settled;
      expect(request).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });
});
