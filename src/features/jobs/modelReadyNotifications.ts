import { useEffect } from 'react';
import type { StoreApi, UseBoundStore } from 'zustand';

import { useAppStore } from '@/store/appStore';
import type { AppState } from '@/store/appStore.types';
import type { DownloadJob, DownloadStatus } from '@/types/model';

/**
 * App-level "Model Ready" notifications (#J11).
 *
 * The notification used to fire from an effect inside SettingsPanel, so a
 * download that finished while Settings was closed - started from Foundry, or
 * left running while the user generated - refreshed nothing and notified no
 * one. This watches the store's download queue for the whole session:
 * - while any download is in flight it refreshes the queue on an interval,
 *   so completion is observed even when no panel is polling;
 * - when a download turns 'ready' it reloads the model catalog once, then
 *   sends one desktop notification per finished model.
 * A download already 'ready' when first observed is not announced.
 */

const ACTIVE_DOWNLOAD_STATUSES = new Set<DownloadStatus>(['queued', 'downloading', 'verifying']);
export const MODEL_DOWNLOAD_POLL_INTERVAL_MS = 2500;

interface ModelReadyElectronApi {
  notifications?: {
    notify: (
      type: 'model_download',
      payload: { title: string; body: string },
    ) => Promise<{ success: boolean; skipped?: boolean }>;
  };
}

export interface ModelReadyNotificationOptions {
  store?: UseBoundStore<StoreApi<AppState>>;
  electron?: () => ModelReadyElectronApi | null | undefined;
  pollIntervalMs?: number;
}

function hasActiveDownload(downloads: Record<string, DownloadJob>) {
  return Object.values(downloads).some((job) => ACTIVE_DOWNLOAD_STATUSES.has(job.status));
}

/** Starts the watcher; returns the teardown. */
export function startModelReadyNotifications({
  store = useAppStore,
  electron = () => (typeof window === 'undefined' ? null : (window as Partial<Window>).electron ?? null),
  pollIntervalMs = MODEL_DOWNLOAD_POLL_INTERVAL_MS,
}: ModelReadyNotificationOptions = {}): () => void {
  let previous: Record<string, DownloadStatus> = {};
  let pollTimer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;

  const announce = async (modelIds: string[]) => {
    try {
      await store.getState().loadModels();
    } catch (error) {
      console.error('[models] catalog refresh after download failed', error);
    }
    if (stopped) return;
    const api = electron();
    if (!api?.notifications) return;
    const installed = store.getState().availableModels;
    for (const id of modelIds) {
      const model = installed.find((entry) => entry.id === id);
      try {
        await api.notifications.notify('model_download', {
          title: 'Model Ready',
          body: `${model?.name ?? 'Model'} is installed and ready to use.`,
        });
      } catch (error) {
        console.error('[models] Model Ready notification failed', error);
      }
    }
  };

  const schedulePoll = (downloads: Record<string, DownloadJob>) => {
    if (pollTimer !== null || stopped || !hasActiveDownload(downloads)) return;
    pollTimer = setTimeout(() => {
      pollTimer = null;
      if (stopped) return;
      void store
        .getState()
        .refreshDownloads()
        .catch((error: unknown) => console.error('[models] download refresh failed', error))
        .finally(() => schedulePoll(store.getState().downloads));
    }, pollIntervalMs);
  };

  const observe = (downloads: Record<string, DownloadJob>) => {
    const becameReady: string[] = [];
    const snapshot: Record<string, DownloadStatus> = {};
    for (const [id, job] of Object.entries(downloads)) {
      snapshot[id] = job.status;
      if (job.status === 'ready' && previous[id] !== undefined && previous[id] !== 'ready') {
        becameReady.push(id);
      }
    }
    previous = snapshot;
    if (becameReady.length > 0) void announce(becameReady);
    schedulePoll(downloads);
  };

  observe(store.getState().downloads);
  const unsubscribe = store.subscribe((state, prevState) => {
    if (state.downloads !== prevState.downloads) observe(state.downloads);
  });

  return () => {
    stopped = true;
    unsubscribe();
    if (pollTimer !== null) clearTimeout(pollTimer);
    pollTimer = null;
  };
}

/** Mounts the watcher for the lifetime of the calling component (App). */
export function useModelReadyNotifications(): void {
  useEffect(() => startModelReadyNotifications(), []);
}
