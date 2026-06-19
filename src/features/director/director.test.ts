import { describe, expect, it } from 'vitest';
import { buildIngestRecords } from './buildIngestRecords';
import { inferModelFamily } from './inferModelFamily';

describe('buildIngestRecords', () => {
  it('maps the corpus to allow-listed records and boosts favorites', () => {
    const records = buildIngestRecords({
      promptHistory: [{ id: '1', prompt: 'a fox', negativePrompt: '', timestamp: new Date(), model: 'sdxl' }],
      favoritePrompts: ['a fox'],
      assetLibrary: [{ id: 'a', jobId: 'j', name: 'n', type: 'image', path: 'C:/secret/x.png', previewUrl: '', thumbnail: '', createdAt: '', prompt: 'a castle', negativePrompt: '', favorite: false, params: { apiKey: 'sk-LEAK' } }],
      batchResults: [{ id: 'b', batchId: 'bb', promptIndex: 0, prompt: 'a ship', imagePath: '', seed: 1, generationTime: 1, params: {}, createdAt: new Date(), isFavorite: true }],
    });

    const fox = records.find((r) => r.text === 'a fox');
    expect(fox?.boosted).toBe(true);
    expect(records.find((r) => r.text === 'a ship')?.boosted).toBe(true);
    // Allow-list: secret-shaped fields from params/path never appear on any record.
    const blob = JSON.stringify(records);
    expect(blob).not.toContain('sk-LEAK');
    expect(blob).not.toContain('secret');
    // Each record only carries the four contract fields.
    for (const r of records) {
      expect(Object.keys(r).sort()).toEqual(['boosted', 'label', 'source', 'text']);
    }
  });

  it('skips empty prompts', () => {
    const records = buildIngestRecords({
      promptHistory: [{ id: '1', prompt: '   ', negativePrompt: '', timestamp: new Date(), model: '' }],
      favoritePrompts: [],
      assetLibrary: [],
      batchResults: [],
    });
    expect(records).toHaveLength(0);
  });
});

describe('inferModelFamily', () => {
  it('maps known model names to KB families', () => {
    expect(inferModelFamily('stabilityai/stable-diffusion-xl-base-1.0')).toBe('sdxl');
    expect(inferModelFamily('black-forest-labs/FLUX.1-schnell')).toBe('flux');
    expect(inferModelFamily('runwayml/stable-diffusion-v1-5')).toBe('sd15');
    expect(inferModelFamily('Lightricks/LTX-Video')).toBe('video');
    expect(inferModelFamily('something-unknown')).toBeNull();
    expect(inferModelFamily(undefined)).toBeNull();
  });
});
