import { parseJobProgressEvent, type JobProgressEvent } from './progressEvent';

export type JobProgressListener = (event: JobProgressEvent) => void;
export type JobProgressSubscribe = (listener: JobProgressListener) => () => void;

/** The bridge's raw `generation:progress` subscription. */
export type RawProgressSource = (callback: (data: unknown) => void) => () => void;

/**
 * One `generation:progress` IPC subscription shared by every consumer (the
 * App-level store bridge and each job watch). Payloads are validated once
 * (parseJobProgressEvent) and fanned out; the IPC listener is attached on the
 * first subscriber and detached after the last, so an idle renderer holds no
 * listener and N concurrent watches do not register N IPC handlers.
 */
export function createJobProgressBus(resolveSource: () => RawProgressSource | null | undefined) {
  const listeners = new Set<JobProgressListener>();
  let detach: (() => void) | null = null;

  const dispatch = (raw: unknown) => {
    const event = parseJobProgressEvent(raw);
    if (!event) return;
    for (const listener of Array.from(listeners)) {
      try {
        listener(event);
      } catch (error) {
        console.error('[jobs] progress listener failed', error);
      }
    }
  };

  const attach = () => {
    if (detach) return;
    let source: RawProgressSource | null | undefined;
    try {
      source = resolveSource();
    } catch {
      source = null;
    }
    if (!source) return;
    try {
      detach = source(dispatch);
    } catch (error) {
      console.error('[jobs] could not subscribe to generation progress', error);
      detach = null;
    }
  };

  const subscribe: JobProgressSubscribe = (listener) => {
    listeners.add(listener);
    attach();
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0 && detach) {
        const release = detach;
        detach = null;
        release();
      }
    };
  };

  return {
    subscribe,
    /** Test seam: listeners currently attached. */
    listenerCount: () => listeners.size,
  };
}

/** The renderer's shared bus over `window.electron.generation.onProgress`. */
export const jobProgressBus = createJobProgressBus(() => {
  if (typeof window === 'undefined') return null;
  const onProgress = (window as Partial<Window>).electron?.generation?.onProgress;
  return typeof onProgress === 'function' ? (onProgress as RawProgressSource) : null;
});
