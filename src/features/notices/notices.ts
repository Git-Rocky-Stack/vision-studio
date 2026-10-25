import { create } from 'zustand';

/**
 * In-app action notices: short success/error reports for actions whose
 * surface closes or has no room for an inline message (a context menu item,
 * an export from a list row, a background pipeline run). Kept in its own
 * store so it never enters the persisted app state.
 *
 * The host renders itself on first use (see NoticeHost / ensureNoticeHost),
 * so no layout file has to mount it.
 */

export type NoticeTone = 'success' | 'error' | 'info';

export interface Notice {
  id: string;
  tone: NoticeTone;
  message: string;
}

interface NoticeState {
  notices: Notice[];
  push: (notice: Omit<Notice, 'id'>) => string;
  dismiss: (id: string) => void;
  clear: () => void;
}

const MAX_NOTICES = 4;
export const NOTICE_TIMEOUT_MS = 6000;

let counter = 0;

export const useNoticeStore = create<NoticeState>((set) => ({
  notices: [],
  push: (notice) => {
    counter += 1;
    const id = `notice-${counter}`;
    set((state) => ({ notices: [...state.notices, { ...notice, id }].slice(-MAX_NOTICES) }));
    return id;
  },
  dismiss: (id) => set((state) => ({ notices: state.notices.filter((n) => n.id !== id) })),
  clear: () => set({ notices: [] }),
}));

type HostMounter = () => void;
let hostMounter: HostMounter | null = null;
let hostMounted = false;

/** Registered by NoticeHost.tsx; lets pushNotice mount the host lazily. */
export function registerNoticeHostMounter(mounter: HostMounter | null): void {
  hostMounter = mounter;
}

export function markNoticeHostMounted(mounted: boolean): void {
  hostMounted = mounted;
}

export function pushNotice(tone: NoticeTone, message: string): string {
  const id = useNoticeStore.getState().push({ tone, message });
  if (!hostMounted) hostMounter?.();
  return id;
}

export function reportActionError(message: string): string {
  return pushNotice('error', message);
}

/**
 * Shared handler for every `assets.export` / `assets.exportMany` call site:
 * the bridge resolves `{ success: false, error }` instead of throwing, which
 * the call sites used to ignore.
 */
export function reportExportResult(
  result: { success: boolean; error?: string; exportedCount?: number } | null | undefined,
  { successMessage }: { successMessage?: string } = {},
): boolean {
  if (!result?.success) {
    reportActionError(result?.error ? `Export failed: ${result.error}` : 'Export failed.');
    return false;
  }
  if (successMessage) pushNotice('success', successMessage);
  return true;
}

/** Await an export call, reporting both resolved failures and thrown errors. */
export async function runExport(
  call: () => Promise<{ success: boolean; error?: string; exportedCount?: number }>,
  options?: { successMessage?: string },
): Promise<boolean> {
  try {
    return reportExportResult(await call(), options);
  } catch (error) {
    reportActionError(`Export failed: ${error instanceof Error ? error.message : 'unknown error'}`);
    return false;
  }
}
