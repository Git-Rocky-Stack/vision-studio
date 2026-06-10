import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAppStore } from '../appStore';
import type { LibraryRoot, SearchResponse, SearchResult } from '@/types/model';

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

function makeSearchResult(overrides: Partial<SearchResult> = {}): SearchResult {
  return {
    id: 'hf:stabilityai/sdxl-base',
    source: 'huggingface',
    name: 'sdxl-base',
    repo_id: 'stabilityai/sdxl-base',
    tier: 'verified',
    tier_reason: 'curated',
    artifact_type: 'checkpoint',
    base_architecture: 'sdxl',
    capability: 'image',
    downloads: 1000,
    likes: 50,
    author: 'stabilityai',
    license: 'openrail++',
    gated: false,
    nsfw: false,
    format: 'safetensors',
    trust_remote_code: false,
    size: '6.9 GB',
    tags: ['diffusers'],
    ...overrides,
  };
}

function makeSearchResponse(overrides: Partial<SearchResponse> = {}): SearchResponse {
  return {
    source: 'hf',
    query: 'sdxl',
    page: 1,
    results: [makeSearchResult()],
    offline: false,
    warning: null,
    ...overrides,
  };
}

describe('modelsSlice hub search actions', () => {
  beforeEach(() => {
    useAppStore.setState({
      searchResults: [],
      searchStatus: 'idle',
      searchQuery: '',
      searchSource: 'hf',
      searchPage: 1,
      searchWarning: null,
      nsfwOptIn: false,
    });
  });

  it('searchModels transitions loading -> ready and stores results', async () => {
    const search = vi.fn().mockImplementation(() => {
      // The loading state must be visible while the IPC call is in flight.
      expect(useAppStore.getState().searchStatus).toBe('loading');
      return Promise.resolve(makeSearchResponse());
    });
    mockModelsApi({ search });

    await useAppStore.getState().searchModels('sdxl', 'hf');

    const state = useAppStore.getState();
    expect(state.searchStatus).toBe('ready');
    expect(state.searchResults).toEqual([makeSearchResult()]);
    expect(state.searchQuery).toBe('sdxl');
    expect(state.searchSource).toBe('hf');
    expect(state.searchPage).toBe(1);
    expect(state.searchWarning).toBeNull();
  });

  it('searchModels transitions loading -> offline with the warning surfaced', async () => {
    const search = vi.fn().mockResolvedValue(
      makeSearchResponse({ results: [], offline: true, warning: 'Model search failed' }),
    );
    mockModelsApi({ search });

    await useAppStore.getState().searchModels('sdxl', 'hf');

    const state = useAppStore.getState();
    expect(state.searchStatus).toBe('offline');
    expect(state.searchResults).toEqual([]);
    expect(state.searchWarning).toBe('Model search failed');
  });

  it('nsfw opt-in defaults to false and is forwarded as false for civitai', async () => {
    const search = vi.fn().mockResolvedValue(makeSearchResponse({ source: 'civitai' }));
    mockModelsApi({ search });

    expect(useAppStore.getState().nsfwOptIn).toBe(false);
    await useAppStore.getState().searchModels('anything', 'civitai');
    expect(search).toHaveBeenCalledWith('anything', 'civitai', 1, false);
  });

  it('setNsfwOptIn(true) forwards nsfw=true for civitai but never for hf', async () => {
    const search = vi.fn().mockResolvedValue(makeSearchResponse());
    mockModelsApi({ search });

    useAppStore.getState().setNsfwOptIn(true);
    expect(useAppStore.getState().nsfwOptIn).toBe(true);

    await useAppStore.getState().searchModels('anything', 'civitai', 2);
    expect(search).toHaveBeenCalledWith('anything', 'civitai', 2, true);

    await useAppStore.getState().searchModels('anything', 'hf');
    expect(search).toHaveBeenLastCalledWith('anything', 'hf', 1, false);
  });

  it('a second search replaces results rather than appending', async () => {
    const first = makeSearchResult();
    const second = makeSearchResult({ id: 'civitai:123', source: 'civitai', name: 'other' });
    const search = vi
      .fn()
      .mockResolvedValueOnce(makeSearchResponse({ results: [first] }))
      .mockResolvedValueOnce(makeSearchResponse({ results: [second] }));
    mockModelsApi({ search });

    await useAppStore.getState().searchModels('sdxl', 'hf');
    expect(useAppStore.getState().searchResults).toEqual([first]);

    await useAppStore.getState().searchModels('other', 'hf');
    expect(useAppStore.getState().searchResults).toEqual([second]);
  });
});

describe('modelsSlice consent + convert actions', () => {
  it('grantConsent forwards args and returns the backend envelope', async () => {
    const consent = vi
      .fn()
      .mockResolvedValue({ model_id: 'm1', pickle: true, trust_remote_code: false });
    mockModelsApi({ consent });

    const state = await useAppStore.getState().grantConsent('m1', 'pickle', true);
    expect(consent).toHaveBeenCalledWith('m1', 'pickle', true);
    expect(state).toEqual({ model_id: 'm1', pickle: true, trust_remote_code: false });
  });

  it('grantConsent surfaces bridge failures instead of swallowing them', async () => {
    // Deliberate deviation from the local-first swallow pattern: a consent
    // grant that did not persist must never be silently lost.
    mockModelsApi({ consent: vi.fn().mockRejectedValue(new Error('bridge down')) });

    await expect(
      useAppStore.getState().grantConsent('m1', 'pickle', true),
    ).rejects.toThrow('bridge down');
  });

  it('convertModel forwards the id and surfaces failures', async () => {
    const convert = vi.fn().mockResolvedValue({
      model_id: 'm1',
      safetensors_path: 'C:\\models\\m1.safetensors',
      tensor_count: 7,
    });
    mockModelsApi({ convert });

    const result = await useAppStore.getState().convertModel('m1');
    expect(convert).toHaveBeenCalledWith('m1');
    expect(result).toMatchObject({ tensor_count: 7 });

    mockModelsApi({ convert: vi.fn().mockRejectedValue(new Error('bridge down')) });
    await expect(useAppStore.getState().convertModel('m1')).rejects.toThrow('bridge down');
  });
});
