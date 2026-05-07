import { toOpenRouterRendererMessage } from './openRouterError';

/**
 * Routing decisions for the OpenRouter still-image path.
 *
 * - `OPENROUTER_JOB_PREFIX` is the documented prefix every OpenRouter
 *   image job id starts with. Used to discriminate locally-tracked jobs
 *   from backend-tracked ones in `generation:get-status`,
 *   `generation:cancel`, and `generation:list-jobs`.
 *
 * - `hasUnsupportedOpenRouterImageInputs` enforces the current OpenRouter
 *   envelope: prompt-only generations only. ControlNet, reference images,
 *   img2img, masks, and inpaint must fall back to the local backend.
 *
 * - `isTerminalJobStatus` and `resolveOpenRouterFailureMessage` are the
 *   small predicates the cancel and error paths need.
 */

export const OPENROUTER_JOB_PREFIX = 'openrouter-image';

export const OPENROUTER_IMAGE_UNSUPPORTED_MESSAGE =
  'OpenRouter still-image routing currently supports prompt-only generations. Switch this account back to Local for ControlNet, inpaint, or reference-image passes.';

export type OpenRouterImageJobStatus =
  | 'pending'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'cancelled';

export function isOpenRouterJobId(jobId: string): boolean {
  return jobId.startsWith(`${OPENROUTER_JOB_PREFIX}-`);
}

export function isTerminalJobStatus(status: OpenRouterImageJobStatus): boolean {
  return status === 'completed' || status === 'failed' || status === 'cancelled';
}

export function hasUnsupportedOpenRouterImageInputs(params: unknown): boolean {
  const candidate = params as
    | {
        controlnet?: unknown[];
        reference_images?: unknown[];
        image_path?: unknown;
        mask?: unknown;
        inpaint?: unknown;
      }
    | null
    | undefined;
  return Boolean(
    candidate?.controlnet?.length ||
      candidate?.reference_images?.length ||
      candidate?.image_path ||
      candidate?.mask ||
      candidate?.inpaint,
  );
}

export function resolveOpenRouterFailureMessage(error: unknown): string {
  if ((error as { name?: string } | null)?.name === 'AbortError') {
    return 'OpenRouter image generation was cancelled.';
  }

  return toOpenRouterRendererMessage(error, 'OpenRouter image generation failed.');
}
