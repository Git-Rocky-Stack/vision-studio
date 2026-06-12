import { useEffect, useState } from 'react';
import { Loader2, PackageX, ShieldAlert } from 'lucide-react';
import { useAppStore } from '@/store/appStore';
import { Led } from '@/components/hardware';
import type { RuntimePlan } from '@/types/model';

interface PreflightFooterProps {
  /** Selected local model id, or null when no local model is in play. */
  modelId: string | null;
}

type PreflightStatus = 'empty' | 'loading' | 'ready' | 'error';

interface PreflightState {
  status: PreflightStatus;
  plan: RuntimePlan | null;
}

/**
 * LED semantics for the resolved fit verdict (DESIGN.md Pioneer-DJ palette):
 * play (green) = fits, cue (amber) = fits with offload, rec (red) = the run
 * will not fit on the GPU (over-budget or cpu-only). The LED mirrors the
 * readiness text - real state, never decoration.
 */
const FIT_LED_COLOR: Record<string, 'play' | 'cue' | 'rec'> = {
  fits: 'play',
  'fits-with-offload': 'cue',
  'over-budget': 'rec',
  'cpu-only': 'rec',
};

/**
 * Run-readiness preflight footer (M5 Task 13 - states + data).
 *
 * Resolves the runtime plan for the selected model and renders one of six
 * honest states: empty, loading, refusal, missing components, ready (LED
 * driven by the real fit verdict), or error (preflight unavailable).
 * Carbon Pro visual polish lands in the later 7.3 design pass.
 */
export function PreflightFooter({ modelId }: PreflightFooterProps) {
  const resolveRuntime = useAppStore((s) => s.resolveRuntime);
  const loadHardwareProfile = useAppStore((s) => s.loadHardwareProfile);
  const [{ status, plan }, setState] = useState<PreflightState>({
    status: modelId ? 'loading' : 'empty',
    plan: null,
  });

  // Hardware snapshot is local-first and cheap; keep it warm for the plan
  // basis readouts (and the 7.3 design pass) whenever the footer is mounted.
  useEffect(() => {
    void loadHardwareProfile();
  }, [loadHardwareProfile]);

  useEffect(() => {
    if (!modelId) {
      setState({ status: 'empty', plan: null });
      return;
    }

    // Stale-response guard: a rapid model switch flips this flag in cleanup,
    // so an in-flight resolution for the previous model is ignored.
    let stale = false;
    setState({ status: 'loading', plan: null });
    resolveRuntime(modelId)
      .then((nextPlan) => {
        if (!stale) setState({ status: 'ready', plan: nextPlan });
      })
      .catch(() => {
        if (!stale) setState({ status: 'error', plan: null });
      });

    return () => {
      stale = true;
    };
  }, [modelId, resolveRuntime]);

  const refusal = status === 'ready' ? plan?.refusal ?? null : null;
  const missingComponents = status === 'ready' && !refusal && (plan?.missing_components.length ?? 0) > 0;
  const fitLedColor =
    status === 'ready' && !refusal && !missingComponents && plan?.fit
      ? FIT_LED_COLOR[plan.fit] ?? null
      : null;

  return (
    <div
      data-testid="preflight-footer"
      className="recessed-well mb-3 px-3 py-2.5"
      role="status"
      aria-live="polite"
    >
      <p className="mono-label text-text-muted">Run Readiness</p>

      {status === 'empty' && (
        <p data-testid="preflight-empty" className="mono-label mt-1.5 text-text-muted">
          No local model selected
        </p>
      )}

      {status === 'loading' && (
        <p
          data-testid="preflight-loading"
          className="mt-1.5 flex items-center gap-2 text-xs text-text-muted"
        >
          <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />
          Resolving runtime plan...
        </p>
      )}

      {status === 'error' && (
        <p data-testid="preflight-error" className="mt-1.5 text-xs text-text-muted">
          Preflight unavailable. Run readiness could not be verified; the backend bridge did not
          respond.
        </p>
      )}

      {refusal && (
        <p
          data-testid="preflight-refusal"
          className="mt-1.5 flex items-start gap-2 text-xs text-status-error"
        >
          <ShieldAlert aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
          <span>{refusal}</span>
        </p>
      )}

      {missingComponents && plan && (
        <p
          data-testid="preflight-missing"
          className="mt-1.5 flex items-start gap-2 text-xs text-status-warning"
        >
          <PackageX aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
          <span>{plan.readiness}</span>
        </p>
      )}

      {status === 'ready' && plan && !refusal && !missingComponents && (
        <p
          data-testid="preflight-ready"
          className="mt-1.5 flex items-center gap-2 text-xs text-text-body"
        >
          {fitLedColor ? <Led color={fitLedColor} size={6} /> : null}
          <span>{plan.readiness}</span>
        </p>
      )}
    </div>
  );
}
