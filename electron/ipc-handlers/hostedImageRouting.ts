import { OPENROUTER_JOB_PREFIX, isOpenRouterJobId } from './openRouterImageRouting';
import type { ProviderId } from '../../shared/providerRouting';

/**
 * Generalized hosted-job routing (M6, S7). Discriminates which hosted provider
 * owns a locally-tracked job id so generation:get-status / cancel route to the
 * right in-memory store. Backend (Python) jobs return null.
 */

export const HUGGINGFACE_JOB_PREFIX = 'huggingface-image';

export function isHuggingFaceJobId(jobId: string): boolean {
  return jobId.startsWith(`${HUGGINGFACE_JOB_PREFIX}-`);
}

/** Returns the hosted provider that owns a job id, or null for backend jobs. */
export function routedJobProvider(jobId: string): Exclude<ProviderId, 'local'> | null {
  if (isOpenRouterJobId(jobId)) return 'openrouter';
  if (isHuggingFaceJobId(jobId)) return 'huggingface';
  return null;
}

export { OPENROUTER_JOB_PREFIX };
