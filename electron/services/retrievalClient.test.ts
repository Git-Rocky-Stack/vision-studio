import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it, vi } from 'vitest';
import { createRetrievalClient, MAX_INGEST_RECORDS } from './retrievalClient';

describe('createRetrievalClient', () => {
  it('queries the backend and normalizes the result', async () => {
    const axiosInstance = {
      get: vi.fn(),
      post: vi.fn().mockResolvedValue({ data: { snippets: [{ id: '1', source: 'assets', text: 't', label: 'L', score: 0.9 }], mode: 'semantic' } }),
    };
    const client = createRetrievalClient({ baseUrl: 'http://127.0.0.1:8000', axiosInstance, authHeaders: () => ({ 'X-Auth': 'k' }) });

    const result = await client.query({ text: 'fox', modelFamily: 'sdxl', sources: ['assets'], maxTokens: 200 });

    expect(result.mode).toBe('semantic');
    expect(result.snippets).toHaveLength(1);
    const [url, body, config] = axiosInstance.post.mock.calls[0];
    expect(url).toContain('/api/v1/retrieval/query');
    expect(body).toMatchObject({ text: 'fox', modelFamily: 'sdxl', sources: ['assets'], maxTokens: 200 });
    expect((config as { headers: Record<string, string> }).headers['X-Auth']).toBe('k');
    // Prompt-assist awaits the query: a wedged backend must time out.
    expect((config as { timeout?: number }).timeout).toBe(30_000);
  });

  it('gives a full corpus ingest the long-operation timeout', async () => {
    const axiosInstance = { get: vi.fn(), post: vi.fn().mockResolvedValue({ data: { ingested: 0, skipped: 0, total: 0 } }) };
    const client = createRetrievalClient({ baseUrl: 'http://x', axiosInstance });
    await client.ingest([]);
    expect((axiosInstance.post.mock.calls[0][2] as { timeout?: number }).timeout).toBe(10 * 60_000);
  });

  it('ingests records and returns counts', async () => {
    const axiosInstance = { get: vi.fn(), post: vi.fn().mockResolvedValue({ data: { ingested: 2, skipped: 0, total: 2 } }) };
    const client = createRetrievalClient({ baseUrl: 'http://x', axiosInstance });
    const out = await client.ingest([{ source: 'assets', text: 'a', boosted: false, label: 'L' }]);
    expect(out.ingested).toBe(2);
    expect(axiosInstance.post.mock.calls[0][0]).toContain('/api/v1/retrieval/ingest');
  });

  it('syncs a corpus above the backend cap in sequential chunks and sums the counts', async () => {
    let indexSize = 0;
    const post = vi.fn(async (_url: string, body: unknown) => {
      const { records } = body as { records: unknown[] };
      indexSize += records.length - 1;
      return { data: { ingested: records.length - 1, skipped: 1, total: indexSize } };
    });
    const client = createRetrievalClient({ baseUrl: 'http://x', axiosInstance: { get: vi.fn(), post } });
    const records = Array.from({ length: MAX_INGEST_RECORDS * 2 + 5 }, (_, i) => ({
      source: 'assets' as const,
      text: `t${i}`,
      boosted: false,
      label: 'L',
    }));

    const out = await client.ingest(records);

    // The backend 422s any request above MAX_INGEST_RECORDS.
    const sizes = post.mock.calls.map(([, body]) => (body as { records: unknown[] }).records.length);
    expect(sizes).toEqual([MAX_INGEST_RECORDS, MAX_INGEST_RECORDS, 5]);
    expect(out).toEqual({ ingested: records.length - 3, skipped: 3, total: records.length - 3 });
  });

  it('mirrors the backend ingest cap', () => {
    const schema = readFileSync(resolve(process.cwd(), 'backend/schemas/retrieval.py'), 'utf8');
    const backendCap = /MAX_INGEST_RECORDS\s*=\s*([\d_]+)/.exec(schema)?.[1]?.replace(/_/g, '');
    expect(Number(backendCap)).toBe(MAX_INGEST_RECORDS);
  });

  it('reads stats', async () => {
    const axiosInstance = { get: vi.fn().mockResolvedValue({ data: { count: 7, mode: 'lexical' } }), post: vi.fn() };
    const client = createRetrievalClient({ baseUrl: 'http://x', axiosInstance });
    expect(await client.stats()).toEqual({ count: 7, mode: 'lexical' });
  });
});
