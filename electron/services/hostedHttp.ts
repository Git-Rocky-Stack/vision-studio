/**
 * Reusable transport primitives for hosted BYOK provider clients (M6).
 * Mirrors the proven helpers in openRouter.ts so the HuggingFace Inference
 * client inherits the same resilience: per-key concurrency capping, exponential
 * backoff honouring Retry-After, and abort-aware retries.
 */

export function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

/**
 * Connection failures where the request provably never reached the provider:
 * refused, or the host name did not resolve. Safe to retry even on a billed
 * call. ECONNRESET is deliberately NOT here - the reset can land after the
 * provider accepted (and billed) the request.
 */
const NEVER_SENT_CODES = new Set(['ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN']);

/** Transient network failures worth retrying on an idempotent / unbilled call. */
const TRANSIENT_NETWORK_CODES = new Set([...NEVER_SENT_CODES, 'ECONNRESET']);

/**
 * True for every shape a cancelled request takes: a DOM AbortError (fetch and
 * the @huggingface/inference client), axios's CanceledError, or its
 * ERR_CANCELED code.
 */
export function isAbortError(error: unknown): boolean {
  const candidate = error as { name?: unknown; code?: unknown } | null;
  return (
    candidate?.name === 'AbortError' ||
    candidate?.name === 'CanceledError' ||
    candidate?.code === 'ERR_CANCELED'
  );
}

/** Axios timeouts (ECONNABORTED / ETIMEDOUT) and AbortSignal.timeout() rejections. */
export function isTimeoutError(error: unknown): boolean {
  const candidate = error as { name?: unknown; code?: unknown } | null;
  return (
    candidate?.code === 'ECONNABORTED' ||
    candidate?.code === 'ETIMEDOUT' ||
    candidate?.name === 'TimeoutError'
  );
}

function responseStatus(error: unknown): number | null {
  const candidate = error as
    | { response?: { status?: unknown }; httpResponse?: { status?: unknown } }
    | null;
  // Axios errors carry response.status; the @huggingface/inference client's
  // InferenceClientProviderApiError carries httpResponse.status (#42). Both
  // must classify identically or client 4xx failures get retried as if they
  // were network blips.
  const status = candidate?.response?.status ?? candidate?.httpResponse?.status;
  return typeof status === 'number' ? status : null;
}

function errorCode(error: unknown): string | null {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === 'string' ? code : null;
}

/**
 * Retry policy for unbilled calls (metadata, key info, model lists) and
 * cheap text completions: 429 and 5xx, plus transient connection failures.
 * Timeouts are terminal - the provider may still be working on the request.
 */
export function isRetryableError(error: unknown): boolean {
  if (isAbortError(error) || isTimeoutError(error)) {
    return false;
  }
  const status = responseStatus(error);
  if (status === null) {
    const code = errorCode(error);
    return code !== null && TRANSIENT_NETWORK_CODES.has(code);
  }
  return RETRYABLE_STATUS.has(status);
}

/**
 * Retry policy for billed generation calls (image / video). A 500/502/504 or
 * a timeout can arrive after the provider already ran (and charged for) the
 * generation, so retrying them can bill the user several times for one image.
 * Only retry what the provider explicitly told us was not run: a 429, a 503
 * that carries Retry-After, or a connection that never reached the provider.
 */
export function isRetryableBilledError(error: unknown): boolean {
  if (isAbortError(error) || isTimeoutError(error)) {
    return false;
  }
  const status = responseStatus(error);
  if (status === null) {
    const code = errorCode(error);
    return code !== null && NEVER_SENT_CODES.has(code);
  }
  if (status === 429) {
    return true;
  }
  return status === 503 && getRetryAfterMs(error) !== null;
}

/**
 * Parse a Retry-After header value: either delay-seconds or an HTTP-date
 * (RFC 9110 section 10.2.3). Returns null for a missing or unusable value.
 */
export function parseRetryAfterMs(raw: unknown, now: number = Date.now()): number | null {
  if (typeof raw !== 'string' || !raw.trim()) {
    return null;
  }
  const seconds = Number(raw);
  if (Number.isFinite(seconds)) {
    return seconds >= 0 ? Math.round(seconds * 1000) : null;
  }
  const dateMs = Date.parse(raw);
  if (!Number.isNaN(dateMs)) {
    return Math.max(0, dateMs - now);
  }
  return null;
}

function readHeader(headers: unknown, name: string): unknown {
  if (!headers || typeof headers !== 'object') {
    return undefined;
  }
  // Fetch-style Headers (the @huggingface/inference client) and AxiosHeaders
  // both expose get(); plain axios header objects are lower-cased records.
  const getter = (headers as { get?: unknown }).get;
  if (typeof getter === 'function') {
    const value = (getter as (key: string) => unknown).call(headers, name);
    if (value !== undefined && value !== null) {
      return value;
    }
  }
  const record = headers as Record<string, unknown>;
  return record[name.toLowerCase()] ?? record[name];
}

export function getRetryAfterMs(error: unknown): number | null {
  const candidate = error as
    | { response?: { headers?: unknown }; httpResponse?: { headers?: unknown } }
    | null;
  const raw =
    readHeader(candidate?.response?.headers, 'Retry-After') ??
    readHeader(candidate?.httpResponse?.headers, 'Retry-After');
  return parseRetryAfterMs(raw);
}

export type HostedRetryOptions = {
  maxAttempts: number;
  baseDelayMs: number;
  signal?: AbortSignal;
  /** Which failures may be retried. Defaults to the unbilled policy. */
  isRetryable?: (error: unknown) => boolean;
};

export async function retryHostedCall<T>(
  operation: () => Promise<T>,
  { maxAttempts, baseDelayMs, signal, isRetryable = isRetryableError }: HostedRetryOptions,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt === maxAttempts || !isRetryable(error)) {
        throw error;
      }
      const backoff = getRetryAfterMs(error) ?? baseDelayMs * 2 ** (attempt - 1);
      await delay(backoff, signal);
    }
  }
  throw lastError;
}

export function createKeyConcurrencyLimit(maxPerKey: number) {
  type KeyState = { active: number; waiters: Array<() => void> };
  const states = new Map<string, KeyState>();

  function getState(key: string): KeyState {
    let state = states.get(key);
    if (!state) {
      state = { active: 0, waiters: [] };
      states.set(key, state);
    }
    return state;
  }

  return async function run<T>(key: string, work: () => Promise<T>): Promise<T> {
    const state = getState(key);
    if (state.active >= maxPerKey) {
      await new Promise<void>((resolve) => state.waiters.push(resolve));
    }
    state.active += 1;
    try {
      return await work();
    } finally {
      state.active -= 1;
      const next = state.waiters.shift();
      if (next) next();
    }
  };
}
