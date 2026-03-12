import { describe, expect, it, vi } from 'vitest';

import { getBackendStatusSnapshot, waitForBackendReady } from './backend';

describe('waitForBackendReady', () => {
  it('falls back across backend origins until one is reachable', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('connect ECONNREFUSED 127.0.0.1:8000'))
      .mockResolvedValueOnce({ ok: true });

    const result = await waitForBackendReady({
      fetchImpl: fetchMock as typeof fetch,
      origins: ['http://127.0.0.1:8000', 'http://localhost:8000'],
      timeoutMs: 50,
      intervalMs: 0,
    });

    expect(result.ready).toBe(true);
    expect(result.origin).toBe('http://localhost:8000');
  });

  it('reports not ready after the timeout window elapses', async () => {
    const result = await waitForBackendReady({
      fetchImpl: vi.fn().mockRejectedValue(new Error('connect ECONNREFUSED 127.0.0.1:8000')) as typeof fetch,
      origins: ['http://127.0.0.1:8000'],
      timeoutMs: 0,
      intervalMs: 0,
    });

    expect(result.ready).toBe(false);
    expect(result.origin).toBeNull();
  });
});

describe('getBackendStatusSnapshot', () => {
  it('treats a live child without a healthy backend as not running', () => {
    const child = { pid: 42, exitCode: null };

    const status = getBackendStatusSnapshot(child, false);

    expect(status).toEqual({
      running: false,
      pid: 42,
    });
  });
});
