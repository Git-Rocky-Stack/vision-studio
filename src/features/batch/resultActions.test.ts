import { describe, expect, it } from 'vitest';
import type { BatchResult } from '@/types/generation';
import { collectBatchAssetPaths, toGenerationDraftFromResult } from './resultActions';

const baseResult: BatchResult = {
  id: 'job-1',
  batchId: 'batch-1',
  promptIndex: 0,
  prompt: 'storm over the ocean',
  imagePath: 'http://localhost:8000/outputs/job-1/image_001.png',
  assetPath: 'C:/vision-studio/outputs/job-1/image_001.png',
  seed: 1234,
  generationTime: 3.2,
  params: {
    negativePrompt: 'blurry',
    width: 1024,
    height: 768,
    steps: 25,
    cfgScale: 7.5,
    model: 'flux-dev',
    scheduler: 'Euler a',
  },
  createdAt: new Date('2026-03-11T10:00:00Z'),
  isFavorite: false,
};

describe('collectBatchAssetPaths', () => {
  it('returns only asset-backed result paths', () => {
    const results = [
      baseResult,
      { ...baseResult, id: 'job-2', assetPath: '' },
    ];

    expect(collectBatchAssetPaths(results)).toEqual([
      'C:/vision-studio/outputs/job-1/image_001.png',
    ]);
  });
});

describe('toGenerationDraftFromResult', () => {
  it('hydrates the generate panel with result parameters', () => {
    expect(toGenerationDraftFromResult(baseResult)).toEqual({
      generationType: 'image',
      prompt: 'storm over the ocean',
      negativePrompt: 'blurry',
      width: 1024,
      height: 768,
      steps: 25,
      cfgScale: 7.5,
      model: 'flux-dev',
      scheduler: 'Euler a',
      seed: 1234,
    });
  });
});
