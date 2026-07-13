import { useEffect, useMemo, useState } from 'react';
import { ExternalLink, RefreshCw } from 'lucide-react';
import packageJson from '../../../package.json';
import licensesMarkdown from '../../../THIRD-PARTY-LICENSES.md?raw';
import { useAppStore } from '@/store/appStore';
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
        if (span.kind === 'link') {
          return (
            <a
              key={index}
              href={span.url}
              onClick={(event) => {
                event.preventDefault();
                void window.electron?.app?.openExternal(span.url);
              }}
              className="inline-flex items-center gap-0.5 text-accent-primary underline decoration-border underline-offset-2 hover:text-accent-primary-hover"
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
      return `Update ${status.version ?? ''} found. Downloading in the background.`.replace('  ', ' ');
    case 'downloading':
      return `Downloading update: ${Math.round(status.percent ?? 0)}%`;
    case 'downloaded':
      return `Update ${status.version ?? ''} ready. Restart to apply.`.replace('  ', ' ');
    case 'not-available':
      return 'You are on the latest version.';
    case 'error':
      return `Update check failed: ${status.message ?? 'unknown error'}`;
    case 'idle':
    default:
      return 'Updates are checked automatically.';
  }
}

/**
 * #34 installer PR4: live auto-update status + actions. State is fed by the
 * main-process updater service (real electron-updater events over
 * updater:status); the manual check and restart actions round-trip through
 * the same service. Without the bridge (dev/web) the block degrades to the
 * disabled explanation.
 */
function UpdatesBlock() {
  const [status, setStatus] = useState<UpdaterStatus | null>(null);
  const updater = window.electron?.updater;

  useEffect(() => {
    if (!updater) return;
    let mounted = true;
    void updater.getStatus().then((snapshot) => {
      if (mounted) setStatus(snapshot);
    });
    const unsubscribe = updater.onStatus((snapshot) => {
      setStatus(snapshot);
    });
    return () => {
      mounted = false;
      unsubscribe();
    };
    // The bridge is fixed for the lifetime of the window.
  }, []);

  const checkDisabled =
    !updater ||
    status === null ||
    status.state === 'disabled' ||
    status.state === 'checking' ||
    status.state === 'downloading';

  return (
    <div data-testid="about-updates">
      <p className="mono-label text-text-muted">Updates</p>
      <p className="mt-2 max-w-[65ch] text-sm leading-relaxed text-text-body">
        {updateStatusLine(status)}
      </p>
      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          data-testid="about-updates-check"
          disabled={checkDisabled}
          onClick={() => void updater?.check()}
          className="inline-flex items-center gap-1.5 rounded border border-border px-3 py-1.5 text-sm text-text-body transition-all hover:border-border-hover hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
        >
          <RefreshCw aria-hidden="true" className="h-3.5 w-3.5" />
          Check for updates
        </button>
        {status?.state === 'downloaded' && (
          <button
            type="button"
            data-testid="about-updates-install"
            onClick={() => void updater?.install()}
            className="btn-chrome vx-btn-chrome px-3 py-1.5 text-sm"
          >
            Restart to update
          </button>
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
        <h2 className="mt-1 text-xl font-semibold text-text-primary">Vision Studio</h2>
        <p className="data-mono mt-1 text-text-muted">{`v${packageJson.version}`}</p>
        <p className="mt-3 max-w-[65ch] text-sm leading-relaxed text-text-body">
          Professional local-first AI image and video generation. Everything runs on
          your GPU - no cloud, no subscription. Vision Studio's own source code is
          released under the MIT License.
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
                  <h3 key={index} className="text-lg font-semibold text-text-primary">
                    {block.text}
                  </h3>
                );
              }
              if (block.level === 2) {
                return (
                  <h4 key={index} className="mt-4 text-base font-medium text-text-primary">
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
