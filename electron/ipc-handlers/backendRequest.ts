/**
 * Retry wrapper around calls to the local Python backend.
 *
 * Backend-down (ECONNREFUSED) is short-circuited to a friendly,
 * actionable message because the user has to physically restart the
 * backend process -- no number of retries will help. Other errors
 * (timeout, 5xx, occasional connection reset) are retried up to
 * `attempts` times with a fixed `delayMs` between attempts.
 *
 * Errors raised on the backend-down path carry `code: 'BACKEND_DOWN'`
 * so callers can branch on them (e.g., to suggest opening Settings).
 */

export const BACKEND_DOWN_MESSAGE =
  'The AI backend is not running. Please restart the app or start the backend manually from Settings.';

export function isBackendDownError(error: unknown): boolean {
  const candidate = error as { message?: unknown; code?: unknown } | null | undefined;
  const msg = typeof candidate?.message === 'string' ? candidate.message : '';
  return msg.includes('ECONNREFUSED') || candidate?.code === 'ECONNREFUSED';
}

/**
 * Attempt count for calls that CREATE work on the backend (generation, edit,
 * export, conversion submits). A timed-out or 5xx submit may already have
 * enqueued its job, so a retry would run - and write output for - the same
 * request twice. Those calls fail once and let the user decide.
 */
export const SUBMIT_ONCE = 1;

export async function requestBackend<T>(
  request: () => Promise<T>,
  attempts: number = 3,
  delayMs: number = 1000,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await request();
    } catch (error) {
      lastError = error;
      if (isBackendDownError(error)) {
        const friendly = new Error(BACKEND_DOWN_MESSAGE);
        (friendly as { code?: string }).code = 'BACKEND_DOWN';
        throw friendly;
      }
      if (attempt === attempts) {
        throw error;
      }

      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  throw lastError;
}

/**
 * Log-safe one-line description of a failed backend call: the message plus
 * the HTTP status when there is one. Never log the raw AxiosError - its
 * config.headers carry the backend auth token and any forwarded HF / CivitAI
 * token.
 */
export function describeBackendError(error: unknown): string {
  const candidate = error as { message?: unknown; response?: { status?: unknown } } | null;
  const message = typeof candidate?.message === 'string' && candidate.message ? candidate.message : 'Unknown error';
  const status = candidate?.response?.status;
  return typeof status === 'number' ? `${message} (HTTP ${status})` : message;
}
