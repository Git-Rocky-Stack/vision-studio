import { describe, expect, it } from 'vitest';

import {
  mergePromptTerms,
  splitPromptTerms,
  suggestNegativePromptFromHeuristics,
} from './negativePromptHeuristics';

// Background: the renderer can ask the main process for an offline
// negative-prompt suggestion when the active account has no OpenRouter
// access for prompt enhancement. The heuristic engine is a deterministic
// regex-keyed merge: a baseline of universally-bad terms, plus
// category-specific terms keyed off prompt vocabulary, all merged into
// the user's existing negative-prompt list with case-insensitive de-dup.
//
// Coverage targets every keyword bucket plus the merge invariants so
// edits to either the bucket list or the merge logic can't silently
// regress the surfaced suggestions.

describe('splitPromptTerms', () => {
  it('splits comma-delimited terms and trims whitespace', () => {
    expect(splitPromptTerms('blurry, low quality ,  distorted')).toEqual([
      'blurry',
      'low quality',
      'distorted',
    ]);
  });

  it('drops empty entries left by trailing or doubled commas', () => {
    expect(splitPromptTerms('a,, ,b,')).toEqual(['a', 'b']);
  });

  it('returns an empty array for an empty string', () => {
    expect(splitPromptTerms('')).toEqual([]);
  });
});

describe('mergePromptTerms', () => {
  it('appends terms not already present', () => {
    expect(mergePromptTerms(['a', 'b'], ['c', 'd'])).toEqual(['a', 'b', 'c', 'd']);
  });

  it('preserves the original casing of existing terms', () => {
    expect(mergePromptTerms(['Blurry'], ['blurry', 'extra fingers'])).toEqual([
      'Blurry',
      'extra fingers',
    ]);
  });

  it('deduplicates case-insensitively across new terms as well', () => {
    expect(mergePromptTerms([], ['blurry', 'BLURRY', 'Blurry'])).toEqual(['blurry']);
  });

  it('returns the existing list unchanged when no new terms', () => {
    expect(mergePromptTerms(['a', 'b'], [])).toEqual(['a', 'b']);
  });
});

describe('suggestNegativePromptFromHeuristics', () => {
  const baseTerms = ['blurry', 'low quality', 'compression artifacts', 'distorted', 'overexposed'];

  it('throws when prompt is empty after trim', () => {
    expect(() => suggestNegativePromptFromHeuristics({ prompt: '   ' })).toThrow(
      /prompt cannot be empty/i,
    );
  });

  it('throws when prompt is the empty string', () => {
    expect(() => suggestNegativePromptFromHeuristics({ prompt: '' })).toThrow(
      /prompt cannot be empty/i,
    );
  });

  it('always includes the baseline negative terms for any non-empty prompt', () => {
    const result = suggestNegativePromptFromHeuristics({ prompt: 'a tree' });
    for (const baseTerm of baseTerms) {
      expect(result.negativePrompt).toContain(baseTerm);
    }
    expect(result.source).toBe('heuristic');
  });

  it('adds portrait-specific terms when prompt mentions a face', () => {
    const result = suggestNegativePromptFromHeuristics({ prompt: 'a portrait of a woman' });
    expect(result.negativePrompt).toContain('extra fingers');
    expect(result.negativePrompt).toContain('deformed hands');
    expect(result.negativePrompt).toContain('bad anatomy');
    expect(result.negativePrompt).toContain('cross-eye');
  });

  it('adds photo-specific terms when prompt mentions photography vocabulary', () => {
    const result = suggestNegativePromptFromHeuristics({ prompt: 'cinematic dslr photograph' });
    expect(result.negativePrompt).toContain('cgi');
    expect(result.negativePrompt).toContain('plastic skin');
    expect(result.negativePrompt).toContain('oversmoothed skin');
  });

  it('adds typography-specific terms when prompt mentions text or logos', () => {
    const result = suggestNegativePromptFromHeuristics({ prompt: 'movie poster with title' });
    expect(result.negativePrompt).toContain('illegible text');
    expect(result.negativePrompt).toContain('misspelled text');
    expect(result.negativePrompt).toContain('warped letters');
  });

  it('adds product-specific terms when prompt mentions packaging vocabulary', () => {
    const result = suggestNegativePromptFromHeuristics({ prompt: 'product mockup of a bottle' });
    expect(result.negativePrompt).toContain('cropped product');
    expect(result.negativePrompt).toContain('duplicate objects');
    expect(result.negativePrompt).toContain('floating object');
  });

  it('adds architecture-specific terms when prompt mentions buildings', () => {
    const result = suggestNegativePromptFromHeuristics({ prompt: 'a futuristic city landscape' });
    expect(result.negativePrompt).toContain('tilted horizon');
    expect(result.negativePrompt).toContain('warped perspective');
    expect(result.negativePrompt).toContain('cluttered background');
  });

  it('adds illustration-specific terms when prompt mentions painted media', () => {
    const result = suggestNegativePromptFromHeuristics({ prompt: 'an anime illustration' });
    expect(result.negativePrompt).toContain('muddy colors');
    expect(result.negativePrompt).toContain('unfinished lines');
    expect(result.negativePrompt).toContain('off-model details');
  });

  it('combines multiple buckets when the prompt straddles vocabularies', () => {
    const result = suggestNegativePromptFromHeuristics({
      prompt: 'a portrait photograph of a person with text on their shirt',
    });
    expect(result.negativePrompt).toContain('extra fingers'); // portrait
    expect(result.negativePrompt).toContain('plastic skin'); // photo
    expect(result.negativePrompt).toContain('illegible text'); // text
  });

  it('preserves user-supplied existing negative-prompt terms verbatim', () => {
    const result = suggestNegativePromptFromHeuristics({
      prompt: 'a portrait',
      negativePrompt: 'My Custom Term, Another One',
    });
    expect(result.negativePrompt).toContain('My Custom Term');
    expect(result.negativePrompt).toContain('Another One');
  });

  it('does not duplicate a baseline term that is already in user input (case-insensitive)', () => {
    const result = suggestNegativePromptFromHeuristics({
      prompt: 'a tree',
      negativePrompt: 'BLURRY, low quality',
    });
    const occurrences = result.negativePrompt
      .split(/\s*,\s*/)
      .filter((term) => term.toLowerCase() === 'blurry').length;
    expect(occurrences).toBe(1);
    // Preserves the user's casing for the term they already had.
    expect(result.negativePrompt).toMatch(/(^|, )BLURRY(,|$)/);
  });

  it('reports only the newly added suggestions, not the user-existing terms', () => {
    const result = suggestNegativePromptFromHeuristics({
      prompt: 'a tree',
      negativePrompt: 'blurry',
    });
    expect(result.suggestions).not.toContain('blurry');
    // baseTerms minus the one the user already had
    expect(result.suggestions).toContain('low quality');
    expect(result.suggestions).toContain('distorted');
  });

  it('reports an empty suggestions list when user already has every baseline term', () => {
    const result = suggestNegativePromptFromHeuristics({
      prompt: 'a tree',
      negativePrompt: baseTerms.join(', '),
    });
    expect(result.suggestions).toEqual([]);
  });

  it('returns negativePrompt as a comma-space joined string', () => {
    const result = suggestNegativePromptFromHeuristics({ prompt: 'a tree' });
    // Round-trips through splitPromptTerms cleanly.
    expect(splitPromptTerms(result.negativePrompt)).toEqual(
      result.negativePrompt.split(/\s*,\s*/).filter(Boolean),
    );
  });

  it('treats negativePrompt as optional', () => {
    const result = suggestNegativePromptFromHeuristics({ prompt: 'a tree' });
    expect(result.source).toBe('heuristic');
    expect(typeof result.negativePrompt).toBe('string');
  });
});
