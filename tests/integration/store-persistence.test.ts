/**
 * Integration tests: Zustand store persistence
 *
 * These tests verify that the persist middleware correctly serializes and
 * deserializes state, enforces size caps on persisted collections, and
 * handles storage unavailability gracefully.
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { useAppStore } from '@/store/appStore';
import type { PromptHistoryEntry, BatchResult, StylePreset } from '@/types/generation';
import type { AssetRecord } from '@/types/assets';

function resetStore() {
  useAppStore.setState(useAppStore.getInitialState());
}

/**
 * The persist middleware's `partialize`, which every test below depends on.
 *
 * These call sites used to read the accessor and `return` early when it came
 * back undefined. That turned a zustand API change into eight green tests that
 * asserted nothing - the suite would report full persistence coverage while
 * verifying none of it. An unreachable accessor is a failure, so throw.
 */
/**
 * Reads a persisted collection, refusing to compare the length of something
 * that is not there.
 *
 * `persisted.promptHistory.length` read `unknown` until tests/ was brought
 * under a tsconfig (tsconfig.tests.json), and a partialize that stopped
 * persisting the key entirely would have failed with "cannot read properties
 * of undefined" rather than naming the defect. This narrows for the compiler
 * and names it for the reader.
 */
function persistedArray(persisted: Record<string, unknown>, key: string): unknown[] {
  const value = persisted[key];
  if (!Array.isArray(value)) {
    throw new Error(
      `persisted.${key} is ${value === undefined ? 'absent' : `a ${typeof value}`}, not an array - ` +
        'partialize no longer persists this collection, so its size cap is untested.'
    );
  }
  return value;
}

function getPartialize(): (state: unknown) => Record<string, unknown> {
  const partialize = (useAppStore as any).persist?.getOptions?.()?.partialize;
  if (typeof partialize !== 'function') {
    throw new Error(
      'zustand persist partialize is unreachable - the persist API shape changed. ' +
        'Fix this accessor; do not let the persistence tests pass vacuously.'
    );
  }
  return partialize;
}

describe('store persistence partialize', () => {
  beforeEach(resetStore);

  it('only persists the designated slices', () => {
    const partialize = getPartialize();

    const state = useAppStore.getState();
    const persisted = partialize(state);

    // Included
    expect(persisted).toHaveProperty('activeTab');
    expect(persisted).toHaveProperty('activeSubMode');
    expect(persisted).toHaveProperty('centerView');
    expect(persisted).toHaveProperty('darkMode');
    expect(persisted).toHaveProperty('recentProjects');
    expect(persisted).toHaveProperty('projects');
    expect(persisted).toHaveProperty('activeProjectId');
    expect(persisted).toHaveProperty('activeSceneId');
    expect(persisted).toHaveProperty('promptHistory');
    expect(persisted).toHaveProperty('favoritePrompts');
    expect(persisted).toHaveProperty('customStylePresets');
    expect(persisted).toHaveProperty('userTemplates');
    expect(persisted).toHaveProperty('batchResults');
    expect(persisted).toHaveProperty('assetLibrary');
    expect(persisted).toHaveProperty('assetMetadata');

    // Excluded (transient state)
    expect(persisted).not.toHaveProperty('activeJobs');
    expect(persisted).not.toHaveProperty('completedJobs');
    expect(persisted).not.toHaveProperty('generationQueue');
    expect(persisted).not.toHaveProperty('editHistory');
    expect(persisted).not.toHaveProperty('editHistoryIndex');
    expect(persisted).not.toHaveProperty('currentImage');
    expect(persisted).not.toHaveProperty('imageAdjustments');
    expect(persisted).not.toHaveProperty('activeEditTool');
    expect(persisted).not.toHaveProperty('editLayers');
    expect(persisted).not.toHaveProperty('systemInfo');
    expect(persisted).not.toHaveProperty('availableModels');
    expect(persisted).not.toHaveProperty('advancedGeneration');
    expect(persisted).not.toHaveProperty('comparisonMode');
    expect(persisted).not.toHaveProperty('comparisonImages');
    expect(persisted).not.toHaveProperty('generationDraft');
  });
});

describe('persistence caps', () => {
  beforeEach(resetStore);

  it('caps promptHistory at 50 items in persisted state', () => {
    const partialize = getPartialize();

    // Add 60 entries
    for (let i = 0; i < 60; i++) {
      useAppStore.getState().addToPromptHistory(makePromptEntry(`p-${i}`));
    }

    const persisted = partialize(useAppStore.getState());
    expect(persistedArray(persisted, 'promptHistory').length).toBeLessThanOrEqual(50);
  });

  it('caps batchResults at 200 items in persisted state', () => {
    const partialize = getPartialize();

    for (let i = 0; i < 210; i++) {
      useAppStore.getState().addBatchResult(makeBatchResult(`br-${i}`));
    }

    const persisted = partialize(useAppStore.getState());
    expect(persistedArray(persisted, 'batchResults').length).toBeLessThanOrEqual(200);
  });

  it('caps assetLibrary at 500 items in persisted state', () => {
    const partialize = getPartialize();

    // Directly inject 510 assets (bypassing upsert for speed)
    const assets: AssetRecord[] = Array.from({ length: 510 }, (_, i) => ({
      id: `asset-${i}`,
      jobId: `job-${i}`,
      name: `image_${i}.png`,
      type: 'image' as const,
      path: `/outputs/job-${i}/image.png`,
      previewUrl: `http://localhost:8000/outputs/job-${i}/image.png`,
      thumbnail: `http://localhost:8000/outputs/job-${i}/image.png`,
      createdAt: new Date().toISOString(),
      prompt: `test prompt ${i}`,
      negativePrompt: '',
      favorite: false,
      params: {},
    }));

    useAppStore.setState({ assetLibrary: assets });

    const persisted = partialize(useAppStore.getState());
    expect(persistedArray(persisted, 'assetLibrary').length).toBeLessThanOrEqual(500);
  });
});

describe('persistence serialization round-trip', () => {
  beforeEach(resetStore);

  it('serializes and deserializes promptHistory without data loss', () => {
    const partialize = getPartialize();

    useAppStore.getState().addToPromptHistory({
      id: 'ph-1',
      prompt: 'a cinematic sunset over the ocean',
      negativePrompt: 'blurry, low quality',
      timestamp: new Date('2026-03-13T10:00:00Z'),
      model: 'flux-dev',
      result: '/outputs/thumb.png',
    });

    const persisted = partialize(useAppStore.getState());
    const serialized = JSON.stringify(persisted);
    const deserialized = JSON.parse(serialized);

    expect(deserialized.promptHistory).toHaveLength(1);
    expect(deserialized.promptHistory[0].prompt).toBe('a cinematic sunset over the ocean');
    expect(deserialized.promptHistory[0].negativePrompt).toBe('blurry, low quality');
    expect(deserialized.promptHistory[0].model).toBe('flux-dev');
  });

  it('serializes and deserializes customStylePresets without data loss', () => {
    const partialize = getPartialize();

    const preset: StylePreset = {
      id: 'custom-1',
      name: 'My Style',
      modifier: 'golden hour, warm tones',
      color: '#f4a261',
      category: 'artistic',
      isCustom: true,
    };
    useAppStore.getState().addCustomStylePreset(preset);

    const persisted = partialize(useAppStore.getState());
    const roundTripped = JSON.parse(JSON.stringify(persisted));

    expect(roundTripped.customStylePresets).toHaveLength(1);
    expect(roundTripped.customStylePresets[0]).toEqual(preset);
  });

  it('serializes and deserializes batchResults including Date fields', () => {
    const partialize = getPartialize();

    useAppStore.getState().addBatchResult({
      id: 'br-1',
      batchId: 'batch-1',
      promptIndex: 0,
      prompt: 'test',
      imagePath: '/outputs/br-1/image.png',
      seed: 42,
      generationTime: 3.5,
      params: { width: 1024, height: 1024 },
      createdAt: new Date('2026-03-13T10:00:00Z'),
      isFavorite: true,
    });

    const persisted = partialize(useAppStore.getState());
    const roundTripped = JSON.parse(JSON.stringify(persisted));

    expect(roundTripped.batchResults).toHaveLength(1);
    expect(roundTripped.batchResults[0].prompt).toBe('test');
    expect(roundTripped.batchResults[0].isFavorite).toBe(true);
    expect(roundTripped.batchResults[0].seed).toBe(42);
  });

  it('serializes and deserializes assetLibrary with all metadata', () => {
    const partialize = getPartialize();

    const asset: AssetRecord = {
      id: 'a-1',
      jobId: 'job-1',
      name: 'image_001.png',
      type: 'image',
      path: 'D:/Outputs/job-1/image_001.png',
      previewUrl: 'http://localhost:8000/outputs/job-1/image_001.png',
      thumbnail: 'http://localhost:8000/outputs/job-1/image_001.png',
      createdAt: '2026-03-13T10:00:00.000Z',
      prompt: 'sunset portrait',
      negativePrompt: 'blurry',
      model: 'flux-dev',
      width: 1024,
      height: 1024,
      seed: 42,
      favorite: true,
      params: { steps: 25, cfg_scale: 7.5 },
    };

    useAppStore.setState({ assetLibrary: [asset] });

    const persisted = partialize(useAppStore.getState());
    const roundTripped = JSON.parse(JSON.stringify(persisted));

    const rt = roundTripped.assetLibrary[0];
    expect(rt.id).toBe('a-1');
    expect(rt.path).toBe('D:/Outputs/job-1/image_001.png');
    expect(rt.model).toBe('flux-dev');
    expect(rt.width).toBe(1024);
    expect(rt.seed).toBe(42);
    expect(rt.favorite).toBe(true);
    expect(rt.params).toEqual({ steps: 25, cfg_scale: 7.5 });
  });
});

describe('store storage key', () => {
  it('uses the expected localStorage key', () => {
    // Zustand 5 persist API: options are on the persist object directly
    const persistApi = (useAppStore as any).persist;
    const name =
      persistApi?.getOptions?.()?.name ??  // zustand 4 API
      persistApi?.options?.name;            // fallback: direct access
    // If NEITHER accessor resolves, that is a failure, not a pass. This used to
    // fall back to `expect(true).toBe(true)`, so a zustand API change would have
    // turned the test green while it verified nothing at all.
    expect(name).toBe('vision-studio-storage');
  });
});

// ── Helpers ────────────────────────────────────────────────────────────────

function makePromptEntry(prompt: string): PromptHistoryEntry {
  return {
    id: `id-${prompt}`,
    prompt,
    negativePrompt: '',
    timestamp: new Date(),
    model: 'flux-dev',
  };
}

function makeBatchResult(id: string): BatchResult {
  return {
    id,
    batchId: 'batch-1',
    promptIndex: 0,
    prompt: 'test',
    imagePath: `/outputs/${id}/image.png`,
    seed: 42,
    generationTime: 1.5,
    params: {},
    createdAt: new Date(),
    isFavorite: false,
  };
}
