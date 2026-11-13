import type { SmartQuery, AssetMetadata } from '@/types/collections';
import type { AssetRecord } from '@/types/assets';
import { isLexiconTerm, promptHasTerm } from '@/features/assets/assetAnalysis';

interface GenerationContext {
  prompt?: string;
  model?: string;
  createdAt?: number;
  [key: string]: unknown;
}

/**
 * Evaluates whether an asset matches a smart collection query.
 * All criteria are AND-combined (must match all specified criteria).
 * If a criterion is specified but the required data is absent, the asset does NOT match.
 */
export function evaluateSmartQuery(
  query: SmartQuery,
  generationContext?: GenerationContext,
  metadata?: AssetMetadata,
): boolean {
  // Prompt text match
  if (query.promptText) {
    if (!generationContext?.prompt || !generationContext.prompt.toLowerCase().includes(query.promptText.toLowerCase())) {
      return false;
    }
  }

  // Model match
  if (query.model) {
    if (!generationContext?.model || generationContext.model !== query.model) {
      return false;
    }
  }

  // Tag match (any listed tag). Lexicon tags come from analysis, so they need
  // the asset's metadata. A custom (user-authored) tag is outside the lexicon,
  // so analysis can never emit it; it matches the prompt directly, whole-word,
  // by the same rule analysis applies - which is what makes it usable at all.
  if (query.tags && query.tags.length > 0) {
    const assetTagNames = new Set((metadata?.tags ?? []).map(t => t.name.toLowerCase()));
    const prompt = generationContext?.prompt;
    const matched = query.tags.some((raw) => {
      const tag = raw.toLowerCase();
      if (assetTagNames.has(tag)) return true;
      return !isLexiconTerm(tag) && typeof prompt === 'string' && promptHasTerm(prompt, tag);
    });
    if (!matched) return false;
  }

  // Date range match
  if (query.dateRange) {
    if (!generationContext?.createdAt) return false;
    if (generationContext.createdAt < query.dateRange.from || generationContext.createdAt > query.dateRange.to) {
      return false;
    }
  }

  // Style categories match
  if (query.styleCategories && query.styleCategories.length > 0) {
    if (!metadata) return false;
    if (!query.styleCategories.some(cat => metadata.detectedStyle.includes(cat))) {
      return false;
    }
  }

  // Mood match
  if (query.mood && query.mood.length > 0) {
    if (!metadata) return false;
    if (!query.mood.some(m => metadata.detectedMood.includes(m))) {
      return false;
    }
  }

  // Color palette match
  if (query.colorPalette && query.colorPalette.length > 0) {
    if (!metadata) return false;
    if (!query.colorPalette.some(color => metadata.colorNames.includes(color.toLowerCase()))) {
      return false;
    }
  }

  return true;
}

/** Coerce an AssetRecord timestamp (ISO string, or epoch ms) to epoch ms. */
function toEpochMs(value: unknown): number | undefined {
  if (typeof value === 'number') return value;
  if (typeof value !== 'string') return undefined;
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? undefined : parsed;
}

/** The asset fields a smart query reads. */
type QueryableAsset = Pick<AssetRecord, 'id' | 'prompt' | 'model' | 'createdAt'>;

/**
 * Ids of the library assets a query matches, in library order - the same
 * evaluation the store's refreshSmartCollection runs, so a live preview of a
 * query shows exactly what the collection will hold once created.
 */
export function collectSmartQueryMatches(
  query: SmartQuery,
  library: readonly QueryableAsset[],
  metadata: ReadonlyMap<string, AssetMetadata>,
): string[] {
  return library
    .filter((asset) =>
      evaluateSmartQuery(
        query,
        { prompt: asset.prompt, model: asset.model, createdAt: toEpochMs(asset.createdAt) },
        metadata.get(asset.id),
      ),
    )
    .map((asset) => asset.id);
}

/** True when the query states at least one rule (an empty query matches everything). */
export function hasSmartQueryCriteria(query: SmartQuery): boolean {
  return Boolean(
    query.promptText?.trim() ||
      query.model ||
      query.tags?.length ||
      query.dateRange ||
      query.styleCategories?.length ||
      query.colorPalette?.length ||
      query.mood?.length,
  );
}