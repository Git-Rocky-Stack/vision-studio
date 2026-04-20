import path from 'path';
import { describe, expect, it } from 'vitest';

import {
  buildBackendEnvironment,
  resolveBackendCommand,
  resolveBundledBackendPath,
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
