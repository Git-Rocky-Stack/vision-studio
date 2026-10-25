import { beforeEach, describe, expect, it, vi } from 'vitest';

type Handler = (event: unknown, ...args: any[]) => Promise<any>;

const harness = vi.hoisted(() => ({
  handlers: new Map<string, Handler>(),
  post: vi.fn(),
  get: vi.fn(),
}));

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: Handler) => {
      harness.handlers.set(channel, handler);
    },
  },
  BrowserWindow: class {},
}));

vi.mock('axios', () => ({
  default: { post: harness.post, get: harness.get, delete: vi.fn() },
}));

vi.mock('ws', () => ({ default: class {} }));

await import('./generation');

function invoke(channel: string, ...args: unknown[]) {
  const handler = harness.handlers.get(channel);
  if (!handler) throw new Error(`no handler for ${channel}`);
  return handler({}, ...args);
}

describe('generation:enhance-prompt (Local route)', () => {
  beforeEach(() => {
    harness.post.mockReset();
    harness.get.mockReset();
  });

  it('adds success to the bare backend body so the renderer accepts it', async () => {
    harness.post.mockResolvedValue({
      data: { mode: 'clarify', prompt: 'a cat, soft window light', variations: [] },
    });

    const result = await invoke('generation:enhance-prompt', { prompt: 'a cat', mode: 'clarify' });

    expect(harness.post).toHaveBeenCalledWith(
      'http://127.0.0.1:8000/api/prompts/enhance',
      { prompt: 'a cat', mode: 'clarify' },
      expect.any(Object),
    );
    expect(result).toEqual({
      success: true,
      mode: 'clarify',
      prompt: 'a cat, soft window light',
      variations: [],
    });
  });

  it('reports a body with no prompt as a failure, not a silent success', async () => {
    harness.post.mockResolvedValue({ data: { mode: 'clarify', variations: [] } });

    const result = await invoke('generation:enhance-prompt', { prompt: 'a cat', mode: 'clarify' });

    expect(result).toMatchObject({ success: false, error: expect.any(String) });
  });

  it('returns success false with an error when the backend call fails', async () => {
    const error = Object.assign(new Error('Request failed with status code 422'), {
      response: { status: 422, data: { detail: 'bad mode' } },
    });
    harness.post.mockRejectedValue(error);

    const result = await invoke('generation:enhance-prompt', { prompt: 'a cat', mode: 'nope' });

    expect(result.success).toBe(false);
    expect(typeof result.error).toBe('string');
  });
});
