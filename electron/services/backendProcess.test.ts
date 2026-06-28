import path from 'path';
import { describe, expect, it } from 'vitest';

import {
  buildBackendEnvironment,
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

  it('builds the backend environment from app paths, output roots, and auth token', () => {
    const env = buildBackendEnvironment({
      baseEnv: { PATH: 'C:/Windows/System32' },
      userDataPath: 'C:/Users/User/AppData/Roaming/Vision Studio',
      outputDirectory: 'D:/Vision Studio/Outputs',
      backendAuthToken: 'session-token',
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
