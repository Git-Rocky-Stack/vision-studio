import { describe, expect, it } from 'vitest';

import type { GenerationJob } from '@/store/appStore.types';
import type { IterationNode } from '@/types/iteration';

import { toGenerationDraftFromIteration } from './iterationDraft';

function makeNode(params: Record<string, unknown> = {}, type: 'image' | 'video' = 'image'): IterationNode {
  const job = {
    id: 'job-1',
    type,
    status: 'completed',
    progress: 100,
    params,
    result: { images: ['file:///a.png'] },
    createdAt: new Date(),
  } as GenerationJob;

  return {
    id: 'job-1',
    parentId: null,
    branchId: 'b1',
    childrenIds: [],
    generationJob: job,
    thumbnail: 'file:///a.png',
    settingsDiff: null,
    createdAt: 0,
    isPinned: false,
    note: '',
  };
}

describe('toGenerationDraftFromIteration', () => {
  it('carries the iteration settings across verbatim', () => {
    const draft = toGenerationDraftFromIteration(
      makeNode({
        prompt: 'a cinematic portrait',
        negative_prompt: 'blurry',
        width: 1280,
        height: 720,
        steps: 30,
        cfg_scale: 6.5,
        model: 'sdxl',
        scheduler: 'DPM++ 2M',
        seed: 42,
      }),
      'fork',
    );

    expect(draft).toEqual({
      generationType: 'image',
      prompt: 'a cinematic portrait',
      negativePrompt: 'blurry',
      width: 1280,
      height: 720,
      steps: 30,
      cfgScale: 6.5,
      model: 'sdxl',
      scheduler: 'DPM++ 2M',
      seed: 42,
    });
  });

  it('releases the seed on a re-roll so the run genuinely differs', () => {
    const draft = toGenerationDraftFromIteration(makeNode({ seed: 42 }), 're-roll');
    expect(draft.seed).toBe(-1);
  });

  it('preserves the seed on a fork so the same point is explored', () => {
    const draft = toGenerationDraftFromIteration(makeNode({ seed: 42 }), 'fork');
    expect(draft.seed).toBe(42);
  });

  it('accepts the camelCase param spelling as well as snake_case', () => {
    const draft = toGenerationDraftFromIteration(
      makeNode({ negativePrompt: 'blurry', cfgScale: 8 }),
      'fork',
    );

    expect(draft.negativePrompt).toBe('blurry');
    expect(draft.cfgScale).toBe(8);
  });

  it('falls back to the app defaults for anything the job never recorded', () => {
    const draft = toGenerationDraftFromIteration(makeNode({}), 'fork');

    expect(draft.prompt).toBe('');
    expect(draft.negativePrompt).toBe('');
    expect(draft.width).toBe(1024);
    expect(draft.height).toBe(1024);
    expect(draft.steps).toBe(25);
    expect(draft.cfgScale).toBe(7.5);
    expect(draft.scheduler).toBe('Euler a');
    expect(draft.seed).toBe(-1);
    expect(draft.model).toBe('');
  });

  it('carries the generation type through for a video iteration', () => {
    const draft = toGenerationDraftFromIteration(makeNode({}, 'video'), 'fork');
    expect(draft.generationType).toBe('video');
  });

  it('ignores param values of the wrong type rather than passing them on', () => {
    const draft = toGenerationDraftFromIteration(
      makeNode({ steps: 'lots', width: null, prompt: 12 }),
      'fork',
    );

    expect(draft.steps).toBe(25);
    expect(draft.width).toBe(1024);
    expect(draft.prompt).toBe('');
  });
});
