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

  describe('workbench view', () => {
    it('defaults the workbench view to canvas', () => {
      expect(useAppStore.getState().activeWorkbenchView).toBe('canvas');
    });

    it('changes the active workbench view', () => {
      useAppStore.getState().setActiveWorkbenchView('workflow');
      expect(useAppStore.getState().activeWorkbenchView).toBe('workflow');
    });

    it('tracks the active viewer item for cross-dock selection', () => {
      expect(useAppStore.getState().activeViewerItemId).toBeNull();

      useAppStore.getState().setActiveViewerItemId('batch-result-1');

      expect(useAppStore.getState().activeViewerItemId).toBe('batch-result-1');
    });
  });

  describe('workflow records', () => {
    it('defaults to a baseline workflow record', () => {
      const state = useAppStore.getState();

      expect(state.activeWorkflowId).toBe('image-generation-baseline');
      expect(state.workflowRecords.map((workflow) => workflow.id)).toContain('image-generation-baseline');
      expect(state.workflowRecords[0].steps.map((step) => step.label)).toEqual([
        'Prompt',
        'Model',
        'Generate',
        'Review',
        'Save',
      ]);
    });

    it('seeds workflow records with user-facing metadata', () => {
      const workflow = useAppStore.getState().workflowRecords[0] as any;

      expect(workflow.description).toBe('Reusable text-to-image pass for current prompt and reference context.');
      expect(workflow.tags).toEqual(['image', 'baseline']);
      expect(workflow.notes).toBe('Use this path before branching accepted output into Viewer, Boards, or Gallery.');
    });

    it('seeds default workflows with editable graph nodes and edges', () => {
      const workflow = useAppStore.getState().workflowRecords[0];

      expect(Object.keys(workflow.graph.nodes)).toEqual([
        'prompt',
        'model',
        'sampler',
        'preview',
        'save',
      ]);
      expect(workflow.graph.nodes.prompt.classType).toBe('CLIPTextEncode');
      expect(workflow.graph.nodes.sampler.inputs.model).toEqual({
        kind: 'link',
        nodeId: 'model',
        output: 'MODEL',
      });
      expect(workflow.graph.edges).toContainEqual({
        id: 'edge-model-sampler-model',
        sourceNodeId: 'model',
        sourceOutput: 'MODEL',
        targetNodeId: 'sampler',
        targetInput: 'model',
      });
    });

    it('changes the active workflow', () => {
      useAppStore.getState().setActiveWorkflow('storyboard-frame');

      expect(useAppStore.getState().activeWorkflowId).toBe('storyboard-frame');
    });

    it('does not change the active workflow for an unknown id', () => {
      useAppStore.getState().setActiveWorkflow('missing-workflow');

      expect(useAppStore.getState().activeWorkflowId).toBe('image-generation-baseline');
    });

    it('creates and selects a new draft workflow', () => {
      const workflow = useAppStore.getState().createWorkflow('Product pass');
      const state = useAppStore.getState();

      expect(workflow.name).toBe('Product pass');
      expect(workflow.status).toBe('draft');
      expect(state.workflowRecords).toContainEqual(workflow);
      expect(state.activeWorkflowId).toBe(workflow.id);
    });

    it('creates draft workflows with empty metadata', () => {
      const workflow = useAppStore.getState().createWorkflow('Product pass') as any;

      expect(workflow.description).toBe('');
      expect(workflow.tags).toEqual([]);
      expect(workflow.notes).toBe('');
    });

    it('creates draft workflows with cloned editable graph state', () => {
      const workflow = useAppStore.getState().createWorkflow('Product pass');

      expect(workflow.graph).toBeDefined();
      expect(workflow.graph.nodes.prompt).toBeDefined();
      expect(workflow.graph.nodes.prompt).not.toBe(
        useAppStore.getState().workflowRecords[0].graph.nodes.prompt
      );
    });

    it('records a workflow run and updates the output summary', () => {
      useAppStore.getState().recordWorkflowRun('image-generation-baseline', {
        id: 'run-1',
        status: 'complete',
        summary: 'Generated 2 images',
        createdAt: '2026-04-17T12:00:00.000Z',
      });

      const workflow = useAppStore
        .getState()
        .workflowRecords.find((record) => record.id === 'image-generation-baseline');

      expect(workflow?.runHistory).toHaveLength(1);
      expect(workflow?.runHistory[0].summary).toBe('Generated 2 images');
      expect(workflow?.runOutputSummary).toBe('Generated 2 images');
    });

    it('caps workflow run history at 10 entries', () => {
      for (let index = 0; index < 12; index++) {
        useAppStore.getState().recordWorkflowRun('image-generation-baseline', {
          id: `run-${index}`,
          status: 'complete',
          summary: `Run ${index}`,
          createdAt: `2026-04-17T12:${String(index).padStart(2, '0')}:00.000Z`,
        });
      }

      const workflow = useAppStore
        .getState()
        .workflowRecords.find((record) => record.id === 'image-generation-baseline');

      expect(workflow?.runHistory).toHaveLength(10);
      expect(workflow?.runHistory[0].summary).toBe('Run 11');
      expect(workflow?.runHistory.at(-1)?.summary).toBe('Run 2');
    });

    it('ignores run records for an unknown workflow id', () => {
      useAppStore.getState().recordWorkflowRun('missing-workflow', {
        id: 'run-1',
        status: 'complete',
        summary: 'Should not be stored',
        createdAt: '2026-04-17T12:00:00.000Z',
      });

      expect(useAppStore.getState().workflowRecords.every((workflow) => workflow.runHistory.length === 0)).toBe(
        true
      );
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

  describe('addScene', () => {
    it('honors an explicit initial scene status', () => {
      const project = useAppStore.getState().createProject('Migration target');

      const scene = useAppStore.getState().addScene(project.id, {
        name: 'Migrated output',
        status: 'complete',
      });

      const storedProject = useAppStore.getState().projects.find((item) => item.id === project.id);
      expect(scene.status).toBe('complete');
      expect(storedProject?.scenes[0].status).toBe('complete');
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
