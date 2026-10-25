import { isTerminalJobStatus, type OpenRouterImageJobStatus } from './openRouterImageRouting';

/**
 * Retention for the in-process hosted job stores (OpenRouter image,
 * HuggingFace image / video). Those Maps live for the whole app session and
 * every finished job keeps its params and result paths, so a long session
 * grew them without bound. Finished jobs older than this are dropped on
 * insert and on list; in-flight jobs are never pruned.
 */
export const FINISHED_JOB_RETENTION_MS = 24 * 60 * 60 * 1000;

type RetainableJob = {
  status: OpenRouterImageJobStatus;
  created_at: string;
  completed_at?: string;
};

export type JobRetentionOptions = {
  /** Clock for age checks; tests inject a fixed one. */
  now?: () => number;
  retentionMs?: number;
};

export function pruneFinishedJobs<J extends RetainableJob>(
  jobs: Map<string, J>,
  { now = Date.now, retentionMs = FINISHED_JOB_RETENTION_MS }: JobRetentionOptions = {},
): void {
  const cutoff = now() - retentionMs;
  for (const [jobId, job] of jobs) {
    if (!isTerminalJobStatus(job.status)) {
      continue;
    }
    const finishedAt = Date.parse(job.completed_at ?? job.created_at);
    if (Number.isFinite(finishedAt) && finishedAt < cutoff) {
      jobs.delete(jobId);
    }
  }
}
