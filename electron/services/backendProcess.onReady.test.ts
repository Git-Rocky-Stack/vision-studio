import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const health = vi.hoisted(() => ({ ready: true }));

vi.mock('child_process', () => ({
  spawn: () => {
    const child = new EventEmitter() as EventEmitter & {
      stdout: EventEmitter;
      stderr: EventEmitter;
      exitCode: number | null;
      kill: () => void;
    };
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.exitCode = null;
    child.kill = () => undefined;
    return child;
  },
}));

vi.mock('./backend', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./backend')>()),
  waitForBackendReady: async () =>
    health.ready ? { ready: true, origin: 'http://127.0.0.1:8000' } : Promise.reject(new Error('never ready')),
}));

const { createBackendProcessService } = await import('./backendProcess');

let root: string | null = null;

afterEach(() => {
  if (root) fs.rmSync(root, { recursive: true, force: true });
  root = null;
});

function service(onReady: () => void) {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-backend-ready-'));
  const backendDir = path.join(root, 'backend');
  fs.mkdirSync(backendDir, { recursive: true });
  fs.writeFileSync(path.join(backendDir, 'main.py'), '');
  return createBackendProcessService({
    appPaths: { getPath: () => root!, resourcesPath: path.join(root, 'resources'), getVersion: () => '0.0.0' },
    dialog: { showErrorBox: () => undefined, showMessageBox: async () => ({ response: 0, checkboxChecked: false }) },
    getMainWindow: () => null,
    getSettings: () => ({ pythonPath: 'python3' }) as never,
    getResolvedOutputDirectory: () => path.join(root!, 'out'),
    rememberOutputRoot: () => undefined,
    isDev: () => true,
    dirname: path.join(root, 'dist-electron'),
    logger: { error: () => undefined, log: () => undefined },
    onReady,
  });
}

describe('backend process onReady', () => {
  it('fires once the spawned backend passes its health check', async () => {
    health.ready = true;
    const onReady = vi.fn();

    await expect(service(onReady).start()).resolves.toBe(true);

    expect(onReady).toHaveBeenCalledOnce();
  });

  it('does not fire when the backend never becomes ready', async () => {
    health.ready = false;
    const onReady = vi.fn();

    await expect(service(onReady).start()).resolves.toBe(false);

    expect(onReady).not.toHaveBeenCalled();
  });
});
