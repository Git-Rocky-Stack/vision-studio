import { describe, expect, it } from 'vitest';

import { createOutputRootService, type OutputRootStore } from './outputRoots';

describe('output root service', () => {
  it('merges persisted settings over release defaults', () => {
    const service = createOutputRootService({
      userDataPath: 'C:/Users/User/AppData/Roaming/Vision Studio',
      store: createStore({
        settings: { theme: 'light' },
        managedOutputRoots: [],
      }),
      exists: () => false,
    });

    expect(service.getAppSettings()).toMatchObject({
      theme: 'light',
      autoSave: true,
      backendAutostart: true,
      defaultOutputPath: '',
    });
  });

  it('normalizes and deduplicates remembered output roots', () => {
    const store = createStore({
      settings: {},
      managedOutputRoots: ['D:/Vision Studio/Outputs'],
    });
    const service = createOutputRootService({
      userDataPath: 'C:/Users/User/AppData/Roaming/Vision Studio',
      store,
      exists: () => false,
    });

    service.rememberOutputRoot('D:\\Vision Studio\\Outputs\\');
    service.rememberOutputRoot('E:\\Other Outputs\\');

    expect(store.state.managedOutputRoots).toEqual([
      'D:/Vision Studio/Outputs',
      'E:/Other Outputs',
    ]);
  });

  it('rejects resolved asset paths outside managed output roots', () => {
    const service = createOutputRootService({
      userDataPath: 'C:/Users/User/AppData/Roaming/Vision Studio',
      store: createStore({
        settings: { defaultOutputPath: 'D:/Vision Studio/Outputs' },
        managedOutputRoots: [],
      }),
      exists: () => true,
    });

    expect(() => service.resolveManagedAssetPath('C:/Users/User/Documents/private.png')).toThrow(
      'Asset path is outside managed output directories'
    );
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
