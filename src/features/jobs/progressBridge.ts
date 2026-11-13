import type { StoreApi, UseBoundStore } from 'zustand';

import type { AppState } from '@/store/appStore.types';
import { jobProgressBus, type JobProgressSubscribe } from './progressBus';
import { toLiveJobPatch } from './progressEvent';

/**
 * App-level `generation:progress` -> job store bridge (#J15).
 *
 * Every push is validated (parseJobProgressEvent, via the bus) before it
 * touches the store, and only live updates are applied: a terminal status is
 * left to the job's watcher, which fetches the full status (with its result)
 * and settles the job exactly once. Applying the bare terminal push here used
 * to move the job to completedJobs without a result, after which the watcher's
 * update with the result was dropped as "no longer active".
 */
export function startJobProgressBridge({
  store,
  subscribe = jobProgressBus.subscribe,
}: {
  store: UseBoundStore<StoreApi<AppState>>;
  subscribe?: JobProgressSubscribe;
}): () => void {
  return subscribe((event) => {
    const patch = toLiveJobPatch(event);
    if (patch) store.getState().updateJob(event.jobId, patch);
  });
}
