import type { GenerationJobParams } from '@/store/appStore.types';
import type { GenerationDraft } from '@/types/generation';
import type { IterationNode } from '@/types/iteration';

/**
 * Turn an iteration back into a generation draft, so forking or re-rolling
 * loads that render's real settings into the generator instead of cloning the
 * finished node.
 *
 * Job params reach the store from several submit paths that spell fields
 * differently (`negative_prompt` from the backend request shape,
 * `negativePrompt` from the renderer's own draft), so both spellings are read.
 * A value of the wrong type is discarded rather than forwarded - a draft field
 * must always be the type the generator expects.
 */

/** Mirrors the generator's own defaults for anything a job never recorded. */
const DRAFT_DEFAULTS = {
  width: 1024,
  height: 1024,
  steps: 25,
  cfgScale: 7.5,
  scheduler: 'Euler a',
  seed: -1,
} as const;

function readString(params: GenerationJobParams, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = params[key];
    if (typeof value === 'string') return value;
  }
  return undefined;
}

function readNumber(params: GenerationJobParams, ...keys: string[]): number | undefined {
  for (const key of keys) {
    const value = params[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
  }
  return undefined;
}

export function toGenerationDraftFromIteration(
  node: IterationNode,
  mode: 'fork' | 're-roll',
): GenerationDraft {
  const params = node.generationJob.params ?? {};

  return {
    generationType: node.generationJob.type === 'video' ? 'video' : 'image',
    prompt: readString(params, 'prompt') ?? '',
    negativePrompt: readString(params, 'negativePrompt', 'negative_prompt') ?? '',
    width: readNumber(params, 'width') ?? DRAFT_DEFAULTS.width,
    height: readNumber(params, 'height') ?? DRAFT_DEFAULTS.height,
    steps: readNumber(params, 'steps') ?? DRAFT_DEFAULTS.steps,
    cfgScale: readNumber(params, 'cfgScale', 'cfg_scale') ?? DRAFT_DEFAULTS.cfgScale,
    model: readString(params, 'model') ?? '',
    scheduler: readString(params, 'scheduler') ?? DRAFT_DEFAULTS.scheduler,
    // A fork re-explores the same point, so it keeps the seed. A re-roll exists
    // to produce a *different* render, so it releases the seed to random.
    seed: mode === 're-roll' ? -1 : (readNumber(params, 'seed') ?? DRAFT_DEFAULTS.seed),
  };
}
