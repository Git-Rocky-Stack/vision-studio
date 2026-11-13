import { useAppStore } from '@/store/appStore';
import type { AppState, GenerationJob } from '@/store/appStore.types';
import { createJobWatcher, type JobOrigin } from './jobWatcher';

/**
 * The renderer's single job watcher, bound to the app store and the desktop
 * bridge. Panels submit through it and read the job back from the store.
 */
export const appJobWatcher = createJobWatcher({
  store: useAppStore,
  electron: () => (typeof window === 'undefined' ? null : (window as Partial<Window>).electron ?? null),
});

/** A job by id, wherever it currently lives (running or finished). */
export function selectJobById(state: AppState, jobId: string | null): GenerationJob | null {
  if (!jobId) return null;
  return (
    state.activeJobs.find((job) => job.id === jobId) ??
    state.completedJobs.find((job) => job.id === jobId) ??
    null
  );
}

/**
 * The newest still-running job a panel submitted, so a panel that remounts
 * (navigation away and back) picks its in-flight run up again.
 */
export function selectLatestRunningJob(state: AppState, origin: JobOrigin): GenerationJob | null {
  for (let index = state.activeJobs.length - 1; index >= 0; index -= 1) {
    const job = state.activeJobs[index];
    if (job.params.origin === origin && (job.status === 'pending' || job.status === 'processing')) {
      return job;
    }
  }
  return null;
}

/** Subscribes to one job record; null until the id is known. */
export function useTrackedJob(jobId: string | null): GenerationJob | null {
  return useAppStore((state) => selectJobById(state, jobId));
}
