/**
 * Maps the local backend's `/api/prompts/enhance` body onto the renderer's
 * enhance-prompt contract.
 *
 * The backend replies with the bare `{ mode, prompt, variations }` shape and
 * no `success` flag, while every hosted sibling handler (OpenRouter,
 * HuggingFace) answers `{ success: true, ... }`. The renderer gates on
 * `result.success`, so passing the raw body through made Enhance and Expand
 * fail on every Local account. A body without a usable prompt is reported as
 * a failure rather than a silent no-op.
 */
export type LocalPromptEnhanceResult =
  | {
      success: true;
      mode?: string;
      prompt: string;
      variations: string[];
    }
  | { success: false; error: string };

export const LOCAL_ENHANCE_EMPTY_MESSAGE = 'The local prompt tools returned no prompt.';

export function toLocalPromptEnhanceResult(data: unknown): LocalPromptEnhanceResult {
  const body = data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
  const prompt = typeof body.prompt === 'string' ? body.prompt : '';
  if (!prompt.trim()) {
    return { success: false, error: LOCAL_ENHANCE_EMPTY_MESSAGE };
  }
  return {
    success: true,
    ...(typeof body.mode === 'string' ? { mode: body.mode } : {}),
    prompt,
    variations: Array.isArray(body.variations)
      ? body.variations.filter((entry): entry is string => typeof entry === 'string')
      : [],
  };
}
