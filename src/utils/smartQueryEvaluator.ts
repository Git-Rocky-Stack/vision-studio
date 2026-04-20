import type { SmartQuery, AssetMetadata } from '@/types/collections';

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

  // Tag match
  if (query.tags && query.tags.length > 0) {
    if (!metadata) return false;
    const assetTagNames = new Set(metadata.tags.map(t => t.name.toLowerCase()));
    if (!query.tags.some(t => assetTagNames.has(t.toLowerCase()))) {
      return false;
    }
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