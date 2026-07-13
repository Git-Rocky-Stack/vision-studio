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

export function isRetryableError(error: unknown): boolean {
  if ((error as { name?: string } | null)?.name === 'AbortError') {
    return false;
  }
  const status = responseStatus(error);
  if (status === null) {
    // No HTTP response => network-level failure, worth a retry.
    return true;
  }
  return RETRYABLE_STATUS.has(status);
}

export function getRetryAfterMs(error: unknown): number | null {
  const headers = (error as { response?: { headers?: Record<string, unknown> } } | null)?.response
    ?.headers;
  const raw = headers?.['retry-after'] ?? headers?.['Retry-After'];
  if (typeof raw !== 'string') {
    return null;
  }
  const seconds = Number(raw);
  return Number.isFinite(seconds) ? seconds * 1000 : null;
}

export async function retryHostedCall<T>(
  operation: () => Promise<T>,
  { maxAttempts, baseDelayMs, signal }: { maxAttempts: number; baseDelayMs: number; signal?: AbortSignal },
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
      if (attempt === maxAttempts || !isRetryableError(error)) {
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
