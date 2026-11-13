import { describe, expect, it, vi } from 'vitest';

import { createOutputRootService, MAX_REMEMBERED_OUTPUT_ROOTS, type OutputRootStore } from './outputRoots';
import type { OutputRootPolicyContext } from './outputRootPolicy';

const USER_DATA = 'C:/Users/User/AppData/Roaming/Vision Studio';

const policy: OutputRootPolicyContext = {
  homeDir: 'C:/Users/User',
  userDataPath: USER_DATA,
  platform: 'win32',
  env: { SystemRoot: 'C:\\Windows', ProgramFiles: 'C:\\Program Files' },
};

const noRealpath = (): string => {
  throw new Error('ENOENT');
};

function createService(
  initial: { settings: Record<string, unknown>; managedOutputRoots: string[] },
  exists: (candidatePath: string) => boolean = () => false,
) {
  const store = createStore(initial);
  const logger = { warn: vi.fn() };
  const service = createOutputRootService({
    userDataPath: USER_DATA,
    store,
    exists,
    policy,
    realpath: noRealpath,
    logger,
  });
  return { service, store, logger };
}

describe('output root service', () => {
  it('merges persisted settings over release defaults and drops retired keys', () => {
    const { service } = createService({
      settings: { theme: 'light', autoSave: false, pythonPath: 'cmd.exe' },
      managedOutputRoots: [],
    });

    const settings = service.getAppSettings();
    expect(settings).toMatchObject({
      theme: 'light',
      backendAutostart: true,
      defaultOutputPath: '',
    });
    expect(settings).not.toHaveProperty('autoSave');
    expect(settings).not.toHaveProperty('pythonPath');
  });

  it('normalizes and deduplicates remembered output roots (case-insensitively on Windows)', () => {
    const { service, store } = createService({
      settings: {},
      managedOutputRoots: ['D:/Vision Studio/Outputs'],
    });

    service.rememberOutputRoot('D:\\Vision Studio\\Outputs\\');
    service.rememberOutputRoot('d:\\vision studio\\outputs');
    service.rememberOutputRoot('E:\\Other Outputs\\');

    expect(store.state.managedOutputRoots).toEqual([
      'd:/vision studio/outputs',
      'E:/Other Outputs',
    ]);
  });

  it('rejects resolved asset paths outside managed output roots', () => {
    const { service } = createService(
      { settings: { defaultOutputPath: 'D:/Vision Studio/Outputs' }, managedOutputRoots: [] },
      () => true,
    );

    expect(() => service.resolveManagedAssetPath('C:/Users/User/Documents/private.png')).toThrow(
      'Asset path is outside managed output directories'
    );
  });

  it('refuses /outputs traversal, UNC and device paths (S1)', () => {
    const { service } = createService(
      { settings: { defaultOutputPath: 'D:/Vision Studio/Outputs' }, managedOutputRoots: [] },
      () => true,
    );

    for (const attack of [
      '/outputs/../../Windows/win.ini',
      'outputs/..\\..\\..\\Users\\User\\.ssh\\id_rsa',
      'D:/Vision Studio/Outputs/../secrets.json',
      'D:/Vision Studio/Outputs-old/x.png',
      '\\\\attacker\\share\\x.png',
      '\\\\?\\D:\\Vision Studio\\Outputs\\x.png',
    ]) {
      expect(() => service.resolveManagedAssetPath(attack), attack).toThrow(/outside managed output/);
    }
    expect(service.resolveManagedAssetPath('/outputs/job-1/image.png')).toBe('D:/Vision Studio/Outputs/job-1/image.png');
  });

  it('drops stored managed roots that fail the root rules on load, keeping legitimate ones (S3)', () => {
    const { service, store, logger } = createService({
      settings: {},
      managedOutputRoots: [
        'D:/Vision Studio/Outputs',
        'C:/',
        'C:/Users/User',
        'C:/Users',
        'C:/Windows/Temp',
        'C:/Program Files/Vision Studio',
        '\\\\nas\\share\\outputs',
        'relative/outputs',
        USER_DATA,
        'E:/Archive/Old Renders',
      ],
    });

    expect(store.state.managedOutputRoots).toEqual(['D:/Vision Studio/Outputs', 'E:/Archive/Old Renders']);
    expect(logger.warn).toHaveBeenCalled();
    expect(service.getManagedOutputRoots()).toEqual([
      `${USER_DATA}/outputs`,
      'D:/Vision Studio/Outputs',
      'E:/Archive/Old Renders',
    ]);
  });

  it('falls back to the internal folder when the stored output path is not allowed', () => {
    const { service } = createService({ settings: { defaultOutputPath: 'C:/Windows' }, managedOutputRoots: [] });

    expect(service.getAppSettings().defaultOutputPath).toBe('');
    expect(service.getResolvedOutputDirectory()).toBe(`${USER_DATA}/outputs`);
  });

  it('refuses to remember a disallowed root and bounds the history', () => {
    const { service, store } = createService({ settings: {}, managedOutputRoots: [] });

    service.rememberOutputRoot('C:/');
    expect(store.state.managedOutputRoots).toEqual([]);

    for (let index = 0; index < MAX_REMEMBERED_OUTPUT_ROOTS + 5; index += 1) {
      service.rememberOutputRoot(`D:/Renders/${index}`);
    }
    expect(store.state.managedOutputRoots).toHaveLength(MAX_REMEMBERED_OUTPUT_ROOTS);
    expect(store.state.managedOutputRoots.at(-1)).toBe(`D:/Renders/${MAX_REMEMBERED_OUTPUT_ROOTS + 4}`);
  });
});

function createStore(initialState: {
  settings: Record<string, unknown>;
  managedOutputRoots: string[];
}) {
  const state = structuredClone(initialState);
  return {
    state,
    // Deliberate partial test double: the service merges persisted settings over
    // release defaults, so the stored `settings` is intentionally loose. Cast the
    // accessors to the real overloaded store contract.
    get: ((key: keyof typeof state) => state[key]) as unknown as OutputRootStore['get'],
    set: ((key: keyof typeof state, value: unknown) => {
      state[key] = value as never;
    }) as unknown as OutputRootStore['set'],
  };
}
