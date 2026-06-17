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
 * HuggingFace hosted still-image routing supports prompt-only generations,
 * ControlNet, and inpaint. A bare init image (img2img) and reference images
 * (IP-adapter) have no standard Inference Providers contract, so those passes
 * stay on the local backend.
 */
export function hasUnsupportedHuggingFaceImageInputs(params: unknown): boolean {
  const candidate = params as
    | { reference_images?: unknown[]; image_path?: unknown; inpaint?: unknown }
    | null
    | undefined;
  const hasInpaint = Boolean(candidate?.inpaint);
  const hasReferenceImages =
    Array.isArray(candidate?.reference_images) && candidate.reference_images.length > 0;
  const hasBareImg2Img = Boolean(candidate?.image_path) && !hasInpaint;
  return hasReferenceImages || hasBareImg2Img;
}

export { OPENROUTER_JOB_PREFIX };
