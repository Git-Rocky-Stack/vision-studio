import type { ContextProvenanceItem, RetrievalSnippet, RetrievalSource } from '../../shared/retrieval';
import { assembleContext, computeBudget } from './contextAssembler';

export interface AugmentDirective {
  sources: RetrievalSource[];
  modelFamily: string | null;
}

export interface PromptContext {
  context?: string;
  provenance: ContextProvenanceItem[];
  mode?: 'semantic' | 'lexical';
}

interface RetrievalClientLike {
  query: (q: {
    text: string;
    modelFamily: string | null;
    sources: RetrievalSource[];
    maxTokens: number;
  }) => Promise<{ snippets: RetrievalSnippet[]; mode: 'semantic' | 'lexical' }>;
}

/**
 * Assemble retrieved context for a prompt-assist request (M7). Owns the trust
 * boundary (the assembled block is reference data) and the graceful-degradation
 * contract: any retrieval failure returns no context rather than throwing, so
 * the assist always proceeds (un-augmented when retrieval is unavailable).
 */
export async function buildPromptContext(args: {
  prompt: string;
  directive: AugmentDirective | undefined;
  retrievalClient: RetrievalClientLike;
  contextLength?: number | null;
}): Promise<PromptContext> {
  const { prompt, directive, retrievalClient, contextLength } = args;
  if (!directive || directive.sources.length === 0) {
    return { provenance: [] };
  }
  const maxTokens = computeBudget(contextLength ?? null);
  try {
    const result = await retrievalClient.query({
      text: prompt,
      modelFamily: directive.modelFamily,
      sources: directive.sources,
      maxTokens,
    });
    const assembled = assembleContext({ retrieved: result.snippets, maxTokens });
    return { context: assembled.contextBlock || undefined, provenance: assembled.provenance, mode: result.mode };
  } catch {
    return { provenance: [] };
  }
}
