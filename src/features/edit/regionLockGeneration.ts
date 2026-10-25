import type { RegionLock } from '@/types/project';

import type { GuidedEditInput, GuidedEditOperation } from './runGuidedEditTool';

export const REGION_EMPTY_MASK_MESSAGE = 'Draw the region mask on the canvas first.';
export const REGION_INVERT_UNSUPPORTED_MESSAGE =
  'Inverted region masks are not supported by the inpaint path yet. Turn off Invert Mask to generate.';
export const REGION_STYLE_UNSUPPORTED_MESSAGE =
  'Region-scoped style transfer is not available yet. Use Style Transfer in the AI Tools tab for the whole image.';
export const REGION_UPSCALE_UNSUPPORTED_MESSAGE =
  'Region-scoped upscale is not available yet. Use Upscale in the AI Tools tab for the whole image.';
export const REGION_FILL_PROMPT_MESSAGE = 'Describe what should fill the region first.';

export type RegionGenerationPlan =
  | { ok: true; operation: GuidedEditOperation; input: GuidedEditInput }
  | { ok: false; error: string };

/**
 * Region Lock "Generate Region" maps onto the inpaint path the AI tools
 * already run (a masked guided pass over the current frame). Tools that
 * have no region-scoped backend operation are refused honestly instead of
 * silently running something else.
 */
export function planRegionLockGeneration(region: RegionLock, sourcePath: string): RegionGenerationPlan {
  if (region.mask.points.length === 0) {
    return { ok: false, error: REGION_EMPTY_MASK_MESSAGE };
  }
  if (region.invertMask) {
    return { ok: false, error: REGION_INVERT_UNSUPPORTED_MESSAGE };
  }
  switch (region.aiTool) {
    case 'generative-fill':
      if (!region.prompt.trim()) {
        return { ok: false, error: REGION_FILL_PROMPT_MESSAGE };
      }
      return {
        ok: true,
        operation: 'generative-fill',
        input: { source_path: sourcePath, prompt: region.prompt, mask: region.mask },
      };
    case 'remove':
      return {
        ok: true,
        operation: 'object-removal',
        input: { source_path: sourcePath, mask: region.mask },
      };
    case 'style-transfer':
      return { ok: false, error: REGION_STYLE_UNSUPPORTED_MESSAGE };
    case 'upscale':
      return { ok: false, error: REGION_UPSCALE_UNSUPPORTED_MESSAGE };
    default:
      return { ok: false, error: 'This region tool is not available yet.' };
  }
}
