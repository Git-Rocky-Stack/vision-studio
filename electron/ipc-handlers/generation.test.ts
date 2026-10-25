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

describe('backend error logging', () => {
  it('logs only the message and status, never the token-bearing request config', async () => {
    const secret = 'backend-token-should-never-be-logged';
    const axiosError = Object.assign(new Error('Request failed with status code 500'), {
      isAxiosError: true,
      config: { headers: { 'x-vision-studio-token': secret, 'X-HF-Token': secret } },
      response: { status: 500, data: {} },
    });
    harness.post.mockReset().mockRejectedValue(axiosError);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const result = await invoke('generation:generate-image', { prompt: 'a cat' });

      expect(result.success).toBe(false);
      const logged = consoleError.mock.calls.map((call) => call.map(String).join(' ')).join('\n');
      expect(logged).toContain('Request failed with status code 500 (HTTP 500)');
      expect(logged).not.toContain(secret);
      for (const call of consoleError.mock.calls) {
        for (const arg of call) expect(typeof arg).toBe('string');
      }
    } finally {
      consoleError.mockRestore();
    }
  });
});

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
