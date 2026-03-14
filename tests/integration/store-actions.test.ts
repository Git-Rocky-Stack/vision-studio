/**
 * Integration tests: Zustand store action interactions
 *
 * These tests verify multi-step store workflows where several actions
 * interact — e.g., generating a job → completing it → syncing assets,
 * or editing layers → undo → redo → push new history.
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { useAppStore } from '@/store/appStore';
import type { AssetJobStatus } from '@/types/assets';

function resetStore() {
  useAppStore.setState(useAppStore.getInitialState());
}

describe('generation → completion → asset sync workflow', () => {
  beforeEach(resetStore);

  it('tracks a job from pending through completed and creates an asset record', () => {
    const { addJob, updateJob, syncAssetsFromJobStatus } = useAppStore.getState();

    // 1. Job starts pending
    addJob({
      id: 'j1',
      type: 'image',
      status: 'pending',
      progress: 0,
      params: { prompt: 'test' },
      createdAt: new Date(),
    });
    expect(useAppStore.getState().activeJobs).toHaveLength(1);

    // 2. Job moves to processing
    updateJob('j1', { status: 'processing', progress: 50 });
    expect(useAppStore.getState().activeJobs).toHaveLength(1);
    expect(useAppStore.getState().activeJobs[0].progress).toBe(50);

    // 3. Job completes → moves to completedJobs
    updateJob('j1', {
      status: 'completed',
      progress: 100,
      result: {
        images: ['/outputs/j1/image_001.png'],
        seed: 42,
      },
    });
    expect(useAppStore.getState().activeJobs).toHaveLength(0);
    expect(useAppStore.getState().completedJobs).toHaveLength(1);

    // 4. Sync asset from job status
    const jobStatus: AssetJobStatus = {
      job_id: 'j1',
      status: 'completed',
      type: 'image',
      created_at: new Date().toISOString(),
      result: {
        images: ['/outputs/j1/image_001.png'],
        seed: 42,
      },
      params: {
        prompt: 'test',
        width: 1024,
        height: 1024,
        model: 'flux-dev',
      },
    };
    syncAssetsFromJobStatus(jobStatus);

    expect(useAppStore.getState().assetLibrary).toHaveLength(1);
    expect(useAppStore.getState().assetLibrary[0].prompt).toBe('test');
    expect(useAppStore.getState().assetLibrary[0].seed).toBe(42);
  });

  it('handles a failed job without creating an asset', () => {
    const { addJob, updateJob, syncAssetsFromJobStatus } = useAppStore.getState();

    addJob({
      id: 'j2',
      type: 'image',
      status: 'pending',
      progress: 0,
      params: { prompt: 'fail test' },
      createdAt: new Date(),
    });

    updateJob('j2', { status: 'failed', error: 'Out of VRAM' });

    expect(useAppStore.getState().activeJobs).toHaveLength(0);
    expect(useAppStore.getState().completedJobs).toHaveLength(1);
    expect(useAppStore.getState().completedJobs[0].error).toBe('Out of VRAM');

    // Syncing a failed job should not create assets (no images in result)
    syncAssetsFromJobStatus({
      job_id: 'j2',
      status: 'failed',
      type: 'image',
      created_at: new Date().toISOString(),
      error: 'Out of VRAM',
    });
    expect(useAppStore.getState().assetLibrary).toHaveLength(0);
  });
});

describe('batch result → favorite → delete workflow', () => {
  beforeEach(resetStore);

  it('adds results, favorites one, then removes a subset', () => {
    const store = useAppStore.getState();

    // Add 3 results
    for (let i = 1; i <= 3; i++) {
      store.addBatchResult({
        id: `r${i}`,
        batchId: 'batch-1',
        promptIndex: i - 1,
        prompt: `prompt ${i}`,
        imagePath: `/outputs/r${i}/image.png`,
        seed: i * 10,
        generationTime: 2,
        params: {},
        createdAt: new Date(),
        isFavorite: false,
      });
    }

    expect(useAppStore.getState().batchResults).toHaveLength(3);

    // Favorite r2
    useAppStore.getState().toggleBatchResultFavorite('r2');
    const r2 = useAppStore.getState().batchResults.find((r) => r.id === 'r2');
    expect(r2?.isFavorite).toBe(true);

    // Remove r1 and r3
    useAppStore.getState().removeBatchResults(['r1', 'r3']);
    expect(useAppStore.getState().batchResults).toHaveLength(1);
    expect(useAppStore.getState().batchResults[0].id).toBe('r2');
    expect(useAppStore.getState().batchResults[0].isFavorite).toBe(true);
  });
});

describe('asset management → delete by path workflow', () => {
  beforeEach(resetStore);

  it('removes assets matching specific paths', () => {
    useAppStore.setState({
      assetLibrary: [
        makeAsset('a1', 'D:/Outputs/job-1/image_001.png'),
        makeAsset('a2', 'D:/Outputs/job-2/image_001.png'),
        makeAsset('a3', 'D:/Outputs/job-3/image_001.png'),
      ],
    });

    useAppStore.getState().removeAssetRecordsByPaths([
      'D:/Outputs/job-1/image_001.png',
      'D:/Outputs/job-3/image_001.png',
    ]);

    expect(useAppStore.getState().assetLibrary).toHaveLength(1);
    expect(useAppStore.getState().assetLibrary[0].id).toBe('a2');
  });

  it('normalizes backslashes when matching paths', () => {
    useAppStore.setState({
      assetLibrary: [
        makeAsset('a1', 'D:\\Outputs\\job-1\\image.png'),
      ],
    });

    useAppStore.getState().removeAssetRecordsByPaths([
      'D:/Outputs/job-1/image.png',
    ]);

    expect(useAppStore.getState().assetLibrary).toHaveLength(0);
  });
});

describe('asset management → remove by output root', () => {
  beforeEach(resetStore);

  it('removes all assets under a managed output root', () => {
    useAppStore.setState({
      assetLibrary: [
        makeAsset('a1', 'D:/VisionStudio/Outputs/job-1/image.png'),
        makeAsset('a2', 'D:/VisionStudio/Outputs/job-2/image.png'),
        makeAsset('a3', 'C:/Other/job-3/image.png'),
      ],
    });

    useAppStore.getState().removeAssetsByRoot('D:/VisionStudio/Outputs');

    const remaining = useAppStore.getState().assetLibrary;
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe('a3');
  });
});

describe('edit history branch workflow', () => {
  beforeEach(resetStore);

  it('truncates future history when a new action is pushed after undo', () => {
    const { pushEditHistory, undo } = useAppStore.getState();

    pushEditHistory(makeHistoryEntry('h1', 'draw'));
    pushEditHistory(makeHistoryEntry('h2', 'crop'));
    pushEditHistory(makeHistoryEntry('h3', 'filter'));

    // Undo twice → index at 0 (h1)
    undo();
    undo();
    expect(useAppStore.getState().editHistoryIndex).toBe(0);

    // Push new action → h2 and h3 should be gone
    useAppStore.getState().pushEditHistory(makeHistoryEntry('h4', 'text'));

    const { editHistory, editHistoryIndex } = useAppStore.getState();
    expect(editHistory).toHaveLength(2); // h1, h4
    expect(editHistory[0].id).toBe('h1');
    expect(editHistory[1].id).toBe('h4');
    expect(editHistoryIndex).toBe(1);
  });

  it('setCurrentImage resets edit state completely', () => {
    const { pushEditHistory, setCurrentImage } = useAppStore.getState();

    pushEditHistory(makeHistoryEntry('h1', 'draw'));
    pushEditHistory(makeHistoryEntry('h2', 'crop'));

    setCurrentImage('http://localhost:8000/outputs/j1/image.png', 'D:/Outputs/j1/image.png');

    const state = useAppStore.getState();
    expect(state.currentImage).toBe('http://localhost:8000/outputs/j1/image.png');
    expect(state.currentImageAssetPath).toBe('D:/Outputs/j1/image.png');
    expect(state.editHistory).toHaveLength(0);
    expect(state.editHistoryIndex).toBe(-1);
    expect(state.editLayers).toHaveLength(1); // base image layer
    expect(state.editLayers[0].type).toBe('image');
  });
});

describe('template CRUD workflow', () => {
  beforeEach(resetStore);

  it('adds, updates, and deletes a user template', () => {
    useAppStore.getState().addUserTemplate({
      id: 't1',
      name: 'My Template',
      description: 'Test template',
      category: 'art',
      thumbnail: '🎨',
      settings: {
        width: 1024,
        height: 1024,
        model: 'flux-dev',
        steps: 25,
        cfgScale: 7.5,
        prompt: 'test',
        negativePrompt: '',
      },
      isCustom: true,
    });

    expect(useAppStore.getState().userTemplates).toHaveLength(1);

    // Update
    useAppStore.getState().updateUserTemplate('t1', { name: 'Updated Template' });
    expect(useAppStore.getState().userTemplates[0].name).toBe('Updated Template');

    // Delete
    useAppStore.getState().deleteUserTemplate('t1');
    expect(useAppStore.getState().userTemplates).toHaveLength(0);
  });
});

// ── Helpers ────────────────────────────────────────────────────────────────

function makeAsset(id: string, path: string): any {
  return {
    id,
    jobId: `job-${id}`,
    name: 'image.png',
    type: 'image',
    path,
    previewUrl: `http://localhost:8000${path}`,
    thumbnail: `http://localhost:8000${path}`,
    createdAt: new Date().toISOString(),
    prompt: 'test',
    negativePrompt: '',
    favorite: false,
    params: {},
  };
}

function makeHistoryEntry(id: string, action: string) {
  return { id, action, timestamp: new Date() };
}
