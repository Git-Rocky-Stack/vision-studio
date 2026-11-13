import { describe, expect, it, vi } from 'vitest';

import {
  BACKEND_ORIGIN,
  computeHandshakeProof,
  createHandshakeNonce,
  getBackendStatusSnapshot,
  isValidHandshakeProof,
  probeBackendIdentity,
  waitForBackendReady,
} from './backend';

const TOKEN = 'session-token';

/** A fetch double that answers the K1 handshake the way a given listener would. */
function handshakeFetch(answer: (nonce: string) => { ok: boolean; body?: unknown } | Error) {
  return vi.fn<typeof fetch>(async (input) => {
    const nonce = new URL(String(input)).searchParams.get('nonce') ?? '';
    const result = answer(nonce);
    if (result instanceof Error) {
      throw result;
    }
    return {
      ok: result.ok,
      json: async () => {
        if (result.body === undefined) throw new SyntaxError('Unexpected token < in JSON');
        return result.body;
      },
    } as Response;
  });
}

const ourBackend = handshakeFetch((nonce) => ({ ok: true, body: { proof: computeHandshakeProof(TOKEN, nonce) } }));
const refused = () => handshakeFetch(() => new Error('connect ECONNREFUSED 127.0.0.1:8000'));

describe('handshake proof', () => {
  it('creates a fresh 64-hex-char nonce per probe', () => {
    const a = createHandshakeNonce();
    const b = createHandshakeNonce();
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toBe(b);
  });

  it('matches HMAC-SHA256(key = token, msg = nonce) as lowercase hex', () => {
    // RFC 4231 test case 2: key "Jefe", data "what do ya want for nothing?".
    expect(computeHandshakeProof('Jefe', 'what do ya want for nothing?')).toBe(
      '5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843',
    );
  });

  it('accepts only the exact proof for this token and nonce', () => {
    const nonce = createHandshakeNonce();
    const proof = computeHandshakeProof(TOKEN, nonce);
    expect(isValidHandshakeProof(proof, TOKEN, nonce)).toBe(true);
    expect(isValidHandshakeProof(proof.toUpperCase(), TOKEN, nonce)).toBe(true);
    expect(isValidHandshakeProof(computeHandshakeProof('other-token', nonce), TOKEN, nonce)).toBe(false);
    expect(isValidHandshakeProof(computeHandshakeProof(TOKEN, createHandshakeNonce()), TOKEN, nonce)).toBe(false);
    expect(isValidHandshakeProof(proof.slice(2), TOKEN, nonce)).toBe(false);
    expect(isValidHandshakeProof(undefined, TOKEN, nonce)).toBe(false);
    expect(isValidHandshakeProof(42, TOKEN, nonce)).toBe(false);
  });
});

describe('probeBackendIdentity', () => {
  it('verifies a backend that proves the token, on the loopback origin, without sending the token', async () => {
    const fetchImpl = handshakeFetch((nonce) => ({ ok: true, body: { proof: computeHandshakeProof(TOKEN, nonce) } }));

    await expect(probeBackendIdentity({ token: TOKEN, fetchImpl })).resolves.toBe('verified');

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url.startsWith(`${BACKEND_ORIGIN}/api/handshake?nonce=`)).toBe(true);
    expect(url).not.toContain(TOKEN);
    expect(init.headers).toBeUndefined();
    expect(init.redirect).toBe('error');
  });

  it('reports a mismatch for any other listener on the port', async () => {
    // Wrong proof, an HTTP error (no handshake route), and a non-JSON page.
    for (const listener of [
      handshakeFetch((nonce) => ({ ok: true, body: { proof: computeHandshakeProof('impostor', nonce) } })),
      handshakeFetch(() => ({ ok: false })),
      handshakeFetch(() => ({ ok: true })),
      handshakeFetch(() => ({ ok: true, body: { hello: 'world' } })),
    ]) {
      await expect(probeBackendIdentity({ token: TOKEN, fetchImpl: listener })).resolves.toBe('mismatch');
    }
  });

  it('reports unreachable when nothing answers', async () => {
    await expect(probeBackendIdentity({ token: TOKEN, fetchImpl: refused() })).resolves.toBe('unreachable');
  });

  it('does not probe at all once the caller has aborted', async () => {
    const fetchImpl = refused();
    const controller = new AbortController();
    controller.abort();
    await expect(probeBackendIdentity({ token: TOKEN, fetchImpl, signal: controller.signal })).resolves.toBe('unreachable');
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('waitForBackendReady', () => {
  it('polls until the backend proves its identity', async () => {
    let calls = 0;
    const fetchImpl = handshakeFetch((nonce) => {
      calls += 1;
      return calls < 3
        ? new Error('connect ECONNREFUSED 127.0.0.1:8000')
        : { ok: true, body: { proof: computeHandshakeProof(TOKEN, nonce) } };
    });

    const result = await waitForBackendReady({ token: TOKEN, fetchImpl, timeoutMs: 5000, intervalMs: 0 });

    expect(result).toEqual({ ready: true, origin: BACKEND_ORIGIN });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('stops at once when a different listener holds the port', async () => {
    const fetchImpl = handshakeFetch(() => ({ ok: true, body: { proof: '0'.repeat(64) } }));

    const result = await waitForBackendReady({ token: TOKEN, fetchImpl, timeoutMs: 60_000, intervalMs: 0 });

    expect(result).toEqual({ ready: false, origin: null, reason: 'mismatch' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('reports a timeout after the window elapses', async () => {
    const result = await waitForBackendReady({ token: TOKEN, fetchImpl: refused(), timeoutMs: 0, intervalMs: 0 });

    expect(result).toEqual({ ready: false, origin: null, reason: 'timeout' });
  });

  it('aborts mid-wait when the signal fires (the child exited)', async () => {
    const controller = new AbortController();
    const fetchImpl = refused();

    const pending = waitForBackendReady({
      token: TOKEN,
      fetchImpl,
      timeoutMs: 300_000,
      intervalMs: 60_000,
      signal: controller.signal,
    });
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(1));
    controller.abort();

    await expect(pending).resolves.toEqual({ ready: false, origin: null, reason: 'aborted' });
  });

  it('keeps the default fetch target to the single verified origin', async () => {
    await waitForBackendReady({ token: TOKEN, fetchImpl: ourBackend, timeoutMs: 0 });
    for (const [url] of ourBackend.mock.calls as unknown as [string][]) {
      expect(url.startsWith('http://127.0.0.1:8000/')).toBe(true);
    }
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

  it('carries the failure reason when there is one', () => {
    expect(getBackendStatusSnapshot(null, false, 'Port 8000 is in use by another application.')).toEqual({
      running: false,
      pid: null,
      error: 'Port 8000 is in use by another application.',
    });
  });
});
