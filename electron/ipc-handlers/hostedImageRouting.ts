import { OPENROUTER_JOB_PREFIX, isOpenRouterJobId } from './openRouterImageRouting';
import type { ProviderId } from '../../shared/providerRouting';

/**
 * Generalized hosted-job routing (M6, S7). Discriminates which hosted provider
 * owns a locally-tracked job id so generation:get-status / cancel route to the
 * right in-memory store. Backend (Python) jobs return null.
 */

export const HUGGINGFACE_JOB_PREFIX = 'huggingface-image';
export const HUGGINGFACE_VIDEO_JOB_PREFIX = 'huggingface-video';

export function isHuggingFaceJobId(jobId: string): boolean {
  return jobId.startsWith(`${HUGGINGFACE_JOB_PREFIX}-`);
}

export function isHuggingFaceVideoJobId(jobId: string): boolean {
  return jobId.startsWith(`${HUGGINGFACE_VIDEO_JOB_PREFIX}-`);
}

/** Returns the hosted provider that owns a job id, or null for backend jobs. */
export function routedJobProvider(jobId: string): Exclude<ProviderId, 'local'> | null {
  if (isOpenRouterJobId(jobId)) return 'openrouter';
  if (isHuggingFaceJobId(jobId) || isHuggingFaceVideoJobId(jobId)) return 'huggingface';
  return null;
}

/**
 * HuggingFace hosted still-image routing supports prompt-only generations only.
 * The Inference Providers task API documents no ControlNet control_image and no
 * masked-inpaint mask_image parameter, and bare img2img / reference images
 * (IP-adapter) have no standard hosted contract either - so every guided pass
 * (ControlNet, inpaint, mask, img2img, reference images, outpaint, background
 * replacement) stays on the local backend (Codex M6 gate).
 */
export function hasUnsupportedHuggingFaceImageInputs(params: unknown): boolean {
  const candidate = params as
    | {
        controlnet?: unknown[];
        reference_images?: unknown[];
        image_path?: unknown;
        mask?: unknown;
        inpaint?: unknown;
        outpaint?: unknown;
        background_replace?: unknown;
      }
    | null
    | undefined;
  return Boolean(
    candidate?.controlnet?.length ||
      candidate?.reference_images?.length ||
      candidate?.image_path ||
      candidate?.mask ||
      candidate?.inpaint ||
      candidate?.outpaint ||
      candidate?.background_replace,
  );
}

export { OPENROUTER_JOB_PREFIX };
