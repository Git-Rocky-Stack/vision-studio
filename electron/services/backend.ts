import type { ChildProcess } from 'child_process';

export const BACKEND_ORIGINS = ['http://127.0.0.1:8000', 'http://localhost:8000'] as const;

type FetchLike = typeof fetch;

type WaitForBackendReadyOptions = {
  fetchImpl?: FetchLike;
  origins?: readonly string[];
  timeoutMs?: number;
  intervalMs?: number;
  requestTimeoutMs?: number;
};

type BackendStatusSnapshot = {
  running: boolean;
  pid: number | null;
};

async function probeOrigin(fetchImpl: FetchLike, origin: string, requestTimeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);

  try {
    const response = await fetchImpl(`${origin}/`, { signal: controller.signal });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

export async function waitForBackendReady({
  fetchImpl = fetch,
  origins = BACKEND_ORIGINS,
  timeoutMs = 60000,
  intervalMs = 500,
  requestTimeoutMs = 1500,
}: WaitForBackendReadyOptions = {}) {
  const deadline = Date.now() + timeoutMs;

  do {
    for (const origin of origins) {
      if (await probeOrigin(fetchImpl, origin, requestTimeoutMs)) {
        return { ready: true, origin };
      }
    }

    if (Date.now() >= deadline) {
      break;
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  } while (true);

  return { ready: false, origin: null };
}

export function getBackendStatusSnapshot(
  childProcess: Pick<ChildProcess, 'pid' | 'exitCode'> | null,
  backendReady: boolean
): BackendStatusSnapshot {
  return {
    running: Boolean(childProcess && childProcess.exitCode === null && backendReady),
    pid: childProcess?.pid ?? null,
  };
}
