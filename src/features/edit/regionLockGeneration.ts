import type { AITool, RegionLock } from '@/types/project';

import type { GuidedEditInput, GuidedEditOperation } from './runGuidedEditTool';

export const REGION_EMPTY_MASK_MESSAGE = 'Draw the region mask on the canvas first.';
export const REGION_UPSCALE_UNSUPPORTED_MESSAGE =
  'Region-scoped upscale has no masked backend pass. Use Upscale in the AI Tools tab for the whole image.';
export const REGION_FILL_PROMPT_MESSAGE = 'Describe what should fill the region first.';
export const REGION_STYLE_PROMPT_MESSAGE = 'Describe the style to apply to the region first.';

/**
 * Region tools the Region Lock panel offers, and whether each has a real
 * masked backend pass. Unavailable tools are rendered disabled up front with
 * this reason - never offered and then refused on Generate.
 */
export const REGION_TOOL_AVAILABILITY: Record<AITool, { available: boolean; reason?: string }> = {
  'generative-fill': { available: true },
  'style-transfer': { available: true },
  remove: { available: true },
  upscale: { available: false, reason: REGION_UPSCALE_UNSUPPORTED_MESSAGE },
};

/** Tools whose result is driven by the region prompt (Remove and Upscale ignore it). */
export function regionToolUsesPrompt(tool: AITool): boolean {
  return tool === 'generative-fill' || tool === 'style-transfer';
}

export type RegionGenerationPlan =
  | { ok: true; operation: GuidedEditOperation; input: GuidedEditInput }
  | { ok: false; error: string };

/**
 * Region Lock "Generate Region" maps onto the masked inpaint path the AI
 * tools already run (a guided pass over the current frame):
 *
 * - Strength is the pass's denoising strength (fill / remove), or the style
 *   strength mapped onto the same 0.30-0.90 range as whole-image Style
 *   Transfer (style).
 * - Invert Mask regenerates everything outside the region; the mask is
 *   inverted at request time against the source image's real size.
 * - Blend Edges composites the result back over the original through the
 *   region mask, softened by Feather px (regionBlend.ts); the backend has no
 *   blur or paste-back of its own. Off = the raw pipeline frame.
 * - Upscale has no masked backend pass and is refused (the panel also
 *   disables it up front).
 */
export function planRegionLockGeneration(region: RegionLock, sourcePath: string): RegionGenerationPlan {
  if (region.mask.points.length === 0) {
    return { ok: false, error: REGION_EMPTY_MASK_MESSAGE };
  }
  const strength = Math.max(0, Math.min(1, Number.isFinite(region.strength) ? region.strength : 1));
  const featherRadius = Number.isFinite(region.mask.featherRadius) ? region.mask.featherRadius : 0;
  const masked = {
    source_path: sourcePath,
    mask: region.mask,
    ...(region.invertMask ? { invertMask: true } : {}),
    ...(region.mask.blendEdges ? { blend: { featherRadius: Math.max(0, featherRadius) } } : {}),
  };

  switch (region.aiTool) {
    case 'generative-fill':
      if (!region.prompt.trim()) {
        return { ok: false, error: REGION_FILL_PROMPT_MESSAGE };
      }
      return {
        ok: true,
        operation: 'generative-fill',
        input: { ...masked, prompt: region.prompt, denoisingStrength: strength },
      };
    case 'remove':
      return {
        ok: true,
        operation: 'object-removal',
        input: { ...masked, denoisingStrength: strength },
      };
    case 'style-transfer':
      if (!region.prompt.trim()) {
        return { ok: false, error: REGION_STYLE_PROMPT_MESSAGE };
      }
      return {
        ok: true,
        operation: 'region-style-transfer',
        input: { ...masked, prompt: region.prompt, styleStrength: Math.round(strength * 100) },
      };
    case 'upscale':
      return { ok: false, error: REGION_UPSCALE_UNSUPPORTED_MESSAGE };
    default:
      return { ok: false, error: 'This region tool is not available.' };
  }
}
