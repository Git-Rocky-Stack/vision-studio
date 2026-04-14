import { describe, it, expect, vi } from 'vitest';

// Mock electron with a minimal ipcMain stub. vi.mock is hoisted so this runs
// before the ipc-guard import below installs its monkey-patches.
vi.mock('electron', () => {
  const handlers = new Map<string, unknown>();
  const ipcMain = {
    handle(channel: string, listener: unknown) {
      handlers.set(channel, listener);
    },
    handleOnce(channel: string, listener: unknown) {
      handlers.set(channel, listener);
    },
    removeHandler(channel: string) {
      handlers.delete(channel);
    },
    // Exposed for assertions in tests.
    __handlers: handlers,
  };
  return { ipcMain };
});

import { ipcMain } from 'electron';
import './ipc-guard';

const noop = () => undefined;

// Every test uses a unique channel so the guard's module-level registry stays isolated.
// Counter is monotonic across the whole file — never reset — because the guard's
// internal map persists across tests.
let channelCounter = 0;
const nextChannel = (): string => `test:channel-${++channelCounter}`;

describe('ipc-guard', () => {
  it('registers a handler on first call', () => {
    const channel = nextChannel();
    expect(() => ipcMain.handle(channel, noop)).not.toThrow();
  });

  it('throws with file:line when the same channel is registered twice', () => {
    const channel = nextChannel();
    ipcMain.handle(channel, noop);
    expect(() => ipcMain.handle(channel, noop)).toThrowError(
      new RegExp(`Duplicate IPC handler for channel "${channel}"`)
    );
  });

  it('captures distinct call sites when registration happens from different callers', () => {
    const channel = nextChannel();
    function registerFromSiteA(): void {
      ipcMain.handle(channel, noop);
    }
    function registerFromSiteB(): void {
      ipcMain.handle(channel, noop);
    }
    registerFromSiteA();
    try {
      registerFromSiteB();
      throw new Error('expected duplicate registration to throw');
    } catch (err) {
      const message = (err as Error).message;
      expect(message).toMatch(/First registered at:/);
      expect(message).toMatch(/Attempted again at:/);
      expect(message).toMatch(/registerFromSiteA/);
      expect(message).toMatch(/registerFromSiteB/);
    }
  });

  it('treats handleOnce as a conflicting registration', () => {
    const channel = nextChannel();
    ipcMain.handle(channel, noop);
    expect(() => ipcMain.handleOnce(channel, noop)).toThrowError(
      /Duplicate IPC handler.*\(handleOnce\)/
    );
  });

  it('allows re-registration after removeHandler clears the channel', () => {
    const channel = nextChannel();
    ipcMain.handle(channel, noop);
    ipcMain.removeHandler(channel);
    expect(() => ipcMain.handle(channel, noop)).not.toThrow();
  });

  it('forwards registrations to the underlying ipcMain', () => {
    const channel = nextChannel();
    const listener = vi.fn();
    ipcMain.handle(channel, listener);
    const handlers = (ipcMain as unknown as { __handlers: Map<string, unknown> }).__handlers;
    expect(handlers.get(channel)).toBe(listener);
  });

  it('forwards removal to the underlying ipcMain', () => {
    const channel = nextChannel();
    ipcMain.handle(channel, noop);
    ipcMain.removeHandler(channel);
    const handlers = (ipcMain as unknown as { __handlers: Map<string, unknown> }).__handlers;
    expect(handlers.has(channel)).toBe(false);
  });

  it('permits different channels to coexist', () => {
    const a = nextChannel();
    const b = nextChannel();
    expect(() => {
      ipcMain.handle(a, noop);
      ipcMain.handle(b, noop);
    }).not.toThrow();
  });
});
