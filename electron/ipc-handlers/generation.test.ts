import { beforeEach, describe, expect, it, vi } from 'vitest';

type Handler = (event: unknown, ...args: any[]) => Promise<any>;

const harness = vi.hoisted(() => ({
  handlers: new Map<string, Handler>(),
  appListeners: new Map<string, () => void>(),
  post: vi.fn(),
  get: vi.fn(),
  verified: true,
  createConfig: undefined as unknown,
  sockets: [] as Array<{
    url: string;
    options?: { headers?: Record<string, string> };
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
  app: {
    on: (event: string, listener: () => void) => {
      harness.appListeners.set(event, listener);
    },
  },
  BrowserWindow: class {},
}));

// K1 gate (electron/services/backend.ts, lifecycle side).
vi.mock('../services/backend', () => ({
  isBackendIdentityVerified: () => harness.verified,
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
    constructor(
      readonly url: string,
      readonly options?: { headers?: Record<string, string> },
    ) {
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

const { configureTrustedRendererLocation } = await import('./ipcSenderPolicy');
const { TEST_RENDERER_ENTRY, TRUSTED_EVENT, UNTRUSTED_EVENT } = await import('./ipcTestHarness');
configureTrustedRendererLocation({ rendererEntryFile: TEST_RENDERER_ENTRY, platform: 'linux' });

const { setupGenerationHandlers, kickBackendWebSocket } = await import('./generation');
const { getBackendAuthToken } = await import('../services/backendAuth');

async function invokeRaw(channel: string, event: unknown, ...args: unknown[]) {
  const handler = harness.handlers.get(channel);
  if (!handler) throw new Error(`no handler for ${channel}`);
  return handler(event, ...args);
}

/** Invoke from the app page and unwrap the envelope like the preload does. */
async function invoke(channel: string, ...args: unknown[]) {
  const envelope = await invokeRaw(channel, TRUSTED_EVENT, ...args);
  if (envelope.ok) return envelope.data;
  throw Object.assign(new Error(envelope.error.message), { code: envelope.error.code });
}

const refused = () => Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:8000'), { code: 'ECONNREFUSED' });

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

  it('sends the session token in a header, never in the URL (K2)', () => {
    const [socket] = harness.sockets;
    expect(socket.url).toBe('ws://127.0.0.1:8000/ws');
    expect(socket.url).not.toContain('token');
    expect(socket.options?.headers).toEqual({ 'x-vision-studio-token': getBackendAuthToken() });
  });

  it('registers its own will-quit disposal', () => {
    expect(harness.appListeners.has('will-quit')).toBe(true);
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

  it('does not connect with the token until the backend identity is verified, then connects', () => {
    vi.useFakeTimers();
    try {
      const current = harness.sockets[1];
      current.readyState = 3;
      harness.verified = false;
      kickBackendWebSocket();
      expect(harness.sockets).toHaveLength(2);
      vi.advanceTimersByTime(5_000);
      expect(harness.sockets).toHaveLength(2);

      harness.verified = true;
      vi.advanceTimersByTime(1_000);
      expect(harness.sockets).toHaveLength(3);
      expect(harness.sockets[2].options?.headers?.['x-vision-studio-token']).toBe(getBackendAuthToken());
    } finally {
      harness.verified = true;
      vi.useRealTimers();
    }
  });
});

describe('contract enforcement on generation channels', () => {
  beforeEach(() => {
    harness.post.mockReset();
    harness.get.mockReset();
  });

  it('refuses a call from an untrusted frame before any backend request', async () => {
    const reply = await invokeRaw('generation:generate-image', UNTRUSTED_EVENT, { prompt: 'x', width: 1, height: 1, steps: 1, cfg_scale: 1 });
    expect(reply).toMatchObject({ ok: false, error: { code: 'FORBIDDEN_SENDER' } });
    expect(harness.post).not.toHaveBeenCalled();
  });

  it('removed the zero-caller channels (S2)', () => {
    for (const channel of [
      'generation:list-jobs',
      'models:get',
      'models:get-status',
      'models:downloads:subscribe',
      'director:ingest-record',
    ]) {
      expect(harness.handlers.has(channel), channel).toBe(false);
    }
  });

  it('allow-lists the edit operation instead of interpolating it into the URL (S6)', async () => {
    await expect(
      invoke('generation:edit-image', { operation: '../../api/models/x/download', source_path: 'C:/a.png' }),
    ).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
    expect(harness.post).not.toHaveBeenCalled();

    harness.post.mockResolvedValue({ data: { job_id: 'edit-1' } });
    const result = await invoke('generation:edit-image', { operation: 'upscale', source_path: 'C:/a.png', scale: 4 });
    expect(result).toEqual({ success: true, jobId: 'edit-1' });
    expect(harness.post).toHaveBeenCalledWith(
      'http://127.0.0.1:8000/api/v1/edit/upscale',
      { source_path: 'C:/a.png', scale: 4 },
      expect.any(Object),
    );
  });

  it('URL-encodes job and model ids in backend paths (S6)', async () => {
    harness.get.mockResolvedValue({ data: { job_id: 'x', status: 'pending', progress: 0 } });
    await invoke('generation:get-status', '../models/evil?x=1');
    expect(harness.get.mock.calls[0][0]).toBe('http://127.0.0.1:8000/api/jobs/..%2Fmodels%2Fevil%3Fx%3D1');

    harness.post.mockResolvedValue({ data: { model_id: 'a/b', status: 'queued' } });
    await invoke('models:download', 'org/model');
    expect(harness.post.mock.calls[0][0]).toBe('http://127.0.0.1:8000/api/models/org%2Fmodel/download');
  });

  it('rejects get-status instead of resolving a failure body typed as a JobStatus', async () => {
    harness.get.mockRejectedValue(refused());
    await expect(invoke('generation:get-status', 'job-1')).rejects.toThrow(/not running/);
  });

  it('submits a model download once, and rejects on failure (S6)', async () => {
    harness.post.mockRejectedValue(Object.assign(new Error('timeout of 30000ms exceeded'), { code: 'ECONNABORTED' }));
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      await expect(invoke('models:download', 'flux-dev')).rejects.toThrow(/Model download failed/);
      expect(harness.post).toHaveBeenCalledTimes(1);
    } finally {
      consoleError.mockRestore();
    }
  });

  it('forwards an optional provisioning subset as model_ids (K3)', async () => {
    harness.post.mockResolvedValue({ data: { models: [] } });
    await invoke('provision:start', { modelIds: ['sdxl', 'flux'] });
    await invoke('provision:start');
    expect(harness.post.mock.calls[0][0]).toBe('http://127.0.0.1:8000/api/models/provision/start');
    expect(harness.post.mock.calls[0][1]).toEqual({ model_ids: ['sdxl', 'flux'] });
    expect(harness.post.mock.calls[1][1]).toBeUndefined();
    await expect(invoke('provision:start', { modelIds: [] })).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
  });

  it('wraps workflow:run-graph in a success envelope and never throws raw axios errors', async () => {
    harness.post.mockResolvedValueOnce({ data: { job_id: 'job-9', status: 'queued', message: 'ok' } });
    const graph = { '1': { class_type: 'KSampler', inputs: { seed: 1, model: ['2', 0] } } };
    expect(await invoke('workflow:run-graph', { graph, generationType: 'image' })).toEqual({
      success: true,
      job_id: 'job-9',
      status: 'queued',
      message: 'ok',
    });

    const secret = 'token-never-logged';
    harness.post.mockRejectedValueOnce(
      Object.assign(new Error('Request failed with status code 500'), {
        config: { headers: { 'x-vision-studio-token': secret } },
        response: { status: 500 },
      }),
    );
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      expect(await invoke('workflow:run-graph', { graph, generationType: 'image' })).toEqual({
        success: false,
        error: expect.any(String),
      });
      expect(consoleError.mock.calls.flat().join(' ')).not.toContain(secret);
    } finally {
      consoleError.mockRestore();
    }
  });

  it('never sends the token to an unverified backend', async () => {
    harness.verified = false;
    try {
      const result = await invoke('generation:generate-image', { prompt: 'a cat', width: 512, height: 512, steps: 20, cfg_scale: 7 });
      expect(result).toEqual({ success: false, error: expect.stringMatching(/identity has not been verified/) });
      await expect(invoke('models:download', 'flux-dev')).rejects.toThrow(/identity has not been verified/);
      expect(harness.post).not.toHaveBeenCalled();
    } finally {
      harness.verified = true;
    }
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
      const result = await invoke('generation:generate-image', {
        prompt: 'a cat',
        width: 512,
        height: 512,
        steps: 20,
        cfg_scale: 7,
      });

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

    const result = await invoke('generation:enhance-prompt', { prompt: 'a cat', mode: 'clarify' });

    expect(result.success).toBe(false);
    expect(typeof result.error).toBe('string');
  });

  it('refuses an unknown mode at the contract', async () => {
    await expect(invoke('generation:enhance-prompt', { prompt: 'a cat', mode: 'nope' })).rejects.toMatchObject({
      code: 'INVALID_REQUEST',
    });
    expect(harness.post).not.toHaveBeenCalled();
  });
});

describe('app shutdown', () => {
  it('closes the socket and cancels reconnects on will-quit', () => {
    vi.useFakeTimers();
    try {
      const live = harness.sockets[harness.sockets.length - 1];
      const count = harness.sockets.length;
      harness.appListeners.get('will-quit')!();

      expect(live.terminated).toBe(true);
      live.emit('close');
      kickBackendWebSocket();
      vi.advanceTimersByTime(60_000);
      expect(harness.sockets).toHaveLength(count);
    } finally {
      vi.useRealTimers();
    }
  });
});
