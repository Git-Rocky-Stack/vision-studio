/**
 * Hosted LoRA routing (#42). Pure and dependency-free, compiled by BOTH
 * tsconfig.app.json (renderer) and tsconfig.electron.json (main) so UX gating
 * and authoritative dispatch read one source of truth - same contract as
 * providerRouting.ts. No node, DOM, or cross-layer imports may be added.
 *
 * The HuggingFace Inference Providers contract for LoRAs is adapter-by-model-id:
 * the Hub LoRA repo id is passed AS the model and a LoRA-capable provider
 * (fal-ai / replicate / wavespeed) serves it. That contract is narrow, and this
 * module encodes its exact boundaries so nothing is advertised that dispatch
 * cannot honestly deliver (Codex M6 gate):
 *
 *   (a) exactly one LoRA per generation - the adapter IS the model;
 *   (b) weight 1.0 only - the documented payload has no per-request weight;
 *   (c) Hub-hosted adapters only - the record must carry a HuggingFace repo id;
 *   (d) FLUX family only - the providers' LoRA endpoints are flux-serving.
 *
 * OpenRouter's image API documents its complete parameter surface with no
 * adapter key, so its LoRA decline is permanent (#42 spike evidence).
 */

export interface HostedLoraSelection {
  id: string;
  weight: number;
}

/** The subset of an installed model record this module reads. */
export interface HostedLoraRecordLike {
  id?: string;
  name?: string;
  artifact_type?: string;
  base_architecture?: string;
  repo_id?: string | null;
}

export type HuggingFaceLoraAdapterDecision =
  | { ok: true; adapterRepoId: string }
  | { ok: false; reason: string };

export type HuggingFaceLoraDispatchVerdict =
  | { ok: true; adapterRepoId: string | null }
  | { ok: false; reason: string };

export const OPENROUTER_LORA_UNSUPPORTED_MESSAGE =
  'OpenRouter still-image routing supports prompt-only generations and has no LoRA contract. Switch the active account back to Local to use LoRAs.';

const EXACTLY_ONE_MESSAGE =
  'HuggingFace still-image routing runs exactly one LoRA per generation. Keep a single LoRA in the mix or switch the active account back to Local to stack LoRAs.';

const WEIGHT_MESSAGE =
  'HuggingFace still-image routing runs LoRAs at weight 1.0 only; the hosted contract has no per-request weight. Set the LoRA weight to 1.0 or switch the active account back to Local.';

const NOT_INSTALLED_MESSAGE =
  'The selected LoRA is not in the installed library, so it cannot be routed to HuggingFace. Reinstall it from the Foundry or switch the active account back to Local.';

const NO_ADAPTER_MESSAGE =
  'HuggingFace LoRA routing requires a resolved Hub adapter for the selected LoRA. Switch the active account back to Local to use it.';

/**
 * Hub adapter repo ids are always namespaced ("org/name"). Validated before
 * the id ever reaches dispatch, mirroring the inference client's model-id
 * hygiene: no extra slashes, no traversal-ish segments, no URLs.
 */
const HF_ADAPTER_REPO_ID = /^[A-Za-z0-9][\w.-]*\/[A-Za-z0-9][\w.-]*$/;

function hubHostedMessage(record: HostedLoraRecordLike): string {
  const label = record.name ?? record.id ?? 'The selected LoRA';
  return `HuggingFace still-image routing runs Hub-hosted LoRAs only. "${label}" has no HuggingFace repo, so it stays on Local.`;
}

function fluxFamilyMessage(record: HostedLoraRecordLike): string {
  const label = record.name ?? record.id ?? 'The selected LoRA';
  const family = record.base_architecture || 'unknown-family';
  return `HuggingFace still-image LoRA routing is FLUX-family only. "${label}" is a ${family} LoRA, so it stays on Local.`;
}

/**
 * Full eligibility decision for routing a LoRA mix to HuggingFace, evaluated
 * where the installed library is available (renderer, workflow runner). The
 * main process re-validates the structural conditions via
 * validateHuggingFaceLoraDispatch before anything is dispatched.
 */
export function resolveHuggingFaceLoraAdapter(
  selections: HostedLoraSelection[],
  models: HostedLoraRecordLike[],
): HuggingFaceLoraAdapterDecision {
  if (selections.length !== 1) {
    return { ok: false, reason: EXACTLY_ONE_MESSAGE };
  }

  const selection = selections[0];
  if (selection.weight !== 1) {
    return { ok: false, reason: WEIGHT_MESSAGE };
  }

  const record = models.find(
    (candidate) => candidate.artifact_type === 'lora' && candidate.id === selection.id,
  );
  if (!record) {
    return { ok: false, reason: NOT_INSTALLED_MESSAGE };
  }

  const repoId = record.repo_id ?? '';
  if (!HF_ADAPTER_REPO_ID.test(repoId)) {
    return { ok: false, reason: hubHostedMessage(record) };
  }

  if (record.base_architecture !== 'flux') {
    return { ok: false, reason: fluxFamilyMessage(record) };
  }

  return { ok: true, adapterRepoId: repoId };
}

/**
 * Authoritative main-process validation of a LoRA-bearing HuggingFace request.
 * The renderer resolves record -> Hub repo id (it holds the installed library;
 * hosted routes must keep working with the local backend offline, so the main
 * process cannot re-read the index). This validator enforces every condition
 * that is checkable without the library: exactly one well-formed selection,
 * weight 1.0, and a shape-safe adapter repo id. Requests that fail are
 * refused outright - never silently degraded to a prompt-only run.
 */
export function validateHuggingFaceLoraDispatch(
  loras: unknown,
  adapterRepoId: unknown,
): HuggingFaceLoraDispatchVerdict {
  if (!Array.isArray(loras) || loras.length === 0) {
    return { ok: true, adapterRepoId: null };
  }

  if (loras.length !== 1) {
    return { ok: false, reason: EXACTLY_ONE_MESSAGE };
  }

  const entry = loras[0] as { id?: unknown; weight?: unknown } | null | undefined;
  if (!entry || typeof entry.id !== 'string' || typeof entry.weight !== 'number') {
    return { ok: false, reason: NOT_INSTALLED_MESSAGE };
  }
  if (entry.weight !== 1) {
    return { ok: false, reason: WEIGHT_MESSAGE };
  }

  if (typeof adapterRepoId !== 'string' || !HF_ADAPTER_REPO_ID.test(adapterRepoId)) {
    return { ok: false, reason: NO_ADAPTER_MESSAGE };
  }

  return { ok: true, adapterRepoId };
}
