import { Pause, Play, X, ExternalLink, AlertTriangle, Check, Loader2 } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '@/store/appStore';
import { cn } from '@/utils/cn';
import type { DownloadJob } from '@/types/model';

interface DownloadRowProps {
  job: DownloadJob;
  modelName: string;
}

/** Format a bytes/second rate as a human string, e.g. "12.4 MB/s". */
function formatSpeed(bytesPerSecond: number): string {
  if (!bytesPerSecond || bytesPerSecond <= 0) return '';
  const units = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
  let value = bytesPerSecond;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(1)} ${units[unit]}`;
}

/** Format a seconds ETA as "m:ss" (or "<1m" / "" when unknown). */
function formatEta(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds) || seconds <= 0) return '';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')} left`;
}

const ACTIVE_STATUSES = new Set<DownloadJob['status']>([
  'queued',
  'downloading',
  'verifying',
  'paused',
]);

/**
 * One active (or recently finished) download with its live progress and
 * controls. Pause is offered while transferring, Resume while paused, and
 * Cancel while the job is in any non-terminal state - all keyed by
 * job.model_id. A license-gated job (gate_url present) surfaces an "Accept
 * license" action that opens the gate page externally.
 */
export function DownloadRow({ job, modelName }: DownloadRowProps) {
  const { pauseDownload, resumeDownload, cancelDownload } = useAppStore(
    useShallow((s) => ({
      pauseDownload: s.pauseDownload,
      resumeDownload: s.resumeDownload,
      cancelDownload: s.cancelDownload,
    })),
  );

  const openGate = () => {
    if (job.gate_url) void window.electron?.app?.openExternal(job.gate_url);
  };

  const progress = Math.max(0, Math.min(100, Math.round(job.progress)));
  const speed = job.status === 'downloading' ? formatSpeed(job.speed) : '';
  const eta = job.status === 'downloading' ? formatEta(job.eta) : '';
  const isActive = ACTIVE_STATUSES.has(job.status);

  return (
    <div className="recessed-well flex flex-col gap-2 rounded-md p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          {job.status === 'ready' ? (
            <Check aria-hidden="true" className="h-4 w-4 flex-shrink-0 text-status-success" />
          ) : job.status === 'error' ? (
            <AlertTriangle aria-hidden="true" className="h-4 w-4 flex-shrink-0 text-status-error" />
          ) : (
            <Loader2
              aria-hidden="true"
              className={cn(
                'h-4 w-4 flex-shrink-0 text-text-muted',
                job.status === 'downloading' && 'animate-spin',
              )}
            />
          )}
          <span className="truncate text-sm font-medium text-text-primary" title={modelName}>
            {modelName}
          </span>
        </div>

        <div className="flex flex-shrink-0 items-center gap-1.5">
          {job.gate_url && (
            <button
              type="button"
              onClick={openGate}
              className="mono-label inline-flex items-center gap-1 rounded border border-accent-primary-border px-2 py-1 text-accent-primary hover:bg-accent-primary-muted"
            >
              <ExternalLink aria-hidden="true" className="h-3 w-3" /> Accept license
            </button>
          )}
          {job.status === 'downloading' && (
            <button
              type="button"
              aria-label="Pause download"
              onClick={() => pauseDownload(job.model_id)}
              className="rounded-md p-1.5 text-text-body hover:bg-elevated hover:text-text-primary"
            >
              <Pause aria-hidden="true" className="h-4 w-4" />
            </button>
          )}
          {job.status === 'paused' && (
            <button
              type="button"
              aria-label="Resume download"
              onClick={() => resumeDownload(job.model_id)}
              className="rounded-md p-1.5 text-text-body hover:bg-elevated hover:text-text-primary"
            >
              <Play aria-hidden="true" className="h-4 w-4" />
            </button>
          )}
          {isActive && (
            <button
              type="button"
              aria-label="Cancel download"
              onClick={() => cancelDownload(job.model_id)}
              className="rounded-md p-1.5 text-text-body hover:bg-status-error/10 hover:text-status-error"
            >
              <X aria-hidden="true" className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Progress track */}
      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-surface"
        role="progressbar"
        aria-valuenow={progress}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${modelName} download progress`}
      >
        <div
          className={cn(
            'h-full rounded-full transition-all duration-300',
            job.status === 'error' ? 'bg-status-error' : 'bg-accent-primary',
          )}
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="flex items-center justify-between gap-2 text-xs text-text-muted">
        <span className="mono-label capitalize">
          {job.status === 'error' ? (job.error ?? 'Failed') : job.status}
        </span>
        <span className="flex items-center gap-2">
          {speed && <span>{speed}</span>}
          {eta && <span>{eta}</span>}
          <span>{progress}%</span>
        </span>
      </div>
    </div>
  );
}
