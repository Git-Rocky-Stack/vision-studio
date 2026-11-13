import { beforeEach, describe, expect, it, vi } from 'vitest';

import { IPC_BRIDGE, IPC_CONTRACT, IPC_PUSH_BRIDGE, type ElectronAPI } from '../shared/ipcContract';

const bridge = vi.hoisted(() => ({
  exposed: undefined as unknown,
  invoke: vi.fn(),
  listeners: new Map<string, Set<(event: unknown, payload: unknown) => void>>(),
}));

vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld: (key: string, api: unknown) => {
      if (key === 'electron') bridge.exposed = api;
    },
  },
  ipcRenderer: {
    invoke: bridge.invoke,
    on: (channel: string, listener: (event: unknown, payload: unknown) => void) => {
      if (!bridge.listeners.has(channel)) bridge.listeners.set(channel, new Set());
      bridge.listeners.get(channel)!.add(listener);
    },
    off: (channel: string, listener: (event: unknown, payload: unknown) => void) => {
      bridge.listeners.get(channel)?.delete(listener);
    },
  },
}));

await import('./preload');
const api = () => bridge.exposed as ElectronAPI;

function push(channel: string, payload: unknown) {
  for (const listener of bridge.listeners.get(channel) ?? []) listener({}, payload);
}

beforeEach(() => {
  bridge.invoke.mockReset();
});

describe('preload bridge (single-source contract)', () => {
  it('exposes exactly the contract methods, each mapped to a declared channel', () => {
    for (const [namespace, methods] of Object.entries(IPC_BRIDGE)) {
      for (const [method, channel] of Object.entries(methods)) {
        expect(typeof (api() as unknown as Record<string, Record<string, unknown>>)[namespace][method], `${namespace}.${method}`).toBe(
          'function',
        );
        expect(Object.prototype.hasOwnProperty.call(IPC_CONTRACT, channel)).toBe(true);
      }
    }
    const exposed = api() as unknown as Record<string, Record<string, unknown>>;
    expect(exposed).not.toHaveProperty('store');
    expect(exposed.settings).not.toHaveProperty('reset');
    expect(exposed.backend).not.toHaveProperty('stop');
    expect(exposed.backend).not.toHaveProperty('checkBundled');
    expect(exposed.models).not.toHaveProperty('subscribeDownloads');
    expect(exposed.generation).not.toHaveProperty('listJobs');
    expect(exposed.director).not.toHaveProperty('ingestRecord');
  });

  it('forwards positional args to the mapped channel and unwraps ok envelopes', async () => {
    bridge.invoke.mockResolvedValue({ ok: true, data: { activeAccountId: 'a', accounts: [] } });

    await expect(api().accounts.update('a', { name: 'Studio' })).resolves.toEqual({ activeAccountId: 'a', accounts: [] });
    expect(bridge.invoke).toHaveBeenCalledWith('accounts:update', 'a', { name: 'Studio' });
  });

  it('exposes the explicit update download as updater.download -> updater:download, with no arguments', async () => {
    expect(IPC_BRIDGE.updater.download).toBe('updater:download');
    expect(typeof api().updater.download).toBe('function');
    bridge.invoke.mockResolvedValue({ ok: true, data: { state: 'downloading', version: '3.2.0', percent: 0 } });

    await expect(api().updater.download()).resolves.toEqual({ state: 'downloading', version: '3.2.0', percent: 0 });
    expect(bridge.invoke).toHaveBeenCalledWith('updater:download');
  });

  it('surfaces a refused update download as a rejection the UI can show', async () => {
    bridge.invoke.mockResolvedValueOnce({
      ok: false,
      error: { code: 'FORBIDDEN_SENDER', message: 'This window is not allowed to call the app.' },
    });

    await expect(api().updater.download()).rejects.toMatchObject({
      code: 'FORBIDDEN_SENDER',
      message: 'This window is not allowed to call the app.',
    });
  });

  it('delivers downloading progress pushes to updater.onStatus', () => {
    const onStatus = vi.fn();
    const unsubscribe = api().updater.onStatus(onStatus);

    push('updater:status', { state: 'downloading', version: '3.2.0', percent: 12.5, transferred: 1, total: 8 });

    expect(onStatus).toHaveBeenCalledWith({ state: 'downloading', version: '3.2.0', percent: 12.5, transferred: 1, total: 8 });
    unsubscribe();
  });

  it('rejects with the main-process message on an error envelope or an unreadable reply', async () => {
    bridge.invoke.mockResolvedValueOnce({ ok: false, error: { code: 'INVALID_REQUEST', message: 'Invalid request for "x"' } });
    await expect(api().app.getVersion()).rejects.toThrow('Invalid request for "x"');

    bridge.invoke.mockResolvedValueOnce('raw value');
    await expect(api().app.getVersion()).rejects.toThrow(/unreadable reply/);
  });

  it('delivers valid push payloads and drops malformed ones (S15)', () => {
    const progress = vi.fn();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const unsubscribe = api().generation.onProgress(progress);

    push('generation:progress', { type: 'job_update', job_id: 'j1', status: 'processing', progress: 40 });
    push('generation:progress', { type: 'job_update', job_id: 'j1', status: 'exploded', progress: 40 });
    push('generation:progress', { job_id: 'j1' });
    push('generation:progress', null);

    expect(progress).toHaveBeenCalledTimes(1);
    expect(progress).toHaveBeenCalledWith({ type: 'job_update', job_id: 'j1', status: 'processing', progress: 40 });
    expect(warn).toHaveBeenCalledTimes(3);

    unsubscribe();
    push('generation:progress', { type: 'job_update', job_id: 'j2', status: 'completed', progress: 100 });
    expect(progress).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it('subscribes to backend:status-changed (K6), with an optional error', () => {
    expect(IPC_PUSH_BRIDGE.backend.onStatusChange).toBe('backend:status-changed');
    const onStatus = vi.fn();
    api().backend.onStatusChange(onStatus);

    push('backend:status', { running: true, pid: 1 });
    push('backend:status-changed', { running: false, pid: null, error: 'Backend identity check failed' });

    expect(onStatus).toHaveBeenCalledTimes(1);
    expect(onStatus).toHaveBeenCalledWith({ running: false, pid: null, error: 'Backend identity check failed' });
  });
});
