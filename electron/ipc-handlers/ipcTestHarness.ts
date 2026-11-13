import type { IpcEnvelope } from '../../shared/ipcTypes';
import type { IpcMainLike } from './ipcHandle';

/**
 * Test support for contract handlers: a fake ipcMain that records listeners,
 * plus an invoke that unwraps the IpcEnvelope the way the preload does.
 * Used by unit tests only; nothing in the app imports it.
 */

/** The app's own top-level page, as the sender policy sees it in tests. */
export const TEST_RENDERER_ENTRY = '/app/dist/index.html';

export const TRUSTED_EVENT = {
  senderFrame: { url: `file://${TEST_RENDERER_ENTRY}#/studio`, parent: null },
};

export const UNTRUSTED_EVENT = {
  senderFrame: { url: 'https://evil.example/', parent: null },
};

type Listener = (event: unknown, ...args: unknown[]) => unknown;

export function createFakeIpcMain() {
  const handlers = new Map<string, Listener>();
  const ipcMain: IpcMainLike = {
    handle: (channel, listener) => {
      handlers.set(channel, listener as Listener);
    },
  };

  /** Raw envelope, as it would cross the wire. */
  async function invokeRaw(channel: string, event: unknown, ...args: unknown[]): Promise<IpcEnvelope<unknown>> {
    const handler = handlers.get(channel);
    if (!handler) {
      throw new Error(`no handler for ${channel}`);
    }
    return (await handler(event, ...args)) as IpcEnvelope<unknown>;
  }

  /** Unwrapped result from a trusted frame; rejects like the preload on `ok: false`. */
  async function invoke<T = unknown>(channel: string, ...args: unknown[]): Promise<T> {
    const envelope = await invokeRaw(channel, TRUSTED_EVENT, ...args);
    if (envelope.ok) {
      return envelope.data as T;
    }
    throw Object.assign(new Error(envelope.error.message), { code: envelope.error.code });
  }

  return { ipcMain, handlers, invoke, invokeRaw };
}
