/**
 * Offline negative-prompt suggestion engine.
 *
 * Used by the `generation:suggest-negative-prompt` IPC handler when the
 * active account does not route prompt enhancement through OpenRouter.
 * Produces deterministic, regex-keyed suggestions that merge into the
 * user's existing negative-prompt list with case-insensitive de-dup.
 *
 * Buckets (baseline + 6 keyword categories) intentionally cover the most
 * common image-generation failure modes: anatomy on portraits, plastic
 * skin on photos, malformed text on typography, cropping on product
 * shots, perspective on architecture, and off-model finishes on painted
 * styles.
 */

export function splitPromptTerms(value: string): string[] {
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function mergePromptTerms(existingTerms: string[], nextTerms: string[]): string[] {
  const normalized = new Set(existingTerms.map((term) => term.toLowerCase()));
  const merged = [...existingTerms];

  for (const term of nextTerms) {
    const key = term.toLowerCase();
    if (!normalized.has(key)) {
      normalized.add(key);
      merged.push(term);
    }
  }

  return merged;
}

export type NegativePromptSuggestion = {
  negativePrompt: string;
  suggestions: string[];
  source: 'heuristic';
};

export function suggestNegativePromptFromHeuristics({
  prompt,
  negativePrompt,
}: {
  prompt: string;
  negativePrompt?: string;
}): NegativePromptSuggestion {
  const normalizedPrompt = typeof prompt === 'string' ? prompt.trim() : '';
  if (!normalizedPrompt) {
    throw new Error('Prompt cannot be empty.');
  }

  const existingTerms = splitPromptTerms(negativePrompt ?? '');
  const baseTerms = ['blurry', 'low quality', 'compression artifacts', 'distorted', 'overexposed'];
  const keywordRules = [
    {
      test: /\b(portrait|face|person|character|fashion|selfie)\b/i,
      terms: ['extra fingers', 'deformed hands', 'bad anatomy', 'cross-eye'],
    },
    {
      test: /\b(photo|photograph|dslr|realistic|cinematic)\b/i,
      terms: ['cgi', 'plastic skin', 'oversmoothed skin'],
    },
    {
      test: /\b(text|logo|poster|typography|lettering|title)\b/i,
      terms: ['illegible text', 'misspelled text', 'warped letters'],
    },
    {
      test: /\b(product|packaging|device|bottle|mockup)\b/i,
      terms: ['cropped product', 'duplicate objects', 'floating object'],
    },
    {
      test: /\b(landscape|city|architecture|interior|building|room)\b/i,
      terms: ['tilted horizon', 'warped perspective', 'cluttered background'],
    },
    {
      test: /\b(anime|illustration|painting|watercolor|comic|sketch)\b/i,
      terms: ['muddy colors', 'unfinished lines', 'off-model details'],
    },
  ];

  const suggestedTerms = keywordRules.reduce<string[]>((terms, rule) => {
    if (rule.test.test(normalizedPrompt)) {
      return mergePromptTerms(terms, rule.terms);
    }
    return terms;
  }, baseTerms);

  const mergedTerms = mergePromptTerms(existingTerms, suggestedTerms);
  const newSuggestions = mergedTerms.filter(
    (term) => !existingTerms.some((existing) => existing.toLowerCase() === term.toLowerCase()),
  );

  return {
    negativePrompt: mergedTerms.join(', '),
    suggestions: newSuggestions,
    source: 'heuristic',
  };
}
