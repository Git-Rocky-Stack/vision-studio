import { ipcMain } from 'electron';

import { isContractListener } from './ipc-handlers/ipcHandle';

// Loaded first by main.ts, before any module registers an ipcMain handler.
//
// 1. Duplicate registrations throw a clear, actionable error at startup instead
//    of crashing the main process with Electron's built-in "Attempted to
//    register a second handler" uncaught exception after the window opened.
// 2. Only listeners built by handleIpc (ipc-handlers/ipcHandle.ts) may be
//    registered, so no handler can bypass the shared IPC contract's sender
//    check, input validation and sanitized error envelope.

const registeredChannels = new Map<string, string>();

function isGuardFrame(line: string): boolean {
  // Match ipc-guard.ts / ipc-guard.js (source or compiled) but not ipc-guard.test.ts.
  const idx = line.indexOf('ipc-guard.');
  if (idx === -1) return false;
  return !line.slice(idx + 'ipc-guard.'.length).startsWith('test.');
}

function captureOrigin(): string {
  const stack = new Error().stack ?? '';
  const lines = stack.split('\n');
  const caller = lines.find((line, idx) => idx >= 2 && !isGuardFrame(line));
  return caller ? caller.trim() : '<unknown caller>';
}

function formatDuplicateError(
  channel: string,
  previous: string,
  current: string,
  kind: 'handle' | 'handleOnce'
): Error {
  return new Error(
    `[ipc-guard] Duplicate IPC handler for channel "${channel}" (${kind}).\n` +
      `  First registered at:  ${previous}\n` +
      `  Attempted again at:   ${current}\n` +
      `Remove one of the registrations, or call ipcMain.removeHandler("${channel}") ` +
      `before re-registering.`
  );
}

function formatUncheckedListenerError(channel: string, origin: string): Error {
  return new Error(
    `[ipc-guard] IPC handler for "${channel}" was not registered through handleIpc.\n` +
      `  Registered at: ${origin}\n` +
      `Declare the channel in shared/ipcContract.ts and register it with ` +
      `handleIpc (electron/ipc-handlers/ipcHandle.ts).`
  );
}

function register(
  kind: 'handle' | 'handleOnce',
  channel: string,
  listener: unknown,
  forward: () => void,
): void {
  const origin = captureOrigin();
  if (!isContractListener(listener)) {
    throw formatUncheckedListenerError(channel, origin);
  }
  const previous = registeredChannels.get(channel);
  if (previous !== undefined) {
    throw formatDuplicateError(channel, previous, origin, kind);
  }
  registeredChannels.set(channel, origin);
  forward();
}

const originalHandle = ipcMain.handle.bind(ipcMain);
const originalHandleOnce = ipcMain.handleOnce.bind(ipcMain);
const originalRemoveHandler = ipcMain.removeHandler.bind(ipcMain);

ipcMain.handle = function guardedHandle(
  channel: string,
  listener: Parameters<typeof ipcMain.handle>[1]
): void {
  register('handle', channel, listener, () => originalHandle(channel, listener));
} as typeof ipcMain.handle;

ipcMain.handleOnce = function guardedHandleOnce(
  channel: string,
  listener: Parameters<typeof ipcMain.handleOnce>[1]
): void {
  register('handleOnce', channel, listener, () => originalHandleOnce(channel, listener));
} as typeof ipcMain.handleOnce;

ipcMain.removeHandler = function guardedRemoveHandler(channel: string): void {
  registeredChannels.delete(channel);
  originalRemoveHandler(channel);
} as typeof ipcMain.removeHandler;
