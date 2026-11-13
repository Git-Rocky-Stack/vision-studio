/**
 * Renderer error reporting shared by every ErrorBoundary and the global
 * `unhandledrejection` / `error` handlers (#J5/#J6).
 *
 * Each report is logged with its context. A user-facing notice is pushed too,
 * de-duplicated per message for a short window so a render loop or a rejection
 * storm produces one notice, not dozens.
 */

import { pushNotice } from '@/features/notices/notices';

const NOTICE_DEDUPE_WINDOW_MS = 5000;
const recentNotices = new Map<string, number>();

export interface RendererErrorContext {
  /** Where it was caught: a boundary label, 'unhandledrejection', ... */
  source: string;
  componentStack?: string | null;
  /** Push a user notice (default true). Boundaries render their own fallback. */
  notify?: boolean;
}

export function describeError(error: unknown): string {
  if (error instanceof Error) return error.message || error.name;
  if (typeof error === 'string') return error;
  try {
    return JSON.stringify(error) ?? String(error);
  } catch {
    return String(error);
  }
}

function pushDedupedNotice(message: string) {
  const now = Date.now();
  const last = recentNotices.get(message);
  if (last !== undefined && now - last < NOTICE_DEDUPE_WINDOW_MS) return;
  recentNotices.set(message, now);
  if (recentNotices.size > 50) {
    const oldest = recentNotices.keys().next().value;
    if (oldest !== undefined) recentNotices.delete(oldest);
  }
  // The notice store only: its host is UI that main.tsx registers.
  pushNotice('error', message);
}

export function reportRendererError(error: unknown, context: RendererErrorContext): void {
  console.error(`[renderer] ${context.source}:`, error, context.componentStack ?? '');
  if (context.notify === false) return;
  pushDedupedNotice(`Something went wrong (${context.source}): ${describeError(error)}`);
}

/**
 * True for rejections that are expected control flow, not faults: an aborted
 * fetch/operation (user cancel, unmount) carries no news for the user.
 */
export function isBenignRejection(reason: unknown): boolean {
  return (
    (reason instanceof DOMException && reason.name === 'AbortError') ||
    (reason instanceof Error && reason.name === 'AbortError')
  );
}

/**
 * Installs the renderer-wide handlers for promise rejections nobody awaited
 * and for uncaught errors outside React's render. Returns the teardown.
 */
export function installGlobalErrorHandlers(target: Window = window): () => void {
  const onRejection = (event: PromiseRejectionEvent) => {
    if (isBenignRejection(event.reason)) {
      event.preventDefault();
      return;
    }
    // Logged here with context, so the browser's duplicate is suppressed.
    event.preventDefault();
    reportRendererError(event.reason, { source: 'unhandled promise rejection' });
  };
  const onError = (event: ErrorEvent) => {
    // Resource load errors (img/script) do not bubble to window as ErrorEvents
    // with an error object; only report real script errors.
    if (!event.error) return;
    reportRendererError(event.error, { source: 'uncaught error' });
  };
  target.addEventListener('unhandledrejection', onRejection);
  target.addEventListener('error', onError);
  return () => {
    target.removeEventListener('unhandledrejection', onRejection);
    target.removeEventListener('error', onError);
  };
}

/** Test seam: forget the de-duplication window. */
export function resetReportedNotices(): void {
  recentNotices.clear();
}
