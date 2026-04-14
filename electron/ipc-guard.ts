import { ipcMain } from 'electron';

// Tracks the registration site for each IPC channel so duplicate registrations
// throw a clear, actionable error at startup instead of crashing the main
// process with Electron's built-in "Attempted to register a second handler"
// uncaught exception after the window has already opened.

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

const originalHandle = ipcMain.handle.bind(ipcMain);
const originalHandleOnce = ipcMain.handleOnce.bind(ipcMain);
const originalRemoveHandler = ipcMain.removeHandler.bind(ipcMain);

ipcMain.handle = function guardedHandle(
  channel: string,
  listener: Parameters<typeof ipcMain.handle>[1]
): void {
  const origin = captureOrigin();
  const previous = registeredChannels.get(channel);
  if (previous !== undefined) {
    throw formatDuplicateError(channel, previous, origin, 'handle');
  }
  registeredChannels.set(channel, origin);
  originalHandle(channel, listener);
} as typeof ipcMain.handle;

ipcMain.handleOnce = function guardedHandleOnce(
  channel: string,
  listener: Parameters<typeof ipcMain.handleOnce>[1]
): void {
  const origin = captureOrigin();
  const previous = registeredChannels.get(channel);
  if (previous !== undefined) {
    throw formatDuplicateError(channel, previous, origin, 'handleOnce');
  }
  registeredChannels.set(channel, origin);
  originalHandleOnce(channel, listener);
} as typeof ipcMain.handleOnce;

ipcMain.removeHandler = function guardedRemoveHandler(channel: string): void {
  registeredChannels.delete(channel);
  originalRemoveHandler(channel);
} as typeof ipcMain.removeHandler;
