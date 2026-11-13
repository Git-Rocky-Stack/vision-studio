import type { IngestRecord, RetrievalQuery, RetrievalResult } from '../../shared/retrieval';
import { backendHttp, BACKEND_CONTROL_TIMEOUT_MS, BACKEND_LONG_OPERATION_TIMEOUT_MS } from './backendHttp';

type AxiosLike = {
  get: (url: string, config?: unknown) => Promise<{ data: unknown }>;
  post: (url: string, body?: unknown, config?: unknown) => Promise<{ data: unknown }>;
};

/** Mirrors backend/schemas/retrieval.py MAX_INGEST_RECORDS. */
export const MAX_INGEST_RECORDS = 10_000;

export interface RetrievalIndexStats {
  count: number;
  mode: 'semantic' | 'lexical';
}

interface CreateRetrievalClientOptions {
  baseUrl: string;
  axiosInstance?: AxiosLike;
  authHeaders?: () => Record<string, string>;
}

export function createRetrievalClient({
  baseUrl,
  axiosInstance = backendHttp as unknown as AxiosLike,
  authHeaders = () => ({}),
}: CreateRetrievalClientOptions) {
  async function query(q: RetrievalQuery): Promise<RetrievalResult> {
    const res = await axiosInstance.post(
      `${baseUrl}/api/v1/retrieval/query`,
      { text: q.text, modelFamily: q.modelFamily, sources: q.sources, maxTokens: q.maxTokens },
      // Prompt-assist awaits this; a wedged backend must not hang it.
      { headers: authHeaders(), timeout: BACKEND_CONTROL_TIMEOUT_MS },
    );
    const data = (res.data ?? {}) as Partial<RetrievalResult>;
    return {
      snippets: Array.isArray(data.snippets) ? data.snippets : [],
      mode: data.mode === 'lexical' ? 'lexical' : 'semantic',
    };
  }

  async function ingestChunk(
    records: IngestRecord[],
  ): Promise<{ ingested: number; skipped: number; total: number }> {
    const res = await axiosInstance.post(`${baseUrl}/api/v1/retrieval/ingest`, { records }, {
      headers: authHeaders(),
      // A corpus chunk embeds every record before answering.
      timeout: BACKEND_LONG_OPERATION_TIMEOUT_MS,
    });
    return (res.data ?? { ingested: 0, skipped: 0, total: 0 }) as { ingested: number; skipped: number; total: number };
  }

  // The backend caps one ingest request at MAX_INGEST_RECORDS (422 beyond it).
  // Ingest is an upsert keyed by content hash, so a larger corpus syncs as
  // sequential chunks with summed counts; `total` is the index size after the
  // last chunk.
  async function ingest(records: IngestRecord[]): Promise<{ ingested: number; skipped: number; total: number }> {
    if (records.length <= MAX_INGEST_RECORDS) {
      return ingestChunk(records);
    }
    const summary = { ingested: 0, skipped: 0, total: 0 };
    for (let start = 0; start < records.length; start += MAX_INGEST_RECORDS) {
      const result = await ingestChunk(records.slice(start, start + MAX_INGEST_RECORDS));
      summary.ingested += result.ingested ?? 0;
      summary.skipped += result.skipped ?? 0;
      summary.total = result.total ?? summary.total;
    }
    return summary;
  }

  async function clearIndex(): Promise<void> {
    await axiosInstance.post(`${baseUrl}/api/v1/retrieval/clear`, {}, {
      headers: authHeaders(),
      timeout: BACKEND_CONTROL_TIMEOUT_MS,
    });
  }

  async function stats(): Promise<RetrievalIndexStats> {
    const res = await axiosInstance.get(`${baseUrl}/api/v1/retrieval/stats`, {
      headers: authHeaders(),
      timeout: BACKEND_CONTROL_TIMEOUT_MS,
    });
    return (res.data ?? { count: 0, mode: 'lexical' }) as RetrievalIndexStats;
  }

  return { query, ingest, clearIndex, stats };
}
