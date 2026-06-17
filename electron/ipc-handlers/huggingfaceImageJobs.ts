import type { OpenRouterImageJobStatus } from './openRouterImageRouting';

/**
 * In-process store for HuggingFace still-image jobs (M6). Mirrors
 * openRouterImageJobs so the IPC layer answers get-status / cancel / list-jobs
 * immediately. Every mutation broadcasts generation:progress via the injected
 * emit, and snapshots strip the AbortController so payloads survive
 * structuredClone across the IPC boundary.
 */

export type HuggingFaceImageJob = {
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
    provider?: 'huggingface';
    model?: string | null;
  };
  params?: Record<string, unknown>;
  abortController?: AbortController;
};

export type HuggingFaceImageJobSnapshot = Omit<HuggingFaceImageJob, 'abortController'>;
export type HuggingFaceImageJobEmit = (channel: string, payload: unknown) => void;

export type HuggingFaceImageJobStore = {
  get(jobId: string): HuggingFaceImageJob | null;
  getStatus(jobId: string): HuggingFaceImageJobSnapshot | null;
  set(job: HuggingFaceImageJob): HuggingFaceImageJob;
  patch(jobId: string, patch: Partial<HuggingFaceImageJob>): HuggingFaceImageJob | null;
  values(): HuggingFaceImageJobSnapshot[];
};

function snapshot(job: HuggingFaceImageJob): HuggingFaceImageJobSnapshot {
  const { abortController: _abortController, ...rest } = job;
  return rest;
}

export function createHuggingFaceImageJobStore({ emit }: { emit: HuggingFaceImageJobEmit }): HuggingFaceImageJobStore {
  const jobs = new Map<string, HuggingFaceImageJob>();

  function emitProgress(job: HuggingFaceImageJob) {
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
      const nextJob: HuggingFaceImageJob = {
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
