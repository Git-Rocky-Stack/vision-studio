import { describe, expect, it, vi } from 'vitest';
import { buildPromptContext } from './promptAugmentation';
import type { RetrievalSource } from '../../shared/retrieval';

const directive = { sources: ['prompt-history'] as RetrievalSource[], modelFamily: 'sdxl' };

describe('buildPromptContext', () => {
  it('returns empty when there is no directive', async () => {
    const out = await buildPromptContext({ prompt: 'p', directive: undefined, retrievalClient: { query: vi.fn() } });
    expect(out).toEqual({ provenance: [] });
  });

  it('queries retrieval, assembles a block, and returns provenance', async () => {
    const query = vi.fn().mockResolvedValue({
      snippets: [{ id: '1', source: 'prompt-history', text: 'a red fox', label: 'your prior prompt', score: 1 }],
      mode: 'semantic',
    });
    const out = await buildPromptContext({ prompt: 'fox', directive: { ...directive }, retrievalClient: { query } });
    expect(out.context).toContain('a red fox');
    expect(out.provenance).toHaveLength(1);
    expect(out.mode).toBe('semantic');
    expect(query).toHaveBeenCalledWith(expect.objectContaining({ text: 'fox', modelFamily: 'sdxl', sources: ['prompt-history'] }));
  });

  it('degrades gracefully when retrieval throws (backend unreachable)', async () => {
    const query = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    const out = await buildPromptContext({ prompt: 'fox', directive: { ...directive }, retrievalClient: { query } });
    expect(out).toEqual({ provenance: [] });
  });

  it('returns empty when the directive has no sources', async () => {
    const out = await buildPromptContext({
      prompt: 'fox',
      directive: { sources: [], modelFamily: null },
      retrievalClient: { query: vi.fn() },
    });
    expect(out).toEqual({ provenance: [] });
  });
});
