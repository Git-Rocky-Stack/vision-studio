import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';

import {
  IPC_BRIDGE,
  IPC_PUSH_BRIDGE,
  IPC_PUSH_SCHEMAS,
  type ElectronAPI,
  type IpcChannel,
  type IpcPushChannel,
  type IpcPushPayloads,
} from '../shared/ipcContract';
import type { IpcEnvelope } from '../shared/ipcTypes';

// The bridge is generated from shared/ipcContract.ts: a renderer method can
// only reach the channel the contract maps it to. The main process validates
// every argument (ipc-handlers/ipcHandle.ts) and answers with an IpcEnvelope,
// which is unwrapped here so the renderer sees a plain value or a rejection.

export type { ElectronAPI } from '../shared/ipcContract';

/** Error the renderer receives when the main process refuses or fails a call. */
export class IpcBridgeError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'IpcBridgeError';
    this.code = code;
  }
}

function isEnvelope(value: unknown): value is IpcEnvelope<unknown> {
  return typeof value === 'object' && value !== null && typeof (value as { ok?: unknown }).ok === 'boolean';
}

export function unwrapEnvelope<T>(channel: string, reply: unknown): T {
  if (!isEnvelope(reply)) {
    throw new IpcBridgeError('INVALID_REPLY', `The app returned an unreadable reply for "${channel}".`);
  }
  if (reply.ok) {
    return reply.data as T;
  }
  throw new IpcBridgeError(reply.error.code, reply.error.message);
}

export async function invokeChannel<T>(channel: IpcChannel, args: unknown[]): Promise<T> {
  return unwrapEnvelope<T>(channel, await ipcRenderer.invoke(channel, ...args));
}

/**
 * Subscribe to a push channel. Payloads are parsed against the contract
 * before the renderer callback sees them; a malformed one is dropped.
 */
export function subscribePush<C extends IpcPushChannel>(
  channel: C,
  callback: (payload: IpcPushPayloads[C]) => void,
): () => void {
  const schema = IPC_PUSH_SCHEMAS[channel];
  const handler = (_event: IpcRendererEvent, payload: unknown) => {
    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
      console.warn(`[preload] Dropped a malformed "${channel}" event.`);
      return;
    }
    // The schema for C validates exactly IpcPushPayloads[C]; TS cannot
    // correlate the two indexed accesses, hence the widening cast.
    callback(parsed.data as unknown as IpcPushPayloads[C]);
  };
  ipcRenderer.on(channel, handler);
  return () => {
    ipcRenderer.off(channel, handler);
  };
}

export function buildElectronApi(): ElectronAPI {
  const api: Record<string, Record<string, unknown>> = {};

  for (const [namespace, methods] of Object.entries(IPC_BRIDGE)) {
    const target: Record<string, unknown> = {};
    for (const [method, channel] of Object.entries(methods as Record<string, IpcChannel>)) {
      target[method] = (...args: unknown[]) => invokeChannel(channel, args);
    }
    api[namespace] = target;
  }

  for (const [namespace, methods] of Object.entries(IPC_PUSH_BRIDGE)) {
    const target = (api[namespace] ??= {});
    for (const [method, channel] of Object.entries(methods as Record<string, IpcPushChannel>)) {
      target[method] = (callback: (payload: unknown) => void) => subscribePush(channel, callback);
    }
  }

  return api as unknown as ElectronAPI;
}

contextBridge.exposeInMainWorld('electron', buildElectronApi());
