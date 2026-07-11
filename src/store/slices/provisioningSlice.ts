import type { AppSet, AppGet } from '../appStore.types';
import type { ProvisionStatus } from '@/types/model';

/**
 * #34 installer PR3: first-run auto-provisioning state.
 *
 * The backend orchestrator is the single source of truth - every action
 * returns a fresh ProvisionStatus snapshot which is stored verbatim. The
 * renderer never invents progress (no progress theater, spec 9).
 */
export const provisioningInitialState = {
  // Last-known snapshot. Transient - excluded from the persist allowlist.
  provisionStatus: null as ProvisionStatus | null,
  // One in-flight user action at a time (start/pause/resume/cancel/reverify).
  provisionBusy: false,
  // Envelope failure from a user action. Unlike the local-first refresh
  // swallow, a failed user action must surface (mirrors consent/convert).
  provisionActionError: null as string | null,
  // First-run overlay dismissal ("Continue in background" / "Skip for now").
  // Persisted so a restart does not re-take-over the workspace.
  firstRunProvisionDismissed: false,
};

/** Runtime guard: an IPC provisioning result is a snapshot, not an error envelope. */
export function isProvisionStatus(value: unknown): value is ProvisionStatus {
  return (
    typeof value === 'object' &&
    value !== null &&
    'schema_version' in value &&
    'models' in value &&
    Array.isArray((value as ProvisionStatus).models)
  );
}

/** Statuses that are actively progressing and warrant continued polling
 * (mirrors ACTIVE_DOWNLOAD_STATUSES in FoundryPage - paused is user-parked). */
const LIVE_STATUSES = new Set(['queued', 'downloading', 'verifying']);

export function hasLiveProvisionJob(status: ProvisionStatus | null): boolean {
  return status !== null && status.models.some((m) => LIVE_STATUSES.has(m.status));
}

type ProvisioningBridge = NonNullable<Window['electron']>['provisioning'];

export function createProvisioningActions(set: AppSet, get: AppGet) {
  const mergeSnapshot = (result: unknown) => {
    if (isProvisionStatus(result)) {
      set({ provisionStatus: result, provisionActionError: null });
      return true;
    }
    return false;
  };

  /** User actions share one shape: busy-guarded, snapshot-merged, error-surfaced. */
  const action = (invoke: (bridge: ProvisioningBridge) => Promise<unknown>) => async () => {
    const bridge = window.electron?.provisioning;
    if (!bridge || get().provisionBusy) return;
    set({ provisionBusy: true });
    try {
      const result = await invoke(bridge);
      if (!mergeSnapshot(result)) {
        const error =
          typeof result === 'object' && result !== null && 'error' in result
            ? String((result as { error: unknown }).error)
            : 'Provisioning request failed';
        set({ provisionActionError: error });
      }
    } catch {
      set({ provisionActionError: 'Provisioning request failed' });
    } finally {
      set({ provisionBusy: false });
    }
  };

  return {
    refreshProvisionStatus: async () => {
      const bridge = window.electron?.provisioning;
      if (!bridge) return;
      try {
        // Envelope failure: keep the last-known snapshot (local-first).
        mergeSnapshot(await bridge.status());
      } catch {
        // Local-first: an IPC hiccup must not wipe known provisioning state.
      }
    },
    startProvisioning: action((bridge) => bridge.start()),
    pauseProvisioning: action((bridge) => bridge.pause()),
    resumeProvisioning: action((bridge) => bridge.resume()),
    cancelProvisioning: action((bridge) => bridge.cancel()),
    reverifyProvisioning: action((bridge) => bridge.reverify()),
    dismissFirstRunProvisioning: () => set({ firstRunProvisionDismissed: true }),
    openFirstRunProvisioning: () => set({ firstRunProvisionDismissed: false }),
  };
}
