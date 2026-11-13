import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import {
  AlertTriangle, Check, Cpu, Download, ExternalLink, HardDrive, ListChecks, Loader2, Pause,
  Play, RefreshCw, ShieldCheck, X,
} from 'lucide-react';
import { useAppStore } from '@/store/appStore';
import { cn } from '@/utils/cn';
import { formatBytes, formatEta, formatSpeed } from '@/utils/formatUtils';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useDialogFocus } from '@/hooks/useDialogFocus';
import type { ProvisionModel } from '@/types/model';
import { ProvisionCustomPicker } from './ProvisionCustomPicker';
import {
  defaultCustomSelection,
  installChoices,
  isInstallable,
  modelSize,
  summarizeSelection,
  type ProvisionStartOptions,
} from './provisionSelection';

export const STABILITY_LICENSE_URL = 'https://stability.ai/community-license-agreement';

/** Free-space headroom below which the pre-flight warns instead of passing. */
const TIGHT_HEADROOM = 1.1;

export interface DiskCheck {
  level: 'unknown' | 'ok' | 'tight' | 'insufficient';
  message: string;
}

/** Pure pre-flight verdict for the models volume (spec 6: warn with exact GB). */
export function diskCheck(freeBytes: number | null, remainingBytes: number): DiskCheck {
  if (freeBytes === null || !Number.isFinite(freeBytes) || freeBytes <= 0) {
    return {
      level: 'unknown',
      message: 'Disk check unavailable - free space is still verified per download.',
    };
  }
  const free = formatBytes(freeBytes);
  const needed = formatBytes(remainingBytes);
  if (freeBytes < remainingBytes) {
    return {
      level: 'insufficient',
      message: `Not enough disk space: ${needed} needed, only ${free} free. Free up space, then re-check.`,
    };
  }
  if (freeBytes < remainingBytes * TIGHT_HEADROOM) {
    return { level: 'tight', message: `Space is tight: ${needed} needed, ${free} free.` };
  }
  return { level: 'ok', message: `Disk check: ${free} free - enough for the remaining ${needed}.` };
}

const ROW_STATUS_LABEL: Record<ProvisionModel['status'], string> = {
  ready: 'Ready',
  missing: 'Waiting',
  queued: 'Queued',
  downloading: 'Downloading',
  paused: 'Paused',
  verifying: 'Verifying',
  error: 'Error',
  cancelled: 'Cancelled',
};

function openExternal(url: string) {
  void window.electron?.app?.openExternal(url);
}

function ModelRow({ row }: { row: ProvisionModel }) {
  const progress = Math.max(0, Math.min(100, Math.round(row.progress * 100)));
  return (
    <div data-testid={`provision-row-${row.id}`} className="recessed-well rounded-md p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          {row.status === 'ready' ? (
            <Check aria-hidden="true" className="h-4 w-4 flex-shrink-0 text-status-success" />
          ) : row.status === 'error' ? (
            <AlertTriangle aria-hidden="true" className="h-4 w-4 flex-shrink-0 text-status-error" />
          ) : (
            <Loader2
              aria-hidden="true"
              className={cn(
                'h-4 w-4 flex-shrink-0 text-text-muted',
                row.status === 'downloading' && 'animate-spin',
              )}
            />
          )}
          <span className="truncate text-sm text-text-primary" title={row.name}>
            {row.name}
          </span>
        </div>
        <div className="flex flex-shrink-0 items-center gap-2">
          {row.gate_url && (
            <button
              type="button"
              onClick={() => row.gate_url && openExternal(row.gate_url)}
              className="mono-label inline-flex items-center gap-1 rounded border border-accent-primary-border px-2 py-1 text-accent-primary hover:bg-accent-primary-muted"
            >
              <ExternalLink aria-hidden="true" className="h-3 w-3" /> Accept license
            </button>
          )}
          <span className="mono-label text-text-muted">{formatBytes(modelSize(row))}</span>
        </div>
      </div>
      <div
        className="mt-2 h-1 w-full overflow-hidden rounded-full bg-surface"
        role="progressbar"
        aria-valuenow={progress}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${row.name} provisioning progress`}
      >
        <div
          className={cn(
            'h-full rounded-full transition-[width,background-color] duration-300',
            row.status === 'error' ? 'bg-status-error' : 'bg-accent-primary',
          )}
          style={{ width: `${progress}%` }}
        />
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-2">
        <span
          className={cn(
            'mono-label',
            row.status === 'error' ? 'text-status-error' : 'text-text-muted',
          )}
        >
          {row.status === 'error' ? (row.error ?? 'Failed') : ROW_STATUS_LABEL[row.status]}
        </span>
        <span className="mono-label text-text-muted">{progress}%</span>
      </div>
    </div>
  );
}

/**
 * #34 installer PR3: the first-run provisioning takeover (spec 6).
 *
 * Shown only when a VALID backend snapshot proves the comprehensive auto-set
 * incomplete and the user has not dismissed it - a cold backend can never
 * produce a false takeover. Every number on screen comes from the last
 * ProvisionStatus snapshot; nothing here invents progress.
 *
 * K3: the user chooses what to install - the core tier, everything, or a
 * custom checklist grouped by tier - and the choice reaches provision:start
 * as { modelIds }. Tierless backends degrade to "everything" + a flat list
 * (see provisionSelection.ts).
 */
export function FirstRunProvisioning() {
  const {
    provisionStatus, provisionBusy, provisionActionError, firstRunProvisionDismissed,
    hardwareProfile, startProvisioning, pauseProvisioning, resumeProvisioning,
    cancelProvisioning, dismissFirstRunProvisioning, loadHardwareProfile,
    refreshProvisionStatus,
  } = useAppStore(
    useShallow((s) => ({
      provisionStatus: s.provisionStatus,
      provisionBusy: s.provisionBusy,
      provisionActionError: s.provisionActionError,
      firstRunProvisionDismissed: s.firstRunProvisionDismissed,
      hardwareProfile: s.hardwareProfile,
      startProvisioning: s.startProvisioning,
      pauseProvisioning: s.pauseProvisioning,
      resumeProvisioning: s.resumeProvisioning,
      cancelProvisioning: s.cancelProvisioning,
      dismissFirstRunProvisioning: s.dismissFirstRunProvisioning,
      loadHardwareProfile: s.loadHardwareProfile,
      refreshProvisionStatus: s.refreshProvisionStatus,
    })),
  );

  const [confirmCancel, setConfirmCancel] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [customSelection, setCustomSelection] = useState<Set<string>>(() => new Set());
  const dialogRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const customPanelId = useId();

  const visible =
    provisionStatus !== null && !provisionStatus.complete && !firstRunProvisionDismissed;

  // Shared dialog contract: focus lands on the panel, Tab stays inside, and
  // focus returns to the opener. Escape steps back out of the custom list
  // first, then continues in the background. While the cancel confirm is
  // open it is the topmost dialog and owns Escape itself.
  useDialogFocus(dialogRef, {
    open: visible,
    initialFocusRef: panelRef,
    onEscape: () => {
      if (confirmCancel) return;
      if (customOpen) {
        setCustomOpen(false);
        return;
      }
      dismissFirstRunProvisioning();
    },
  });

  // Pre-flight data: the hardware profile owns disk_free_bytes for the models
  // volume (foundry/hardware.py probes shutil.disk_usage(models_dir)).
  useEffect(() => {
    if (visible) void loadHardwareProfile();
  }, [visible, loadHardwareProfile]);

  const rows = useMemo(() => provisionStatus?.models ?? [], [provisionStatus]);
  const derived = useMemo(() => {
    const pickle = rows.filter((m) => m.format === 'pickle');
    const gated = rows.filter((m) => m.gated);
    const started = rows.some((m) => m.status !== 'missing');
    const paused = rows.some((m) => m.status === 'paused');
    const live = rows.some(
      (m) => m.status === 'queued' || m.status === 'downloading' || m.status === 'verifying',
    );
    // Models the user left out stay 'missing'; listing them as "Waiting" in
    // the progress view would promise downloads that will never start.
    const tracked = rows.filter((m) => m.status !== 'missing');
    return { pickle, gated, started, paused, live, tracked, untracked: rows.length - tracked.length };
  }, [rows]);
  const choices = useMemo(() => installChoices(rows), [rows]);

  const customModels = useMemo(
    () => rows.filter((m) => isInstallable(m) && customSelection.has(m.id)),
    [rows, customSelection],
  );
  const customSummary = useMemo(() => summarizeSelection(customModels), [customModels]);

  if (!visible || provisionStatus === null) return null;

  const freeBytes = hardwareProfile?.disk_free_bytes ?? null;
  const disk = diskCheck(freeBytes, provisionStatus.remaining_bytes);
  const overallPct = Math.max(0, Math.min(100, Math.round(provisionStatus.overall_progress * 100)));
  const speed = formatSpeed(provisionStatus.speed);
  const eta = formatEta(provisionStatus.eta);
  const installBlocked = disk.level === 'insufficient';
  const coreBlocked = choices.core !== null && diskCheck(freeBytes, choices.core.bytes).level === 'insufficient';
  const canChoose = !derived.live && !derived.paused && choices.everything.count > 0;

  // K3: provision:start takes { modelIds }. "Everything" sends no ids so the
  // backend installs its whole auto-set (and older backends keep working).
  const startWith = (options?: ProvisionStartOptions) => {
    setCustomOpen(false);
    void (startProvisioning as (options?: ProvisionStartOptions) => Promise<void>)(options);
  };

  const openCustom = () => {
    setCustomSelection(defaultCustomSelection(rows));
    setCustomOpen(true);
  };

  const installChoiceButtons = canChoose && (
    <>
      {choices.core && (
        <button
          type="button"
          data-testid="provision-install-core"
          onClick={() => startWith({ modelIds: choices.core!.ids })}
          disabled={coreBlocked || provisionBusy}
          title={`${choices.core.count} core ${choices.core.count === 1 ? 'model' : 'models'}`}
          className="btn-chrome vx-btn-chrome inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Download aria-hidden="true" className="h-4 w-4" />
          Install core ({formatBytes(choices.core.bytes)})
        </button>
      )}
      <button
        type="button"
        data-testid="provision-install"
        onClick={() => startWith()}
        disabled={installBlocked || provisionBusy}
        title={`${choices.everything.count} ${choices.everything.count === 1 ? 'model' : 'models'}`}
        className={cn(
          'inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50',
          choices.core
            ? 'rounded-md border border-border text-text-body transition-colors hover:border-border-hover hover:text-text-primary'
            : 'btn-chrome vx-btn-chrome',
        )}
      >
        <Download aria-hidden="true" className="h-4 w-4" />
        Install everything ({formatBytes(provisionStatus.remaining_bytes)})
      </button>
      <button
        type="button"
        data-testid="provision-custom-toggle"
        onClick={() => (customOpen ? setCustomOpen(false) : openCustom())}
        aria-expanded={customOpen}
        aria-controls={customPanelId}
        disabled={provisionBusy}
        className="inline-flex items-center gap-2 rounded-md border border-border px-4 py-2.5 text-sm text-text-body transition-colors hover:border-border-hover hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
      >
        <ListChecks aria-hidden="true" className="h-4 w-4" />
        Custom...
      </button>
    </>
  );

  return (
    <div
      ref={dialogRef}
      className="fixed inset-0 z-[var(--z-overlay)] flex items-center justify-center overflow-y-auto bg-void/90 p-6 backdrop-blur-sm"
      data-testid="first-run-provisioning"
      role="dialog"
      aria-modal="true"
      aria-label="First-run model setup"
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        className="raised-panel my-auto w-full max-w-3xl overflow-hidden rounded-sm outline-none"
      >
        {/* Polished-silver identity band - replaces the old unstyleable native
            Windows welcome dialog (electron dialog.showMessageBox). */}
        <div className="chrome-plate px-8 py-5">
          <p className="mono-label text-void/60">First-run setup</p>
          <h1 className="mt-1 text-2xl font-semibold text-void">Welcome to Vision Studio</h1>
        </div>

        <div className="p-8">
        <h2 className="text-lg font-semibold text-text-primary">
          Install the model library
        </h2>
        <p className="mt-2 max-w-[65ch] text-sm leading-relaxed text-text-body">
          Vision Studio runs entirely on your machine.{' '}
          {choices.tiered
            ? 'Install the core set to start creating with every primary capability, install everything, or pick models yourself.'
            : 'Install the complete verified model set so every image, video, and edit capability works out of the box, or pick models yourself.'}{' '}
          You can keep using the app while models install; each feature unlocks the moment
          its model is ready.
        </p>

        <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2">
          <span className="mono-label text-text-body">
            {provisionStatus.total_count} models
          </span>
          {hardwareProfile !== null && (
            <span
              className={cn(
                'mono-label inline-flex items-center gap-1.5',
                hardwareProfile.gpu_available ? 'text-text-body' : 'text-status-warning',
              )}
            >
              <Cpu aria-hidden="true" className="h-3.5 w-3.5" />
              {hardwareProfile.gpu_available
                ? `GPU detected: ${hardwareProfile.gpu_name ?? 'Unknown GPU'}`
                : hardwareProfile.gpu_unsupported_reason
                  ? `Unsupported GPU, runs on CPU: ${hardwareProfile.gpu_name ?? 'NVIDIA GPU'}`
                  : 'No dedicated GPU detected'}
            </span>
          )}
          <span className="mono-label text-text-body">
            {formatBytes(provisionStatus.remaining_bytes)} to download
          </span>
          <span
            className={cn(
              'mono-label inline-flex items-center gap-1.5',
              disk.level === 'insufficient' && 'text-status-error',
              disk.level === 'tight' && 'text-status-warning',
              disk.level === 'ok' && 'text-status-success',
              disk.level === 'unknown' && 'text-text-muted',
            )}
          >
            <HardDrive aria-hidden="true" className="h-3.5 w-3.5" />
            {disk.message}
          </span>
          {disk.level === 'insufficient' && (
            <button
              type="button"
              data-testid="provision-disk-recheck"
              onClick={() => {
                void loadHardwareProfile();
                void refreshProvisionStatus();
              }}
              className="mono-label inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-text-body hover:border-border-hover hover:text-text-primary"
            >
              <RefreshCw aria-hidden="true" className="h-3 w-3" /> Re-check
            </button>
          )}
        </div>

        {!derived.started && (
          <div
            data-testid="provision-disclosure"
            className="recessed-well mt-6 rounded-md p-4"
          >
            <p className="mono-label inline-flex items-center gap-1.5 text-text-primary">
              <ShieldCheck aria-hidden="true" className="h-3.5 w-3.5" />
              What installs, and under which terms
            </p>
            <ul className="mt-3 flex flex-col gap-2.5 text-xs leading-relaxed text-text-body">
              <li>
                Every file installs from its pinned upstream source and is
                integrity-verified (SHA-256 / LFS) before use.
              </li>
              {derived.pickle.length > 0 && (
                <li>
                  {derived.pickle.length} curated first-party weights (
                  {derived.pickle.map((m) => m.name).join(', ')}) are pickle-format
                  checkpoints. Vision Studio approves their security consent automatically
                  for exactly this pinned, audited set and records each grant in the
                  consent audit log. Models you add yourself always ask first.
                </li>
              )}
              {provisionStatus.attribution && (
                <li>
                  Stability AI models install under the Stability AI Community License -
                  free for individuals and organizations under $1M annual revenue. This
                  install is marked "{provisionStatus.attribution}".{' '}
                  <button
                    type="button"
                    onClick={() => openExternal(STABILITY_LICENSE_URL)}
                    className="inline-flex items-center gap-1 text-accent-primary underline decoration-border underline-offset-2 hover:text-accent-primary-hover"
                  >
                    Read the license
                    <ExternalLink aria-hidden="true" className="h-3 w-3" />
                  </button>
                </li>
              )}
              {derived.gated.length > 0 && (
                <li>
                  {derived.gated.length} of them ({derived.gated.map((m) => m.name).join(', ')})
                  are gated upstream and need a free Hugging Face account: add your token at
                  the top of the Foundry, then accept each model's license when prompted here.
                </li>
              )}
              <li>
                Full license text for every model and bundled dependency lives in
                Settings, under About and Licenses.
              </li>
            </ul>
          </div>
        )}

        {derived.started && (
          <div className="mt-6">
            <div
              className="recessed-well h-2.5 w-full overflow-hidden rounded-full"
              role="progressbar"
              aria-valuenow={overallPct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Overall provisioning progress"
            >
              <div
                className="h-full rounded-full bg-accent-primary transition-[width] duration-300"
                style={{ width: `${overallPct}%` }}
              />
            </div>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <span className="mono-label text-text-body">
                {provisionStatus.ready_count}/{provisionStatus.total_count} models ready
              </span>
              <span className="mono-label flex items-center gap-3 text-text-muted">
                {speed && <span>{speed}</span>}
                {eta && <span>{eta}</span>}
                <span>{overallPct}%</span>
              </span>
            </div>
            <div className="mt-4 flex max-h-64 flex-col gap-2 overflow-y-auto pr-1">
              {derived.tracked.map((row) => (
                <ModelRow key={row.id} row={row} />
              ))}
            </div>
            {derived.untracked > 0 && (
              <p className="mono-label mt-2 text-text-muted">
                {derived.untracked} {derived.untracked === 1 ? 'model' : 'models'} not selected - add{' '}
                {derived.untracked === 1 ? 'it' : 'them'} here or from the Foundry anytime.
              </p>
            )}
          </div>
        )}

        {canChoose && customOpen && (
          <ProvisionCustomPicker
            id={customPanelId}
            models={rows}
            selected={customSelection}
            onSelectedChange={setCustomSelection}
            summary={customSummary}
            disk={diskCheck(freeBytes, customSummary.bytes)}
            busy={provisionBusy}
            onInstall={() => startWith({ modelIds: customSummary.ids })}
            onClose={() => setCustomOpen(false)}
          />
        )}

        {provisionActionError && (
          <p className="mt-4 flex items-center gap-2 text-sm text-status-error" role="alert">
            <AlertTriangle aria-hidden="true" className="h-4 w-4 flex-shrink-0" />
            {provisionActionError}
          </p>
        )}

        <div className="mt-8 flex flex-wrap items-center gap-3">
          {!derived.started ? (
            <>
              {installChoiceButtons}
              <button
                type="button"
                data-testid="provision-skip"
                onClick={dismissFirstRunProvisioning}
                className="rounded-md border border-border px-4 py-2.5 text-sm text-text-body transition-colors hover:border-border-hover hover:text-text-primary"
              >
                Skip for now
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                data-testid="provision-background"
                onClick={dismissFirstRunProvisioning}
                className={cn(
                  'inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium',
                  canChoose
                    ? 'rounded-md border border-border text-text-body transition-colors hover:border-border-hover hover:text-text-primary'
                    : 'btn-chrome vx-btn-chrome',
                )}
              >
                Continue in background
              </button>
              {installChoiceButtons}
              {derived.live && (
                <button
                  type="button"
                  data-testid="provision-pause"
                  onClick={() => void pauseProvisioning()}
                  disabled={provisionBusy}
                  className="inline-flex items-center gap-2 rounded-md border border-border px-4 py-2.5 text-sm text-text-body transition-colors hover:border-border-hover hover:text-text-primary disabled:opacity-50"
                >
                  <Pause aria-hidden="true" className="h-4 w-4" /> Pause all
                </button>
              )}
              {!derived.live && derived.paused && (
                <button
                  type="button"
                  data-testid="provision-resume"
                  onClick={() => void resumeProvisioning()}
                  disabled={provisionBusy}
                  className="inline-flex items-center gap-2 rounded-md border border-border px-4 py-2.5 text-sm text-text-body transition-colors hover:border-border-hover hover:text-text-primary disabled:opacity-50"
                >
                  <Play aria-hidden="true" className="h-4 w-4" /> Resume all
                </button>
              )}
              {provisionStatus.error_count > 0 && (
                <button
                  type="button"
                  data-testid="provision-retry"
                  onClick={() => void resumeProvisioning()}
                  disabled={provisionBusy}
                  className="inline-flex items-center gap-2 rounded-md border border-border px-4 py-2.5 text-sm text-text-body transition-colors hover:border-border-hover hover:text-text-primary disabled:opacity-50"
                >
                  <RefreshCw aria-hidden="true" className="h-4 w-4" />
                  Retry failed ({provisionStatus.error_count})
                </button>
              )}
              <button
                type="button"
                data-testid="provision-cancel"
                onClick={() => setConfirmCancel(true)}
                disabled={provisionBusy}
                className="ml-auto inline-flex items-center gap-2 rounded-md px-3 py-2.5 text-sm text-text-muted transition-colors hover:bg-status-error/10 hover:text-status-error disabled:opacity-50"
              >
                <X aria-hidden="true" className="h-4 w-4" /> Cancel setup
              </button>
            </>
          )}
        </div>

        <p className="mt-6 text-xs text-text-muted">
          Features that need a specific model stay honestly disabled until that model is
          installed. You can resume, verify, or add models anytime from the Foundry.
        </p>
        </div>
      </div>

      <ConfirmDialog
        open={confirmCancel}
        title="Cancel first-run setup?"
        message="Downloads stop and partially downloaded files are kept for resume. Models already installed stay installed. You can resume anytime from the Foundry."
        confirmLabel="Stop downloads"
        cancelLabel="Keep going"
        variant="danger"
        onConfirm={() => {
          setConfirmCancel(false);
          void cancelProvisioning();
        }}
        onCancel={() => setConfirmCancel(false)}
      />
    </div>
  );
}
