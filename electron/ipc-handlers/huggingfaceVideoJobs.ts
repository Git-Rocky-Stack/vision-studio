import type { OpenRouterImageJobStatus } from './openRouterImageRouting';

/**
 * In-process store for HuggingFace text-to-video jobs (M6 PR2). Mirrors
 * huggingfaceImageJobs so the IPC layer answers get-status / cancel / list-jobs
 * immediately. Every mutation broadcasts generation:progress via the injected
 * emit, and snapshots strip the AbortController so payloads survive
 * structuredClone across the IPC boundary. The result carries a single video
 * path under `result.video`, matching JobStatus.
 */

export type HuggingFaceVideoJob = {
  job_id: string;
  status: OpenRouterImageJobStatus;
  progress: number;
  type: 'video';
  created_at: string;
  completed_at?: string;
  error?: string;
  result?: {
    video?: string;
    seed?: number;
    provider?: 'huggingface';
    model?: string | null;
  };
  params?: Record<string, unknown>;
  abortController?: AbortController;
};

export type HuggingFaceVideoJobSnapshot = Omit<HuggingFaceVideoJob, 'abortController'>;
export type HuggingFaceVideoJobEmit = (channel: string, payload: unknown) => void;

export type HuggingFaceVideoJobStore = {
  get(jobId: string): HuggingFaceVideoJob | null;
  getStatus(jobId: string): HuggingFaceVideoJobSnapshot | null;
  set(job: HuggingFaceVideoJob): HuggingFaceVideoJob;
  patch(jobId: string, patch: Partial<HuggingFaceVideoJob>): HuggingFaceVideoJob | null;
  values(): HuggingFaceVideoJobSnapshot[];
};

function snapshot(job: HuggingFaceVideoJob): HuggingFaceVideoJobSnapshot {
  const { abortController: _abortController, ...rest } = job;
  return rest;
}

export function createHuggingFaceVideoJobStore({
  emit,
}: {
  emit: HuggingFaceVideoJobEmit;
}): HuggingFaceVideoJobStore {
  const jobs = new Map<string, HuggingFaceVideoJob>();

  function emitProgress(job: HuggingFaceVideoJob) {
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
      const nextJob: HuggingFaceVideoJob = {
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
