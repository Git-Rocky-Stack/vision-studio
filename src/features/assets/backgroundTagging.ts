import type { StoreApi } from 'zustand';

import type { AppState } from '@/store/appStore.types';

/**
 * How long the app must be quiet - no generation running, no new asset
 * queued - before the Background Batch backlog is tagged.
 */
export const BACKGROUND_TAGGING_IDLE_MS = 10_000;

type TaggingStore = Pick<StoreApi<AppState>, 'getState' | 'subscribe'>;

function isGenerating(state: AppState): boolean {
  return state.activeJobs.some((job) => job.status === 'pending' || job.status === 'processing');
}

/**
 * Background Batch tagging mode: enqueueForTagging queues new assets, and this
 * tags the whole queue in one pass once the app has been idle for
 * BACKGROUND_TAGGING_IDLE_MS. Only a change to the queue, the tagging mode, or
 * whether a generation is running restarts the wait; other store updates do
 * not, or an app in use would never count as idle.
 *
 * Returns a function that stops watching.
 */
export function startBackgroundTagging(
  store: TaggingStore,
  idleMs: number = BACKGROUND_TAGGING_IDLE_MS,
): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;

  const clearTimer = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const ready = (state: AppState) =>
    state.taggingMode === 'background-batch' && state.taggingQueue.length > 0 && !isGenerating(state);

  const drain = () => {
    timer = null;
    const state = store.getState();
    if (ready(state)) state.analyzeAssets([...state.taggingQueue]);
  };

  const schedule = (state: AppState) => {
    clearTimer();
    if (ready(state)) timer = setTimeout(drain, idleMs);
  };

  let seen = store.getState();
  schedule(seen);

  const unsubscribe = store.subscribe((state) => {
    const relevantChange =
      state.taggingQueue !== seen.taggingQueue ||
      state.taggingMode !== seen.taggingMode ||
      isGenerating(state) !== isGenerating(seen);
    seen = state;
    if (relevantChange) schedule(state);
  });

  let stopped = false;
  return () => {
    if (stopped) return;
    stopped = true;
    unsubscribe();
    clearTimer();
  };
}
