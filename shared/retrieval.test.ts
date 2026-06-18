import { describe, expect, it } from 'vitest';
import {
  AI_DIRECTOR_DEFAULTS,
  CHARS_PER_TOKEN,
  FALLBACK_CONTEXT_TOKENS,
  MAX_CONTEXT_TOKENS,
  type AiDirectorSettings,
  type RetrievalSource,
} from './retrieval';

describe('shared/retrieval contract', () => {
  it('defaults augmentation on with every source enabled (S2 decision 3)', () => {
    const defaults: AiDirectorSettings = AI_DIRECTOR_DEFAULTS;
    expect(defaults.enabled).toBe(true);
    expect(defaults.sources).toEqual({ promptHistory: true, assets: true, knowledgeBase: true });
  });

  it('exposes a conservative token estimate and a hard ceiling', () => {
    expect(CHARS_PER_TOKEN).toBeGreaterThanOrEqual(3);
    expect(MAX_CONTEXT_TOKENS).toBeGreaterThan(FALLBACK_CONTEXT_TOKENS);
  });

  it('names the three retrieval sources', () => {
    const sources: RetrievalSource[] = ['prompt-history', 'assets', 'knowledge-base'];
    expect(new Set(sources).size).toBe(3);
  });
});
