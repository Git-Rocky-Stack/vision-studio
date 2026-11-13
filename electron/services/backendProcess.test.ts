import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  BACKEND_CRASH_LOOP_THRESHOLD,
  BACKEND_CRASH_WINDOW_MS,
  BACKEND_RESTART_BASE_DELAY_MS,
  BACKEND_RESTART_MAX_DELAY_MS,
  buildBackendEnvironment,
  createBackendProcessService,
  evaluateBackendCrash,
  externalBackendTokenWarning,
  isExternalBackendEnabled,
  isSkipBackendEnabled,
  resolveBackendCommand,
  resolveBundledBackendPath,
  resolvePythonOverride,
  shouldProbeBackendConnectivity,
} from './backendProcess';

const quiet = { error: () => undefined, log: () => undefined };

describe('backend process helpers', () => {
  it('prefers the development one-folder bundle when it exists', () => {
    const backendPath = path.join(
      'C:/vision-studio/dist-electron',
      '../backend/dist',
      'VisionStudio-Backend',
      'VisionStudio-Backend.exe',
    );
    const result = resolveBundledBackendPath({
      dirname: 'C:/vision-studio/dist-electron',
      resourcesPath: 'C:/vision-studio/resources',
      platform: 'win32',
      isDev: true,
      exists: (candidate) => candidate === backendPath,
    });

    expect(result).toBe(backendPath);
  });

  it('falls back to the staged resources/backend bundle in development', () => {
    const backendPath = path.join('C:/vision-studio/dist-electron', '../resources/backend', 'VisionStudio-Backend');
    const result = resolveBundledBackendPath({
      dirname: 'C:/vision-studio/dist-electron',
      resourcesPath: 'C:/vision-studio/resources',
      platform: 'linux',
      isDev: true,
      exists: (candidate) => candidate === backendPath,
    });

    expect(result).toBe(backendPath);
  });

  it('uses the packaged resources/backend bundle outside development', () => {
    const backendPath = path.join('C:/Program Files/Vision Studio/resources', 'backend', 'VisionStudio-Backend.exe');
    const result = resolveBundledBackendPath({
      dirname: 'C:/Program Files/Vision Studio/resources/app.asar/dist-electron',
      resourcesPath: 'C:/Program Files/Vision Studio/resources',
      platform: 'win32',
      isDev: false,
      exists: (candidate) => candidate === backendPath,
      logger: quiet,
    });

    expect(result).toBe(backendPath);
  });

  it('ignores a stale one-file executable at the resources root', () => {
    const legacyPath = path.join('C:/Program Files/Vision Studio/resources', 'VisionStudio-Backend.exe');
    const result = resolveBundledBackendPath({
      dirname: 'C:/Program Files/Vision Studio/resources/app.asar/dist-electron',
      resourcesPath: 'C:/Program Files/Vision Studio/resources',
      platform: 'win32',
      isDev: false,
      exists: (candidate) => candidate === legacyPath,
      logger: quiet,
    });

    expect(result).toBeNull();
  });

  // pythonPath used to come from the renderer-editable Settings and was
  // spawned. Only the developer's own environment may name an interpreter now.
  describe('VISION_STUDIO_PYTHON developer override', () => {
    const electronDir = 'C:/vision-studio/dist-electron';
    const backendDir = path.join(electronDir, '../backend');
    const mainPy = path.join(backendDir, 'main.py');

    function command(pythonOverride: string | undefined, isFile: (candidate: string) => boolean = () => true) {
      return resolveBackendCommand({
        bundledBackendPath: null,
        dirname: electronDir,
        resourcesPath: 'C:/vision-studio/resources',
        isDev: true,
        platform: 'win32',
        pythonOverride,
        exists: (candidate) => candidate === mainPy,
        isFile,
        logger: quiet,
      });
    }

    it('runs main.py with an existing, absolute, local Python', () => {
      expect(command('C:/Python311/python.exe')).toEqual({
        command: 'C:/Python311/python.exe',
        args: ['main.py'],
        cwd: backendDir,
      });
    });

    it('refuses an override that is not a Python executable', () => {
      expect(command('powershell.exe')).toBeNull();
      expect(command('C:\\Windows\\System32\\cmd.exe')).toBeNull();
    });

    it('refuses UNC and device paths', () => {
      expect(command('\\\\attacker\\share\\python.exe')).toBeNull();
      expect(command('//attacker/share/python.exe')).toBeNull();
      expect(command('\\\\?\\C:\\Python311\\python.exe')).toBeNull();
      expect(command('\\\\.\\C:\\Python311\\python.exe')).toBeNull();
    });

    it('refuses a relative command or a file that does not exist', () => {
      expect(command('python')).toBeNull();
      expect(command('C:/Python311/python.exe', () => false)).toBeNull();
    });

    it('does not fall back to another interpreter when the override is rejected', () => {
      // A silent fallback would run a different Python than the developer named.
      expect(command('C:/missing/python.exe', () => false)).toBeNull();
    });

    it('is ignored while a bundled backend exists', () => {
      expect(
        resolveBackendCommand({
          bundledBackendPath: 'C:/vs/resources/VisionStudio-Backend.exe',
          dirname: electronDir,
          resourcesPath: 'C:/vs/resources',
          isDev: false,
          pythonOverride: 'C:/Python311/python.exe',
          exists: () => true,
          logger: quiet,
        })?.command,
      ).toBe('C:/vs/resources/VisionStudio-Backend.exe');
    });

    it('validates the override on its own', () => {
      expect(resolvePythonOverride(undefined, { logger: quiet })).toBeNull();
      expect(resolvePythonOverride('  ', { logger: quiet })).toBeNull();
      expect(resolvePythonOverride('/usr/bin/python3', { isFile: () => true, logger: quiet })).toBe('/usr/bin/python3');
      expect(resolvePythonOverride('/usr/bin/python3', { isFile: () => false, logger: quiet })).toBeNull();
      expect(resolvePythonOverride('/usr/bin/bash', { isFile: () => true, logger: quiet })).toBeNull();
    });
  });

  // setup-python.bat (and the README's Linux/macOS steps) create backend/venv,
  // but nothing activates it for `npm run dev`, so the PATH `python` - often
  // a different install without the generation stack - used to start main.py.
  describe('development Python without an override', () => {
    const electronDir = 'C:/vision-studio/dist-electron';
    const backendDir = path.join(electronDir, '../backend');
    const mainPy = path.join(backendDir, 'main.py');

    it("uses backend/venv's python on Windows when the setup created it", () => {
      const venvPython = path.join(backendDir, 'venv', 'Scripts', 'python.exe');
      const command = resolveBackendCommand({
        bundledBackendPath: null,
        dirname: electronDir,
        resourcesPath: 'C:/vision-studio/resources',
        isDev: true,
        platform: 'win32',
        pythonOverride: '',
        exists: (candidate) => candidate === mainPy || candidate === venvPython,
        logger: quiet,
      });

      expect(command).toEqual({ command: venvPython, args: ['main.py'], cwd: backendDir });
    });

    it("uses backend/venv/bin/python on Linux and macOS", () => {
      const venvPython = path.join(backendDir, 'venv', 'bin', 'python');
      const command = resolveBackendCommand({
        bundledBackendPath: null,
        dirname: electronDir,
        resourcesPath: 'C:/vision-studio/resources',
        isDev: true,
        platform: 'linux',
        pythonOverride: undefined,
        exists: (candidate) => candidate === mainPy || candidate === venvPython,
        logger: quiet,
      });

      expect(command?.command).toBe(venvPython);
    });

    it('falls back to the PATH python when there is no venv', () => {
      const command = resolveBackendCommand({
        bundledBackendPath: null,
        dirname: electronDir,
        resourcesPath: 'C:/vision-studio/resources',
        isDev: true,
        platform: 'win32',
        exists: (candidate) => candidate === mainPy,
        logger: quiet,
      });

      expect(command?.command).toBe('python');
    });

    it('never looks for a venv outside development', () => {
      const sourceDir = path.join('C:/vision-studio/resources', 'backend-source');
      const command = resolveBackendCommand({
        bundledBackendPath: null,
        dirname: electronDir,
        resourcesPath: 'C:/vision-studio/resources',
        isDev: false,
        platform: 'win32',
        exists: () => true,
        logger: quiet,
      });

      expect(command).toEqual({ command: 'python', args: ['main.py'], cwd: sourceDir });
    });
  });

  describe('the service reads the interpreter from the environment, never Settings', () => {
    let root: string | null = null;
    afterEach(() => {
      if (root) fs.rmSync(root, { recursive: true, force: true });
      root = null;
    });

    function serviceIn(env: NodeJS.ProcessEnv) {
      root = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-backend-'));
      const backendDir = path.join(root, 'backend');
      const venvPython = process.platform === 'win32'
        ? path.join(backendDir, 'venv', 'Scripts', 'python.exe')
        : path.join(backendDir, 'venv', 'bin', 'python');
      fs.mkdirSync(path.dirname(venvPython), { recursive: true });
      fs.writeFileSync(path.join(backendDir, 'main.py'), '');
      fs.writeFileSync(venvPython, '');
      const service = createBackendProcessService({
        appPaths: { getPath: () => root!, resourcesPath: path.join(root, 'resources'), getVersion: () => '0.0.0' },
        dialog: { showErrorBox: () => undefined, showMessageBox: async () => ({ response: 0, checkboxChecked: false }) },
        getMainWindow: () => null,
        getResolvedOutputDirectory: () => path.join(root!, 'out'),
        rememberOutputRoot: () => undefined,
        isDev: () => true,
        dirname: path.join(root, 'dist-electron'),
        logger: quiet,
        env,
      });
      return { service, venvPython, root };
    }

    it("starts main.py with backend/venv's python when no override is set", () => {
      const { service, venvPython } = serviceIn({});
      expect(service.getBackendCommand()?.command).toBe(path.normalize(venvPython));
    });

    it('starts main.py with the VISION_STUDIO_PYTHON interpreter when it is a real local file', () => {
      const { service, venvPython } = serviceIn({});
      const devPython = path.join(path.dirname(venvPython), process.platform === 'win32' ? 'python3.exe' : 'python3');
      fs.writeFileSync(devPython, '');
      const overridden = createBackendProcessService({
        appPaths: { getPath: () => root!, resourcesPath: path.join(root!, 'resources'), getVersion: () => '0.0.0' },
        dialog: { showErrorBox: () => undefined, showMessageBox: async () => ({ response: 0, checkboxChecked: false }) },
        getMainWindow: () => null,
        getResolvedOutputDirectory: () => path.join(root!, 'out'),
        rememberOutputRoot: () => undefined,
        isDev: () => true,
        dirname: path.join(root!, 'dist-electron'),
        logger: quiet,
        env: { VISION_STUDIO_PYTHON: devPython },
      });

      expect(overridden.getBackendCommand()?.command).toBe(devPython);
      expect(service.getBackendCommand()?.command).toBe(path.normalize(venvPython));
    });
  });

  it('builds the backend environment from app paths, output roots, and auth token', () => {
    const env = buildBackendEnvironment({
      baseEnv: { PATH: 'C:/Windows/System32' },
      userDataPath: 'C:/Users/User/AppData/Roaming/Vision Studio',
      outputDirectory: 'D:/Vision Studio/Outputs',
      backendAuthToken: 'session-token',
      appVersion: '3.3.0',
    });

    expect(env).toMatchObject({
      PATH: 'C:/Windows/System32',
      PYTHONUNBUFFERED: '1',
      MODELS_DIR: path.join('C:/Users/User/AppData/Roaming/Vision Studio', 'models'),
      OUTPUT_DIR: 'D:/Vision Studio/Outputs',
      DATABASE_PATH: path.join('C:/Users/User/AppData/Roaming/Vision Studio', 'data', 'vision_studio.db'),
      LOG_FILE: path.join('C:/Users/User/AppData/Roaming/Vision Studio', 'logs', 'backend.log'),
      VISION_STUDIO_BACKEND_AUTH_TOKEN: 'session-token',
    });
  });

  it('tells the backend which app version it belongs to', () => {
    // The backend used to hardcode its own version string, and it drifted two
    // releases behind - it served a stale number in its OpenAPI spec and sent
    // one as its User-Agent to Hugging Face and CivitAI. The shell knows the
    // real version; it has to pass it down.
    const env = buildBackendEnvironment({
      baseEnv: {},
      userDataPath: 'C:/data',
      outputDirectory: 'C:/out',
      backendAuthToken: 'token',
      appVersion: '9.9.9',
    });

    expect(env.VISION_STUDIO_VERSION).toBe('9.9.9');
  });

  it('forwards earlier trusted output roots so their media stays readable', () => {
    // backend/utils/media_paths.py only reads media inside its outputs dir,
    // library roots and VISION_STUDIO_MEDIA_ROOTS (os.pathsep-separated).
    const env = buildBackendEnvironment({
      baseEnv: {},
      userDataPath: 'C:/data',
      outputDirectory: 'D:/Outputs/current',
      backendAuthToken: 'token',
      appVersion: '1.0.0',
      mediaRoots: ['D:/Outputs/current', 'E:/Old Renders', 'C:/data/outputs', 'E:/Old Renders', ''],
      pathDelimiter: ';',
    });

    // Current output dir travels as OUTPUT_DIR; duplicates and blanks drop out.
    expect(env.VISION_STUDIO_MEDIA_ROOTS).toBe('E:/Old Renders;C:/data/outputs');
  });

  it('sends an empty media-root list when there are no earlier roots', () => {
    const env = buildBackendEnvironment({
      baseEnv: { VISION_STUDIO_MEDIA_ROOTS: 'Z:/inherited' },
      userDataPath: 'C:/data',
      outputDirectory: 'C:/out',
      backendAuthToken: 'token',
      appVersion: '1.0.0',
    });

    // Never inherit a stale list from the parent environment.
    expect(env.VISION_STUDIO_MEDIA_ROOTS).toBe('');
  });
});

describe('crash supervisor policy', () => {
  it('backs off exponentially from the base delay', () => {
    const first = evaluateBackendCrash([], 1_000_000);
    expect(first).toMatchObject({ giveUp: false, delayMs: BACKEND_RESTART_BASE_DELAY_MS });

    const second = evaluateBackendCrash(first.crashes, 1_010_000);
    expect(second).toMatchObject({ giveUp: false, delayMs: BACKEND_RESTART_BASE_DELAY_MS * 2 });
  });

  it(`gives up at ${BACKEND_CRASH_LOOP_THRESHOLD} crashes inside the window`, () => {
    let crashes: number[] = [];
    let verdict = evaluateBackendCrash(crashes, 0);
    for (let index = 1; index < BACKEND_CRASH_LOOP_THRESHOLD; index += 1) {
      crashes = verdict.crashes;
      verdict = evaluateBackendCrash(crashes, index * 1000);
    }
    expect(verdict.giveUp).toBe(true);
  });

  it('forgets crashes older than the window', () => {
    const old = [0, 1000];
    const verdict = evaluateBackendCrash(old, BACKEND_CRASH_WINDOW_MS + 5000);
    expect(verdict.crashes).toEqual([BACKEND_CRASH_WINDOW_MS + 5000]);
    expect(verdict.giveUp).toBe(false);
  });

  it('caps the backoff', () => {
    const many = Array.from({ length: 20 }, (_, index) => index);
    expect(evaluateBackendCrash(many, 30).delayMs).toBe(BACKEND_RESTART_MAX_DELAY_MS);
  });
});

describe('skip-backend flag', () => {
  it('only skips the spawn for truthy values, so =0 / =false still start the backend', () => {
    expect(isSkipBackendEnabled({})).toBe(false);
    for (const value of ['', '0', 'false', 'off', 'no', ' FALSE ']) {
      expect(isSkipBackendEnabled({ VISION_STUDIO_SKIP_BACKEND: value })).toBe(false);
    }
    for (const value of ['1', 'true', 'yes', 'on', ' TRUE ']) {
      expect(isSkipBackendEnabled({ VISION_STUDIO_SKIP_BACKEND: value })).toBe(true);
    }
  });
});

describe('external backend connectivity gating', () => {
  it('treats the external-backend flag as opt-in (disabled by default and for falsey values)', () => {
    expect(isExternalBackendEnabled({})).toBe(false);
    for (const value of ['', '0', 'false', 'off', 'no', ' FALSE ', 'Off']) {
      expect(isExternalBackendEnabled({ VISION_STUDIO_BACKEND_EXTERNAL: value })).toBe(false);
    }
  });

  it('enables the external-backend probe for truthy opt-in values', () => {
    for (const value of ['1', 'true', 'yes', 'on', ' 1 ', 'TRUE']) {
      expect(isExternalBackendEnabled({ VISION_STUDIO_BACKEND_EXTERNAL: value })).toBe(true);
    }
  });

  it('probes connectivity when a child is live OR an external backend is declared', () => {
    expect(shouldProbeBackendConnectivity({ hasLiveChild: true, externalBackendEnabled: false })).toBe(true);
    expect(shouldProbeBackendConnectivity({ hasLiveChild: false, externalBackendEnabled: true })).toBe(true);
    expect(shouldProbeBackendConnectivity({ hasLiveChild: true, externalBackendEnabled: true })).toBe(true);
  });

  it('skips the probe only when there is no child and no external backend (default)', () => {
    expect(shouldProbeBackendConnectivity({ hasLiveChild: false, externalBackendEnabled: false })).toBe(false);
  });
});

describe('external backend auth-token guard', () => {
  it('warns when external mode is on but no shared auth token is set', () => {
    const warning = externalBackendTokenWarning({ VISION_STUDIO_BACKEND_EXTERNAL: '1' });
    expect(warning).toMatch(/VISION_STUDIO_BACKEND_AUTH_TOKEN/);
    expect(warning).toMatch(/403/);
  });

  it('stays silent when external mode is off', () => {
    expect(externalBackendTokenWarning({})).toBeNull();
    expect(externalBackendTokenWarning({ VISION_STUDIO_BACKEND_AUTH_TOKEN: 'shared' })).toBeNull();
  });

  it('stays silent when external mode is on and a shared token is provided', () => {
    expect(
      externalBackendTokenWarning({
        VISION_STUDIO_BACKEND_EXTERNAL: '1',
        VISION_STUDIO_BACKEND_AUTH_TOKEN: 'shared',
      })
    ).toBeNull();
  });
});
