import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  buildPersistedAppState,
  createMemoizedPartialize,
  migratePersistedAppState,
  PERSIST_VERSION,
  PERSISTED_SOURCE_KEYS,
  shouldExposeStoreGlobal,
  useAppStore,
  whenAppStoreHydrated,
} from './appStore';
import type { AppState } from './appStore.types';
import type { AssetRecord } from '@/types/assets';
import type { MediaAsset } from '@/types/media';
import type { PromptTemplate } from '@/types/promptStudio';
import { BUILT_IN_PROMPT_TEMPLATES } from '@/data/builtInTemplates';
import { isMediaPlaceholderPreview, toPreviewUrl } from '@/features/assets/assetRecords';

type PersistOptions = {
  partialize: (state: AppState) => unknown;
  merge: (persisted: unknown, current: AppState) => AppState;
  version: number;
};

function persistOptions(): PersistOptions {
  return (useAppStore as unknown as { persist: { getOptions: () => PersistOptions } }).persist.getOptions();
}

function videoAsset(): AssetRecord {
  const placeholder = toPreviewUrl('/outputs/job-v/video.mp4', { type: 'video', label: 'Video job-v' });
  return {
    id: 'job-v::/outputs/job-v/video.mp4',
    jobId: 'job-v',
    name: 'Video job-v',
    type: 'video',
    path: 'D:/Outputs/job-v/video.mp4',
    previewUrl: placeholder,
    thumbnail: placeholder,
    createdAt: '2026-01-01T00:00:00Z',
    prompt: 'a river',
    negativePrompt: '',
    favorite: false,
    params: {},
  };
}

describe('persisted slice memoization (#J4)', () => {
  beforeEach(() => {
    useAppStore.setState(useAppStore.getInitialState());
  });

  it('lists exactly the state fields the persisted slice is built from', () => {
    const read = new Set<string>();
    const state = useAppStore.getState();
    const tracking = new Proxy(state, {
      get(target, key, receiver) {
        if (typeof key === 'string') read.add(key);
        return Reflect.get(target, key, receiver);
      },
    });
    buildPersistedAppState(tracking);
    expect([...read].sort()).toEqual([...PERSISTED_SOURCE_KEYS].sort());
  });

  it('returns the same object until a persisted source changes', () => {
    const build = vi.fn(buildPersistedAppState);
    const partialize = createMemoizedPartialize(build);
    const first = partialize(useAppStore.getState());

    useAppStore.setState({ currentTime: 1234 });
    expect(partialize(useAppStore.getState())).toBe(first);

    useAppStore.setState({ activeTab: 'canvas' });
    expect(partialize(useAppStore.getState())).not.toBe(first);
    expect(build).toHaveBeenCalledTimes(2);
  });

  it('a 60fps playhead and job progress ticks never rebuild the slice or schedule a write', () => {
    const storage = (
      useAppStore as unknown as {
        persist: { getOptions: () => { storage: { flush: () => void; hasPending: () => boolean } } };
      }
    ).persist.getOptions().storage;
    useAppStore.getState().addJob({
      id: 'tick-job', type: 'image', status: 'processing', progress: 0, params: {}, createdAt: new Date(),
    });
    storage.flush();
    const write = vi.spyOn(globalThis.localStorage ?? { setItem: () => undefined }, 'setItem');

    for (let frame = 0; frame < 1000; frame++) {
      useAppStore.setState({ currentTime: frame * 16.7 });
      useAppStore.getState().updateJob('tick-job', { progress: frame / 10 });
    }

    // Neither field is persisted: the memoized slice is the object the storage
    // already holds, so nothing is queued, serialized or written.
    expect(storage.hasPending()).toBe(false);
    storage.flush();
    expect(write).not.toHaveBeenCalled();
    write.mockRestore();

    // A persisted change still lands.
    useAppStore.setState({ activeTab: 'assets' });
    expect(storage.hasPending()).toBe(true);
    storage.flush();
  });
});

describe('persist version + migrate (#J3/#J12/#J17)', () => {
  it('drops the dead fields, the asset placeholders and the dead composition layers', () => {
    const legacy = {
      activeTab: 'generate',
      darkMode: true,
      recentProjects: [],
      generationMode: 'image',
      migrationStatus: 'idle',
      assetLibrary: [videoAsset()],
      compositionLayers: {
        aspectFrame: { visible: true, opacity: 1 },
        reference: { visible: true, opacity: 1, blendMode: 'normal' },
        controlNet: { visible: true, opacity: 0.7 },
        regionMasks: { visible: true, opacity: 0.5 },
      },
    };
    const migrated = migratePersistedAppState(legacy, 0) as Record<string, unknown>;

    for (const dead of ['darkMode', 'recentProjects', 'generationMode', 'migrationStatus']) {
      expect(migrated).not.toHaveProperty(dead);
    }
    const [asset] = migrated.assetLibrary as AssetRecord[];
    expect(asset.previewUrl).toBe('');
    expect(asset.thumbnail).toBe('');
    expect(Object.keys(migrated.compositionLayers as object).sort()).toEqual(['aspectFrame', 'reference']);
    expect(legacy).toHaveProperty('darkMode'); // the input is not mutated
  });

  it('is at the current version', () => {
    expect(persistOptions().version).toBe(PERSIST_VERSION);
    expect(PERSIST_VERSION).toBe(2);
  });
});

describe('asset placeholders are a display artefact, not persisted data (#J3)', () => {
  beforeEach(() => {
    useAppStore.setState(useAppStore.getInitialState());
  });

  it('persists video assets without the placeholder SVGs and rebuilds them on load', () => {
    const media: MediaAsset = {
      id: 'media::v',
      name: 'Clip',
      type: 'video',
      source: 'generated',
      path: 'D:/v.mp4',
      previewUrl: 'D:/v.mp4',
      thumbnailUrl: toPreviewUrl('D:/v.mp4', { type: 'video', label: 'Clip' }),
      posterUrl: toPreviewUrl('D:/v.mp4', { type: 'video', label: 'Clip' }),
      metadata: {},
      createdAt: '2026-01-01T00:00:00Z',
    };
    useAppStore.setState({ assetLibrary: [videoAsset()], mediaAssets: [media] });

    const persisted = buildPersistedAppState(useAppStore.getState());
    expect(JSON.stringify(persisted)).not.toContain('data:image/svg+xml');
    expect(persisted.mediaAssets[0].previewUrl).toBe('D:/v.mp4');

    const merged = persistOptions().merge(JSON.parse(JSON.stringify(persisted)), useAppStore.getInitialState());
    expect(isMediaPlaceholderPreview(merged.assetLibrary[0].thumbnail)).toBe(true);
    expect(merged.assetLibrary[0].previewUrl).toBe(videoAsset().previewUrl);
    expect(isMediaPlaceholderPreview(merged.mediaAssets[0].thumbnailUrl)).toBe(true);
    expect(isMediaPlaceholderPreview(merged.mediaAssets[0].posterUrl)).toBe(true);
  });

  it('merges a first run (nothing stored) over the defaults', () => {
    const merged = persistOptions().merge(undefined, useAppStore.getInitialState());
    expect(merged.activeTab).toBe(useAppStore.getInitialState().activeTab);
  });
});

describe('built-in prompt templates refresh on load (#J16)', () => {
  it('replaces stored built-ins with the shipped catalog and keeps user templates and favorites', () => {
    const [first, ...rest] = BUILT_IN_PROMPT_TEMPLATES;
    const staleBuiltIn: PromptTemplate = {
      ...first,
      promptText: 'stale, (weighted:1.3) syntax',
      suggestedSettings: { ...first.suggestedSettings, model: 'sd-xl' },
      isFavorite: true,
      lastUsedAt: 123,
    };
    const retired: PromptTemplate = { ...first, id: 'retired-built-in', isBuiltIn: true };
    const mine: PromptTemplate = { ...first, id: 'user-1', name: 'Mine', isBuiltIn: false, promptText: 'my words' };

    const merged = persistOptions().merge(
      { promptTemplates: [staleBuiltIn, retired, mine] },
      useAppStore.getInitialState(),
    );

    const refreshed = merged.promptTemplates.find((t) => t.id === first.id)!;
    expect(refreshed.promptText).toBe(first.promptText);
    expect(refreshed.suggestedSettings).toEqual(first.suggestedSettings);
    expect(refreshed.isFavorite).toBe(true);
    expect(refreshed.lastUsedAt).toBe(123);
    expect(merged.promptTemplates.some((t) => t.id === 'retired-built-in')).toBe(false);
    expect(merged.promptTemplates.filter((t) => t.isBuiltIn).map((t) => t.id)).toEqual(
      BUILT_IN_PROMPT_TEMPLATES.map((t) => t.id),
    );
    expect(merged.promptTemplates.find((t) => t.id === 'user-1')).toEqual(mine);
    expect(rest.length).toBeGreaterThan(0);
  });
});

describe('store global exposure (#J13)', () => {
  it('exposes the store only in dev, an E2E harness build, or under automation', () => {
    expect(shouldExposeStoreGlobal({ DEV: false }, { webdriver: false })).toBe(false);
    expect(shouldExposeStoreGlobal({ DEV: false }, undefined)).toBe(false);
    expect(shouldExposeStoreGlobal({ DEV: true }, { webdriver: false })).toBe(true);
    expect(shouldExposeStoreGlobal({ DEV: false, VITE_E2E_STORE: '1' }, { webdriver: false })).toBe(true);
    expect(shouldExposeStoreGlobal({ DEV: false }, { webdriver: true })).toBe(true);
  });
});

describe('hydration gate', () => {
  it('settles for the synchronous test storage', async () => {
    await expect(whenAppStoreHydrated(50)).resolves.toBeUndefined();
  });
});

describe('iteration thumbnails load in the browser after a restart', () => {
  it('upgrades a legacy backend-relative thumbnail on load and keeps URLs as stored', () => {
    const node = (id: string, thumbnail: string) => [
      id,
      {
        id,
        parentId: null,
        branchId: 'b1',
        childrenIds: [],
        generationJob: { id, type: 'image', status: 'completed', progress: 100, params: {}, createdAt: 0 },
        thumbnail,
        settingsDiff: null,
        createdAt: 0,
        isPinned: false,
        note: '',
      },
    ];
    const merged = persistOptions().merge(
      {
        iterationNodes: [
          node('legacy', '/outputs/legacy/generated.png'),
          node('current', 'http://localhost:8000/outputs/current/generated.png'),
        ],
      },
      useAppStore.getInitialState(),
    );
    expect(merged.iterationNodes.get('legacy')?.thumbnail).toBe('http://localhost:8000/outputs/legacy/generated.png');
    expect(merged.iterationNodes.get('current')?.thumbnail).toBe('http://localhost:8000/outputs/current/generated.png');
  });
});
