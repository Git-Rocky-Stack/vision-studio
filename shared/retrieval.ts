/**
 * M7 AI Director wire contract (shared, dependency-free). Compiled by both
 * tsconfig.app.json (renderer) and tsconfig.electron.json (main) so the
 * ingestion adapter, the IPC layer, the context assembler, and the settings UI
 * read one source of truth. No node/DOM imports.
 */

export type RetrievalSource = 'prompt-history' | 'assets' | 'knowledge-base';

/** A single retrieved unit, ranked and ready to assemble into the DATA block. */
export interface RetrievalSnippet {
  id: string;
  source: RetrievalSource;
  text: string;
  score: number;
  /** Short human label for the transparency disclosure, e.g. "your prior prompt" or "SDXL tip". */
  label: string;
}

export interface RetrievalQuery {
  text: string;
  /** Active image model's family for KB matching; null when unknown. */
  modelFamily: string | null;
  sources: RetrievalSource[];
  maxTokens: number;
}

export interface RetrievalResult {
  snippets: RetrievalSnippet[];
  /** 'semantic' when the embedder ranked, 'lexical' when the fallback ranked. */
  mode: 'semantic' | 'lexical';
}

/** What the renderer sends to be indexed (already allow-list sanitized). */
export interface IngestRecord {
  source: RetrievalSource;
  text: string;
  /** Favorited OR successfully completed → ranked higher. */
  boosted: boolean;
  label: string;
}

/** Shown to the user after an augmented assist. */
export interface ContextProvenanceItem {
  source: RetrievalSource;
  label: string;
  preview: string;
}

export interface AiDirectorSettings {
  enabled: boolean;
  sources: {
    promptHistory: boolean;
    assets: boolean;
    knowledgeBase: boolean;
  };
}

export const AI_DIRECTOR_DEFAULTS: AiDirectorSettings = {
  enabled: true,
  sources: { promptHistory: true, assets: true, knowledgeBase: true },
};

/** Conservative chars-per-token estimate; never under-counts, so an assembled block cannot exceed budget. */
export const CHARS_PER_TOKEN = 4;
/** Fraction of an LLM route's known context window M7 will spend on retrieved context. */
export const CONTEXT_BUDGET_FRACTION = 0.25;
/** Hard ceiling on retrieved-context tokens regardless of model window. */
export const MAX_CONTEXT_TOKENS = 1500;
/** Budget used when the route's context window is unknown. */
export const FALLBACK_CONTEXT_TOKENS = 400;

/** Map a settings block to the enabled source list the query carries. */
export function enabledSources(settings: AiDirectorSettings): RetrievalSource[] {
  const out: RetrievalSource[] = [];
  if (settings.sources.promptHistory) out.push('prompt-history');
  if (settings.sources.assets) out.push('assets');
  if (settings.sources.knowledgeBase) out.push('knowledge-base');
  return out;
}
