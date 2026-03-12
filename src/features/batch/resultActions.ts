import type { BatchResult } from '@/types/generation';

export function collectBatchAssetPaths(results: BatchResult[]) {
  return results
    .map((result) => result.assetPath)
    .filter((assetPath): assetPath is string => Boolean(assetPath));
}

export function toGenerationDraftFromResult(result: BatchResult) {
  return {
    generationType: 'image' as const,
    prompt: result.prompt,
    negativePrompt:
      (typeof result.params.negativePrompt === 'string' && result.params.negativePrompt) ||
      (typeof result.params.negative_prompt === 'string' && result.params.negative_prompt) ||
      '',
    width: typeof result.params.width === 'number' ? result.params.width : 1024,
    height: typeof result.params.height === 'number' ? result.params.height : 1024,
    steps: typeof result.params.steps === 'number' ? result.params.steps : 25,
    cfgScale:
      (typeof result.params.cfgScale === 'number' && result.params.cfgScale) ||
      (typeof result.params.cfg_scale === 'number' && result.params.cfg_scale) ||
      7.5,
    model: typeof result.params.model === 'string' ? result.params.model : 'flux-dev',
    scheduler:
      typeof result.params.scheduler === 'string' ? result.params.scheduler : 'Euler a',
    seed: result.seed,
  };
}
