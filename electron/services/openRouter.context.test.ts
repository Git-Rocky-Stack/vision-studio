import { describe, expect, it, vi } from 'vitest';
import { createOpenRouterService } from './openRouter';

// M7: retrieved context rides in the user message as `referenceContext`, never
// mutating the cache-pinned system prompt (S5 / S10 trust boundary).
describe('OpenRouter context injection (M7)', () => {
  const enhanceResponse = {
    data: {
      choices: [{ message: { content: JSON.stringify({ mode: 'clarify', prompt: 'p', variations: [] }) } }],
      usage: {},
    },
  };

  it('carries referenceContext in the user message and leaves the system prompt unchanged', async () => {
    const axiosInstance = { get: vi.fn(), post: vi.fn().mockResolvedValue(enhanceResponse) };
    const service = createOpenRouterService({ axiosInstance });
    await service.enhancePrompt({
      apiKey: 'k',
      prompt: 'a fox',
      mode: 'clarify',
      context: '<<RETRIEVED_CONTEXT>>\n[tip] use 1024\n<<END_RETRIEVED_CONTEXT>>',
    });

    const body = axiosInstance.post.mock.calls[0][1] as { messages: Array<{ role: string; content: unknown }> };
    const system = body.messages.find((m) => m.role === 'system');
    const user = body.messages.find((m) => m.role === 'user');
    expect(JSON.stringify(user?.content)).toContain('referenceContext');
    expect(JSON.stringify(user?.content)).toContain('RETRIEVED_CONTEXT');
    expect(JSON.stringify(system?.content)).toContain('You improve prompts');
  });

  it('omits referenceContext when no context is supplied', async () => {
    const axiosInstance = { get: vi.fn(), post: vi.fn().mockResolvedValue(enhanceResponse) };
    const service = createOpenRouterService({ axiosInstance });
    await service.enhancePrompt({ apiKey: 'k', prompt: 'a fox', mode: 'clarify' });
    expect(JSON.stringify(axiosInstance.post.mock.calls[0][1])).not.toContain('referenceContext');
  });

  it('injects referenceContext into negative-prompt suggestion too', async () => {
    const axiosInstance = {
      get: vi.fn(),
      post: vi.fn().mockResolvedValue({
        data: { choices: [{ message: { content: JSON.stringify({ negativePrompt: 'blurry', suggestions: ['blurry'] }) } }], usage: {} },
      }),
    };
    const service = createOpenRouterService({ axiosInstance });
    await service.suggestNegativePrompt({ apiKey: 'k', prompt: 'a fox', context: '<<RETRIEVED_CONTEXT>> tip <<END>>' });
    const user = (axiosInstance.post.mock.calls[0][1] as { messages: Array<{ role: string; content: unknown }> }).messages.find((m) => m.role === 'user');
    expect(JSON.stringify(user?.content)).toContain('referenceContext');
  });
});
