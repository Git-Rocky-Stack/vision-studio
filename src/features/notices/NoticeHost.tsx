import { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { X } from 'lucide-react';
import { cn } from '@/utils/cn';
import { Led } from '@/components/hardware/Led';
import {
  NOTICE_TIMEOUT_MS,
  markNoticeHostMounted,
  registerNoticeHostMounter,
  useNoticeStore,
  type Notice,
} from './notices';

const TONE_LED: Record<Notice['tone'], string> = {
  success: 'play',
  error: 'rec',
  info: 'jog',
};

function NoticeItem({ notice }: { notice: Notice }) {
  const dismiss = useNoticeStore((s) => s.dismiss);
  useEffect(() => {
    const timer = window.setTimeout(() => dismiss(notice.id), NOTICE_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [dismiss, notice.id]);

  return (
    <div
      role={notice.tone === 'error' ? 'alert' : 'status'}
      className="raised-panel pointer-events-auto flex items-start gap-2 px-3 py-2"
    >
      <Led color={TONE_LED[notice.tone]} size={6} className="mt-1.5" />
      <p className="flex-1 type-caption text-text-primary">{notice.message}</p>
      <button
        type="button"
        onClick={() => dismiss(notice.id)}
        aria-label="Dismiss notice"
        className="rounded-md p-0.5 text-text-muted transition hover:text-text-primary"
      >
        <X className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}

/** Bottom-right stack of action notices. */
export function NoticeHost({ className }: { className?: string }) {
  const notices = useNoticeStore((s) => s.notices);
  useEffect(() => {
    markNoticeHostMounted(true);
    return () => markNoticeHostMounted(false);
  }, []);

  return (
    <div
      aria-live="polite"
      className={cn(
        'pointer-events-none fixed bottom-4 right-4 z-[60] flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2',
        className,
      )}
    >
      {notices.map((notice) => (
        <NoticeItem key={notice.id} notice={notice} />
      ))}
    </div>
  );
}

let autoRoot: ReturnType<typeof createRoot> | null = null;

/** Mount a NoticeHost in its own root the first time a notice is pushed. */
export function ensureNoticeHost(): void {
  if (autoRoot || typeof document === 'undefined') return;
  const container = document.createElement('div');
  container.setAttribute('data-notice-host', '');
  document.body.appendChild(container);
  autoRoot = createRoot(container);
  autoRoot.render(<NoticeHost />);
}

// Under Vitest, component tests render <NoticeHost /> themselves when they
// assert on notices; a detached second root would outlive RTL cleanup.
if (import.meta.env?.MODE !== 'test') {
  registerNoticeHostMounter(ensureNoticeHost);
}
