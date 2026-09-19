import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  buildBackendEnvironment,
  createBackendProcessService,
  externalBackendTokenWarning,
  isExternalBackendEnabled,
  resolveBackendCommand,
  resolveBundledBackendPath,
  shouldProbeBackendConnectivity,
} from './backendProcess';

describe('backend process helpers', () => {
  it('prefers the development backend executable when it exists', () => {
    const backendPath = path.join('C:/vision-studio/dist-electron', '../backend/dist', 'VisionStudio-Backend.exe');
    const result = resolveBundledBackendPath({
      dirname: 'C:/vision-studio/dist-electron',
      resourcesPath: 'C:/vision-studio/resources',
      platform: 'win32',
      isDev: true,
      exists: (candidate) => candidate === backendPath,
    });

    expect(result).toBe(backendPath);
  });

  it('uses the packaged resources backend outside development', () => {
    const backendPath = path.join('C:/Program Files/Vision Studio/resources', 'VisionStudio-Backend.exe');
    const result = resolveBundledBackendPath({
      dirname: 'C:/Program Files/Vision Studio/resources/app.asar/dist-electron',
      resourcesPath: 'C:/Program Files/Vision Studio/resources',
      platform: 'win32',
      isDev: false,
      exists: (candidate) => candidate === backendPath,
    });

    expect(result).toBe(backendPath);
  });

  it('falls back to system Python only when the configured command is safe', () => {
    const command = resolveBackendCommand({
      bundledBackendPath: null,
      dirname: 'C:/vision-studio/dist-electron',
      resourcesPath: 'C:/vision-studio/resources',
      isDev: true,
      pythonPath: 'C:/Python311/python.exe',
      exists: (candidate) => candidate === path.join('C:/vision-studio/dist-electron', '../backend', 'main.py'),
      logger: { error: () => undefined, log: () => undefined },
    });

    expect(command).toEqual({
      command: 'C:/Python311/python.exe',
      args: ['main.py'],
      cwd: path.join('C:/vision-studio/dist-electron', '../backend'),
    });

    expect(
      resolveBackendCommand({
        bundledBackendPath: null,
        dirname: 'C:/vision-studio/dist-electron',
        resourcesPath: 'C:/vision-studio/resources',
        isDev: true,
        pythonPath: 'powershell.exe',
        exists: () => true,
        logger: { error: () => undefined, log: () => undefined },
      })
    ).toBeNull();
  });

  // setup-python.bat (and the README's Linux/macOS steps) create backend/venv,
  // but nothing activates it for `npm run dev`, so the PATH `python` - often
  // a different install without the generation stack - used to start main.py.
  describe('development Python when Settings names none', () => {
    const electronDir = 'C:/vision-studio/dist-electron';
    const backendDir = path.join(electronDir, '../backend');
    const mainPy = path.join(backendDir, 'main.py');
    const quiet = { error: () => undefined, log: () => undefined };

    it("uses backend/venv's python on Windows when the setup created it", () => {
      const venvPython = path.join(backendDir, 'venv', 'Scripts', 'python.exe');
      const command = resolveBackendCommand({
        bundledBackendPath: null,
        dirname: electronDir,
        resourcesPath: 'C:/vision-studio/resources',
        isDev: true,
        platform: 'win32',
        pythonPath: '',
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
        pythonPath: undefined,
        exists: (candidate) => candidate === mainPy || candidate === venvPython,
        logger: quiet,
      });

      expect(command?.command).toBe(venvPython);
    });

    it('keeps a Python path set in Settings ahead of the venv', () => {
      const command = resolveBackendCommand({
        bundledBackendPath: null,
        dirname: electronDir,
        resourcesPath: 'C:/vision-studio/resources',
        isDev: true,
        platform: 'win32',
        pythonPath: 'C:/Python312/python.exe',
        exists: () => true,
        logger: quiet,
      });

      expect(command?.command).toBe('C:/Python312/python.exe');
    });

    it('falls back to the PATH python when there is no venv', () => {
      const command = resolveBackendCommand({
        bundledBackendPath: null,
        dirname: electronDir,
        resourcesPath: 'C:/vision-studio/resources',
        isDev: true,
        platform: 'win32',
        pythonPath: '',
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
        pythonPath: '',
        exists: () => true,
        logger: quiet,
      });

      expect(command).toEqual({ command: 'python', args: ['main.py'], cwd: sourceDir });
    });
  });

  describe('the service passes the Settings value through, not a default', () => {
    let root: string | null = null;
    afterEach(() => {
      if (root) fs.rmSync(root, { recursive: true, force: true });
      root = null;
    });

    function serviceIn(settings: { pythonPath?: string }) {
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
        getSettings: () => settings,
        getResolvedOutputDirectory: () => path.join(root!, 'out'),
        rememberOutputRoot: () => undefined,
        isDev: () => true,
        dirname: path.join(root, 'dist-electron'),
        logger: { error: () => undefined, log: () => undefined },
      });
      return { service, venvPython };
    }

    it("starts main.py with backend/venv's python when Settings names none", () => {
      const { service, venvPython } = serviceIn({});
      expect(service.getBackendCommand()?.command).toBe(path.normalize(venvPython));
    });

    it('starts main.py with the Python named in Settings when there is one', () => {
      const { service } = serviceIn({ pythonPath: 'C:/Python312/python.exe' });
      expect(service.getBackendCommand()?.command).toBe('C:/Python312/python.exe');
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
