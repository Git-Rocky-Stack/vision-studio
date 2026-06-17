/**
 * Pure route resolver (M6, S5). The single decision authority. Read by the
 * renderer for UX gating and by the Electron main process at dispatch as the
 * authoritative guard. No node/DOM/cross-layer imports.
 */
import type { ProviderId, RequestModality, FitVerdict } from './providerRouting';
import { providerSupports } from './providerRouting';

const HOSTED_PROVIDERS: readonly ProviderId[] = ['openrouter', 'huggingface'];

export type RouteDecision =
  | { ok: true; provider: ProviderId; reason: 'explicit' | 'fallback-auto' }
  | { ok: false; kind: 'unsupported'; message: string }
  | { ok: false; kind: 'unconfigured'; message: string }
  | { ok: false; kind: 'fallback-prompt'; candidates: ProviderId[] };

export interface RouteResolverInput {
  modality: RequestModality;
  /** The per-modality provider the user selected. */
  requested: ProviderId;
  /** Hosted providers that have a stored key AND a selected model for this modality. */
  configuredHosted: ProviderId[];
  autoRouteOnOverBudget: boolean;
  /** RuntimePlan.fit; only meaningful when `requested === 'local'`. */
  fit?: FitVerdict | null;
  /** Per-account hosted fallback target for the over-budget path. */
  fallbackProvider?: ProviderId | null;
}

function isHosted(provider: ProviderId): boolean {
  return HOSTED_PROVIDERS.includes(provider);
}

export function resolveRoute(input: RouteResolverInput): RouteDecision {
  const { modality, requested, configuredHosted, autoRouteOnOverBudget, fit, fallbackProvider } =
    input;

  // 1. Capability - refuse impossible combinations honestly.
  if (!providerSupports(requested, modality)) {
    return {
      ok: false,
      kind: 'unsupported',
      message: `${requested} cannot run ${modality} requests.`,
    };
  }

  // 2. Configuration - hosted routes need a key + model; local is always runnable.
  if (isHosted(requested) && !configuredHosted.includes(requested)) {
    return {
      ok: false,
      kind: 'unconfigured',
      message: `${requested} needs a stored key and a selected model before it can run ${modality} requests.`,
    };
  }

  // 3. Local over-budget fallback.
  if (requested === 'local' && fit === 'over-budget') {
    const candidates = configuredHosted.filter((provider) => providerSupports(provider, modality));
    if (autoRouteOnOverBudget && fallbackProvider && candidates.includes(fallbackProvider)) {
      return { ok: true, provider: fallbackProvider, reason: 'fallback-auto' };
    }
    return { ok: false, kind: 'fallback-prompt', candidates };
  }

  // 4. Explicit route.
  return { ok: true, provider: requested, reason: 'explicit' };
}
