import { spawn, type ChildProcess } from 'child_process';
import fs from 'fs';
import path, { dirname, join } from 'path';
import type { BrowserWindow, Dialog, MessageBoxOptions } from 'electron';

import {
  BACKEND_ORIGIN,
  getBackendStatusSnapshot,
  probeBackendIdentity,
  setBackendIdentityVerified,
  waitForBackendReady,
} from './backend';
import { getBackendAuthToken, backendAuthHeaders } from './backendAuth';
import { backendHttp } from './backendHttp';
import { isSafePythonCommand } from './security';

type Logger = Pick<Console, 'error' | 'log'>;
type Platform = NodeJS.Platform;

type ResolveBundledBackendPathOptions = {
  dirname: string;
  resourcesPath: string;
  platform: Platform;
  isDev: boolean;
  exists: (candidatePath: string) => boolean;
  logger?: Logger;
};

type ResolveBackendCommandOptions = {
  bundledBackendPath: string | null;
  dirname: string;
  resourcesPath: string;
  isDev: boolean;
  /**
   * Developer override for the interpreter that runs main.py: the raw
   * VISION_STUDIO_PYTHON value. Never the renderer-editable Settings value.
   */
  pythonOverride?: string;
  platform?: Platform;
  exists: (candidatePath: string) => boolean;
  /** Whether a path is an existing regular file (the override must be one). */
  isFile?: (candidatePath: string) => boolean;
  logger: Logger;
};

type BackendCommand = {
  command: string;
  args: string[];
  cwd: string;
};

type BackendEnvironmentOptions = {
  baseEnv: NodeJS.ProcessEnv;
  userDataPath: string;
  outputDirectory: string;
  backendAuthToken: string;
  appVersion: string;
  /**
   * Every output root the user has trusted (current and earlier output
   * folders). The backend only reads media inside its outputs dir, library
   * roots and these, so assets made in an earlier output folder stay usable.
   */
  mediaRoots?: string[];
  /** Path-list separator; matches the backend's os.pathsep on this platform. */
  pathDelimiter?: string;
};

/** Push channel for backend status changes (contract K6). */
export const BACKEND_STATUS_CHANNEL = 'backend:status-changed';

/** How long a freshly spawned backend gets to pass the handshake (first-run extraction is slow). */
export const BACKEND_STARTUP_TIMEOUT_MS = 300_000;
/** Grace period after the polite stop request before escalating. */
export const BACKEND_STOP_GRACE_MS = 5_000;
/** How long to wait for the exit after the forced kill. */
export const BACKEND_KILL_WAIT_MS = 2_000;

/** Crash supervisor: this many crashes inside the window stops the restarts. */
export const BACKEND_CRASH_LOOP_THRESHOLD = 3;
export const BACKEND_CRASH_WINDOW_MS = 5 * 60_000;
export const BACKEND_RESTART_BASE_DELAY_MS = 2_000;
export const BACKEND_RESTART_MAX_DELAY_MS = 30_000;

/** Timeout for the job-list query that guards closing the window. */
export const ACTIVE_JOBS_QUERY_TIMEOUT_MS = 1_500;

export const PORT_IN_USE_MESSAGE =
  'Port 8000 is in use by another application. Close that application, then start the AI backend again from Settings.';
export const BACKEND_ALREADY_RUNNING_MESSAGE =
  'Another Vision Studio backend is already running on port 8000 outside this app. Stop it, then start the AI backend again from Settings.';
export const BACKEND_CRASH_LOOP_MESSAGE =
  'The AI backend crashed repeatedly and was not restarted. Start it again from Settings once the cause is resolved (see the backend log).';

export type BackendFailureKind =
  | 'not-found'
  | 'spawn-error'
  | 'port-in-use'
  | 'already-running'
  | 'exited-during-startup'
  | 'startup-timeout'
  | 'crashed'
  | 'crash-loop';

export type BackendFailure = { kind: BackendFailureKind; message: string };

export function resolveBundledBackendPath({
  dirname: electronDirname,
  resourcesPath,
  platform,
  isDev,
  exists,
}: ResolveBundledBackendPathOptions): string | null {
  // The backend is a PyInstaller ONE-FOLDER bundle: the launcher sits next to
  // its _internal/ directory inside a folder of its own (build-backend.cjs).
  const bundleDir = 'VisionStudio-Backend';
  const exeName = platform === 'win32' ? 'VisionStudio-Backend.exe' : 'VisionStudio-Backend';

  if (isDev) {
    // Fresh PyInstaller output first, then the copy build-backend.cjs staged
    // for packaging.
    const devPath = join(electronDirname, '../backend/dist', bundleDir, exeName);
    if (exists(devPath)) {
      return devPath;
    }

    const resourcesDevPath = join(electronDirname, '../resources/backend', exeName);
    if (exists(resourcesDevPath)) {
      return resourcesDevPath;
    }

    return null;
  }

  // Packaged: electron-builder copies resources/backend/ to <resources>/backend/.
  const prodPath = join(resourcesPath, 'backend', exeName);
  return exists(prodPath) ? prodPath : null;
}

// A Windows drive-absolute path ("C:\\...", "D:/..."). Node's POSIX
// `path.isAbsolute` (the Linux CI runner) reports these as relative.
const WINDOWS_DRIVE_ABSOLUTE = /^[A-Za-z]:[\\/]/;

function isAbsoluteLocalPath(candidate: string): boolean {
  return path.isAbsolute(candidate) || WINDOWS_DRIVE_ABSOLUTE.test(candidate);
}

function defaultIsFile(candidatePath: string): boolean {
  try {
    return fs.statSync(candidatePath).isFile();
  } catch {
    return false;
  }
}

/**
 * Validates the developer interpreter override. It must be an absolute path to
 * an existing local file with a Python executable name; UNC and device paths
 * are refused (isSafePythonCommand). Returns null - and logs why - otherwise.
 */
export function resolvePythonOverride(
  raw: string | undefined,
  {
    isFile = defaultIsFile,
    logger,
  }: { isFile?: (candidatePath: string) => boolean; logger: Logger },
): string | null {
  const candidate = raw?.trim();
  if (!candidate) {
    return null;
  }
  if (!isSafePythonCommand(candidate)) {
    logger.error(`VISION_STUDIO_PYTHON rejected (not a local Python executable): ${candidate}`);
    return null;
  }
  if (!isAbsoluteLocalPath(candidate)) {
    logger.error(`VISION_STUDIO_PYTHON rejected (must be an absolute path): ${candidate}`);
    return null;
  }
  if (!isFile(candidate)) {
    logger.error(`VISION_STUDIO_PYTHON rejected (no such file): ${candidate}`);
    return null;
  }
  return candidate;
}

export function resolveBackendCommand({
  bundledBackendPath,
  dirname: electronDirname,
  resourcesPath,
  isDev,
  pythonOverride,
  platform = process.platform,
  exists,
  isFile = defaultIsFile,
  logger,
}: ResolveBackendCommandOptions): BackendCommand | null {
  if (bundledBackendPath) {
    logger.log('Using bundled Python backend:', bundledBackendPath);
    if (pythonOverride?.trim()) {
      logger.log('VISION_STUDIO_PYTHON is ignored while a bundled backend exists.');
    }
    return {
      command: bundledBackendPath,
      args: [],
      cwd: dirname(bundledBackendPath),
    };
  }

  const backendPath = isDev
    ? join(electronDirname, '../backend')
    : join(resourcesPath, 'backend-source');

  let python: string;
  if (pythonOverride?.trim()) {
    const override = resolvePythonOverride(pythonOverride, { isFile, logger });
    if (!override) {
      // An explicit override that cannot be honoured must not silently fall
      // back to some other interpreter.
      return null;
    }
    python = override;
  } else {
    python = defaultPython(backendPath, isDev, platform, exists);
  }

  if (!isSafePythonCommand(python)) {
    logger.error(`Invalid Python command rejected: ${python}`);
    return null;
  }

  const mainPy = join(backendPath, 'main.py');
  logger.log(`Fallback to system Python: ${python}, main.py at: ${mainPy} (exists: ${exists(mainPy)})`);

  if (!exists(mainPy)) {
    logger.error('Neither bundled backend nor backend source found');
    return null;
  }

  return {
    command: python,
    args: ['main.py'],
    cwd: backendPath,
  };
}

/**
 * The Python that runs main.py when no developer override is set. In
 * development that is the venv the setup steps create in backend/
 * (setup-python.bat, or the README's Linux and macOS commands), when it
 * exists: nothing activates it for `npm run dev`, and the PATH `python` is
 * often a different install without the generation stack.
 */
function defaultPython(
  backendPath: string,
  isDev: boolean,
  platform: Platform,
  exists: (candidatePath: string) => boolean,
): string {
  if (isDev) {
    const venvPython = platform === 'win32'
      ? join(backendPath, 'venv', 'Scripts', 'python.exe')
      : join(backendPath, 'venv', 'bin', 'python');
    if (exists(venvPython)) {
      return venvPython;
    }
  }
  return 'python';
}

export function buildBackendEnvironment({
  baseEnv,
  userDataPath,
  outputDirectory,
  backendAuthToken,
  appVersion,
  mediaRoots = [],
  pathDelimiter = path.delimiter,
}: BackendEnvironmentOptions): NodeJS.ProcessEnv {
  const extraRoots = [...new Set(mediaRoots.filter((root) => root && root !== outputDirectory))];
  return {
    ...baseEnv,
    PYTHONUNBUFFERED: '1',
    MODELS_DIR: join(userDataPath, 'models'),
    OUTPUT_DIR: outputDirectory,
    DATABASE_PATH: join(userDataPath, 'data', 'vision_studio.db'),
    LOG_FILE: join(userDataPath, 'logs', 'backend.log'),
    VISION_STUDIO_BACKEND_AUTH_TOKEN: backendAuthToken,
    // The shell owns the version number. A packaged backend is a PyInstaller
    // binary with no package.json in reach, so without this it can only guess -
    // which is how it ended up reporting 3.1.1 from a 3.2.0 install.
    VISION_STUDIO_VERSION: appVersion,
    // Contract with backend/utils/media_paths.py (os.pathsep-separated).
    VISION_STUDIO_MEDIA_ROOTS: extraRoots.join(pathDelimiter),
  };
}

const EXTERNAL_BACKEND_FALSEY = new Set(['', '0', 'false', 'off', 'no']);

/**
 * Whether the user has declared that a Vision Studio backend is running
 * out-of-process - started manually, by a dev workflow, or by an E2E harness -
 * rather than spawned and managed by this app.
 *
 * When enabled, the app probes the backend over HTTP for connectivity even
 * though it did not spawn the child itself, so a developer running
 * `python main.py` themselves is correctly detected as connected instead of
 * being told "the AI backend is not running". Opt-in via the
 * `VISION_STUDIO_BACKEND_EXTERNAL` env var. Pairs with
 * `VISION_STUDIO_SKIP_BACKEND` (do not spawn) and `VISION_STUDIO_BACKEND_HOST`
 * (where the backend binds).
 */
export function isExternalBackendEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = (env.VISION_STUDIO_BACKEND_EXTERNAL ?? '').trim().toLowerCase();
  return !EXTERNAL_BACKEND_FALSEY.has(raw);
}

/**
 * `VISION_STUDIO_SKIP_BACKEND` (do not spawn the backend) uses the same
 * truthiness as `VISION_STUDIO_BACKEND_EXTERNAL`, so `=0` / `=false` mean
 * "do not skip" instead of skipping because the variable is non-empty.
 */
export function isSkipBackendEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = (env.VISION_STUDIO_SKIP_BACKEND ?? '').trim().toLowerCase();
  return !EXTERNAL_BACKEND_FALSEY.has(raw);
}

/**
 * When an external backend is declared but no shared auth token is configured,
 * Electron (via backendAuth) and the manually-started `python main.py` each
 * mint a *different* random token. The backend then rejects Electron's
 * authenticated requests with HTTP 403 - and fails the identity handshake -
 * so the app reads as "disconnected" even though the backend is up. Returns
 * an actionable warning in that case, or null when the configuration is sound.
 */
export function externalBackendTokenWarning(
  env: NodeJS.ProcessEnv = process.env
): string | null {
  if (!isExternalBackendEnabled(env) || env.VISION_STUDIO_BACKEND_AUTH_TOKEN) {
    return null;
  }
  return (
    'External backend mode (VISION_STUDIO_BACKEND_EXTERNAL) is enabled but ' +
    'VISION_STUDIO_BACKEND_AUTH_TOKEN is not set. This app and the external ' +
    'backend will generate different auth tokens, so authenticated requests ' +
    '(generation, models, websocket) fail with HTTP 403. Set the SAME ' +
    'VISION_STUDIO_BACKEND_AUTH_TOKEN for both this app and the backend process.'
  );
}

/**
 * Decide whether `getSystemInfo` should issue an HTTP connectivity probe: when
 * this app manages a live backend child, OR when an externally-managed backend
 * has been declared. Pure and host-agnostic for unit testing.
 */
export function shouldProbeBackendConnectivity({
  hasLiveChild,
  externalBackendEnabled,
}: {
  hasLiveChild: boolean;
  externalBackendEnabled: boolean;
}): boolean {
  return hasLiveChild || externalBackendEnabled;
}

export type CrashVerdict = {
  /** Crash timestamps still inside the window, including this one. */
  crashes: number[];
  /** Crash loop: stop restarting. */
  giveUp: boolean;
  /** Capped exponential backoff before the restart. */
  delayMs: number;
};

/** Pure crash-supervisor policy: backoff 2s, 4s, ... capped; give up at the threshold. */
export function evaluateBackendCrash(previousCrashes: readonly number[], now: number): CrashVerdict {
  const crashes = [
    ...previousCrashes.filter((at) => now - at < BACKEND_CRASH_WINDOW_MS),
    now,
  ];
  return {
    crashes,
    giveUp: crashes.length >= BACKEND_CRASH_LOOP_THRESHOLD,
    delayMs: Math.min(
      BACKEND_RESTART_BASE_DELAY_MS * 2 ** (crashes.length - 1),
      BACKEND_RESTART_MAX_DELAY_MS,
    ),
  };
}

type BackendProcessServiceOptions = {
  appPaths: {
    getPath: (name: 'userData') => string;
    resourcesPath: string;
    /** `app.getVersion()`. Passed to the backend so it stops guessing. */
    getVersion: () => string;
  };
  dialog: Pick<Dialog, 'showErrorBox' | 'showMessageBox'>;
  getMainWindow: () => BrowserWindow | null;
  getResolvedOutputDirectory: () => string;
  rememberOutputRoot: (outputRoot: string) => void;
  /** Trusted output roots forwarded to the backend as VISION_STUDIO_MEDIA_ROOTS. */
  getManagedOutputRoots?: () => string[];
  isDev: () => boolean;
  dirname: string;
  logger?: Logger;
  /**
   * Fired each time a spawned backend passes its identity handshake. The main
   * process uses it to reconnect the progress WebSocket immediately instead
   * of waiting out a backoff grown while the backend was still starting.
   */
  onReady?: () => void;
  /** Defaults to process.env; read for VISION_STUDIO_PYTHON and the spawn environment. */
  env?: NodeJS.ProcessEnv;
  /** Defaults to process.platform; selects the process-tree kill strategy. */
  platform?: Platform;
  now?: () => number;
};

/**
 * One spawned backend. Every exit, stop and readiness transition is keyed on
 * this record, so an old child's late 'exit' can never clear the state of the
 * child that replaced it.
 */
type ManagedBackend = {
  proc: ChildProcess;
  exited: Promise<void>;
  hasExited: boolean;
  /** Passed the identity handshake at least once. A later exit is a crash. */
  ready: boolean;
  /** Stop requested by the user or the app: its exit is never restarted. */
  stopRequested: boolean;
  stopPromise: Promise<void> | null;
  /** Aborts the startup health poll as soon as the child exits or is stopped. */
  startupAbort: AbortController;
};

export function createBackendProcessService({
  appPaths,
  dialog,
  getMainWindow,
  getResolvedOutputDirectory,
  rememberOutputRoot,
  getManagedOutputRoots = () => [],
  isDev,
  dirname: electronDirname,
  logger = console,
  onReady,
  env = process.env,
  platform = process.platform,
  now = Date.now,
}: BackendProcessServiceOptions) {
  let current: ManagedBackend | null = null;
  /** Last handshake result for the current child: what `running` reports. */
  let backendReady = false;
  let lastFailure: BackendFailure | null = null;
  let startupPromise: Promise<boolean> | null = null;
  let restartTimer: ReturnType<typeof setTimeout> | null = null;
  let crashTimes: number[] = [];
  const stopping = new Set<Promise<void>>();
  let bundledPathCache: { value: string | null } | null = null;

  // Surface the external-backend token mismatch once at startup: in external
  // mode without a shared VISION_STUDIO_BACKEND_AUTH_TOKEN the backend 403s our
  // authenticated calls and the app misreads as disconnected.
  const startupTokenWarning = externalBackendTokenWarning(env);
  if (startupTokenWarning) {
    logger.error(`[backend-auth] ${startupTokenWarning}`);
  }

  function isAlive(managed: ManagedBackend | null): managed is ManagedBackend {
    return Boolean(managed && !managed.hasExited);
  }

  function setReady(ready: boolean) {
    backendReady = ready;
    setBackendIdentityVerified(Boolean(ready && isAlive(current) && current.ready));
  }

  function fail(kind: BackendFailureKind, message: string) {
    lastFailure = { kind, message };
    logger.error(`[backend] ${message}`);
  }

  function snapshot() {
    return getBackendStatusSnapshot(
      isAlive(current) ? current.proc : null,
      backendReady,
      lastFailure?.message ?? null,
    );
  }

  function sendStatus() {
    const window = getMainWindow();
    if (!window || window.isDestroyed()) {
      return;
    }
    try {
      window.webContents.send(BACKEND_STATUS_CHANNEL, snapshot());
    } catch (error) {
      // A window torn down mid-send must never break the supervisor.
      logger.error('Could not push backend status to the renderer:', error);
    }
  }

  function getBundledBackendPath(): string | null {
    return resolveBundledBackendPath({
      dirname: electronDirname,
      resourcesPath: appPaths.resourcesPath,
      platform: process.platform,
      isDev: isDev(),
      exists: (candidatePath) => fs.existsSync(candidatePath),
      logger,
    });
  }

  /**
   * The bundled backend path, resolved once and reused by the 30s status poll.
   * Re-resolved when the cached file has disappeared, or on `refresh` (every
   * spawn), so a backend built or removed while the app runs is picked up.
   */
  function getCachedBundledBackendPath({ refresh = false }: { refresh?: boolean } = {}): string | null {
    const cached = bundledPathCache;
    if (
      refresh ||
      cached === null ||
      (cached.value !== null && !fs.existsSync(cached.value))
    ) {
      bundledPathCache = { value: getBundledBackendPath() };
    }
    return bundledPathCache!.value;
  }

  function getBackendCommand({ refresh = false }: { refresh?: boolean } = {}): BackendCommand | null {
    return resolveBackendCommand({
      bundledBackendPath: getCachedBundledBackendPath({ refresh }),
      dirname: electronDirname,
      resourcesPath: appPaths.resourcesPath,
      isDev: isDev(),
      pythonOverride: env.VISION_STUDIO_PYTHON,
      platform: process.platform,
      exists: (candidatePath) => fs.existsSync(candidatePath),
      logger,
    });
  }

  function cancelScheduledRestart() {
    if (restartTimer !== null) {
      clearTimeout(restartTimer);
      restartTimer = null;
    }
  }

  function waitForExit(managed: ManagedBackend, timeoutMs: number): Promise<boolean> {
    if (managed.hasExited) {
      return Promise.resolve(true);
    }
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve(false), timeoutMs);
      void managed.exited.then(() => {
        clearTimeout(timer);
        resolve(true);
      });
    });
  }

  function killHandle(proc: ChildProcess, signal: NodeJS.Signals) {
    try {
      proc.kill(signal);
    } catch (error) {
      logger.error(`Could not send ${signal} to the backend:`, error);
    }
  }

  /** POSIX: the child leads its own process group (spawned detached), so signal the group. */
  function signalProcessGroup(managed: ManagedBackend, pid: number, signal: NodeJS.Signals) {
    try {
      process.kill(-pid, signal);
    } catch {
      killHandle(managed.proc, signal);
    }
  }

  /** Windows: terminate the whole tree (a PyInstaller bootloader runs the app as its child). */
  function taskkillTree(managed: ManagedBackend, pid: number) {
    const systemRoot = env.SystemRoot || env.SYSTEMROOT || 'C:\\Windows';
    const taskkillPath = path.win32.join(systemRoot, 'System32', 'taskkill.exe');
    try {
      const killer = spawn(taskkillPath, ['/PID', String(pid), '/T', '/F'], { windowsHide: true });
      // A failed spawn reports through 'error', never by throwing.
      killer.on('error', (error) => {
        logger.error('taskkill failed; terminating the backend directly:', error);
        killHandle(managed.proc, 'SIGKILL');
      });
    } catch (error) {
      logger.error('taskkill could not be started; terminating the backend directly:', error);
      killHandle(managed.proc, 'SIGKILL');
    }
  }

  async function terminate(managed: ManagedBackend): Promise<void> {
    if (managed.hasExited) {
      return;
    }

    const pid = managed.proc.pid;
    if (typeof pid !== 'number' || pid <= 0) {
      // Never got a pid (spawn failed): there is no tree to kill, and
      // `taskkill /PID ''` must never run.
      killHandle(managed.proc, 'SIGKILL');
      await waitForExit(managed, BACKEND_KILL_WAIT_MS);
      return;
    }

    if (platform === 'win32') {
      // Windows has no graceful signal for a windowless console process:
      // force-terminate the tree, then fall back to the handle.
      taskkillTree(managed, pid);
      if (await waitForExit(managed, BACKEND_STOP_GRACE_MS)) {
        return;
      }
      logger.error(`Backend (pid ${pid}) survived taskkill; terminating it directly.`);
      killHandle(managed.proc, 'SIGKILL');
    } else {
      signalProcessGroup(managed, pid, 'SIGTERM');
      if (await waitForExit(managed, BACKEND_STOP_GRACE_MS)) {
        return;
      }
      logger.error(`Backend (pid ${pid}) ignored SIGTERM for ${BACKEND_STOP_GRACE_MS} ms; sending SIGKILL.`);
      signalProcessGroup(managed, pid, 'SIGKILL');
    }

    if (!(await waitForExit(managed, BACKEND_KILL_WAIT_MS))) {
      logger.error(`Backend (pid ${pid}) is still running after a forced kill.`);
    }
  }

  /**
   * Stops one child and resolves once it has actually exited (or the bounded
   * escalation is exhausted). Idempotent per child.
   */
  function stopManaged(managed: ManagedBackend): Promise<void> {
    managed.stopRequested = true;
    managed.startupAbort.abort();
    if (current === managed) {
      current = null;
      setReady(false);
      sendStatus();
    }
    if (managed.stopPromise) {
      return managed.stopPromise;
    }

    logger.log('Stopping Python backend...');
    const stopPromise = terminate(managed).finally(() => {
      stopping.delete(stopPromise);
    });
    managed.stopPromise = stopPromise;
    stopping.add(stopPromise);
    return stopPromise;
  }

  function showCrashLoopNotice() {
    const options: MessageBoxOptions = {
      type: 'error',
      title: 'AI Backend Stopped',
      message: 'The AI backend keeps crashing',
      detail: BACKEND_CRASH_LOOP_MESSAGE,
      buttons: ['OK'],
    };
    const window = getMainWindow();
    const shown = window && !window.isDestroyed()
      ? dialog.showMessageBox(window, options)
      : dialog.showMessageBox(options);
    void Promise.resolve(shown).catch((error: unknown) => {
      logger.error('Could not show the crash notice:', error);
    });
  }

  function scheduleRestart(delayMs: number) {
    cancelScheduledRestart();
    restartTimer = setTimeout(() => {
      restartTimer = null;
      void launch().then((started) => {
        if (!started) {
          logger.error('[backend] Automatic restart after a crash did not succeed.');
        }
      });
    }, delayMs);
  }

  function handleExit(managed: ManagedBackend, code: number | null, signal: NodeJS.Signals | null) {
    logger.log(`Python backend exited (code ${code ?? 'none'}, signal ${signal ?? 'none'})`);

    // A child that has been replaced (stop -> start) must not touch the state
    // of its successor. This was the orphan bug: the old child's late exit
    // nulled the module-level handle of the new one.
    if (current !== managed) {
      return;
    }

    current = null;
    setReady(false);

    if (managed.stopRequested) {
      sendStatus();
      return;
    }

    if (!managed.ready) {
      // Died before passing the handshake: startup reports it; no restart.
      if (!lastFailure) {
        fail(
          'exited-during-startup',
          `The AI backend exited during startup (exit code ${code ?? signal ?? 'unknown'}). See the backend log for details.`,
        );
      }
      sendStatus();
      return;
    }

    const verdict = evaluateBackendCrash(crashTimes, now());
    crashTimes = verdict.crashes;

    if (verdict.giveUp) {
      fail('crash-loop', BACKEND_CRASH_LOOP_MESSAGE);
      sendStatus();
      showCrashLoopNotice();
      return;
    }

    fail(
      'crashed',
      `The AI backend stopped unexpectedly (exit code ${code ?? signal ?? 'unknown'}). Restarting in ${Math.round(verdict.delayMs / 1000)} s.`,
    );
    sendStatus();
    scheduleRestart(verdict.delayMs);
  }

  function spawnManaged(backendConfig: BackendCommand, outputDirectory: string): ManagedBackend {
    const proc = spawn(backendConfig.command, backendConfig.args, {
      cwd: backendConfig.cwd,
      env: buildBackendEnvironment({
        baseEnv: env,
        userDataPath: appPaths.getPath('userData'),
        outputDirectory,
        backendAuthToken: getBackendAuthToken(),
        appVersion: appPaths.getVersion(),
        mediaRoots: getManagedOutputRoots(),
      }),
      // POSIX: lead a process group so stop() can signal the whole tree.
      // Windows: taskkill /T walks the tree; detaching there would open a console.
      detached: platform !== 'win32',
      windowsHide: true,
    });

    let resolveExited!: () => void;
    const managed: ManagedBackend = {
      proc,
      exited: new Promise<void>((resolve) => {
        resolveExited = resolve;
      }),
      hasExited: false,
      ready: false,
      stopRequested: false,
      stopPromise: null,
      startupAbort: new AbortController(),
    };

    const markExited = (code: number | null, signal: NodeJS.Signals | null) => {
      if (managed.hasExited) {
        return;
      }
      managed.hasExited = true;
      managed.startupAbort.abort();
      resolveExited();
      handleExit(managed, code, signal);
    };

    proc.stdout?.on('data', (data) => {
      logger.log(`[Python] ${data.toString().trim()}`);
    });

    proc.stderr?.on('data', (data) => {
      logger.error(`[Python Error] ${data.toString().trim()}`);
    });

    proc.on('error', (err) => {
      logger.error('Python backend process error:', err);
      if (typeof proc.pid === 'number') {
        // A running child whose handle reported an error (e.g. a failed kill):
        // its 'exit' still arrives on its own.
        return;
      }
      if (!managed.stopRequested) {
        fail('spawn-error', `Failed to start the AI backend: ${err.message}`);
        dialog.showErrorBox(
          'Backend Error',
          `Failed to start Python backend:\n${err.message}\n\nPlease ensure you have the required dependencies installed.`
        );
      }
      // A spawn failure (ENOENT, EACCES) never emits 'exit'.
      markExited(proc.exitCode, null);
    });

    proc.once('exit', (code, signal) => markExited(code, signal));
    proc.once('close', (code, signal) => markExited(code, signal));

    return managed;
  }

  async function awaitStartup(managed: ManagedBackend): Promise<boolean> {
    const result = await waitForBackendReady({
      token: getBackendAuthToken(),
      timeoutMs: BACKEND_STARTUP_TIMEOUT_MS,
      intervalMs: 1000,
      requestTimeoutMs: 1500,
      signal: managed.startupAbort.signal,
    });

    if (current !== managed || managed.hasExited) {
      // Exited or stopped while starting; handleExit / stop() already reported.
      return false;
    }

    if (result.ready) {
      managed.ready = true;
      lastFailure = null;
      setReady(true);
      logger.log(`Backend identity verified via ${result.origin}`);
      sendStatus();
      onReady?.();
      return true;
    }

    if (result.reason === 'mismatch') {
      // Another program answers on our port. Never send it the token, and do
      // not leave our own child behind: it cannot bind the port anyway.
      fail('port-in-use', PORT_IN_USE_MESSAGE);
      await stopManaged(managed);
      sendStatus();
      return false;
    }

    if (result.reason === 'aborted') {
      return false;
    }

    fail(
      'startup-timeout',
      `The AI backend did not become ready within ${Math.round(BACKEND_STARTUP_TIMEOUT_MS / 60_000)} minutes.`,
    );
    sendStatus();
    return false;
  }

  async function launchBackend(): Promise<boolean> {
    // A child still shutting down holds port 8000 (and the GPU).
    if (stopping.size > 0) {
      await Promise.all([...stopping]);
    }

    const backendConfig = getBackendCommand({ refresh: true });
    if (!backendConfig) {
      fail('not-found', 'Could not find the Python backend.');
      dialog.showErrorBox(
        'Backend Not Found',
        'Could not find the Python backend. Please reinstall the application.'
      );
      sendStatus();
      return false;
    }

    // Before spawning anything heavy: is the port already taken?
    const occupant = await probeBackendIdentity({ token: getBackendAuthToken(), requestTimeoutMs: 1500 });
    if (occupant === 'mismatch') {
      fail('port-in-use', PORT_IN_USE_MESSAGE);
      sendStatus();
      return false;
    }
    if (occupant === 'verified') {
      fail('already-running', BACKEND_ALREADY_RUNNING_MESSAGE);
      sendStatus();
      return false;
    }

    logger.log('Starting Python backend...');
    logger.log(`   Command: ${backendConfig.command}`);
    logger.log(`   Args: ${backendConfig.args.join(' ')}`);
    logger.log(`   CWD: ${backendConfig.cwd}`);

    const outputDirectory = getResolvedOutputDirectory();
    fs.mkdirSync(outputDirectory, { recursive: true });
    rememberOutputRoot(outputDirectory);

    lastFailure = null;
    setReady(false);
    const managed = spawnManaged(backendConfig, outputDirectory);
    current = managed;
    sendStatus();

    return awaitStartup(managed);
  }

  /** Spawns unless a start is in flight or a child is alive. Never rejects. */
  function launch(): Promise<boolean> {
    if (startupPromise) {
      return startupPromise;
    }
    if (isAlive(current)) {
      return Promise.resolve(current.ready);
    }

    startupPromise = launchBackend()
      .catch((error: unknown) => {
        fail('spawn-error', `Failed to start the AI backend: ${error instanceof Error ? error.message : String(error)}`);
        sendStatus();
        return false;
      })
      .finally(() => {
        startupPromise = null;
      });
    return startupPromise;
  }

  /**
   * User- or app-initiated start. Clears a crash-loop give-up: the user asked
   * for another attempt.
   */
  function start(): Promise<boolean> {
    cancelScheduledRestart();
    crashTimes = [];
    return launch();
  }

  /**
   * Stops the managed backend (no automatic restart follows) and resolves once
   * it has exited - bounded by the SIGTERM grace and SIGKILL waits.
   */
  async function stop(): Promise<void> {
    cancelScheduledRestart();
    lastFailure = null;
    const managed = current;
    if (!managed) {
      await Promise.all([...stopping]);
      sendStatus();
      return;
    }
    await stopManaged(managed);
  }

  async function restart(): Promise<boolean> {
    await stop();
    return start();
  }

  async function restartIfRunning() {
    if (!isAlive(current)) {
      return true;
    }

    const restarted = await restart();
    return restarted || isAlive(current);
  }

  async function startOrRecover(): Promise<{ success: boolean; error?: string; restarted?: boolean }> {
    if (startupPromise) {
      const started = await startupPromise;
      return started ? { success: true } : { success: false, error: lastFailure?.message };
    }

    if (!isAlive(current)) {
      const started = await start();
      return started ? { success: true } : { success: false, error: lastFailure?.message };
    }

    const identity = await probeBackendIdentity({ token: getBackendAuthToken(), requestTimeoutMs: 1000 });
    setReady(identity === 'verified');

    if (identity !== 'verified') {
      const restarted = await restart();
      return restarted
        ? { success: true, restarted: true }
        : { success: false, restarted: true, error: lastFailure?.message };
    }

    return { success: false, error: 'Backend already running' };
  }

  async function getStatus() {
    if (isAlive(current) && !startupPromise) {
      const managed = current;
      const identity = await probeBackendIdentity({ token: getBackendAuthToken(), requestTimeoutMs: 1000 });
      if (current === managed) {
        if (identity === 'verified' && !managed.ready) {
          // Came up after the startup deadline: supervise it from now on.
          managed.ready = true;
          lastFailure = null;
        }
        setReady(identity === 'verified');
      }
    } else if (!isAlive(current)) {
      backendReady = false;
      // External mode has no child for setReady to vouch for: its identity is
      // the last handshake taken by getSystemInfo, which a status read must
      // not erase (that would refuse every token-bearing call in between).
      if (!isExternalBackendEnabled(env)) {
        setBackendIdentityVerified(false);
      }
    }

    return {
      ...snapshot(),
      bundled: getCachedBundledBackendPath() !== null,
    };
  }

  /**
   * True when the token may be sent to 127.0.0.1:8000: our live child proved
   * its identity, or (external mode) a fresh handshake succeeds now.
   */
  async function isIdentityEstablished(): Promise<boolean> {
    if (isAlive(current) && current.ready) {
      return true;
    }
    const verified =
      (await probeBackendIdentity({ token: getBackendAuthToken(), requestTimeoutMs: 1000 })) === 'verified';
    if (!isAlive(current) && isExternalBackendEnabled(env)) {
      // An externally-managed backend (manual `python main.py`, E2E harness)
      // has no child whose exit would clear the gate, so this fresh handshake
      // IS the proof the token-bearing IPC handlers consult. It is re-taken on
      // every system-info poll, so a listener that stops proving the token
      // (backend gone, impostor on the port) closes the gate on the next poll.
      setBackendIdentityVerified(verified);
    }
    return verified;
  }

  async function getSystemInfo() {
    const hasLiveChild = isAlive(current);
    // Probe whether or not we spawned the child: an externally-managed backend
    // (manual dev run / E2E harness) should still register as connected. A
    // closed loopback port refuses the connection near-instantly, so this stays
    // cheap when nothing is listening. The token goes out only after the
    // listener has proven its identity.
    if (
      shouldProbeBackendConnectivity({
        hasLiveChild,
        externalBackendEnabled: isExternalBackendEnabled(env),
      }) &&
      (await isIdentityEstablished())
    ) {
      try {
        const response = await fetch(`${BACKEND_ORIGIN}/api/system/info`, {
          headers: backendAuthHeaders(),
          signal: AbortSignal.timeout(3000),
        });
        if (response.ok) {
          return { ...await response.json(), backendConnected: true };
        }
      } catch {
        // Backend not reachable (no process, or running but not responding).
      }
    }

    return {
      backendConnected: false,
      gpu_available: false,
      gpu_name: undefined,
      gpu_vram: undefined,
      cuda_version: undefined,
      comfyui_connected: false,
      models_count: 0,
    };
  }

  /**
   * Generation jobs still pending or processing on the managed backend. Used
   * to confirm before a close or quit that would kill them. Any failure
   * (timeout, backend busy, unverified listener) reports 0 so closing is never
   * blocked by a broken backend.
   */
  async function countActiveJobs(): Promise<number> {
    if (!isAlive(current) || !current.ready) {
      return 0;
    }
    try {
      const response = await backendHttp.get(`${BACKEND_ORIGIN}/api/jobs`, {
        params: { limit: 100 },
        headers: backendAuthHeaders(),
        timeout: ACTIVE_JOBS_QUERY_TIMEOUT_MS,
      });
      const jobs: unknown[] = Array.isArray(response.data?.jobs) ? response.data.jobs : [];
      return jobs.filter((job) => {
        const status = (job as { status?: unknown } | null)?.status;
        return status === 'pending' || status === 'processing';
      }).length;
    } catch (error) {
      // Message only: an AxiosError's config carries the auth header.
      logger.error(
        'Could not query active generation jobs:',
        error instanceof Error ? error.message : String(error),
      );
      return 0;
    }
  }

  return {
    start,
    stop,
    restart,
    restartIfRunning,
    startOrRecover,
    getStatus,
    getSystemInfo,
    getBundledBackendPath,
    getBackendCommand,
    countActiveJobs,
    /** A managed child exists and has not exited (it may still be starting). */
    isRunning: () => isAlive(current),
    /** The managed child is alive and has proven its identity. */
    isReady: () => isAlive(current) && current.ready,
    getLastFailure: (): BackendFailure | null => lastFailure,
  };
}

export type BackendProcessService = ReturnType<typeof createBackendProcessService>;
