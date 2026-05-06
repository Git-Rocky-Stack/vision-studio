import { z } from 'zod';

/**
 * Schema for the renderer-supplied parameter object that backs an
 * OpenRouter image generation job.
 *
 * The OpenRouter service in `electron/services/openRouter.ts` runs its
 * own validation (length guards, type checks) but it produces clean errors
 * only when its inputs are at least the expected primitive types.
 * Renderer-controlled `params: any` could land non-string prompts or
 * non-number widths and cause cryptic JS engine errors instead of the
 * actionable "prompt cannot be empty" message the user expects.
 *
 * `.passthrough()` keeps additional fields (e.g., `__openrouterAccountId`
 * added by the IPC handler, or future feature flags from the renderer)
 * intact for the downstream service.
 */
const schema = z
  .object({
    prompt: z.string().refine((value) => value.trim().length > 0, 'Prompt cannot be empty.'),
    negative_prompt: z.string().optional(),
    model: z.string().optional(),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    seed: z.number().int().optional(),
  })
  .passthrough();

export type OpenRouterImageJobParams = z.infer<typeof schema>;

export type ParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

export function parseOpenRouterImageJobParams(input: unknown): ParseResult<OpenRouterImageJobParams> {
  const parsed = schema.safeParse(input);
  if (parsed.success) {
    return { ok: true, value: parsed.data };
  }
  // Surface the first issue with a stable prefix so callers can recognize
  // it as a validation rejection vs an upstream service error.
  const firstIssue = parsed.error.issues[0];
  const path = firstIssue?.path?.join('.') ?? 'request';
  const detail = firstIssue?.message ?? 'invalid request';
  return { ok: false, error: `Invalid generation parameters: ${path} -- ${detail}` };
}
