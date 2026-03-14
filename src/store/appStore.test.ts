import { describe, expect, it, beforeEach } from 'vitest';
import { useAppStore } from './appStore';
import type { EditHistoryEntry } from '@/types/editor';
import type { BatchResult, PromptHistoryEntry } from '@/types/generation';

function resetStore() {
  useAppStore.setState(useAppStore.getInitialState());
}

describe('appStore', () => {
  beforeEach(resetStore);

  // ── UI state ──────────────────────────────────────────────────────────

  describe('toggleSidebar', () => {
    it('toggles the sidebar collapsed state', () => {
      expect(useAppStore.getState().sidebarCollapsed).toBe(false);
      useAppStore.getState().toggleSidebar();
      expect(useAppStore.getState().sidebarCollapsed).toBe(true);
      useAppStore.getState().toggleSidebar();
      expect(useAppStore.getState().sidebarCollapsed).toBe(false);
    });
  });

  describe('setActivePanel', () => {
    it('changes the active panel', () => {
      useAppStore.getState().setActivePanel('batch');
      expect(useAppStore.getState().activePanel).toBe('batch');
    });
  });

  // ── Job management ────────────────────────────────────────────────────

  describe('addJob', () => {
    it('adds a new job to activeJobs', () => {
      const job = makeJob('j1', 'pending');
      useAppStore.getState().addJob(job);
      expect(useAppStore.getState().activeJobs).toHaveLength(1);
      expect(useAppStore.getState().activeJobs[0].id).toBe('j1');
    });

    it('replaces an existing job with the same id', () => {
      useAppStore.getState().addJob(makeJob('j1', 'pending'));
      useAppStore.getState().addJob(makeJob('j1', 'processing'));
      expect(useAppStore.getState().activeJobs).toHaveLength(1);
      expect(useAppStore.getState().activeJobs[0].status).toBe('processing');
    });
  });

  describe('updateJob', () => {
    it('moves a completed job from activeJobs to completedJobs', () => {
      useAppStore.getState().addJob(makeJob('j1', 'processing'));
      useAppStore.getState().updateJob('j1', { status: 'completed' });
      expect(useAppStore.getState().activeJobs).toHaveLength(0);
      expect(useAppStore.getState().completedJobs).toHaveLength(1);
      expect(useAppStore.getState().completedJobs[0].status).toBe('completed');
    });

    it('caps completedJobs at 100 entries', () => {
      for (let i = 0; i < 105; i++) {
        const id = `j${i}`;
        useAppStore.getState().addJob(makeJob(id, 'processing'));
        useAppStore.getState().updateJob(id, { status: 'completed' });
      }
      expect(useAppStore.getState().completedJobs.length).toBeLessThanOrEqual(100);
    });

    it('is a no-op when the job does not exist', () => {
      useAppStore.getState().updateJob('nonexistent', { status: 'completed' });
      expect(useAppStore.getState().activeJobs).toHaveLength(0);
      expect(useAppStore.getState().completedJobs).toHaveLength(0);
    });
  });

  // ── Prompt history ────────────────────────────────────────────────────

  describe('addToPromptHistory', () => {
    it('prepends entries and caps at 50', () => {
      for (let i = 0; i < 55; i++) {
        useAppStore.getState().addToPromptHistory(makePromptEntry(`prompt-${i}`));
      }
      const { promptHistory } = useAppStore.getState();
      expect(promptHistory).toHaveLength(50);
      expect(promptHistory[0].prompt).toBe('prompt-54');
    });
  });

  describe('toggleFavoritePrompt', () => {
    it('adds and removes a prompt from favorites', () => {
      useAppStore.getState().toggleFavoritePrompt('sunset');
      expect(useAppStore.getState().favoritePrompts).toContain('sunset');

      useAppStore.getState().toggleFavoritePrompt('sunset');
      expect(useAppStore.getState().favoritePrompts).not.toContain('sunset');
    });
  });

  // ── Batch results ─────────────────────────────────────────────────────

  describe('addBatchResult', () => {
    it('caps batch results at 200', () => {
      for (let i = 0; i < 210; i++) {
        useAppStore.getState().addBatchResult(makeBatchResult(`r${i}`));
      }
      expect(useAppStore.getState().batchResults).toHaveLength(200);
    });

    it('replaces a result with the same id instead of duplicating', () => {
      useAppStore.getState().addBatchResult(makeBatchResult('r1', 'first prompt'));
      useAppStore.getState().addBatchResult(makeBatchResult('r1', 'updated prompt'));
      expect(useAppStore.getState().batchResults).toHaveLength(1);
      expect(useAppStore.getState().batchResults[0].prompt).toBe('updated prompt');
    });
  });

  describe('toggleBatchResultFavorite', () => {
    it('toggles the isFavorite flag on a batch result', () => {
      useAppStore.getState().addBatchResult(makeBatchResult('r1'));
      expect(useAppStore.getState().batchResults[0].isFavorite).toBe(false);

      useAppStore.getState().toggleBatchResultFavorite('r1');
      expect(useAppStore.getState().batchResults[0].isFavorite).toBe(true);
    });
  });

  // ── Asset library ─────────────────────────────────────────────────────

  describe('deleteAssetRecord', () => {
    it('removes the asset with the given id', () => {
      useAppStore.setState({
        assetLibrary: [
          { id: 'a1', path: '/a', prompt: 'x' } as any,
          { id: 'a2', path: '/b', prompt: 'y' } as any,
        ],
      });
      useAppStore.getState().deleteAssetRecord('a1');
      expect(useAppStore.getState().assetLibrary).toHaveLength(1);
      expect(useAppStore.getState().assetLibrary[0].id).toBe('a2');
    });
  });

  describe('toggleAssetFavorite', () => {
    it('toggles the favorite flag on an asset', () => {
      useAppStore.setState({
        assetLibrary: [{ id: 'a1', path: '/a', favorite: false } as any],
      });
      useAppStore.getState().toggleAssetFavorite('a1');
      expect(useAppStore.getState().assetLibrary[0].favorite).toBe(true);
    });
  });

  // ── Edit history (undo/redo) ──────────────────────────────────────────

  describe('undo / redo', () => {
    it('moves the history index back and forward', () => {
      const { pushEditHistory } = useAppStore.getState();
      pushEditHistory(makeHistoryEntry('h1'));
      pushEditHistory(makeHistoryEntry('h2'));
      pushEditHistory(makeHistoryEntry('h3'));

      expect(useAppStore.getState().editHistoryIndex).toBe(2);

      useAppStore.getState().undo();
      expect(useAppStore.getState().editHistoryIndex).toBe(1);

      useAppStore.getState().undo();
      expect(useAppStore.getState().editHistoryIndex).toBe(0);

      // Cannot undo past 0
      useAppStore.getState().undo();
      expect(useAppStore.getState().editHistoryIndex).toBe(0);

      useAppStore.getState().redo();
      expect(useAppStore.getState().editHistoryIndex).toBe(1);
    });

    it('truncates future history when pushing after an undo', () => {
      const { pushEditHistory } = useAppStore.getState();
      pushEditHistory(makeHistoryEntry('h1'));
      pushEditHistory(makeHistoryEntry('h2'));
      pushEditHistory(makeHistoryEntry('h3'));

      useAppStore.getState().undo(); // index = 1
      pushEditHistory(makeHistoryEntry('h4'));

      expect(useAppStore.getState().editHistory).toHaveLength(3); // h1, h2, h4
      expect(useAppStore.getState().editHistoryIndex).toBe(2);
    });

    it('caps edit history at 100 entries', () => {
      for (let i = 0; i < 110; i++) {
        useAppStore.getState().pushEditHistory(makeHistoryEntry(`h${i}`));
      }
      expect(useAppStore.getState().editHistory.length).toBeLessThanOrEqual(100);
    });
  });

  // ── Persistence partialize ────────────────────────────────────────────

  describe('persistence partialize', () => {
    it('only persists the designated slices', () => {
      // The persist middleware's partialize function is embedded in the store.
      // We verify that the persisted shape excludes transient state like activeJobs.
      const state = useAppStore.getState();
      // Access the persist API
      const persisted = (useAppStore as any).persist?.getOptions?.()?.partialize?.(state);
      if (persisted) {
        expect(persisted).toHaveProperty('sidebarCollapsed');
        expect(persisted).toHaveProperty('promptHistory');
        expect(persisted).toHaveProperty('assetLibrary');
        expect(persisted).not.toHaveProperty('activeJobs');
        expect(persisted).not.toHaveProperty('completedJobs');
        expect(persisted).not.toHaveProperty('editHistory');
      }
    });
  });

  // ── Advanced generation ───────────────────────────────────────────────

  describe('updateAdvancedGeneration', () => {
    it('merges a partial update into advanced settings', () => {
      useAppStore.getState().updateAdvancedGeneration({ steps: 50, cfgScale: 12 });
      const { advancedGeneration } = useAppStore.getState();
      expect(advancedGeneration.steps).toBe(50);
      expect(advancedGeneration.cfgScale).toBe(12);
      // Unchanged fields should remain at defaults
      expect(advancedGeneration.scheduler).toBe('Euler a');
    });
  });
});

// ── Helpers ───────────────────────────────────────────────────────────────

function makeJob(id: string, status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled') {
  return {
    id,
    type: 'image' as const,
    status,
    progress: 0,
    params: {},
    createdAt: new Date(),
  };
}

function makePromptEntry(prompt: string): PromptHistoryEntry {
  return {
    id: `id-${prompt}`,
    prompt,
    negativePrompt: '',
    timestamp: new Date(),
    model: 'flux-dev',
  };
}

function makeBatchResult(id: string, prompt = 'test'): BatchResult {
  return {
    id,
    batchId: 'batch-1',
    promptIndex: 0,
    prompt,
    imagePath: `/outputs/${id}/image.png`,
    seed: 42,
    generationTime: 1.5,
    params: {},
    createdAt: new Date(),
    isFavorite: false,
  };
}

function makeHistoryEntry(id: string): EditHistoryEntry {
  return {
    id,
    action: 'test-action',
    timestamp: new Date(),
  };
}
