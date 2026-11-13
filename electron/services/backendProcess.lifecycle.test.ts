import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type BackendIdentity = 'verified' | 'mismatch' | 'unreachable';
type WaitResult =
  | { ready: true; origin: string }
  | { ready: false; origin: null; reason: 'timeout' | 'mismatch' | 'aborted' };

class FakeChild extends EventEmitter {
  stdout = new EventEmitter();
  stderr = new EventEmitter();
  exitCode: number | null = null;
  signalCode: NodeJS.Signals | null = null;
  kills: (NodeJS.Signals | number | undefined)[] = [];
  constructor(public pid: number | undefined) {
    super();
  }
  kill(signal?: NodeJS.Signals | number) {
    this.kills.push(signal);
    return true;
  }
  exit(code: number | null, signal: NodeJS.Signals | null = null) {
    this.exitCode = code;
    this.signalCode = signal;
    this.emit('exit', code, signal);
    this.emit('close', code, signal);
  }
}

const h = vi.hoisted(() => ({
  nextPid: 4000,
  noPid: false,
  children: [] as unknown[],
  spawns: [] as { command: string; args: string[]; options: Record<string, unknown> }[],
  /** Pre-spawn / status handshake answer. */
  identity: 'unreachable' as 'verified' | 'mismatch' | 'unreachable',
  /** What the startup poll reports; 'pending' waits until aborted. */
  startup: 'ready' as 'ready' | 'mismatch' | 'timeout' | 'pending',
  httpGet: null as unknown as ReturnType<typeof vi.fn>,
}));

vi.mock('child_process', () => ({
  spawn: (command: string, args: string[], options: Record<string, unknown>) => {
    h.spawns.push({ command, args, options });
    if (/taskkill/i.test(command)) {
      return new (class extends EventEmitter {})();
    }
    const child = new FakeChild(h.noPid ? undefined : (h.nextPid += 1));
    h.children.push(child);
    return child;
  },
}));

vi.mock('./backend', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./backend')>()),
  probeBackendIdentity: vi.fn(async (): Promise<BackendIdentity> => h.identity),
  waitForBackendReady: vi.fn(
    ({ signal }: { signal?: AbortSignal }) =>
      new Promise<WaitResult>((resolve) => {
        const aborted = () => resolve({ ready: false, origin: null, reason: 'aborted' });
        if (signal?.aborted) return aborted();
        signal?.addEventListener('abort', aborted, { once: true });
        if (h.startup === 'ready') resolve({ ready: true, origin: 'http://127.0.0.1:8000' });
        if (h.startup === 'mismatch') resolve({ ready: false, origin: null, reason: 'mismatch' });
        if (h.startup === 'timeout') resolve({ ready: false, origin: null, reason: 'timeout' });
      }),
  ),
}));

vi.mock('./backendHttp', () => {
  h.httpGet = vi.fn();
  return { backendHttp: { get: h.httpGet } };
});

const {
  BACKEND_CRASH_LOOP_MESSAGE,
  BACKEND_KILL_WAIT_MS,
  BACKEND_STATUS_CHANNEL,
  BACKEND_STOP_GRACE_MS,
  PORT_IN_USE_MESSAGE,
  createBackendProcessService,
} = await import('./backendProcess');
const { isBackendIdentityVerified } = await import('./backend');
const { BACKEND_AUTH_HEADER } = await import('./backendAuth');

let root: string | null = null;

beforeEach(() => {
  vi.useFakeTimers();
  h.noPid = false;
  h.children = [];
  h.spawns = [];
  h.identity = 'unreachable';
  h.startup = 'ready';
  h.httpGet.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  if (root) fs.rmSync(root, { recursive: true, force: true });
  root = null;
});

function harness(platform: NodeJS.Platform = 'linux') {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-backend-life-'));
  const backendDir = path.join(root, 'backend');
  fs.mkdirSync(backendDir, { recursive: true });
  fs.writeFileSync(path.join(backendDir, 'main.py'), '');

  const sent: { channel: string; payload: { running: boolean; pid: number | null; error?: string } }[] = [];
  const window = {
    isDestroyed: () => false,
    webContents: { send: (channel: string, payload: never) => sent.push({ channel, payload }) },
  };
  const dialog = {
    showErrorBox: vi.fn(),
    showMessageBox: vi.fn(async () => ({ response: 0, checkboxChecked: false })),
  };
  const onReady = vi.fn();
  const service = createBackendProcessService({
    appPaths: { getPath: () => root!, resourcesPath: path.join(root, 'resources'), getVersion: () => '0.0.0' },
    dialog,
    getMainWindow: () => window as never,
    getResolvedOutputDirectory: () => path.join(root!, 'out'),
    rememberOutputRoot: () => undefined,
    isDev: () => true,
    dirname: path.join(root, 'dist-electron'),
    logger: { error: () => undefined, log: () => undefined },
    onReady,
    env: {},
    platform,
  });
  const backendSpawns = () => h.spawns.filter((call) => !/taskkill/i.test(call.command));
  const child = (index: number) => h.children[index] as FakeChild;
  return { service, sent, dialog, onReady, backendSpawns, child };
}

async function flush() {
  await vi.advanceTimersByTimeAsync(0);
}

describe('backend lifecycle: stop and replace (L1)', () => {
  it("never lets a replaced child's late exit clear its successor", async () => {
    vi.spyOn(process, 'kill').mockImplementation(() => true); // the old child ignores every signal
    const { service, child, backendSpawns } = harness();

    await expect(service.start()).resolves.toBe(true);
    const oldChild = child(0);

    const stopped = service.stop();
    await vi.advanceTimersByTimeAsync(BACKEND_STOP_GRACE_MS + BACKEND_KILL_WAIT_MS);
    await stopped;

    await expect(service.start()).resolves.toBe(true);
    const newChild = child(1);
    expect(backendSpawns()).toHaveLength(2);

    // The stubborn old child finally exits after its successor took over.
    oldChild.exit(null, 'SIGKILL');
    await flush();

    expect(service.isRunning()).toBe(true);
    expect(service.isReady()).toBe(true);
    const status = await service.getStatus();
    expect(status.pid).toBe(newChild.pid);
    // ...and it was a requested stop: no restart is scheduled.
    await vi.advanceTimersByTimeAsync(60_000);
    expect(backendSpawns()).toHaveLength(2);
  });

  it('waits for a stopping child to exit before spawning the next one', async () => {
    const kill = vi.spyOn(process, 'kill').mockImplementation(() => true);
    const { service, child, backendSpawns } = harness();
    await service.start();

    const stopped = service.stop();
    const restarted = service.start();
    await flush();
    expect(backendSpawns()).toHaveLength(1);

    child(0).exit(0);
    await stopped;
    await expect(restarted).resolves.toBe(true);
    expect(backendSpawns()).toHaveLength(2);
    expect(kill).toHaveBeenCalledWith(-child(0).pid!, 'SIGTERM');
  });
});

describe('backend lifecycle: stop() escalation', () => {
  it('POSIX: spawns the backend in its own process group, SIGTERMs the group, then SIGKILLs it', async () => {
    const kill = vi.spyOn(process, 'kill').mockImplementation(() => true);
    const { service, child, backendSpawns } = harness('linux');
    await service.start();
    expect(backendSpawns()[0].options.detached).toBe(true);
    const pid = child(0).pid!;

    let resolved = false;
    const stopped = service.stop().then(() => {
      resolved = true;
    });
    await flush();
    expect(kill).toHaveBeenCalledWith(-pid, 'SIGTERM');
    expect(resolved).toBe(false);

    await vi.advanceTimersByTimeAsync(BACKEND_STOP_GRACE_MS);
    expect(kill).toHaveBeenCalledWith(-pid, 'SIGKILL');
    expect(resolved).toBe(false);

    child(0).exit(null, 'SIGKILL');
    await stopped;
    expect(resolved).toBe(true);
    expect(service.isRunning()).toBe(false);
  });

  it('Windows: kills the tree with taskkill /PID <pid> /T /F and resolves on exit', async () => {
    const { service, child, backendSpawns } = harness('win32');
    await service.start();
    expect(backendSpawns()[0].options.detached).toBe(false);
    const pid = child(0).pid!;

    const stopped = service.stop();
    await flush();
    const taskkill = h.spawns.find((call) => /taskkill/i.test(call.command));
    expect(taskkill?.command).toMatch(/System32[\\/]taskkill\.exe$/i);
    expect(taskkill?.args).toEqual(['/PID', String(pid), '/T', '/F']);

    child(0).exit(1);
    await stopped;
    expect(child(0).kills).toEqual([]);
  });

  it('Windows: falls back to killing the handle when taskkill does not end it', async () => {
    const { service, child } = harness('win32');
    await service.start();

    const stopped = service.stop();
    await vi.advanceTimersByTimeAsync(BACKEND_STOP_GRACE_MS);
    expect(child(0).kills).toEqual(['SIGKILL']);
    await vi.advanceTimersByTimeAsync(BACKEND_KILL_WAIT_MS);
    await stopped;
  });

  it('never runs taskkill for a child without a pid', async () => {
    h.noPid = true;
    h.startup = 'pending';
    const { service, child } = harness('win32');
    const starting = service.start();
    await flush();

    const stopped = service.stop();
    await flush();
    expect(h.spawns.some((call) => /taskkill/i.test(call.command))).toBe(false);
    expect(child(0).kills).toEqual(['SIGKILL']);

    child(0).exit(null);
    await stopped;
    await expect(starting).resolves.toBe(false);
  });

  it('a stop while nothing runs resolves at once', async () => {
    const { service } = harness();
    await expect(service.stop()).resolves.toBeUndefined();
  });
});

describe('backend lifecycle: crash supervisor (L2)', () => {
  it('restarts a crashed backend with backoff and gives up on a crash loop', async () => {
    const { service, child, backendSpawns, sent, dialog } = harness();
    await service.start();

    child(0).exit(1);
    await flush();
    expect(service.isRunning()).toBe(false);
    expect(sent.at(-1)?.payload.error).toMatch(/stopped unexpectedly/);

    await vi.advanceTimersByTimeAsync(1999);
    expect(backendSpawns()).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(backendSpawns()).toHaveLength(2);
    expect(service.isReady()).toBe(true);

    child(1).exit(1);
    await vi.advanceTimersByTimeAsync(3999);
    expect(backendSpawns()).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(backendSpawns()).toHaveLength(3);

    // Third crash inside five minutes: no more restarts.
    child(2).exit(1);
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(backendSpawns()).toHaveLength(3);
    expect(sent.at(-1)?.payload).toMatchObject({ running: false, error: BACKEND_CRASH_LOOP_MESSAGE });
    expect(dialog.showMessageBox).toHaveBeenCalledOnce();

    // The user asking again starts over.
    await expect(service.start()).resolves.toBe(true);
    expect(backendSpawns()).toHaveLength(4);
  });

  it('does not restart a backend the user stopped', async () => {
    vi.spyOn(process, 'kill').mockImplementation(() => true);
    const { service, child, backendSpawns } = harness();
    await service.start();

    const stopped = service.stop();
    child(0).exit(0);
    await stopped;
    await vi.advanceTimersByTimeAsync(10 * 60_000);

    expect(backendSpawns()).toHaveLength(1);
  });

  it('a stop cancels a pending crash restart', async () => {
    const { service, child, backendSpawns } = harness();
    await service.start();
    child(0).exit(1);
    await flush();

    await service.stop();
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(backendSpawns()).toHaveLength(1);
  });

  it('does not treat a death during startup as a crash to restart', async () => {
    h.startup = 'pending';
    const { service, child, backendSpawns } = harness();
    const starting = service.start();
    await flush();

    child(0).exit(3);
    // The 300 s health poll is abandoned the moment the child exits.
    await expect(starting).resolves.toBe(false);
    expect(service.getLastFailure()?.kind).toBe('exited-during-startup');
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(backendSpawns()).toHaveLength(1);
  });
});

describe('backend lifecycle: identity handshake (L3)', () => {
  it('refuses to start when another application holds port 8000', async () => {
    h.identity = 'mismatch';
    const { service, backendSpawns, sent } = harness();

    await expect(service.start()).resolves.toBe(false);

    expect(backendSpawns()).toHaveLength(0);
    expect(sent.at(-1)?.payload.error).toBe(PORT_IN_USE_MESSAGE);
    await expect(service.startOrRecover()).resolves.toEqual({ success: false, error: PORT_IN_USE_MESSAGE });
  });

  it('stops its own child when the handshake finds a different listener', async () => {
    h.startup = 'mismatch';
    vi.spyOn(process, 'kill').mockImplementation(() => true);
    const { service, child, onReady } = harness();

    const starting = service.start();
    await flush();
    child(0).exit(1);

    await expect(starting).resolves.toBe(false);
    expect(service.getLastFailure()).toEqual({ kind: 'port-in-use', message: PORT_IN_USE_MESSAGE });
    expect(onReady).not.toHaveBeenCalled();
    expect(isBackendIdentityVerified()).toBe(false);
  });

  it('marks the identity verified only while the verified child lives', async () => {
    const { service, child } = harness();
    await service.start();
    expect(isBackendIdentityVerified()).toBe(true);

    child(0).exit(1);
    await flush();
    expect(isBackendIdentityVerified()).toBe(false);
    await service.stop();
  });

  it('does not send the token to an unverified external listener', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    h.identity = 'mismatch';
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-backend-ext-'));
    const service = createBackendProcessService({
      appPaths: { getPath: () => root!, resourcesPath: root, getVersion: () => '0.0.0' },
      dialog: { showErrorBox: vi.fn(), showMessageBox: vi.fn() },
      getMainWindow: () => null,
      getResolvedOutputDirectory: () => root!,
      rememberOutputRoot: () => undefined,
      isDev: () => true,
      dirname: root,
      logger: { error: () => undefined, log: () => undefined },
      env: { VISION_STUDIO_BACKEND_EXTERNAL: '1', VISION_STUDIO_BACKEND_AUTH_TOKEN: 'shared' },
    });

    await expect(service.getSystemInfo()).resolves.toMatchObject({ backendConnected: false });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(isBackendIdentityVerified()).toBe(false);
  });

  function externalService() {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-backend-ext-'));
    return createBackendProcessService({
      appPaths: { getPath: () => root!, resourcesPath: root, getVersion: () => '0.0.0' },
      dialog: { showErrorBox: vi.fn(), showMessageBox: vi.fn() },
      getMainWindow: () => null,
      getResolvedOutputDirectory: () => root!,
      rememberOutputRoot: () => undefined,
      isDev: () => true,
      dirname: root,
      logger: { error: () => undefined, log: () => undefined },
      env: { VISION_STUDIO_BACKEND_EXTERNAL: '1', VISION_STUDIO_BACKEND_AUTH_TOKEN: 'shared' },
    });
  }

  it('opens the token gate for a verified external backend, and keeps it open across status reads', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ gpu_available: true }), { status: 200 }),
    );
    h.identity = 'verified';
    const service = externalService();

    await expect(service.getSystemInfo()).resolves.toMatchObject({ backendConnected: true });
    // Generation, model and download handlers consult this flag before
    // attaching the token; without it every external-mode call was refused.
    expect(isBackendIdentityVerified()).toBe(true);

    await service.getStatus();
    expect(isBackendIdentityVerified()).toBe(true);
  });

  it('closes the external gate on the next poll once the listener stops proving the token', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ gpu_available: true }), { status: 200 }),
    );
    h.identity = 'verified';
    const service = externalService();
    await service.getSystemInfo();
    expect(isBackendIdentityVerified()).toBe(true);

    h.identity = 'mismatch';
    await expect(service.getSystemInfo()).resolves.toMatchObject({ backendConnected: false });
    expect(isBackendIdentityVerified()).toBe(false);
  });
});

describe('backend lifecycle: status push and readiness', () => {
  it(`pushes status on ${'backend:status-changed'} (K6) and fires onReady once`, async () => {
    const { service, sent, onReady, child } = harness();
    await service.start();

    expect(BACKEND_STATUS_CHANNEL).toBe('backend:status-changed');
    expect(sent.every((entry) => entry.channel === 'backend:status-changed')).toBe(true);
    expect(sent.at(-1)?.payload).toEqual({ running: true, pid: child(0).pid });
    expect(onReady).toHaveBeenCalledOnce();
  });

  it('dedupes concurrent starts into one spawn', async () => {
    h.startup = 'pending';
    const { service, backendSpawns, child } = harness();
    const first = service.start();
    const second = service.start();
    await flush();
    expect(backendSpawns()).toHaveLength(1);

    child(0).exit(1);
    await expect(Promise.all([first, second])).resolves.toEqual([false, false]);
  });

  it('reports a startup timeout without killing the slow child', async () => {
    h.startup = 'timeout';
    const kill = vi.spyOn(process, 'kill').mockImplementation(() => true);
    const { service, child } = harness();

    await expect(service.start()).resolves.toBe(false);
    expect(service.getLastFailure()?.kind).toBe('startup-timeout');
    expect(service.isRunning()).toBe(true);
    expect(kill).not.toHaveBeenCalled();

    const stopped = service.stop();
    child(0).exit(0);
    await stopped;
  });
});

describe('backend lifecycle: active jobs (L10)', () => {
  it('reports none without asking an unverified backend', async () => {
    const { service } = harness();
    await expect(service.countActiveJobs()).resolves.toBe(0);
    expect(h.httpGet).not.toHaveBeenCalled();
  });

  it('counts pending and processing jobs with a short, authenticated request', async () => {
    h.httpGet.mockResolvedValue({
      data: {
        jobs: [
          { status: 'processing' },
          { status: 'pending' },
          { status: 'completed' },
          { status: 'failed' },
        ],
      },
    });
    const { service } = harness();
    await service.start();

    await expect(service.countActiveJobs()).resolves.toBe(2);
    const [url, config] = h.httpGet.mock.calls[0] as [string, { headers: Record<string, string>; timeout: number }];
    expect(url).toBe('http://127.0.0.1:8000/api/jobs');
    expect(config.headers[BACKEND_AUTH_HEADER]).toBeTruthy();
    expect(config.timeout).toBeLessThanOrEqual(2000);
  });

  it('treats a failed query as no jobs so closing is never blocked', async () => {
    h.httpGet.mockRejectedValue(new Error('timeout of 1500ms exceeded'));
    const { service } = harness();
    await service.start();

    await expect(service.countActiveJobs()).resolves.toBe(0);
  });
});

describe('backend lifecycle: bundled path cache (L12)', () => {
  it('resolves the bundled backend once across status polls and re-resolves when it disappears', async () => {
    const { service } = harness();
    const exeName = process.platform === 'win32' ? 'VisionStudio-Backend.exe' : 'VisionStudio-Backend';
    // One-folder PyInstaller layout: the launcher lives in its own bundle dir.
    const devExe = path.join(root!, 'backend', 'dist', 'VisionStudio-Backend', exeName);
    fs.mkdirSync(path.dirname(devExe), { recursive: true });
    fs.writeFileSync(devExe, '');
    const existsSync = vi.spyOn(fs, 'existsSync');

    expect((await service.getStatus()).bundled).toBe(true);
    const afterFirst = existsSync.mock.calls.length;
    await service.getStatus();
    await service.getStatus();
    // Only the cheap re-check of the one cached path per poll.
    expect(existsSync.mock.calls.length - afterFirst).toBe(2);

    fs.rmSync(devExe);
    expect((await service.getStatus()).bundled).toBe(false);
  });
});
