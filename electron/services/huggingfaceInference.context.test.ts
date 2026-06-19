import { describe, expect, it, vi } from 'vitest';
import { createHuggingFaceInferenceService } from './huggingfaceInference';

// M7: HuggingFace shares the OpenAI-compatible chat surface, so context rides in
// the user message JSON as `referenceContext` exactly like OpenRouter (S5).
describe('HuggingFace context injection (M7)', () => {
  const enhanceResponse = {
    data: { choices: [{ message: { content: JSON.stringify({ prompt: 'p', variations: [] }) } }], usage: {} },
  };

  it('carries referenceContext in the user message', async () => {
    const axiosInstance = { get: vi.fn(), post: vi.fn().mockResolvedValue(enhanceResponse) };
    const service = createHuggingFaceInferenceService({ axiosInstance });
    await service.enhancePrompt({ token: 'hf_x', prompt: 'a fox', mode: 'clarify', context: '<<RETRIEVED_CONTEXT>> tip <<END>>' });

    const body = axiosInstance.post.mock.calls[0][1] as { messages: Array<{ role: string; content: string }> };
    const user = body.messages.find((m) => m.role === 'user');
    expect(user?.content).toContain('referenceContext');
    expect(user?.content).toContain('RETRIEVED_CONTEXT');
  });

  it('omits referenceContext when no context supplied', async () => {
    const axiosInstance = { get: vi.fn(), post: vi.fn().mockResolvedValue(enhanceResponse) };
    const service = createHuggingFaceInferenceService({ axiosInstance });
    await service.enhancePrompt({ token: 'hf_x', prompt: 'a fox', mode: 'clarify' });
    const body = axiosInstance.post.mock.calls[0][1] as { messages: Array<{ role: string; content: string }> };
    expect(body.messages.find((m) => m.role === 'user')?.content).not.toContain('referenceContext');
  });
});
