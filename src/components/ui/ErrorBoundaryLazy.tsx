import { lazy, type ComponentProps, type ComponentType, type LazyExoticComponent } from 'react';

/**
 * A code-split component whose failed import can be retried (#J5).
 *
 * React.lazy caches the promise it was given forever: once a chunk fails to
 * load (offline, a dev-server restart, a stale build), every later render of
 * that lazy component rethrows the same rejection, so an ErrorBoundary
 * "Retry" re-renders straight back into the error. `reset()` swaps in a fresh
 * lazy() over a fresh import(), and the wrapper renders whichever is current,
 * so a boundary retry (which re-renders its subtree) actually re-fetches.
 */

/**
 * Whatever React.lazy accepts as a module's default export, derived from
 * lazy's own signature so the constraint can never drift from React's.
 */
type LazyLoadable = Awaited<ReturnType<Parameters<typeof lazy>[0]>>['default'];

export interface RetryableLazy<T extends LazyLoadable> {
  Component: T;
  reset: () => void;
}

export function retryableLazy<T extends LazyLoadable>(
  load: () => Promise<{ default: T }>,
): RetryableLazy<T> {
  let failed = false;
  const tracked = () => {
    const attempt = load();
    attempt.catch(() => {
      failed = true;
    });
    return attempt;
  };
  let current: LazyExoticComponent<T> = lazy(tracked);

  function RetryableLazyComponent(props: ComponentProps<T>) {
    // Read at render time: reset() may have swapped in a fresh lazy().
    const Current = current as unknown as ComponentType<ComponentProps<T>>;
    return <Current {...props} />;
  }

  return {
    Component: RetryableLazyComponent as unknown as T,
    reset: () => {
      // A loaded chunk stays cached: only a failed one is worth re-fetching.
      if (!failed) return;
      failed = false;
      current = lazy(tracked);
    },
  };
}
