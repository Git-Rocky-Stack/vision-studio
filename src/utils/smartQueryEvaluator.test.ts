import { describe, expect, it } from 'vitest';
import { evaluateSmartQuery } from './smartQueryEvaluator';
import type { AssetMetadata } from '@/types/collections';

const makeMetadata = (overrides: Partial<AssetMetadata> & { assetId: string }): AssetMetadata => ({
  assetId: overrides.assetId,
  tags: overrides.tags ?? [],
  dominantColors: overrides.dominantColors ?? [],
  colorNames: overrides.colorNames ?? [],
  detectedStyle: overrides.detectedStyle ?? [],
  detectedSubject: overrides.detectedSubject ?? [],
  detectedMood: overrides.detectedMood ?? [],
  analyzedAt: overrides.analyzedAt ?? Date.now(),
});

describe('smartQueryEvaluator', () => {
  it('matches by prompt text', () => {
    const query = { promptText: 'sunset' };
    expect(evaluateSmartQuery(query, { prompt: 'cinematic sunset over ocean' })).toBe(true);
    expect(evaluateSmartQuery(query, { prompt: 'portrait of a woman' })).toBe(false);
  });

  it('matches by model', () => {
    const query = { model: 'flux-dev' };
    expect(evaluateSmartQuery(query, { model: 'flux-dev' })).toBe(true);
    expect(evaluateSmartQuery(query, { model: 'sdxl' })).toBe(false);
  });

  it('matches by tags', () => {
    const metadata = makeMetadata({ assetId: '1', tags: [{ id: 't1', name: 'portrait', category: 'subject', source: 'ai', confidence: 0.9 }] });
    const query = { tags: ['portrait'] };
    expect(evaluateSmartQuery(query, undefined, metadata)).toBe(true);
  });

  it('matches by date range', () => {
    const now = Date.now();
    const query = { dateRange: { from: now - 86400000, to: now } };
    expect(evaluateSmartQuery(query, { createdAt: now - 3600000 })).toBe(true);
    expect(evaluateSmartQuery(query, { createdAt: now - 172800000 })).toBe(false);
  });

  it('matches by style categories', () => {
    const metadata = makeMetadata({ assetId: '1', detectedStyle: ['cinematic', 'dramatic'] });
    const query = { styleCategories: ['cinematic'] };
    expect(evaluateSmartQuery(query, undefined, metadata)).toBe(true);
  });

  it('matches by mood', () => {
    const metadata = makeMetadata({ assetId: '1', detectedMood: ['serene', 'calm'] });
    const query = { mood: ['calm'] };
    expect(evaluateSmartQuery(query, undefined, metadata)).toBe(true);
  });

  it('combines multiple criteria (AND)', () => {
    const metadata = makeMetadata({ assetId: '1', detectedStyle: ['portrait'], detectedMood: ['dramatic'] });
    const query = { styleCategories: ['portrait'], mood: ['dramatic'] };
    expect(evaluateSmartQuery(query, undefined, metadata)).toBe(true);
    const query2 = { styleCategories: ['portrait'], mood: ['calm'] };
    expect(evaluateSmartQuery(query2, undefined, metadata)).toBe(false);
  });

  it('returns false for empty metadata when query requires it', () => {
    const query = { tags: ['portrait'] };
    expect(evaluateSmartQuery(query, undefined, undefined)).toBe(false);
  });
});