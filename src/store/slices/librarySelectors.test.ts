import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAppStore } from '../appStore';
import type { LibraryRoot } from '@/types/model';

const ROOT: LibraryRoot = {
  id: 'r1',
  path: 'C:\\ComfyUI\\models',
  layout_hint: 'comfyui',
  added_at: '2026-06-09T00:00:00Z',
};

function mockModelsApi(overrides: Record<string, unknown> = {}) {
  (globalThis as any).window = {
    electron: {
      models: {
        list: vi.fn().mockResolvedValue([]),
        librariesList: vi.fn().mockResolvedValue([ROOT]),
        librariesRemove: vi.fn().mockResolvedValue({ removed: true, records_dropped: 1 }),
        librariesDetect: vi.fn().mockResolvedValue([{ path: ROOT.path, layout_hint: 'comfyui' }]),
        importRoot: vi.fn().mockResolvedValue(ROOT),
        scan: vi.fn().mockResolvedValue({ records_indexed: 3, warnings: [] }),
        ...overrides,
      },
    },
  };
}

describe('modelsSlice library actions', () => {
  beforeEach(() => {
    useAppStore.setState({ libraryRoots: [], detectedRoots: [] });
  });

  it('loadLibraryRoots populates state', async () => {
    mockModelsApi();
    await useAppStore.getState().loadLibraryRoots();
    expect(useAppStore.getState().libraryRoots).toEqual([ROOT]);
  });

  it('addLibraryRoot imports then refreshes roots and models', async () => {
    mockModelsApi();
    await useAppStore.getState().addLibraryRoot(ROOT.path, 'comfyui');
    const api = (globalThis as any).window.electron.models;
    expect(api.importRoot).toHaveBeenCalledWith(ROOT.path, 'comfyui');
    expect(api.list).toHaveBeenCalled();
    expect(useAppStore.getState().libraryRoots).toEqual([ROOT]);
  });

  it('removeLibraryRoot refreshes roots and models', async () => {
    mockModelsApi({ librariesList: vi.fn().mockResolvedValue([]) });
    await useAppStore.getState().removeLibraryRoot(ROOT.id);
    expect(useAppStore.getState().libraryRoots).toEqual([]);
  });

  it('detectLibraries stores offers', async () => {
    mockModelsApi();
    await useAppStore.getState().detectLibraries();
    expect(useAppStore.getState().detectedRoots).toEqual([
      { path: ROOT.path, layout_hint: 'comfyui' },
    ]);
  });

  it('scanLibraries refreshes the model list', async () => {
    mockModelsApi();
    await useAppStore.getState().scanLibraries();
    const api = (globalThis as any).window.electron.models;
    expect(api.scan).toHaveBeenCalled();
    expect(api.list).toHaveBeenCalled();
  });

  it('backend hiccup leaves existing state intact (local-first)', async () => {
    mockModelsApi({ librariesList: vi.fn().mockRejectedValue(new Error('down')) });
    useAppStore.setState({ libraryRoots: [ROOT] });
    await useAppStore.getState().loadLibraryRoots();
    expect(useAppStore.getState().libraryRoots).toEqual([ROOT]);
  });
});
