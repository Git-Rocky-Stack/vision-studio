import { z } from 'zod';
import type { GenerationJob } from '@/store/appStore.types';

/**
 * The `generation:progress` push (#J15). The backend WebSocket and the hosted
 * OpenRouter / HuggingFace job stores both emit
 * `{ type: 'job_update', job_id, status, progress }`; the bridge forwards it
 * as `any`. Every renderer consumer goes through this parser, so a malformed
 * or future-shaped frame is dropped here instead of writing an unknown status
 * or a NaN progress into the job store.
 */

export const JOB_STATUSES = ['pending', 'processing', 'completed', 'failed', 'cancelled'] as const;
export type JobStatusValue = (typeof JOB_STATUSES)[number];

export const TERMINAL_JOB_STATUSES: ReadonlySet<JobStatusValue> = new Set([
  'completed',
  'failed',
  'cancelled',
]);

export function isTerminalJobStatus(status: unknown): status is 'completed' | 'failed' | 'cancelled' {
  return typeof status === 'string' && TERMINAL_JOB_STATUSES.has(status as JobStatusValue);
}

const jobProgressEventSchema = z.object({
  type: z.literal('job_update').optional(),
  job_id: z.string().min(1),
  status: z.enum(JOB_STATUSES).optional(),
  progress: z.number().optional(),
  step: z.number().int().nonnegative().optional(),
});

export interface JobProgressEvent {
  jobId: string;
  status?: JobStatusValue;
  /** 0-100, clamped. */
  progress?: number;
  step?: number;
}

/** Validates one raw push payload; null when it is not a usable job update. */
export function parseJobProgressEvent(raw: unknown): JobProgressEvent | null {
  const parsed = jobProgressEventSchema.safeParse(raw);
  if (!parsed.success) return null;
  const { job_id: jobId, status, progress, step } = parsed.data;
  if (status === undefined && progress === undefined && step === undefined) return null;
  return {
    jobId,
    ...(status !== undefined ? { status } : {}),
    ...(progress !== undefined ? { progress: Math.min(100, Math.max(0, progress)) } : {}),
    ...(step !== undefined ? { step } : {}),
  };
}

/**
 * The store patch a push may apply on its own. Terminal statuses are left to
 * the job watcher: the push carries no result, and moving a job to
 * completedJobs without one would drop the result the watcher fetches next.
 */
export function toLiveJobPatch(event: JobProgressEvent): Partial<GenerationJob> | null {
  if (event.status !== undefined && isTerminalJobStatus(event.status)) return null;
  const patch: Partial<GenerationJob> = {};
  if (event.status !== undefined) patch.status = event.status;
  if (event.progress !== undefined) patch.progress = event.progress;
  if (event.step !== undefined) patch.step = event.step;
  return Object.keys(patch).length > 0 ? patch : null;
}
