import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import type { ChildProcess } from 'child_process';

/**
 * The one origin the app sends token-bearing requests to. The backend binds
 * loopback on port 8000 (backend/main.py get_uvicorn_config), so identity is
 * proven on exactly this origin: verifying `localhost` would prove nothing
 * about `127.0.0.1`, which can resolve to a different listener.
 */
export const BACKEND_ORIGIN = 'http://127.0.0.1:8000';

/**
 * Backend identity handshake (contract K1).
 *
 * `GET /api/handshake?nonce=<hex>` is unauthenticated and answers
 * `{ "proof": hex(HMAC-SHA256(key = auth token, msg = nonce)) }`. Only the
 * process that was handed this session's token can produce the proof, so a
 * verified handshake is what makes it safe to send the token - and what tells
 * our backend apart from any other program that happens to hold port 8000.
 */
export type BackendIdentity =
  /** The listener proved it holds this session's token. */
  | 'verified'
  /** Something answered HTTP on the port but could not prove the token. */
  | 'mismatch'
  /** Nothing answered (refused, timed out, or the probe was aborted). */
  | 'unreachable';

type FetchLike = typeof fetch;

/** 32 random bytes: 64 hex characters, inside the contract's 32-128 range. */
export function createHandshakeNonce(): string {
  return randomBytes(32).toString('hex');
}

export function computeHandshakeProof(token: string, nonce: string): string {
  return createHmac('sha256', Buffer.from(token, 'utf8')).update(nonce, 'utf8').digest('hex');
}

const SHA256_HEX = /^[0-9a-f]{64}$/i;

/** Constant-time comparison of a received proof against the expected HMAC. */
export function isValidHandshakeProof(proof: unknown, token: string, nonce: string): boolean {
  if (typeof proof !== 'string' || !SHA256_HEX.test(proof)) {
    return false;
  }
  const expected = createHmac('sha256', Buffer.from(token, 'utf8')).update(nonce, 'utf8').digest();
  const received = Buffer.from(proof, 'hex');
  return received.length === expected.length && timingSafeEqual(received, expected);
}

type ProbeBackendIdentityOptions = {
  token: string;
  fetchImpl?: FetchLike;
  origin?: string;
  requestTimeoutMs?: number;
  signal?: AbortSignal;
};

/**
 * One handshake round trip with a fresh nonce. Never throws and never sends
 * the auth token.
 */
export async function probeBackendIdentity({
  token,
  fetchImpl = fetch,
  origin = BACKEND_ORIGIN,
  requestTimeoutMs = 1500,
  signal,
}: ProbeBackendIdentityOptions): Promise<BackendIdentity> {
  if (signal?.aborted) {
    return 'unreachable';
  }

  const nonce = createHandshakeNonce();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
  const forwardAbort = () => controller.abort();
  signal?.addEventListener('abort', forwardAbort, { once: true });

  try {
    let response: Response;
    try {
      response = await fetchImpl(`${origin}/api/handshake?nonce=${nonce}`, {
        signal: controller.signal,
        // A redirect would hand the nonce exchange to another origin.
        redirect: 'error',
      });
    } catch {
      return 'unreachable';
    }

    if (!response.ok) {
      return 'mismatch';
    }

    try {
      const body = (await response.json()) as { proof?: unknown } | null;
      return isValidHandshakeProof(body?.proof, token, nonce) ? 'verified' : 'mismatch';
    } catch {
      // A body cut short by the timeout (or an abort) is inconclusive; a body
      // that arrived but is not JSON came from something that is not ours.
      return controller.signal.aborted ? 'unreachable' : 'mismatch';
    }
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', forwardAbort);
  }
}

type WaitForBackendReadyOptions = {
  token: string;
  fetchImpl?: FetchLike;
  origin?: string;
  timeoutMs?: number;
  intervalMs?: number;
  requestTimeoutMs?: number;
  /** Aborts the poll at once, e.g. when the spawned child exits. */
  signal?: AbortSignal;
};

export type BackendReadyResult =
  | { ready: true; origin: string }
  | { ready: false; origin: null; reason: 'timeout' | 'mismatch' | 'aborted' };

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve();
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * Polls the handshake until the backend proves its identity, a different
 * listener is found on the port (`mismatch` - polling longer cannot help),
 * the deadline passes, or `signal` aborts. `timeoutMs: 0` probes once.
 */
export async function waitForBackendReady({
  token,
  fetchImpl = fetch,
  origin = BACKEND_ORIGIN,
  timeoutMs = 60000,
  intervalMs = 500,
  requestTimeoutMs = 1500,
  signal,
}: WaitForBackendReadyOptions): Promise<BackendReadyResult> {
  const deadline = Date.now() + timeoutMs;

  for (;;) {
    if (signal?.aborted) {
      return { ready: false, origin: null, reason: 'aborted' };
    }

    const identity = await probeBackendIdentity({ token, fetchImpl, origin, requestTimeoutMs, signal });

    if (signal?.aborted) {
      return { ready: false, origin: null, reason: 'aborted' };
    }
    if (identity === 'verified') {
      return { ready: true, origin };
    }
    if (identity === 'mismatch') {
      return { ready: false, origin: null, reason: 'mismatch' };
    }
    if (Date.now() >= deadline) {
      return { ready: false, origin: null, reason: 'timeout' };
    }

    await delay(intervalMs, signal);
  }
}

/**
 * Whether the backend this app manages has proven its identity and is still
 * alive. Maintained by the backend process service; other main-process modules
 * can consult it before attaching the auth token to a request.
 */
let backendIdentityVerified = false;

export function setBackendIdentityVerified(verified: boolean): void {
  backendIdentityVerified = verified;
}

export function isBackendIdentityVerified(): boolean {
  return backendIdentityVerified;
}

export type BackendStatusSnapshot = {
  running: boolean;
  pid: number | null;
  /** Why the backend is not available, when the app knows (port conflict, crash loop, ...). */
  error?: string;
};

export function getBackendStatusSnapshot(
  childProcess: Pick<ChildProcess, 'pid' | 'exitCode'> | null,
  backendReady: boolean,
  error: string | null = null,
): BackendStatusSnapshot {
  return {
    running: Boolean(childProcess && childProcess.exitCode === null && backendReady),
    pid: childProcess?.pid ?? null,
    ...(error ? { error } : {}),
  };
}
