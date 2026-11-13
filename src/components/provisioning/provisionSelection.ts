import type { ProvisionModel, ProvisionTier } from '@/types/model';

/**
 * K3 first-run model selection: pure helpers behind the "Install core",
 * "Install everything" and "Custom..." choices.
 *
 * Degradation contract for backends that predate tiers (no `tier` on any
 * model): every model is treated as one undifferentiated group, the "core"
 * choice is not offered (it would be indistinguishable from "everything"),
 * and the custom checklist shows a single flat group. A model whose `tier` is
 * missing while others carry one is treated as core - installing a model the
 * user may not need is recoverable, silently skipping one a feature needs is
 * not.
 */

/** Options the `provision:start` bridge accepts (K3). */
export interface ProvisionStartOptions {
  /** Install only these models; omitted means the whole auto-set. */
  modelIds?: string[];
}

/** Statuses the install choices act on. Paused rows resume, errored rows retry. */
const INSTALLABLE_STATUSES = new Set<ProvisionModel['status']>(['missing', 'cancelled']);

export function isInstallable(model: ProvisionModel): boolean {
  return INSTALLABLE_STATUSES.has(model.status);
}

export function hasTierData(models: ProvisionModel[]): boolean {
  return models.some((model) => model.tier !== undefined);
}

export function modelTier(model: ProvisionModel): ProvisionTier {
  return model.tier ?? 'core';
}

/** Full download size: the exact K3 size when present, else the registry estimate. */
export function modelSize(model: ProvisionModel): number {
  const exact = model.size_bytes;
  return typeof exact === 'number' && Number.isFinite(exact) && exact >= 0 ? exact : model.approx_bytes;
}

/** Bytes still to fetch: nothing for a ready model, the unfetched share otherwise. */
export function modelRemainingBytes(model: ProvisionModel): number {
  if (model.status === 'ready') return 0;
  const progress = Number.isFinite(model.progress) ? Math.max(0, Math.min(1, model.progress)) : 0;
  return Math.round(modelSize(model) * (1 - progress));
}

export interface SelectionSummary {
  ids: string[];
  count: number;
  bytes: number;
}

export function summarizeSelection(models: ProvisionModel[]): SelectionSummary {
  return {
    ids: models.map((model) => model.id),
    count: models.length,
    bytes: models.reduce((total, model) => total + modelRemainingBytes(model), 0),
  };
}

export interface TierGroup {
  tier: ProvisionTier | 'all';
  label: string;
  description: string;
  models: ProvisionModel[];
}

const TIER_COPY: Record<ProvisionTier, { label: string; description: string }> = {
  core: {
    label: 'Core',
    description: 'Every primary image, video and edit capability works with these.',
  },
  extended: {
    label: 'Extended',
    description: 'Optional extra models and alternates. Add them now or later from the Foundry.',
  },
};

/** Checklist groups in display order; tierless backends get one flat group. */
export function groupByTier(models: ProvisionModel[]): TierGroup[] {
  if (!hasTierData(models)) {
    return [{ tier: 'all', label: 'Models', description: 'The verified model set.', models }];
  }
  return (['core', 'extended'] as const)
    .map((tier) => ({ tier, ...TIER_COPY[tier], models: models.filter((m) => modelTier(m) === tier) }))
    .filter((group) => group.models.length > 0);
}

export interface InstallChoices {
  /** Present only when the backend reports tiers and core still has work. */
  core: SelectionSummary | null;
  everything: SelectionSummary;
  tiered: boolean;
}

export function installChoices(models: ProvisionModel[]): InstallChoices {
  const installable = models.filter(isInstallable);
  const tiered = hasTierData(models);
  const core = installable.filter((model) => modelTier(model) === 'core');
  return {
    tiered,
    core: tiered && core.length > 0 ? summarizeSelection(core) : null,
    everything: summarizeSelection(installable),
  };
}

/** Default custom selection: the installable core models (all of them when tierless). */
export function defaultCustomSelection(models: ProvisionModel[]): Set<string> {
  return new Set(models.filter((m) => isInstallable(m) && modelTier(m) === 'core').map((m) => m.id));
}
