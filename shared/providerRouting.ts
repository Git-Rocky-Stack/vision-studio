/**
 * Provider routing capability registry (M6 Provider Routing Fabric, S4).
 *
 * Pure, dependency-free, and compiled by BOTH tsconfig.app.json (renderer) and
 * tsconfig.electron.json (main) so the renderer's UX gating and the main
 * process's authoritative dispatch read one source of truth. No node, DOM, or
 * cross-layer imports may be added to this module.
 */

export type ProviderId = 'local' | 'openrouter' | 'huggingface';

export type RequestModality =
  | 'still-image'
  | 'controlnet'
  | 'inpaint'
  | 'video'
  | 'llm-assist';

export type FitVerdict = 'fits' | 'fits-with-offload' | 'over-budget' | 'cpu-only';

export interface ProviderCapabilities {
  stillImage: boolean;
  controlNet: boolean;
  inpaint: boolean;
  video: boolean;
  /** enhance / expand / negative-suggest / variations. Local is heuristic-backed. */
  llmAssist: boolean;
  /** Whether cost/quota can be surfaced for this provider (S10). */
  reportsUsage: boolean;
  /** Fixed provider resolution ceiling, or null when model-driven. */
  maxResolution: { width: number; height: number } | null;
}

export const PROVIDER_CAPABILITIES: Record<ProviderId, ProviderCapabilities> = {
  local: {
    stillImage: true,
    controlNet: true,
    inpaint: true,
    video: true,
    llmAssist: true,
    reportsUsage: false,
    maxResolution: null,
  },
  openrouter: {
    stillImage: true,
    controlNet: false,
    inpaint: false,
    video: false,
    llmAssist: true,
    reportsUsage: true,
    maxResolution: null,
  },
  huggingface: {
    stillImage: true,
    // Wired end-to-end in PR2: hosted ControlNet + inpaint (Inference Providers
    // image-to-image router, renderer supplies base64 control/init/mask) and
    // text-to-video. The registry stays an honest authority - these are only
    // true because dispatch + UI back them (Codex M6 gate).
    controlNet: true,
    inpaint: true,
    video: true,
    llmAssist: true,
    reportsUsage: true,
    maxResolution: null,
  },
};

const MODALITY_CAPABILITY: Record<RequestModality, keyof ProviderCapabilities> = {
  'still-image': 'stillImage',
  controlnet: 'controlNet',
  inpaint: 'inpaint',
  video: 'video',
  'llm-assist': 'llmAssist',
};

/** True when `provider` can run `modality` per the capability matrix. */
export function providerSupports(provider: ProviderId, modality: RequestModality): boolean {
  return PROVIDER_CAPABILITIES[provider][MODALITY_CAPABILITY[modality]] === true;
}
