import { useEffect, useMemo, useState } from 'react';
import { Download, ExternalLink, RefreshCw, RotateCcw } from 'lucide-react';
import packageJson from '../../../package.json';
import licensesMarkdown from '../../../THIRD-PARTY-LICENSES.md?raw';
import { Button } from '@/components/ui/Button';
import { useAppStore } from '@/store/appStore';
import { formatBytes, formatSpeed } from '@/utils/formatUtils';
import {
  parseLicensesMarkdown,
  type LicenseSpan,
} from '@/features/licenses/parseLicensesMarkdown';
import type { UpdaterStatus } from '@/types/electron';

function Spans({ spans }: { spans: LicenseSpan[] }) {
  return (
    <>
      {spans.map((span, index) => {
        if (span.kind === 'bold') {
          return (
            <strong key={index} className="font-medium text-text-primary">
              {span.text}
            </strong>
          );
        }
        if (span.kind === 'code') {
          return (
            <code key={index} className="data-mono text-text-primary">
              {span.text}
            </code>
          );
        }
        if (span.kind === 'link') {
          return (
            <a
              key={index}
              href={span.url}
              onClick={(event) => {
                event.preventDefault();
                void window.electron?.app?.openExternal(span.url);
              }}
              className="inline-flex min-h-6 items-center gap-0.5 text-accent-primary underline decoration-border underline-offset-2 hover:text-accent-primary-hover"
            >
              {span.text}
              <ExternalLink aria-hidden="true" className="h-3 w-3" />
            </a>
          );
        }
        return <span key={index}>{span.text}</span>;
      })}
    </>
  );
}

/** " 3.2.0" when the version is known, else "" - for inline copy. */
function versionSuffix(status: UpdaterStatus): string {
  return status.version ? ` ${status.version}` : '';
}

/** Human copy for each live updater state - values come only from the
 * pushed UpdaterStatus, never from local animation. */
function updateStatusLine(status: UpdaterStatus | null): string {
  if (status === null) return 'Automatic updates run in the installed app.';
  switch (status.state) {
    case 'disabled':
      return 'Automatic updates run in the installed app.';
    case 'checking':
      return 'Checking for updates...';
    case 'available':
      return `Update${versionSuffix(status)} is available. Nothing downloads until you choose Download update.`;
    case 'downloading':
      return `Downloading update${versionSuffix(status)}: ${Math.round(status.percent ?? 0)}%`;
    case 'downloaded':
      return `Update${versionSuffix(status)} ready. Restart to apply.`;
    case 'not-available':
      return 'You are on the latest version.';
    case 'error':
      // A version on an error means the download (not the check) failed.
      return status.version
        ? `Update${versionSuffix(status)} download failed: ${status.message ?? 'unknown error'}`
        : `Update check failed: ${status.message ?? 'unknown error'}`;
    case 'idle':
    default:
      return 'Updates are checked automatically.';
  }
}

/** "120.0 MB of 2.1 GB, 12.4 MB/s" from the real progress fields, or '' when unknown. */
function downloadDetail(status: UpdaterStatus): string {
  const parts: string[] = [];
  if (typeof status.transferred === 'number' && typeof status.total === 'number' && status.total > 0) {
    parts.push(`${formatBytes(status.transferred)} of ${formatBytes(status.total)}`);
  }
  const speed = typeof status.bytesPerSecond === 'number' ? formatSpeed(status.bytesPerSecond) : '';
  if (speed) {
    parts.push(speed);
  }
  return parts.join(', ');
}

/**
 * An action reply must not roll back a newer pushed status: a progress push
 * can reach the renderer before the `updater:download` reply does.
 */
function mergeReply(current: UpdaterStatus | null, reply: UpdaterStatus): UpdaterStatus {
  if (current?.state === 'downloaded') return current;
  if (current?.state === 'downloading' && reply.state === 'downloading') return current;
  return reply;
}

type UpdateAction = 'check' | 'download' | 'install';

const ACTION_FAILURE: Record<UpdateAction, string> = {
  check: 'Could not check for updates.',
  download: 'Could not start the update download.',
  install: 'Could not start the update.',
};

/**
 * #34 installer PR4: live auto-update status + actions. State is fed by the
 * main-process updater service (real electron-updater events over
 * updater:status); check, download and restart round-trip through the same
 * service. Nothing downloads until the user chooses Download update - the
 * installer is several GB. Without the bridge (dev/web) the block degrades to
 * the disabled explanation.
 */
function UpdatesBlock() {
  const [status, setStatus] = useState<UpdaterStatus | null>(null);
  const [pendingAction, setPendingAction] = useState<UpdateAction | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const updater = window.electron?.updater;

  useEffect(() => {
    if (!updater) return;
    let mounted = true;
    updater.getStatus().then(
      (snapshot) => {
        if (mounted) setStatus(snapshot);
      },
      () => {
        // The pushed stream still delivers the next status.
      },
    );
    const unsubscribe = updater.onStatus((snapshot) => {
      setStatus(snapshot);
    });
    return () => {
      mounted = false;
      unsubscribe();
    };
    // The bridge object is fixed for the lifetime of the window, so this
    // subscribes once per mount.
  }, [updater]);

  async function runAction(action: UpdateAction, call: () => Promise<UpdaterStatus | void>) {
    setPendingAction(action);
    setActionError(null);
    try {
      const reply = await call();
      if (reply) {
        setStatus((current) => mergeReply(current, reply));
      }
    } catch (error) {
      setActionError(error instanceof Error && error.message ? error.message : ACTION_FAILURE[action]);
    } finally {
      setPendingAction(null);
    }
  }

  const state = status?.state ?? null;
  const busy = pendingAction !== null;
  const checkDisabled =
    !updater ||
    busy ||
    state === null ||
    state === 'disabled' ||
    state === 'checking' ||
    state === 'downloading' ||
    state === 'downloaded';
  // A failed download keeps its version, so it can be retried directly.
  const canDownload = Boolean(updater) && (state === 'available' || (state === 'error' && Boolean(status?.version)));
  const isRetry = state === 'error';
  const percent = Math.min(100, Math.max(0, status?.percent ?? 0));
  const detail = status && state === 'downloading' ? downloadDetail(status) : '';

  return (
    <div data-testid="about-updates">
      <p className="mono-label text-text-muted">Updates</p>
      <p
        data-testid="about-updates-status"
        aria-live="polite"
        className="mt-2 max-w-[65ch] text-sm leading-relaxed text-text-body"
      >
        {updateStatusLine(status)}
      </p>

      {state === 'downloading' && (
        <div data-testid="about-updates-progress" className="mt-3 max-w-[65ch]">
          <div
            className="recessed-well h-1.5 w-full overflow-hidden rounded-full"
            role="progressbar"
            aria-label="Update download progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(percent)}
            aria-valuetext={detail ? `${Math.round(percent)}%, ${detail}` : `${Math.round(percent)}%`}
          >
            <div
              className="h-full rounded-full bg-accent-primary transition-[width] duration-300"
              style={{ width: `${percent}%` }}
            />
          </div>
          {detail && <p className="data-mono mt-1.5 text-text-muted">{detail}</p>}
        </div>
      )}

      {actionError && (
        <p
          role="alert"
          data-testid="about-updates-action-error"
          className="mt-2 max-w-[65ch] text-sm leading-relaxed text-status-error"
        >
          {actionError}
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          icon={RefreshCw}
          data-testid="about-updates-check"
          disabled={checkDisabled}
          isLoading={pendingAction === 'check'}
          loadingLabel="Checking..."
          onClick={() => {
            if (updater) void runAction('check', () => updater.check());
          }}
        >
          Check for updates
        </Button>
        {canDownload && (
          <Button
            type="button"
            variant="primary"
            size="sm"
            icon={Download}
            data-testid="about-updates-download"
            disabled={busy}
            isLoading={pendingAction === 'download'}
            loadingLabel="Starting download..."
            onClick={() => {
              if (updater) void runAction('download', () => updater.download());
            }}
          >
            {isRetry ? 'Retry download' : 'Download update'}
          </Button>
        )}
        {state === 'downloaded' && (
          <Button
            type="button"
            variant="primary"
            size="sm"
            icon={RotateCcw}
            data-testid="about-updates-install"
            disabled={busy}
            isLoading={pendingAction === 'install'}
            loadingLabel="Preparing restart..."
            onClick={() => {
              if (updater) void runAction('install', () => updater.install());
            }}
          >
            Restart to update
          </Button>
        )}
      </div>
    </div>
  );
}

/**
 * #34 installer PR3: About > Licenses (spec 4 compliance artifacts).
 *
 * Renders the exact THIRD-PARTY-LICENSES.md the installer ships (raw import;
 * the file itself is drift-guarded against the generator by
 * backend/tests/test_notices.py), plus the live "Powered by Stability AI"
 * mark while any Stability-Community model is installed. When the backend is
 * unreachable the mark stays visible - absence can only be proven by a valid
 * snapshot, and over-attribution is the compliance-safe failure mode.
 */
export function AboutSection() {
  const provisionStatus = useAppStore((s) => s.provisionStatus);
  const blocks = useMemo(() => parseLicensesMarkdown(licensesMarkdown), []);

  const attribution =
    provisionStatus === null
      ? 'Powered by Stability AI'
      : provisionStatus.models.find((m) => m.attribution && m.status === 'ready')
          ?.attribution ?? null;

  return (
    <div data-testid="settings-about" className="flex flex-col gap-6">
      <div>
        <p className="mono-label text-text-muted">About</p>
        <h2 className="mt-1 type-title">Vision Studio</h2>
        <p className="data-mono mt-1 text-text-muted">{`v${packageJson.version}`}</p>
        <p className="mt-3 max-w-[65ch] text-sm leading-relaxed text-text-body">
          Professional local-first AI image and video generation. Generation runs
          on your own GPU by default; hosted OpenRouter and Hugging Face routes are
          opt-in, with your own key. No subscription. Vision Studio's own source
          code is released under the MIT License.
        </p>
        {attribution && (
          <p
            data-testid="about-attribution"
            className="mono-label mt-3 inline-block rounded border border-border px-2 py-1 text-text-body"
          >
            {attribution}
          </p>
        )}
      </div>

      <UpdatesBlock />

      <div data-testid="about-licenses" className="recessed-well rounded-md p-5">
        <div className="flex max-w-[75ch] flex-col gap-2">
          {blocks.map((block, index) => {
            if (block.kind === 'heading') {
              if (block.level === 1) {
                return (
                  <h3 key={index} className="text-base font-semibold text-text-primary">
                    {block.text}
                  </h3>
                );
              }
              if (block.level === 2) {
                return (
                  <h4 key={index} className="mt-4 type-section">
                    {block.text}
                  </h4>
                );
              }
              return (
                <p key={index} className="mono-label mt-3 text-text-muted">
                  {block.text}
                </p>
              );
            }
            if (block.kind === 'listItem') {
              return (
                <p key={index} className="pl-4 text-xs leading-relaxed text-text-body">
                  <Spans spans={block.spans} />
                </p>
              );
            }
            return (
              <p key={index} className="text-sm leading-relaxed text-text-body">
                <Spans spans={block.spans} />
              </p>
            );
          })}
        </div>
      </div>
    </div>
  );
}
