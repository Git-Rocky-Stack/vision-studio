import { useSyncExternalStore } from 'react';

import { getElectronBridge } from '@/utils/electronBridge';

/**
 * The backend status-change payload with the optional failure reason the main
 * process now attaches (e.g. "Port 8000 is in use by another application").
 *
 * Local extension until `src/types/electron.d.ts` / `electron/preload.ts`
 * declare `error?: string` on `backend.onStatusChange` (cross-boundary request).
 */
export interface BackendStatusEvent {
  running: boolean;
  error?: string;
}

type StatusSubscriber = (callback: (status: BackendStatusEvent) => void) => () => void;

let latestError: string | null = null;
let unsubscribeBridge: (() => void) | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((listener) => listener());
}

/** Applies one status event: a reason replaces the last one, a clean event clears it. */
export function applyBackendStatusEvent(status: BackendStatusEvent | null | undefined): void {
  const reason = typeof status?.error === 'string' ? status.error.trim() : '';
  const next = reason ? reason : null;
  if (next === latestError) return;
  latestError = next;
  emit();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  // One IPC listener for the whole renderer, opened by the first consumer and
  // closed with the last, however many surfaces show the backend state.
  if (!unsubscribeBridge) {
    const onStatusChange = getElectronBridge()?.backend?.onStatusChange as StatusSubscriber | undefined;
    unsubscribeBridge = onStatusChange?.((status) => applyBackendStatusEvent(status)) ?? null;
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && unsubscribeBridge) {
      unsubscribeBridge();
      unsubscribeBridge = null;
    }
  };
}

function getSnapshot(): string | null {
  return latestError;
}

/**
 * The reason the backend last reported for failing to start or stopping, or
 * null when the latest status event carried none.
 */
export function useBackendStatusError(): string | null {
  return useSyncExternalStore(subscribe, getSnapshot, () => null);
}

/** Test seam: drop the cached reason and any bridge subscription. */
export function resetBackendStatusErrorForTests(): void {
  unsubscribeBridge?.();
  unsubscribeBridge = null;
  latestError = null;
  listeners.clear();
}
