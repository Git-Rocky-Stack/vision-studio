import { describe, expect, it, vi } from 'vitest';
import { createRetrievalClient } from './retrievalClient';

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
  });

  it('ingests records and returns counts', async () => {
    const axiosInstance = { get: vi.fn(), post: vi.fn().mockResolvedValue({ data: { ingested: 2, skipped: 0, total: 2 } }) };
    const client = createRetrievalClient({ baseUrl: 'http://x', axiosInstance });
    const out = await client.ingest([{ source: 'assets', text: 'a', boosted: false, label: 'L' }]);
    expect(out.ingested).toBe(2);
    expect(axiosInstance.post.mock.calls[0][0]).toContain('/api/v1/retrieval/ingest');
  });

  it('reads stats', async () => {
    const axiosInstance = { get: vi.fn().mockResolvedValue({ data: { count: 7, mode: 'lexical' } }), post: vi.fn() };
    const client = createRetrievalClient({ baseUrl: 'http://x', axiosInstance });
    expect(await client.stats()).toEqual({ count: 7, mode: 'lexical' });
  });
});
