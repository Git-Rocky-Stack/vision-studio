import { describe, expect, it } from 'vitest';

import type { AssetRecord } from '@/types/assets';

import { analyzeAssetRecord, TAG_LEXICON } from './assetAnalysis';

function makeAsset(overrides: Partial<AssetRecord> = {}): AssetRecord {
  return {
    id: 'a1',
    jobId: 'j1',
    name: 'render.png',
    type: 'image',
    path: 'C:/out/render.png',
    previewUrl: 'file:///C:/out/render.png',
    thumbnail: '',
    createdAt: '2026-08-23T10:00:00.000Z',
    prompt: '',
    negativePrompt: '',
    favorite: false,
    params: {},
    ...overrides,
  };
}

describe('TAG_LEXICON', () => {
  it('covers every smart-query category the evaluator can filter on', () => {
    expect(Object.keys(TAG_LEXICON).sort()).toEqual(['color', 'mood', 'style', 'subject']);
  });

  it('holds only lowercase, non-empty terms so matching is deterministic', () => {
    for (const terms of Object.values(TAG_LEXICON)) {
      expect(terms.length).toBeGreaterThan(0);
      for (const term of terms) {
        expect(term).toBe(term.toLowerCase().trim());
        expect(term.length).toBeGreaterThan(0);
      }
    }
  });

  it('resolves every colour term to a real hex, so no colour tag is ever colourless', () => {
    for (const term of TAG_LEXICON.color) {
      const meta = analyzeAssetRecord(makeAsset({ prompt: term }));
      expect(meta.colorNames).toEqual([term]);
      expect(meta.dominantColors).toHaveLength(1);
      expect(meta.dominantColors[0]).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it('matches every lexicon term when it appears verbatim in a prompt', () => {
    for (const [category, terms] of Object.entries(TAG_LEXICON)) {
      for (const term of terms) {
        const meta = analyzeAssetRecord(makeAsset({ prompt: term }));
        const hit = meta.tags.find((t) => t.name === term && t.category === category);
        expect(hit, `${category}/${term} did not match its own term`).toBeDefined();
      }
    }
  });
});

describe('analyzeAssetRecord', () => {
  it('derives style, subject, mood and colour tags from the real prompt', () => {
    const meta = analyzeAssetRecord(
      makeAsset({ prompt: 'cinematic portrait of a woman, moody crimson lighting' }),
    );

    const byCategory = (category: string) =>
      meta.tags.filter((t) => t.category === category).map((t) => t.name);

    expect(byCategory('style')).toContain('cinematic');
    expect(byCategory('subject')).toContain('portrait');
    expect(byCategory('mood')).toContain('moody');
    expect(byCategory('color')).toContain('crimson');
  });

  it('mirrors the derived tags into the detected* fields the evaluator reads', () => {
    const meta = analyzeAssetRecord(
      makeAsset({ prompt: 'a serene watercolor landscape in teal' }),
    );

    expect(meta.detectedStyle).toContain('watercolor');
    expect(meta.detectedSubject).toContain('landscape');
    expect(meta.detectedMood).toContain('serene');
    expect(meta.colorNames).toContain('teal');
  });

  it('matches only whole words, never substrings of unrelated terms', () => {
    // "portraiture" must not register the "portrait" subject tag, and
    // "scandal" must not register "candid".
    const meta = analyzeAssetRecord(makeAsset({ prompt: 'portraiture scandal' }));
    expect(meta.tags.map((t) => t.name)).not.toContain('portrait');
    expect(meta.tags.map((t) => t.name)).not.toContain('candid');
  });

  it('ignores terms that only appear in the negative prompt', () => {
    const meta = analyzeAssetRecord(
      makeAsset({ prompt: 'a landscape', negativePrompt: 'cinematic, moody, blurry' }),
    );

    const names = meta.tags.map((t) => t.name);
    expect(names).toContain('landscape');
    expect(names).not.toContain('cinematic');
    expect(names).not.toContain('moody');
  });

  it('scores an earlier prompt term above a later one, reflecting real token weight', () => {
    const meta = analyzeAssetRecord(
      makeAsset({ prompt: 'cinematic, a very long stretch of filler words here, watercolor' }),
    );

    const cinematic = meta.tags.find((t) => t.name === 'cinematic');
    const watercolor = meta.tags.find((t) => t.name === 'watercolor');
    expect(cinematic).toBeDefined();
    expect(watercolor).toBeDefined();
    expect(cinematic!.confidence).toBeGreaterThan(watercolor!.confidence);
  });

  it('keeps every confidence a real fraction between 0 and 1', () => {
    const meta = analyzeAssetRecord(
      makeAsset({ prompt: 'cinematic moody crimson portrait watercolor landscape serene teal' }),
    );

    expect(meta.tags.length).toBeGreaterThan(0);
    for (const tag of meta.tags) {
      expect(tag.confidence).toBeGreaterThan(0);
      expect(tag.confidence).toBeLessThanOrEqual(1);
    }
  });

  it('marks derived tags as ai-sourced and gives each a stable id', () => {
    const first = analyzeAssetRecord(makeAsset({ prompt: 'cinematic portrait' }));
    const second = analyzeAssetRecord(makeAsset({ prompt: 'cinematic portrait' }));

    expect(first.tags.every((t) => t.source === 'ai')).toBe(true);
    expect(first.tags.map((t) => t.id)).toEqual(second.tags.map((t) => t.id));
  });

  it('never emits the same tag twice for a repeated term', () => {
    const meta = analyzeAssetRecord(
      makeAsset({ prompt: 'cinematic cinematic cinematic portrait' }),
    );
    const cinematic = meta.tags.filter((t) => t.name === 'cinematic');
    expect(cinematic).toHaveLength(1);
  });

  it('returns an empty, well-formed record for a prompt with no known terms', () => {
    const meta = analyzeAssetRecord(makeAsset({ id: 'z9', prompt: 'qqqq zzzz' }));

    expect(meta.assetId).toBe('z9');
    expect(meta.tags).toEqual([]);
    expect(meta.detectedStyle).toEqual([]);
    expect(meta.detectedSubject).toEqual([]);
    expect(meta.detectedMood).toEqual([]);
    expect(meta.colorNames).toEqual([]);
    expect(meta.dominantColors).toEqual([]);
    expect(meta.analyzedAt).toBeGreaterThan(0);
  });

  it('resolves a colour term to its real hex so dominantColors is never invented', () => {
    const meta = analyzeAssetRecord(makeAsset({ prompt: 'a crimson sky' }));
    expect(meta.colorNames).toContain('crimson');
    expect(meta.dominantColors.every((hex) => /^#[0-9a-f]{6}$/.test(hex))).toBe(true);
    expect(meta.dominantColors.length).toBe(meta.colorNames.length);
  });

  it('handles weighted prompt syntax without leaking punctuation into tag names', () => {
    const meta = analyzeAssetRecord(makeAsset({ prompt: '(cinematic:1.4), [moody], <lora:x:1>' }));
    const names = meta.tags.map((t) => t.name);
    expect(names).toContain('cinematic');
    expect(names).toContain('moody');
    expect(names.every((n) => /^[a-z][a-z -]*$/.test(n))).toBe(true);
  });
});
