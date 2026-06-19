import axios from 'axios';
import type { IngestRecord, RetrievalQuery, RetrievalResult } from '../../shared/retrieval';

type AxiosLike = {
  get: (url: string, config?: unknown) => Promise<{ data: unknown }>;
  post: (url: string, body?: unknown, config?: unknown) => Promise<{ data: unknown }>;
};

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
  axiosInstance = axios as unknown as AxiosLike,
  authHeaders = () => ({}),
}: CreateRetrievalClientOptions) {
  async function query(q: RetrievalQuery): Promise<RetrievalResult> {
    const res = await axiosInstance.post(
      `${baseUrl}/api/v1/retrieval/query`,
      { text: q.text, modelFamily: q.modelFamily, sources: q.sources, maxTokens: q.maxTokens },
      { headers: authHeaders() },
    );
    const data = (res.data ?? {}) as Partial<RetrievalResult>;
    return {
      snippets: Array.isArray(data.snippets) ? data.snippets : [],
      mode: data.mode === 'lexical' ? 'lexical' : 'semantic',
    };
  }

  async function ingest(records: IngestRecord[]): Promise<{ ingested: number; skipped: number; total: number }> {
    const res = await axiosInstance.post(`${baseUrl}/api/v1/retrieval/ingest`, { records }, { headers: authHeaders() });
    return (res.data ?? { ingested: 0, skipped: 0, total: 0 }) as { ingested: number; skipped: number; total: number };
  }

  async function clearIndex(): Promise<void> {
    await axiosInstance.post(`${baseUrl}/api/v1/retrieval/clear`, {}, { headers: authHeaders() });
  }

  async function stats(): Promise<RetrievalIndexStats> {
    const res = await axiosInstance.get(`${baseUrl}/api/v1/retrieval/stats`, { headers: authHeaders() });
    return (res.data ?? { count: 0, mode: 'lexical' }) as RetrievalIndexStats;
  }

  return { query, ingest, clearIndex, stats };
}
