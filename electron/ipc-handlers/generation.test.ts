import { beforeEach, describe, expect, it, vi } from 'vitest';

type Handler = (event: unknown, ...args: any[]) => Promise<any>;

const harness = vi.hoisted(() => ({
  handlers: new Map<string, Handler>(),
  post: vi.fn(),
  get: vi.fn(),
  createConfig: undefined as unknown,
  sockets: [] as Array<{
    readyState: number;
    terminated: boolean;
    emit: (event: string, ...args: unknown[]) => boolean;
  }>,
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
  default: {
    create: (config: unknown) => {
      harness.createConfig = config;
      return { post: harness.post, get: harness.get, delete: vi.fn() };
    },
  },
}));

vi.mock('ws', async () => {
  const { EventEmitter } = await import('node:events');
  class FakeWebSocket extends EventEmitter {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSED = 3;
    readyState = FakeWebSocket.CONNECTING;
    terminated = false;
    constructor(readonly url: string) {
      super();
      harness.sockets.push(this);
    }
    terminate() {
      this.terminated = true;
      this.readyState = FakeWebSocket.CLOSED;
    }
  }
  return { default: FakeWebSocket };
});

const { setupGenerationHandlers, kickBackendWebSocket } = await import('./generation');

function invoke(channel: string, ...args: unknown[]) {
  const handler = harness.handlers.get(channel);
  if (!handler) throw new Error(`no handler for ${channel}`);
  return handler({}, ...args);
}

describe('backend progress WebSocket', () => {
  function fakeWindow() {
    return { isDestroyed: () => false, webContents: { send: vi.fn() } };
  }
  const jobUpdate = JSON.stringify({ type: 'job_update', job_id: 'j1', status: 'processing', progress: 40 });

  it('opens one socket for the session and only swaps the target window on re-activate', () => {
    const first = fakeWindow();
    const second = fakeWindow();
    vi.spyOn(console, 'log').mockImplementation(() => undefined);

    setupGenerationHandlers(first as never);
    setupGenerationHandlers(second as never);

    expect(harness.sockets).toHaveLength(1);
    harness.sockets[0].readyState = 1;
    harness.sockets[0].emit('open');
    harness.sockets[0].emit('message', Buffer.from(jobUpdate));
    expect(first.webContents.send).not.toHaveBeenCalled();
    expect(second.webContents.send).toHaveBeenCalledTimes(1);
    expect(second.webContents.send).toHaveBeenCalledWith('generation:progress', expect.objectContaining({ job_id: 'j1' }));
  });

  it('ignores a kick while the socket is open', () => {
    kickBackendWebSocket();
    expect(harness.sockets).toHaveLength(1);
  });

  it('reconnects immediately on a kick instead of waiting out the backoff', () => {
    vi.useFakeTimers();
    try {
      const socket = harness.sockets[0];
      socket.readyState = 3;
      socket.emit('close');
      expect(harness.sockets).toHaveLength(1);

      kickBackendWebSocket();
      expect(harness.sockets).toHaveLength(2);

      // The backoff timer from the close was cancelled: no third socket.
      vi.advanceTimersByTime(60_000);
      expect(harness.sockets).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('retires a superseded socket so it cannot deliver duplicate events', () => {
    const window = fakeWindow();
    setupGenerationHandlers(window as never);
    const [stale, current] = harness.sockets;

    stale.emit('message', Buffer.from(jobUpdate));
    current.emit('message', Buffer.from(jobUpdate));

    expect(window.webContents.send).toHaveBeenCalledTimes(1);
  });
});

describe('backend request timeouts', () => {
  it('builds the shared backend client with a 30s default timeout', () => {
    expect(harness.createConfig).toEqual({ timeout: 30_000 });
  });

  it('lets a long synchronous backend operation outlive the control timeout', async () => {
    harness.post.mockReset().mockResolvedValue({ data: { records_indexed: 3, warnings: [] } });

    await invoke('models:scan');

    const config = harness.post.mock.calls[0][2] as { timeout?: number };
    expect(config.timeout).toBe(10 * 60_000);
  });
});

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
