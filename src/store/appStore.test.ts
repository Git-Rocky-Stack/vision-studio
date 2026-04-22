import { describe, expect, it, beforeEach } from 'vitest';
import { useAppStore } from './appStore';
import {
  LEFT_DOCK_DEFAULT_WIDTH,
  LEFT_DOCK_MAX_WIDTH,
  LEFT_DOCK_MIN_WIDTH,
  RIGHT_DOCK_DUAL_DEFAULT_RATIOS,
  RIGHT_DOCK_TRIPLE_MIN_RATIO,
} from './layoutPreferences';
import type { EditHistoryEntry } from '@/types/editor';
import type { BatchResult, PromptHistoryEntry } from '@/types/generation';

function resetStore() {
  useAppStore.setState(useAppStore.getInitialState());
}

describe('appStore', () => {
  beforeEach(resetStore);

  // ── UI state ──────────────────────────────────────────────────────────

  // toggleSidebar removed -- NavBar is always narrow

  describe('setActiveTab', () => {
    it('changes the active tab', () => {
      useAppStore.getState().setActiveTab('canvas');
      expect(useAppStore.getState().activeTab).toBe('canvas');
    });

    it('sets default sub-mode when switching to generate', () => {
      useAppStore.getState().setActiveTab('generate');
      expect(useAppStore.getState().activeSubMode).toBe('generate');
    });

    it('sets default sub-mode when switching to story', () => {
      useAppStore.getState().setActiveTab('story');
      expect(useAppStore.getState().activeSubMode).toBe('storyboard');
    });

    it('sets sub-mode to null for tabs without sub-modes', () => {
      useAppStore.getState().setActiveTab('assets');
      expect(useAppStore.getState().activeSubMode).toBeNull();
    });
  });

  describe('center view', () => {
    it('defaults the center view to canvas', () => {
      expect(useAppStore.getState().centerView).toBe('canvas');
    });

    it('changes the center view', () => {
      useAppStore.getState().setCenterView('workflow');
      expect(useAppStore.getState().centerView).toBe('workflow');
    });
  });

  describe('active viewer item', () => {
    it('tracks the active viewer item for cross-dock selection', () => {
      expect(useAppStore.getState().activeViewerItemId).toBeNull();

      useAppStore.getState().setActiveViewerItemId('batch-result-1');

      expect(useAppStore.getState().activeViewerItemId).toBe('batch-result-1');
    });
  });

  describe('layout preferences', () => {
    it('clamps dock widths to supported bounds', () => {
      useAppStore.getState().setLeftDockWidth(LEFT_DOCK_MIN_WIDTH - 80);
      expect(useAppStore.getState().layoutPreferences.leftDockWidth).toBe(LEFT_DOCK_MIN_WIDTH);

      useAppStore.getState().setLeftDockWidth(LEFT_DOCK_MAX_WIDTH + 120);
      expect(useAppStore.getState().layoutPreferences.leftDockWidth).toBe(LEFT_DOCK_MAX_WIDTH);
    });

    it('normalizes right dock triple ratios and preserves minimum panel sizes', () => {
      useAppStore.getState().setRightDockTripleRatios([9, 0.01, 0.01]);

      const ratios = useAppStore.getState().layoutPreferences.rightDockTripleRatios;
      expect(ratios.reduce((sum, value) => sum + value, 0)).toBeCloseTo(1, 5);
      expect(Math.min(...ratios)).toBeGreaterThanOrEqual(RIGHT_DOCK_TRIPLE_MIN_RATIO);
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

    it('adds and moves a workflow graph node', () => {
      const node = useAppStore.getState().addWorkflowNode('image-generation-baseline', {
        classType: 'PreviewImage',
        label: 'Alt Preview',
        position: { x: 900, y: 120 },
        inputs: {},
      });

      expect(node.id).toMatch(/^node-/);

      useAppStore.getState().moveWorkflowNode('image-generation-baseline', node.id, { x: 940, y: 180 });
      const workflow = useAppStore
        .getState()
        .workflowRecords.find((record) => record.id === 'image-generation-baseline');

      expect(workflow?.graph.nodes[node.id].position).toEqual({ x: 940, y: 180 });
    });

    it('connects nodes and replaces an existing target input link', () => {
      const edge = useAppStore.getState().connectWorkflowNodes('image-generation-baseline', {
        sourceNodeId: 'prompt',
        sourceOutput: 'CONDITIONING',
        targetNodeId: 'sampler',
        targetInput: 'positive',
      });

      const workflow = useAppStore
        .getState()
        .workflowRecords.find((record) => record.id === 'image-generation-baseline');

      expect(edge.id).toMatch(/^edge-/);
      expect(
        workflow?.graph.edges.filter(
          (item) => item.targetNodeId === 'sampler' && item.targetInput === 'positive'
        )
      ).toHaveLength(1);
      expect(workflow?.graph.nodes.sampler.inputs.positive).toEqual({
        kind: 'link',
        nodeId: 'prompt',
        output: 'CONDITIONING',
      });
    });

    it('rejects invalid workflow graph connections', () => {
      const before = useAppStore.getState().workflowRecords.find(
        (record) => record.id === 'image-generation-baseline'
      );
      const edgeCountBefore = before?.graph.edges.length ?? 0;

      const result = useAppStore.getState().connectWorkflowNodes('image-generation-baseline', {
        sourceNodeId: 'prompt',
        sourceOutput: 'CONDITIONING',
        targetNodeId: 'prompt',
        targetInput: 'text',
      });

      expect(result).toBeNull();
      const after = useAppStore.getState().workflowRecords.find(
        (record) => record.id === 'image-generation-baseline'
      );
      expect(after?.graph.edges.length).toBe(edgeCountBefore);
    });

    it('deletes workflow graph nodes and removes connected edges', () => {
      useAppStore.getState().deleteWorkflowNode('image-generation-baseline', 'prompt');

      const workflow = useAppStore
        .getState()
        .workflowRecords.find((record) => record.id === 'image-generation-baseline');

      expect(workflow?.graph.nodes.prompt).toBeUndefined();
      expect(workflow?.graph.edges.some((edge) => edge.sourceNodeId === 'prompt')).toBe(false);
      expect(workflow?.graph.nodes.sampler.inputs.positive).toBeUndefined();
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
        expect(persisted).toHaveProperty('activeTab');
        expect(persisted).toHaveProperty('layoutPreferences');
        expect(persisted).toHaveProperty('promptHistory');
        expect(persisted).toHaveProperty('assetLibrary');
        expect(persisted).not.toHaveProperty('activeJobs');
        expect(persisted).not.toHaveProperty('completedJobs');
        expect(persisted).not.toHaveProperty('editHistory');
        expect(persisted.layoutPreferences).toEqual({
          leftDockWidth: LEFT_DOCK_DEFAULT_WIDTH,
          rightDockWidth: 360,
          rightDockCanvasRatios: [0.52, 0.48],
          rightDockDualRatios: [...RIGHT_DOCK_DUAL_DEFAULT_RATIOS],
          rightDockTripleRatios: [0.4, 0.32, 0.28],
        });
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

  // ── Navigation refactor ──────────────────────────────────────────────────

  describe('navigation refactor', () => {
    it('defaults activeTab to generate', () => {
      expect(useAppStore.getState().activeTab).toBe('generate');
    });

    it('defaults activeSubMode to generate', () => {
      expect(useAppStore.getState().activeSubMode).toBe('generate');
    });

    it('defaults centerView to canvas', () => {
      expect(useAppStore.getState().centerView).toBe('canvas');
    });

    it('setActiveTab changes the active tab', () => {
      useAppStore.getState().setActiveTab('canvas');
      expect(useAppStore.getState().activeTab).toBe('canvas');
    });

    it('setActiveSubMode changes the sub-mode', () => {
      useAppStore.getState().setActiveSubMode('quick');
      expect(useAppStore.getState().activeSubMode).toBe('quick');
    });

    it('setActiveTab sets default sub-mode for the new tab', () => {
      useAppStore.getState().setActiveTab('story');
      expect(useAppStore.getState().activeSubMode).toBe('storyboard');
    });

    it('setActiveTab sets sub-mode to null for tabs without sub-modes', () => {
      useAppStore.getState().setActiveTab('assets');
      expect(useAppStore.getState().activeSubMode).toBeNull();
    });

    it('setCenterView changes the center workspace view', () => {
      useAppStore.getState().setCenterView('workflow');
      expect(useAppStore.getState().centerView).toBe('workflow');
    });
  });

  // ── Resolution picker ──────────────────────────────────────────────────

  describe('resolution picker', () => {
    it('defaults aspect ratio to 1:1', () => {
      expect(useAppStore.getState().aspectRatio).toBe('1:1');
    });

    it('defaults resolution tier to ultra', () => {
      expect(useAppStore.getState().resolutionTier).toBe('ultra');
    });

    it('setAspectRatio changes the ratio', () => {
      useAppStore.getState().setAspectRatio('16:9');
      expect(useAppStore.getState().aspectRatio).toBe('16:9');
    });

    it('setResolutionTier changes the tier', () => {
      useAppStore.getState().setResolutionTier('standard');
      expect(useAppStore.getState().resolutionTier).toBe('standard');
    });
  });

  // ── Prompt Studio ───────────────────────────────────────────────────────

  describe('prompt studio', () => {
    it('defaults promptTemplates to >= 8 entries', () => {
      expect(useAppStore.getState().promptTemplates.length).toBeGreaterThanOrEqual(8);
    });

    it('defaults compositionLayers visibility to true', () => {
      const { compositionLayers } = useAppStore.getState();
      expect(compositionLayers.aspectFrame.visible).toBe(true);
      expect(compositionLayers.reference.visible).toBe(true);
      expect(compositionLayers.controlNet.visible).toBe(true);
      expect(compositionLayers.regionMasks.visible).toBe(true);
    });

    it('addUserPromptTemplate adds a template', () => {
      const before = useAppStore.getState().promptTemplates.length;
      useAppStore.getState().addUserPromptTemplate({
        id: 'user-1',
        name: 'My Template',
        description: 'A custom template',
        category: 'custom',
        promptText: 'test prompt',
        isBuiltIn: false,
        isFavorite: false,
        createdAt: Date.now(),
      });
      expect(useAppStore.getState().promptTemplates).toHaveLength(before + 1);
      expect(useAppStore.getState().promptTemplates.at(-1)!.id).toBe('user-1');
    });

    it('deleteUserPromptTemplate removes non-built-in only', () => {
      useAppStore.getState().addUserPromptTemplate({
        id: 'user-2',
        name: 'Custom',
        description: 'Delete me',
        category: 'custom',
        promptText: 'custom prompt',
        isBuiltIn: false,
        isFavorite: false,
        createdAt: Date.now(),
      });
      const builtInCount = useAppStore.getState().promptTemplates.filter((t) => t.isBuiltIn).length;
      useAppStore.getState().deleteUserPromptTemplate('user-2');
      expect(useAppStore.getState().promptTemplates.find((t) => t.id === 'user-2')).toBeUndefined();

      // Built-in templates are protected
      useAppStore.getState().deleteUserPromptTemplate('cinematic-portrait');
      expect(useAppStore.getState().promptTemplates.find((t) => t.id === 'cinematic-portrait')).toBeDefined();
      expect(useAppStore.getState().promptTemplates.filter((t) => t.isBuiltIn)).toHaveLength(builtInCount);
    });

    it('togglePromptTemplateFavorite toggles isFavorite', () => {
      const before = useAppStore.getState().promptTemplates.find((t) => t.id === 'cinematic-portrait')!.isFavorite;
      useAppStore.getState().togglePromptTemplateFavorite('cinematic-portrait');
      expect(useAppStore.getState().promptTemplates.find((t) => t.id === 'cinematic-portrait')!.isFavorite).toBe(!before);
      useAppStore.getState().togglePromptTemplateFavorite('cinematic-portrait');
      expect(useAppStore.getState().promptTemplates.find((t) => t.id === 'cinematic-portrait')!.isFavorite).toBe(before);
    });

    it('setCompositionLayerVisibility toggles a layer', () => {
      useAppStore.getState().setCompositionLayerVisibility('controlNet', false);
      expect(useAppStore.getState().compositionLayers.controlNet.visible).toBe(false);
      useAppStore.getState().setCompositionLayerVisibility('controlNet', true);
      expect(useAppStore.getState().compositionLayers.controlNet.visible).toBe(true);
    });

    it('setCompositionLayerOpacity sets opacity', () => {
      useAppStore.getState().setCompositionLayerOpacity('regionMasks', 0.3);
      expect(useAppStore.getState().compositionLayers.regionMasks.opacity).toBe(0.3);
    });
  });

  // ── Generation Preview ───────────────────────────────────────────────────

  describe('generation preview', () => {
    it('defaults to empty state', () => {
      const state = useAppStore.getState();
      expect(state.stepImages.size).toBe(0);
      expect(state.currentStep).toBe(0);
      expect(state.totalSteps).toBe(0);
      expect(state.isPreviewActive).toBe(false);
    });

    it('addStepImage adds a step', () => {
      useAppStore.getState().addStepImage(1, 'data:image/png;base64,abc');
      const state = useAppStore.getState();
      expect(state.stepImages.get(1)).toBe('data:image/png;base64,abc');
      expect(state.currentStep).toBe(1);
      expect(state.isPreviewActive).toBe(true);
    });

    it('addStepImage evicts oldest entries when cap exceeded', () => {
      for (let i = 0; i < 12; i++) {
        useAppStore.getState().addStepImage(i, `img-${i}`);
      }
      const state = useAppStore.getState();
      expect(state.stepImages.size).toBe(10);
      // Oldest entries (0, 1) should have been evicted
      expect(state.stepImages.has(0)).toBe(false);
      expect(state.stepImages.has(1)).toBe(false);
      expect(state.stepImages.has(2)).toBe(true);
    });

    it('clearPreview resets state', () => {
      useAppStore.getState().addStepImage(5, 'data');
      useAppStore.getState().setTotalSteps(20);
      useAppStore.getState().clearPreview();
      const state = useAppStore.getState();
      expect(state.stepImages.size).toBe(0);
      expect(state.currentStep).toBe(0);
      expect(state.totalSteps).toBe(0);
      expect(state.isPreviewActive).toBe(false);
    });

    it('setPreviewActive toggles', () => {
      useAppStore.getState().setPreviewActive(true);
      expect(useAppStore.getState().isPreviewActive).toBe(true);
      useAppStore.getState().setPreviewActive(false);
      expect(useAppStore.getState().isPreviewActive).toBe(false);
    });
  });

  // ── Iteration History ────────────────────────────────────────────────────

  describe('iteration history', () => {
    it('defaults to empty iteration state', () => {
      const state = useAppStore.getState();
      expect(state.iterationNodes.size).toBe(0);
      expect(state.iterationBranches).toHaveLength(0);
      expect(state.activeIterationId).toBeNull();
      expect(state.iterationView).toBe('panel');
      expect(state.iterationComparisonMode).toBe('side-by-side');
    });

    it('adds a root iteration', () => {
      const job = makeIterationJob('iter-1');
      useAppStore.getState().addIteration({ job, parentId: null, thumbnail: 'data:image/png;base64,abc' });
      expect(useAppStore.getState().iterationNodes.size).toBe(1);
      expect(useAppStore.getState().iterationBranches).toHaveLength(1);
      expect(useAppStore.getState().iterationBranches[0].rootNodeId).toBe('iter-1');
    });

    it('adds a child iteration (re-roll)', () => {
      const job1 = makeIterationJob('iter-1');
      useAppStore.getState().addIteration({ job: job1, parentId: null, thumbnail: 'thumb1' });
      const branchId = useAppStore.getState().iterationBranches[0].id;
      const job2 = makeIterationJob('iter-2');
      useAppStore.getState().addIteration({ job: job2, parentId: 'iter-1', thumbnail: 'thumb2', branchId });
      expect(useAppStore.getState().iterationNodes.get('iter-1')?.childrenIds).toContain('iter-2');
    });

    it('forks a new branch when re-rolling from a node with existing children', () => {
      const job1 = makeIterationJob('iter-1');
      useAppStore.getState().addIteration({ job: job1, parentId: null, thumbnail: 'thumb1' });
      const branchId = useAppStore.getState().iterationBranches[0].id;
      const job2 = makeIterationJob('iter-2');
      useAppStore.getState().addIteration({ job: job2, parentId: 'iter-1', thumbnail: 'thumb2', branchId });
      const job3 = makeIterationJob('iter-3');
      useAppStore.getState().forkIteration({ job: job3, parentId: 'iter-1', thumbnail: 'thumb3' });
      expect(useAppStore.getState().iterationBranches).toHaveLength(2);
    });

    it('pins and unpins an iteration', () => {
      const job = makeIterationJob('iter-1');
      useAppStore.getState().addIteration({ job, parentId: null, thumbnail: 'thumb1' });
      useAppStore.getState().pinIteration('iter-1');
      expect(useAppStore.getState().iterationNodes.get('iter-1')?.isPinned).toBe(true);
      useAppStore.getState().pinIteration('iter-1');
      expect(useAppStore.getState().iterationNodes.get('iter-1')?.isPinned).toBe(false);
    });

    it('sets iteration view and comparison mode', () => {
      useAppStore.getState().setIterationView('timeline');
      expect(useAppStore.getState().iterationView).toBe('timeline');
      useAppStore.getState().setIterationComparisonMode('grid');
      expect(useAppStore.getState().iterationComparisonMode).toBe('grid');
    });

    it('cleans up dangling childrenIds when deleting a branch', () => {
      const job1 = makeIterationJob('iter-1');
      useAppStore.getState().addIteration({ job: job1, parentId: null, thumbnail: 'thumb1' });
      const branch1Id = useAppStore.getState().iterationBranches[0].id;
      const job2 = makeIterationJob('iter-2');
      useAppStore.getState().addIteration({ job: job2, parentId: 'iter-1', thumbnail: 'thumb2', branchId: branch1Id });
      // Fork creates a new branch
      const job3 = makeIterationJob('iter-3');
      useAppStore.getState().forkIteration({ job: job3, parentId: 'iter-1', thumbnail: 'thumb3' });
      // iter-1 should have both iter-2 and iter-3 as children
      expect(useAppStore.getState().iterationNodes.get('iter-1')?.childrenIds).toContain('iter-2');
      expect(useAppStore.getState().iterationNodes.get('iter-1')?.childrenIds).toContain('iter-3');
      // Get the forked branch id
      const forkedBranchId = useAppStore.getState().iterationBranches.find(b => b.id !== branch1Id)?.id;
      // Delete the forked branch (containing iter-3)
      if (forkedBranchId) {
        useAppStore.getState().deleteIterationBranch(forkedBranchId);
      }
      // iter-1 should no longer reference iter-3 in childrenIds
      expect(useAppStore.getState().iterationNodes.get('iter-1')?.childrenIds).not.toContain('iter-3');
      // iter-2 should still be referenced
      expect(useAppStore.getState().iterationNodes.get('iter-1')?.childrenIds).toContain('iter-2');
    });
  });

  // ── Smart Collections ───────────────────────────────────────────────────

  describe('video generation', () => {
    it('defaults generationMode to image', () => {
      expect(useAppStore.getState().generationMode).toBe('image');
    });

    it('defaults start/end frame to null', () => {
      expect(useAppStore.getState().startFrameImage).toBeNull();
      expect(useAppStore.getState().endFrameImage).toBeNull();
    });

    it('setGenerationMode switches mode', () => {
      useAppStore.getState().setGenerationMode('video');
      expect(useAppStore.getState().generationMode).toBe('video');
    });

    it('setStartFrameImage stores the image', () => {
      useAppStore.getState().setStartFrameImage('data:image/png;base64,test');
      expect(useAppStore.getState().startFrameImage).toBe('data:image/png;base64,test');
    });

    it('setEndFrameImage stores and clears the image', () => {
      useAppStore.getState().setEndFrameImage('data:image/png;base64,test');
      expect(useAppStore.getState().endFrameImage).toBe('data:image/png;base64,test');
      useAppStore.getState().setEndFrameImage(null);
      expect(useAppStore.getState().endFrameImage).toBeNull();
    });
  });

  describe('smart collections', () => {
    it('defaults to empty collections state', () => {
      const state = useAppStore.getState();
      expect(state.collections).toHaveLength(0);
      expect(state.assetMetadata.size).toBe(0);
      expect(state.taggingMode).toBe('on-generation');
    });

    it('creates a manual collection', () => {
      useAppStore.getState().createCollection({ name: 'My Favorites', type: 'manual' });
      expect(useAppStore.getState().collections).toHaveLength(1);
      expect(useAppStore.getState().collections[0].name).toBe('My Favorites');
      expect(useAppStore.getState().collections[0].type).toBe('manual');
    });

    it('creates a smart collection with query', () => {
      useAppStore.getState().createCollection({
        name: 'Portraits',
        type: 'smart',
        smartQuery: { tags: ['portrait'], styleCategories: ['cinematic'] },
        isAutoGenerated: true,
      });
      const coll = useAppStore.getState().collections[0];
      expect(coll.smartQuery?.tags).toContain('portrait');
    });

    it('adds and removes assets from collection', () => {
      useAppStore.getState().createCollection({ name: 'Test', type: 'manual' });
      const collId = useAppStore.getState().collections[0].id;
      useAppStore.getState().addAssetToCollection(collId, 'asset-1');
      expect(useAppStore.getState().collections[0].assetIds).toContain('asset-1');
      useAppStore.getState().removeAssetFromCollection(collId, 'asset-1');
      expect(useAppStore.getState().collections[0].assetIds).not.toContain('asset-1');
    });

    it('changes tagging mode', () => {
      useAppStore.getState().setTaggingMode('off');
      expect(useAppStore.getState().taggingMode).toBe('off');
      useAppStore.getState().setTaggingMode('on-generation');
      expect(useAppStore.getState().taggingMode).toBe('on-generation');
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

function makeIterationJob(id: string) {
  return {
    id,
    type: 'image' as const,
    status: 'completed' as const,
    progress: 100,
    params: {},
    createdAt: new Date(),
  };
}
