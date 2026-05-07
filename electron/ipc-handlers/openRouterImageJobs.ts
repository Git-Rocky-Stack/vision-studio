import type { OpenRouterImageJobStatus } from './openRouterImageRouting';

/**
 * In-process store for OpenRouter still-image jobs.
 *
 * The Python backend keeps its own job store; this one mirrors the
 * lifecycle of OpenRouter jobs (pending -> processing -> completed |
 * failed | cancelled) so the IPC layer can answer get-status / cancel /
 * list-jobs immediately without a network round-trip.
 *
 * Every mutation broadcasts a `generation:progress` event via the
 * injected `emit` so the renderer can stream lifecycle changes without
 * polling. `emit` is dependency-injected (rather than reaching into a
 * module-level BrowserWindow) so tests stay fast and isolated, and so
 * the same store works headlessly from background services.
 *
 * `getStatus` and `values` strip the in-flight AbortController so the
 * payload is safe to send across the IPC boundary (AbortControllers do
 * not survive structuredClone).
 */

export type OpenRouterImageJob = {
  job_id: string;
  status: OpenRouterImageJobStatus;
  progress: number;
  type: 'image';
  created_at: string;
  completed_at?: string;
  error?: string;
  result?: {
    images?: string[];
    seed?: number;
    provider?: 'openrouter';
    provider_response_id?: string | null;
    provider_message?: string;
    model?: string | null;
    usage?: unknown;
  };
  params?: Record<string, unknown>;
  abortController?: AbortController;
};

export type OpenRouterImageJobSnapshot = Omit<OpenRouterImageJob, 'abortController'>;

export type OpenRouterImageJobEmit = (channel: string, payload: unknown) => void;

export type OpenRouterImageJobStore = {
  get(jobId: string): OpenRouterImageJob | null;
  getStatus(jobId: string): OpenRouterImageJobSnapshot | null;
  set(job: OpenRouterImageJob): OpenRouterImageJob;
  patch(jobId: string, patch: Partial<OpenRouterImageJob>): OpenRouterImageJob | null;
  values(): OpenRouterImageJobSnapshot[];
};

function snapshot(job: OpenRouterImageJob): OpenRouterImageJobSnapshot {
  const { abortController: _abortController, ...rest } = job;
  return rest;
}

export function createOpenRouterImageJobStore({
  emit,
}: {
  emit: OpenRouterImageJobEmit;
}): OpenRouterImageJobStore {
  const jobs = new Map<string, OpenRouterImageJob>();

  function emitProgress(job: OpenRouterImageJob) {
    emit('generation:progress', {
      type: 'job_update',
      job_id: job.job_id,
      status: job.status,
      progress: job.progress,
    });
  }

  return {
    get(jobId) {
      return jobs.get(jobId) ?? null;
    },
    getStatus(jobId) {
      const job = jobs.get(jobId);
      return job ? snapshot(job) : null;
    },
    set(job) {
      jobs.set(job.job_id, job);
      emitProgress(job);
      return job;
    },
    patch(jobId, patch) {
      const current = jobs.get(jobId);
      if (!current) {
        return null;
      }
      const nextJob: OpenRouterImageJob = {
        ...current,
        ...patch,
        result: patch.result ? { ...current.result, ...patch.result } : current.result,
      };
      jobs.set(jobId, nextJob);
      emitProgress(nextJob);
      return nextJob;
    },
    values() {
      return Array.from(jobs.values()).map(snapshot);
    },
  };
}
