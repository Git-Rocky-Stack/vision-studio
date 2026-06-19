import type { IngestRecord } from '../../../shared/retrieval';
import type { AssetRecord } from '@/types/assets';
import type { BatchResult, PromptHistoryEntry } from '@/types/generation';

/**
 * Map the renderer corpus to ingest records. This is the allow-list sanitization
 * boundary: ONLY prompt text, a boost flag, a label, and a source ever leave the
 * renderer - never params, file paths, model ids, or any secret-shaped field
 * (M7 S7/S10, defense-in-depth with the backend allow-list).
 */
export function buildIngestRecords(input: {
  promptHistory: PromptHistoryEntry[];
  favoritePrompts: string[];
  assetLibrary: AssetRecord[];
  batchResults: BatchResult[];
}): IngestRecord[] {
  const records: IngestRecord[] = [];
  const favorites = new Set(input.favoritePrompts.map((p) => p.trim()));

  for (const entry of input.promptHistory) {
    const text = entry.prompt.trim();
    if (!text) continue;
    records.push({ source: 'prompt-history', text, boosted: favorites.has(text), label: 'your prior prompt' });
  }
  for (const asset of input.assetLibrary) {
    const text = asset.prompt.trim();
    if (!text) continue;
    records.push({ source: 'assets', text, boosted: Boolean(asset.favorite), label: 'your asset' });
  }
  for (const batch of input.batchResults) {
    const text = batch.prompt.trim();
    if (!text) continue;
    records.push({ source: 'prompt-history', text, boosted: Boolean(batch.isFavorite), label: 'your prior prompt' });
  }
  return records;
}
