import { useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Download, Pause, Play, ShieldCheck } from 'lucide-react';
import { useAppStore } from '@/store/appStore';
import { hasLiveProvisionJob } from '@/store/slices/provisioningSlice';
import { formatBytes } from '@/utils/formatUtils';

/**
 * #34 installer PR3: set-level provisioning state inside the Foundry - the
 * durable re-entry point after the first-run screen is dismissed, and the
 * home of the verify-and-repair path (spec 6 idempotence and recovery).
 * Renders nothing until a valid backend snapshot exists (cold backend safe).
 */
export function ProvisioningCard() {
  const {
    provisionStatus, provisionBusy, provisionActionError, startProvisioning,
    pauseProvisioning, resumeProvisioning, reverifyProvisioning,
    openFirstRunProvisioning, refreshProvisionStatus,
  } = useAppStore(
    useShallow((s) => ({
      provisionStatus: s.provisionStatus,
      provisionBusy: s.provisionBusy,
      provisionActionError: s.provisionActionError,
      startProvisioning: s.startProvisioning,
      pauseProvisioning: s.pauseProvisioning,
      resumeProvisioning: s.resumeProvisioning,
      reverifyProvisioning: s.reverifyProvisioning,
      openFirstRunProvisioning: s.openFirstRunProvisioning,
      refreshProvisionStatus: s.refreshProvisionStatus,
    })),
  );

  useEffect(() => {
    void refreshProvisionStatus();
  }, [refreshProvisionStatus]);

  if (!provisionStatus) return null;

  const live = hasLiveProvisionJob(provisionStatus);
  const paused = !live && provisionStatus.models.some((m) => m.status === 'paused');
  const pct = Math.max(0, Math.min(100, Math.round(provisionStatus.overall_progress * 100)));
  const attributionShown = provisionStatus.models.some(
    (m) => m.attribution && m.status === 'ready',
  );

  return (
    <section data-testid="provisioning-card" className="raised-panel mt-6 rounded-sm p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="mono-label text-text-muted">Model library</p>
          <p className="mt-1 text-sm text-text-primary">
            {provisionStatus.complete
              ? `All ${provisionStatus.total_count} models installed`
              : `${provisionStatus.ready_count}/${provisionStatus.total_count} models installed - ${formatBytes(provisionStatus.remaining_bytes)} remaining`}
          </p>
          {attributionShown && (
            <p className="mono-label mt-1 text-text-muted">{provisionStatus.attribution}</p>
          )}
        </div>
        <div className="flex flex-shrink-0 flex-wrap items-center gap-2">
          {!provisionStatus.complete && !live && !paused && (
            <>
              <button
                type="button"
                data-testid="provisioning-card-install"
                onClick={() => void startProvisioning()}
                disabled={provisionBusy}
                className="btn-chrome vx-btn-chrome inline-flex items-center gap-2 px-3 py-2 text-sm disabled:opacity-50"
              >
                <Download aria-hidden="true" className="h-4 w-4" />
                Install remaining
              </button>
              <button
                type="button"
                data-testid="provisioning-card-open"
                onClick={openFirstRunProvisioning}
                className="rounded-md border border-border px-3 py-2 text-sm text-text-body hover:border-border-hover hover:text-text-primary"
              >
                Open setup screen
              </button>
            </>
          )}
          {live && (
            <button
              type="button"
              data-testid="provisioning-card-pause"
              onClick={() => void pauseProvisioning()}
              disabled={provisionBusy}
              className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm text-text-body hover:border-border-hover hover:text-text-primary disabled:opacity-50"
            >
              <Pause aria-hidden="true" className="h-4 w-4" /> Pause
            </button>
          )}
          {paused && (
            <button
              type="button"
              data-testid="provisioning-card-resume"
              onClick={() => void resumeProvisioning()}
              disabled={provisionBusy}
              className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm text-text-body hover:border-border-hover hover:text-text-primary disabled:opacity-50"
            >
              <Play aria-hidden="true" className="h-4 w-4" /> Resume
            </button>
          )}
          <button
            type="button"
            data-testid="provisioning-card-verify"
            onClick={() => void reverifyProvisioning()}
            disabled={provisionBusy || live}
            title="Re-hash installed weights against the manifest and re-fetch any corrupt file"
            className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm text-text-body hover:border-border-hover hover:text-text-primary disabled:opacity-50"
          >
            <ShieldCheck aria-hidden="true" className="h-4 w-4" /> Verify and repair
          </button>
        </div>
      </div>
      {(live || paused) && (
        <div
          className="recessed-well mt-3 h-1.5 w-full overflow-hidden rounded-full"
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Model library provisioning progress"
        >
          <div
            className="h-full rounded-full bg-accent-primary transition-all duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
      {provisionActionError && (
        <p className="mt-2 text-xs text-status-error" role="alert">{provisionActionError}</p>
      )}
    </section>
  );
}
