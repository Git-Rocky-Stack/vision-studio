import type { JobStatus } from '@/types/electron';
import {
  makePollErrorBudget,
  recordPollError,
  recordPollSuccess,
} from '@/features/generation/pollErrorBudget';
import { isTerminalJobStatus } from './progressEvent';
import { jobProgressBus, type JobProgressSubscribe } from './progressBus';

/**
 * One backend job, watched to a terminal state (#J1).
 *
 * The `generation:progress` push is the primary signal: a progress frame
 * updates the caller immediately, and a terminal frame wakes the loop to fetch
 * the full status (the push carries no result). Polling is the fallback. It
 * starts at `pollIntervalMs` and backs off (x1.5, up to `maxPollIntervalMs`)
 * while nothing changes, so a queue of pending jobs, or a job the push is
 * already reporting, costs few requests.
 *
 * Termination is status-based - there is no wall-clock ceiling, so a long
 * video render is never cut off. Two guards replace it:
 * - an error budget (pollErrorBudget): `errorCap` consecutive failed status
 *   reads end the watch as 'lost' (backend gone, job unknown after a restart);
 * - a stall timeout: a job reported 'processing' that shows no change in
 *   status, progress or step for `stallTimeoutMs` ends the watch as 'stalled'.
 *   A 'pending' job is queued behind others and never counts as stalled.
 */

export type JobWatchOutcome =
  | { kind: 'completed' | 'failed' | 'cancelled'; status: JobStatus }
  | { kind: 'aborted' }
  | { kind: 'lost'; error: unknown }
  | { kind: 'stalled'; lastStatus: JobStatus | null };

export interface JobWatchUpdate {
  status: 'pending' | 'processing';
  progress: number;
  step?: number;
  source: 'poll' | 'push';
}

export interface WatchJobOptions {
  jobId: string;
  /** Status read. A rejection, or a value without a string `status`, counts against the error budget. */
  getStatus: (jobId: string) => Promise<unknown>;
  /** Push subscription; defaults to the shared bus. Pass null for poll-only. */
  progressEvents?: JobProgressSubscribe | null;
  signal?: AbortSignal;
  pollIntervalMs?: number;
  maxPollIntervalMs?: number;
  retryIntervalMs?: number;
  errorCap?: number;
  /** 0 or Infinity disables the stall guard. */
  stallTimeoutMs?: number;
  onUpdate?: (update: JobWatchUpdate) => void;
}

export const DEFAULT_POLL_INTERVAL_MS = 1000;
export const DEFAULT_MAX_POLL_INTERVAL_MS = 8000;
export const DEFAULT_RETRY_INTERVAL_MS = 2000;
export const DEFAULT_POLL_ERROR_CAP = 5;
/** Generous: a large video model can sit at 0% for minutes while it loads. */
export const DEFAULT_STALL_TIMEOUT_MS = 15 * 60 * 1000;
const BACKOFF_FACTOR = 1.5;

function readJobStatus(value: unknown): JobStatus | null {
  if (!value || typeof value !== 'object') return null;
  const status = (value as { status?: unknown }).status;
  return typeof status === 'string' ? (value as JobStatus) : null;
}

function describeEnvelopeError(value: unknown): string {
  if (value && typeof value === 'object' && typeof (value as { error?: unknown }).error === 'string') {
    return (value as { error: string }).error;
  }
  return 'Job status unavailable';
}

/** Coerces an unknown future status to 'processing' so callers only ever see the union. */
function toLiveStatus(status: string): 'pending' | 'processing' {
  return status === 'pending' ? 'pending' : 'processing';
}

export async function watchJob({
  jobId,
  getStatus,
  progressEvents = jobProgressBus.subscribe,
  signal,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
  maxPollIntervalMs = DEFAULT_MAX_POLL_INTERVAL_MS,
  retryIntervalMs = DEFAULT_RETRY_INTERVAL_MS,
  errorCap = DEFAULT_POLL_ERROR_CAP,
  stallTimeoutMs = DEFAULT_STALL_TIMEOUT_MS,
  onUpdate,
}: WatchJobOptions): Promise<JobWatchOutcome> {
  if (signal?.aborted) return { kind: 'aborted' };

  let budget = makePollErrorBudget(errorCap);
  let interval = pollIntervalMs;
  let lastStatus: JobStatus;
  let seen: { status: string; progress: number; step?: number } | null = null;
  // Read through a function: `seen` is written inside closures, which the
  // compiler's narrowing of the enclosing scope does not see.
  const lastSeen = () => seen;
  let lastActivityAt = Date.now();
  let wake: (() => void) | null = null;
  let terminalPushed: boolean;

  /** Records an observation; true when it differs from the last one. */
  const observe = (status: string, progress: number, step?: number) => {
    const changed =
      !seen || seen.status !== status || seen.progress !== progress || seen.step !== step;
    if (changed) {
      if (!seen || seen.status !== status || status !== 'pending') lastActivityAt = Date.now();
      seen = { status, progress, step };
    }
    return changed;
  };

  const unsubscribe =
    progressEvents?.((event) => {
      if (event.jobId !== jobId) return;
      if (event.status !== undefined && isTerminalJobStatus(event.status)) {
        terminalPushed = true;
        wake?.();
        return;
      }
      const status = event.status ?? (seen?.status as string | undefined) ?? 'processing';
      const progress = event.progress ?? seen?.progress ?? 0;
      const step = event.step ?? seen?.step;
      if (observe(status, progress, step)) {
        onUpdate?.({ status: toLiveStatus(status), progress, step, source: 'push' });
      }
    }) ?? null;

  const onAbort = () => wake?.();
  signal?.addEventListener('abort', onAbort);

  const sleep = (ms: number) =>
    new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        wake = null;
        resolve();
      }, ms);
      wake = () => {
        clearTimeout(timer);
        wake = null;
        resolve();
      };
    });

  try {
    for (;;) {
      if (signal?.aborted) return { kind: 'aborted' };

      let status: JobStatus | null = null;
      let failure: unknown = null;
      try {
        const raw = await getStatus(jobId);
        status = readJobStatus(raw);
        if (!status) failure = new Error(describeEnvelopeError(raw));
      } catch (error) {
        failure = error;
      }
      if (signal?.aborted) return { kind: 'aborted' };

      if (!status) {
        const outcome = recordPollError(budget);
        budget = outcome.budget;
        if (outcome.exhausted) return { kind: 'lost', error: failure };
        await sleep(retryIntervalMs);
        continue;
      }

      budget = recordPollSuccess(budget);
      lastStatus = status;
      terminalPushed = false;

      if (status.status === 'completed' || status.status === 'failed' || status.status === 'cancelled') {
        return { kind: status.status, status };
      }

      const progress = typeof status.progress === 'number' ? status.progress : (lastSeen()?.progress ?? 0);
      const step = typeof status.step === 'number' ? status.step : lastSeen()?.step;
      if (observe(status.status, progress, step)) {
        interval = pollIntervalMs;
        onUpdate?.({ status: toLiveStatus(status.status), progress, step, source: 'poll' });
      } else {
        interval = Math.min(maxPollIntervalMs, Math.round(interval * BACKOFF_FACTOR));
      }

      if (
        stallTimeoutMs > 0 &&
        Number.isFinite(stallTimeoutMs) &&
        status.status !== 'pending' &&
        Date.now() - lastActivityAt >= stallTimeoutMs
      ) {
        return { kind: 'stalled', lastStatus };
      }

      // A terminal push that arrived while the status read was in flight
      // must not wait out a full interval.
      if (!terminalPushed) await sleep(interval);
    }
  } finally {
    unsubscribe?.();
    signal?.removeEventListener('abort', onAbort);
    wake = null;
  }
}

/** Abort-aware delay shared by the job runners. Rejects when `signal` aborts. */
export function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('delay aborted'));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    function onAbort() {
      clearTimeout(timer);
      reject(new Error('delay aborted'));
    }
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}
