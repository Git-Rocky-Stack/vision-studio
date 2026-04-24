import { describe, expect, it, beforeEach } from 'vitest';
import { useAppStore } from './appStore';
import {
  DEFAULT_COLLAPSED_GENERATE_SECTIONS,
  DEFAULT_REVIEW_DENSITY,
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

    it('tracks curated collapsed generate sections', () => {
      expect(useAppStore.getState().layoutPreferences.collapsedGenerateSections).toEqual(
        DEFAULT_COLLAPSED_GENERATE_SECTIONS,
      );

      useAppStore.getState().setGenerateSectionCollapsed('advanced', false);
      expect(useAppStore.getState().layoutPreferences.collapsedGenerateSections).toEqual([]);

      useAppStore.getState().setGenerateSectionCollapsed('reference-inputs', true);

      expect(useAppStore.getState().layoutPreferences.collapsedGenerateSections).toEqual([
        'reference-inputs',
      ]);
    });

    it('persists the shared review density preference', () => {
      expect(useAppStore.getState().layoutPreferences.reviewDensity).toBe(DEFAULT_REVIEW_DENSITY);

      useAppStore.getState().setReviewDensity('compact');

      expect(useAppStore.getState().layoutPreferences.reviewDensity).toBe('compact');
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

    it('tracks transient workflow runtime state outside persisted workflow records', () => {
      const state = useAppStore.getState();

      state.setWorkflowRuntimeState('image-generation-baseline', {
        issues: [{ severity: 'error', code: 'missing-prompt', message: 'Prompt is required.' }],
        activeJobId: 'job-1',
      });

      expect(useAppStore.getState().workflowRuntimeById['image-generation-baseline']?.activeJobId).toBe(
        'job-1'
      );

      const persisted = (useAppStore as any).persist?.getOptions?.()?.partialize?.(useAppStore.getState());
      expect(persisted).not.toHaveProperty('workflowRuntimeById');
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

    it('does not mirror timeline-native jobs into the iteration tree', () => {
      useAppStore.getState().addJob({
        ...makeJob('timeline-job-1', 'processing'),
        type: 'video',
        params: {
          source: 'timeline',
          prompt: 'timeline variant',
        },
      });

      useAppStore.getState().updateJob('timeline-job-1', {
        status: 'completed',
        result: {
          video: '/outputs/timeline-job-1/shot.mp4',
        },
      });

      expect(useAppStore.getState().completedJobs).toHaveLength(1);
      expect(useAppStore.getState().iterationNodes.size).toBe(0);
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
        expect(persisted).toHaveProperty('mediaAssets');
        expect(persisted).toHaveProperty('storyboardImportDrafts');
        expect(persisted).toHaveProperty('referenceSets');
        expect(persisted).toHaveProperty('timelineSequences');
        expect(persisted).toHaveProperty('timelineTracks');
        expect(persisted).toHaveProperty('timelineClips');
        expect(persisted).toHaveProperty('clipGenerationBindings');
        expect(persisted).not.toHaveProperty('activeJobs');
        expect(persisted).not.toHaveProperty('completedJobs');
        expect(persisted).not.toHaveProperty('editHistory');
        expect(persisted.layoutPreferences).toEqual({
          collapsedGenerateSections: DEFAULT_COLLAPSED_GENERATE_SECTIONS,
          leftDockWidth: LEFT_DOCK_DEFAULT_WIDTH,
          rightDockWidth: 360,
          rightDockCanvasRatios: [0.52, 0.48],
          rightDockDualRatios: [...RIGHT_DOCK_DUAL_DEFAULT_RATIOS],
          rightDockTripleRatios: [0.4, 0.32, 0.28],
          reviewDensity: DEFAULT_REVIEW_DENSITY,
        });
      }
    });

    it('normalizes persisted storyboard state that predates elements and canvas control layers', () => {
      const merge = (useAppStore as any).persist?.getOptions?.()?.merge;
      expect(typeof merge).toBe('function');

      const currentState = useAppStore.getInitialState();
      const merged = merge(
        {
          projects: [
            {
              id: 'project-1',
              name: 'Legacy Project',
              created: '2026-04-23T00:00:00.000Z',
              modified: '2026-04-23T00:00:00.000Z',
              dimensions: { width: 1024, height: 1024 },
              fps: 24,
              timelineSequenceId: null,
              referenceSetIds: [],
              characters: [],
              scenes: [
                {
                  id: 'scene-1',
                  orderIndex: 0,
                  name: 'Legacy Scene',
                  prompt: '',
                  negativePrompt: '',
                  generationConfig: {
                    model: 'stable-diffusion-xl',
                    steps: 25,
                    cfgScale: 7.5,
                    scheduler: 'euler_a',
                    seed: -1,
                    width: 1024,
                    height: 1024,
                    clipSkip: 1,
                    lora: [],
                    controlNet: [],
                  },
                  referenceImages: [],
                  timelineClipIds: [],
                  frames: [],
                  regionLocks: [],
                  transitions: { type: 'cut', duration: 0 },
                  camera: [],
                  metadata: {
                    created: '2026-04-23T00:00:00.000Z',
                    modified: '2026-04-23T00:00:00.000Z',
                    duration: 0,
                    fps: 24,
                    notes: '',
                  },
                  status: 'draft',
                  characterRefs: [],
                },
              ],
              metadata: {},
            },
          ],
        },
        currentState,
      );

      expect(merged.projects[0].elements).toEqual([]);
      expect(merged.projects[0].scenes[0].elementIds).toEqual([]);
      expect(merged.projects[0].scenes[0].shotBeats).toEqual([]);
      expect(merged.projects[0].scenes[0].canvasControlLayers).toEqual([]);
      expect(merged.projects[0].scenes[0].activeCanvasControlLayerId).toBeNull();
      expect(merged.storyboardImportDrafts).toEqual([]);
      expect(merged.activeStoryboardImportDraftId).toBeNull();
    });

    it('normalizes persisted storyboard import drafts and active selection', () => {
      const merge = (useAppStore as any).persist?.getOptions?.()?.merge;
      expect(typeof merge).toBe('function');

      const currentState = useAppStore.getInitialState();
      const merged = merge(
        {
          storyboardImportDrafts: [
            {
              id: 'draft-1',
              projectId: 'project-1',
              title: 'Opening Act',
              sourceText: 'INT. CONTROL ROOM - NIGHT',
              sceneDrafts: [
                {
                  id: 'scene-draft-1',
                  name: 'Scene 1',
                  summary: 'A tense opening.',
                  promptSeed: 'control room at night',
                  notes: '',
                  orderIndex: 0,
                  elementCandidateIds: ['element-draft-1'],
                  shotBeats: [
                    {
                      id: 'beat-1',
                      summary: 'Console lights flicker.',
                      promptSeed: 'neon control room close-up',
                      notes: '',
                      orderIndex: 0,
                      durationMs: 1800,
                      elementIds: [],
                      metadata: {},
                    },
                  ],
                  accepted: true,
                  metadata: {},
                },
              ],
              elementDrafts: [
                {
                  id: 'element-draft-1',
                  type: 'location',
                  name: 'Control Room',
                  aliases: ['Bridge'],
                  description: 'Primary command center.',
                  tags: ['sci-fi'],
                  continuityNotes: '',
                  referenceSetIds: [],
                  heroMediaAssetId: null,
                  color: '#123456',
                  mergeTargetElementId: null,
                  accepted: true,
                  metadata: {},
                },
              ],
              issues: [],
              status: 'reviewing',
              createdAt: '2026-04-23T00:00:00.000Z',
              updatedAt: '2026-04-23T00:00:00.000Z',
              metadata: {},
            },
          ],
          activeStoryboardImportDraftId: 'draft-1',
        },
        currentState,
      );

      expect(merged.storyboardImportDrafts).toHaveLength(1);
      expect(merged.storyboardImportDrafts[0].sceneDrafts[0].shotBeats).toHaveLength(1);
      expect(merged.activeStoryboardImportDraftId).toBe('draft-1');
    });

    it('normalizes persisted timeline clips that predate storyboard derivation metadata', () => {
      const merge = (useAppStore as any).persist?.getOptions?.()?.merge;
      expect(typeof merge).toBe('function');

      const currentState = useAppStore.getInitialState();
      const merged = merge(
        {
          timelineTracks: [
            {
              id: 'track-1',
              sequenceId: 'sequence-1',
              kind: 'audio',
              name: 'Legacy Audio',
              clipIds: ['clip-1'],
              orderIndex: 0,
              locked: false,
              muted: false,
              hidden: false,
            },
          ],
          timelineClips: [
            {
              id: 'clip-1',
              trackId: 'track-1',
              mediaAssetId: 'media-1',
              sceneId: 'scene-1',
              startMs: 0,
              durationMs: 2000,
              sourceInMs: 0,
              sourceOutMs: 2000,
              transitionIn: null,
              transitionOut: null,
              gain: undefined,
              fadeInMs: undefined,
              fadeOutMs: undefined,
              label: 'Legacy Clip',
              posterUrl: null,
              referenceSetIds: [],
              generationBindingId: null,
              createdAt: '2026-04-23T00:00:00.000Z',
              updatedAt: '2026-04-23T00:00:00.000Z',
            },
          ],
        },
        currentState,
      );

      expect(merged.timelineTracks).toHaveLength(1);
      expect(merged.timelineTracks[0].solo).toBe(false);
      expect(merged.timelineClips).toHaveLength(1);
      expect(merged.timelineClips[0].gain).toBe(1);
      expect(merged.timelineClips[0].fadeInMs).toBe(0);
      expect(merged.timelineClips[0].fadeOutMs).toBe(0);
      expect(merged.timelineClips[0].storyboardDerived).toBe(false);
      expect(merged.timelineClips[0].storyboardBeatMarkers).toEqual([]);
      expect(merged.timelineClips[0].storyboardDerivedAt).toBeNull();
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
    it('creates projects with no attached timeline sequence by default', () => {
      const project = useAppStore.getState().createProject('Timeline target');

      expect(project.timelineSequenceId).toBeNull();
      expect(project.referenceSetIds).toEqual([]);
      expect(project.elements).toEqual([]);
    });

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

    it('creates scenes with an empty timeline clip adapter list', () => {
      const project = useAppStore.getState().createProject('Timeline target');
      const scene = useAppStore.getState().addScene(project.id, { name: 'Scene 1' });

      expect(scene.timelineClipIds).toEqual([]);
      expect(scene.referenceSetIds).toEqual([]);
      expect(scene.canvasControlLayers).toEqual([]);
      expect(scene.activeCanvasControlLayerId).toBeNull();
      expect(scene.elementIds).toEqual([]);
      expect(scene.shotBeats).toEqual([]);
    });

    it('syncs scene reference adapters when a scoped reference set is attached', () => {
      const project = useAppStore.getState().createProject('Reference target');
      const scene = useAppStore.getState().addScene(project.id, { name: 'Scene 1' });

      const referenceSet = useAppStore.getState().createReferenceSet({
        name: 'Shot refs',
        scope: 'scene',
        projectId: project.id,
        sceneId: scene.id,
        items: [
          {
            id: 'shot-ref-1',
            slot: 'composition',
            path: 'C:/vision-studio-output/refs/shot.png',
            label: 'Shot reference',
            orderIndex: 0,
          },
        ],
      });

      const storedScene = useAppStore
        .getState()
        .projects.find((item) => item.id === project.id)
        ?.scenes.find((item) => item.id === scene.id);

      expect(storedScene?.referenceSetIds).toContain(referenceSet.id);
      expect(storedScene?.referenceImages).toEqual([
        expect.objectContaining({
          id: 'shot-ref-1',
          path: 'C:/vision-studio-output/refs/shot.png',
          type: 'composition',
          referenceSetId: referenceSet.id,
        }),
      ]);
    });

    it('links project elements to reference sets and prunes stale links when the set is deleted', () => {
      const project = useAppStore.getState().createProject('Reference target');
      const scene = useAppStore.getState().addScene(project.id, {
        name: 'Scene 1',
        elementIds: ['element-character-1'],
      });

      useAppStore.setState((state) => ({
        projects: state.projects.map((item) =>
          item.id !== project.id
            ? item
            : {
                ...item,
                elements: [
                  {
                    id: 'element-character-1',
                    projectId: project.id,
                    type: 'character',
                    name: 'Captain Nova',
                    aliases: [],
                    description: '',
                    tags: [],
                    continuityNotes: '',
                    referenceSetIds: [],
                    heroMediaAssetId: null,
                    status: 'approved',
                    color: '#e63946',
                    metadata: {},
                  },
                ],
              },
        ),
      }));

      const referenceSet = useAppStore.getState().createReferenceSet({
        name: 'Scene refs',
        scope: 'scene',
        projectId: project.id,
        sceneId: scene.id,
        items: [
          {
            id: 'shot-ref-1',
            slot: 'character',
            path: 'C:/vision-studio-output/refs/character.png',
            label: 'Captain Nova turn',
            orderIndex: 0,
          },
        ],
      });

      useAppStore
        .getState()
        .setElementReferenceSetLink(project.id, 'element-character-1', referenceSet.id, true);

      let storedProject = useAppStore.getState().projects.find((item) => item.id === project.id);
      expect(storedProject?.elements?.[0]?.referenceSetIds).toContain(referenceSet.id);

      useAppStore.getState().deleteReferenceSet(referenceSet.id);

      storedProject = useAppStore.getState().projects.find((item) => item.id === project.id);
      expect(storedProject?.elements?.[0]?.referenceSetIds).toEqual([]);
    });
  });

  describe('canvas control layers', () => {
    function seedScene() {
      const state = useAppStore.getState();
      const project = state.createProject('Canvas controls');
      const scene = state.addScene(project.id, { name: 'Shot 1' });

      return { projectId: project.id, sceneId: scene.id };
    }

    function getStoredScene(projectId: string, sceneId: string) {
      return useAppStore
        .getState()
        .projects.find((project) => project.id === projectId)
        ?.scenes.find((scene) => scene.id === sceneId);
    }

    it('creates and selects a canvas control layer', () => {
      const { projectId, sceneId } = seedScene();

      const layer = useAppStore.getState().createCanvasControlLayer(sceneId, {
        type: 'controlnet',
        name: 'Pose guide',
        opacity: 0.65,
      });

      const storedScene = getStoredScene(projectId, sceneId);
      expect(layer).not.toBeNull();
      expect(storedScene?.canvasControlLayers).toHaveLength(1);
      expect(storedScene?.canvasControlLayers[0]).toEqual(
        expect.objectContaining({
          id: layer?.id,
          sceneId,
          name: 'Pose guide',
          type: 'controlnet',
          opacity: 0.65,
          visible: true,
        }),
      );
      expect(storedScene?.activeCanvasControlLayerId).toBe(layer?.id);
    });

    it('updates, duplicates, reorders, and deletes canvas control layers', () => {
      const { projectId, sceneId } = seedScene();
      const first = useAppStore.getState().createCanvasControlLayer(sceneId, {
        type: 'controlnet',
        name: 'First',
      })!;
      const second = useAppStore.getState().createCanvasControlLayer(sceneId, {
        type: 'reference-image',
        name: 'Second',
      })!;

      useAppStore.getState().updateCanvasControlLayer(sceneId, first.id, {
        opacity: 0.4,
        sourcePath: 'C:/vision-studio-output/refs/pose.png',
      });

      let storedScene = getStoredScene(projectId, sceneId);
      expect(storedScene?.canvasControlLayers.find((layer) => layer.id === first.id)).toEqual(
        expect.objectContaining({
          opacity: 0.4,
          sourcePath: 'C:/vision-studio-output/refs/pose.png',
        }),
      );

      const duplicate = useAppStore.getState().duplicateCanvasControlLayer(sceneId, first.id);
      storedScene = getStoredScene(projectId, sceneId);
      expect(duplicate).not.toBeNull();
      expect(duplicate?.id).not.toBe(first.id);
      expect(duplicate?.sceneId).toBe(sceneId);
      expect(storedScene?.activeCanvasControlLayerId).toBe(duplicate?.id);

      useAppStore.getState().reorderCanvasControlLayers(sceneId, [
        second.id,
        duplicate!.id,
        first.id,
      ]);

      storedScene = getStoredScene(projectId, sceneId);
      expect(storedScene?.canvasControlLayers.map((layer) => layer.id)).toEqual([
        second.id,
        duplicate!.id,
        first.id,
      ]);

      useAppStore.getState().deleteCanvasControlLayer(sceneId, duplicate!.id);

      storedScene = getStoredScene(projectId, sceneId);
      expect(storedScene?.canvasControlLayers.map((layer) => layer.id)).toEqual([
        second.id,
        first.id,
      ]);
      expect(storedScene?.activeCanvasControlLayerId).toBe(first.id);
    });

    it('duplicates scenes with remapped canvas control layer ids', () => {
      const { projectId, sceneId } = seedScene();
      const layer = useAppStore.getState().createCanvasControlLayer(sceneId, {
        type: 'controlnet',
        name: 'Pose guide',
      })!;

      useAppStore.getState().setActiveCanvasControlLayerId(sceneId, layer.id);
      const duplicatedScene = useAppStore.getState().duplicateScene(projectId, sceneId);

      expect(duplicatedScene).toBeDefined();
      expect(duplicatedScene?.id).not.toBe(sceneId);
      expect(duplicatedScene?.canvasControlLayers).toHaveLength(1);
      expect(duplicatedScene?.canvasControlLayers[0].id).not.toBe(layer.id);
      expect(duplicatedScene?.canvasControlLayers[0].sceneId).toBe(duplicatedScene?.id);
      expect(duplicatedScene?.activeCanvasControlLayerId).toBe(
        duplicatedScene?.canvasControlLayers[0].id,
      );
    });
  });

  describe('storyboard import drafts', () => {
    it('upserts, selects, and deletes storyboard import drafts', () => {
      const project = useAppStore.getState().createProject('Draft target');

      const firstDraft = useAppStore.getState().upsertStoryboardImportDraft({
        id: 'draft-1',
        projectId: project.id,
        title: 'Draft One',
        sourceText: 'INT. WAREHOUSE - NIGHT',
        sceneDrafts: [],
        elementDrafts: [],
        issues: [],
        status: 'draft',
        createdAt: '2026-04-23T00:00:00.000Z',
        updatedAt: '2026-04-23T00:00:00.000Z',
        metadata: {},
      });

      expect(useAppStore.getState().storyboardImportDrafts).toHaveLength(1);
      expect(useAppStore.getState().activeStoryboardImportDraftId).toBe(firstDraft.id);

      useAppStore.getState().upsertStoryboardImportDraft({
        ...firstDraft,
        title: 'Draft One Updated',
      });

      expect(useAppStore.getState().storyboardImportDrafts).toHaveLength(1);
      expect(useAppStore.getState().storyboardImportDrafts[0].title).toBe('Draft One Updated');

      useAppStore.getState().setActiveStoryboardImportDraft('draft-1');
      expect(useAppStore.getState().activeStoryboardImportDraftId).toBe('draft-1');

      useAppStore.getState().deleteStoryboardImportDraft('draft-1');
      expect(useAppStore.getState().storyboardImportDrafts).toEqual([]);
      expect(useAppStore.getState().activeStoryboardImportDraftId).toBeNull();
    });

    it('creates a storyboard import draft from raw text using the active project context', () => {
      const project = useAppStore.getState().createProject('Draft target');

      const draft = useAppStore.getState().createStoryboardImportDraftFromText(
        project.id,
        `
INT. CONTROL ROOM - NIGHT
- Captain Nova scans the console.

CAPTAIN NOVA
We only get one pass at this.
        `,
        {
          title: 'Control Room Import',
        },
      );

      expect(draft).not.toBeNull();
      expect(draft?.title).toBe('Control Room Import');
      expect(draft?.projectId).toBe(project.id);
      expect(draft?.sceneDrafts).toHaveLength(1);
      expect(draft?.elementDrafts.some((candidate) => candidate.name === 'Captain Nova')).toBe(true);
      expect(useAppStore.getState().activeStoryboardImportDraftId).toBe(draft?.id ?? null);
    });

    it('commits approved storyboard import drafts into appended scenes and project elements', () => {
      const project = useAppStore.getState().createProject('Draft target');
      const existingScene = useAppStore.getState().addScene(project.id, {
        name: 'Existing Scene',
        prompt: 'legacy prompt',
      });

      useAppStore.setState((state) => ({
        projects: state.projects.map((item) =>
          item.id !== project.id
            ? item
            : {
                ...item,
                elements: [
                  {
                    id: 'element-existing-character',
                    projectId: project.id,
                    type: 'character',
                    name: 'Captain Nova',
                    aliases: [],
                    description: '',
                    tags: ['lead'],
                    continuityNotes: '',
                    referenceSetIds: [],
                    heroMediaAssetId: null,
                    status: 'approved',
                    color: '#e63946',
                    metadata: {},
                  },
                ],
              },
        ),
      }));

      useAppStore.getState().upsertStoryboardImportDraft({
        id: 'draft-commit-1',
        projectId: project.id,
        title: 'Control Room Import',
        sourceText: 'INT. CONTROL ROOM - NIGHT',
        status: 'approved',
        createdAt: '2026-04-23T00:00:00.000Z',
        updatedAt: '2026-04-23T00:00:00.000Z',
        metadata: {},
        issues: [],
        elementDrafts: [
          {
            id: 'candidate-character-1',
            type: 'character',
            name: 'Captain Nova',
            aliases: ['Nova'],
            description: 'Lead pilot.',
            tags: ['captain'],
            continuityNotes: 'Always wears the flight jacket.',
            referenceSetIds: [],
            heroMediaAssetId: null,
            color: '#e63946',
            mergeTargetElementId: 'element-existing-character',
            accepted: true,
            metadata: {},
          },
          {
            id: 'candidate-location-1',
            type: 'location',
            name: 'Control Room',
            aliases: [],
            description: 'Command deck at night.',
            tags: ['interior'],
            continuityNotes: '',
            referenceSetIds: [],
            heroMediaAssetId: null,
            color: '#4f46e5',
            mergeTargetElementId: null,
            accepted: true,
            metadata: {},
          },
          {
            id: 'candidate-object-1',
            type: 'object',
            name: 'Abandoned Prop',
            aliases: [],
            description: '',
            tags: [],
            continuityNotes: '',
            referenceSetIds: [],
            heroMediaAssetId: null,
            color: '#64748b',
            mergeTargetElementId: null,
            accepted: false,
            metadata: {},
          },
        ],
        sceneDrafts: [
          {
            id: 'scene-draft-1',
            name: 'Control Room',
            summary: 'A tense opening in the command deck.',
            promptSeed: 'Captain Nova in the control room at night',
            notes: 'Keep the skyline monitors alive in the background.',
            orderIndex: 0,
            elementCandidateIds: [
              'candidate-character-1',
              'candidate-location-1',
              'candidate-object-1',
            ],
            shotBeats: [
              {
                id: 'beat-1',
                summary: 'Captain Nova scans the console.',
                promptSeed: 'Captain Nova scans the glowing control console.',
                notes: 'Push in slowly.',
                orderIndex: 0,
                durationMs: null,
                elementIds: ['candidate-character-1', 'candidate-location-1'],
                metadata: { camera: 'push-in' },
              },
            ],
            accepted: true,
            metadata: {},
          },
        ],
      });

      const commitResult = useAppStore.getState().commitStoryboardImportDraft('draft-commit-1');

      expect(commitResult).not.toBeNull();
      expect(commitResult?.projectId).toBe(project.id);
      expect(commitResult?.sceneIds).toHaveLength(1);

      const committedState = useAppStore.getState();
      const committedProject = committedState.projects.find((item) => item.id === project.id);
      expect(committedProject?.scenes).toHaveLength(2);
      expect(committedProject?.scenes[0].id).toBe(existingScene.id);

      const importedScene = committedProject?.scenes.find((scene) => scene.id === commitResult?.sceneIds[0]);
      expect(importedScene?.name).toBe('Control Room');
      expect(importedScene?.orderIndex).toBe(1);
      expect(importedScene?.prompt).toBe('Captain Nova in the control room at night');
      expect(importedScene?.metadata.notes).toContain('A tense opening in the command deck.');
      expect(importedScene?.metadata.notes).toContain(
        'Keep the skyline monitors alive in the background.',
      );
      expect(importedScene?.elementIds).toHaveLength(2);
      expect(importedScene?.shotBeats[0].elementIds).toEqual(importedScene?.elementIds);
      expect(importedScene?.shotBeats[0].metadata).toEqual({ camera: 'push-in' });

      expect(committedProject?.elements).toHaveLength(2);
      const mergedCharacter = committedProject?.elements?.find(
        (element) => element.id === 'element-existing-character',
      );
      expect(mergedCharacter?.aliases).toContain('Nova');
      expect(mergedCharacter?.tags).toContain('captain');
      expect(committedProject?.elements?.some((element) => element.name === 'Control Room')).toBe(true);

      expect(committedState.storyboardImportDrafts).toEqual([]);
      expect(committedState.activeStoryboardImportDraftId).toBeNull();
      expect(committedState.activeProjectId).toBe(project.id);
      expect(committedState.activeSceneId).toBe(importedScene?.id ?? null);
    });

    it('removes project-scoped storyboard import drafts when deleting a project', () => {
      const project = useAppStore.getState().createProject('Draft target');

      useAppStore.getState().upsertStoryboardImportDraft({
        id: 'draft-1',
        projectId: project.id,
        title: 'Draft One',
        sourceText: 'INT. WAREHOUSE - NIGHT',
        sceneDrafts: [],
        elementDrafts: [],
        issues: [],
        status: 'draft',
        createdAt: '2026-04-23T00:00:00.000Z',
        updatedAt: '2026-04-23T00:00:00.000Z',
        metadata: {},
      });

      useAppStore.getState().deleteProject(project.id);

      expect(useAppStore.getState().storyboardImportDrafts).toEqual([]);
      expect(useAppStore.getState().activeStoryboardImportDraftId).toBeNull();
    });
  });

  describe('timeline clip editing', () => {
    function seedTimelineClips() {
      const state = useAppStore.getState();
      const project = state.createProject('Timeline Edit');
      const sequence = state.ensureTimelineSequenceForProject(project.id)!;
      const primaryTrack = useAppStore.getState().timelineTracks.find((track) => track.sequenceId === sequence.id)!;
      const altTrack = state.createTimelineTrack(sequence.id, { kind: 'video', name: 'B-Roll' })!;

      state.upsertMediaAsset({
        id: 'timeline-media',
        name: 'Shot Source',
        type: 'video',
        source: 'generated',
        path: '/outputs/timeline.mp4',
        previewUrl: '/outputs/timeline.mp4',
        thumbnailUrl: '/outputs/timeline.jpg',
        posterUrl: '/outputs/timeline.jpg',
        durationMs: 6000,
        fps: 24,
        metadata: {},
        createdAt: '2026-04-22T00:00:00.000Z',
      });

      const clipA = state.createTimelineClip({
        trackId: primaryTrack.id,
        mediaAssetId: 'timeline-media',
        startMs: 0,
        durationMs: 1000,
        label: 'Clip A',
      })!;

      const clipB = state.createTimelineClip({
        trackId: primaryTrack.id,
        mediaAssetId: 'timeline-media',
        startMs: 1000,
        durationMs: 1000,
        label: 'Clip B',
      })!;

      return { sequence, primaryTrack, altTrack, clipA, clipB };
    }

    it('moves clips ripple-safe across tracks and stores play ranges and transitions', () => {
      const { sequence, altTrack, clipA, clipB } = seedTimelineClips();

      useAppStore.getState().moveTimelineClip(clipA.id, { startMs: 800 });
      let state = useAppStore.getState();
      let movedA = state.timelineClips.find((clip) => clip.id === clipA.id)!;
      const movedB = state.timelineClips.find((clip) => clip.id === clipB.id)!;
      expect(movedB.startMs).toBeGreaterThanOrEqual(movedA.startMs + movedA.durationMs);

      useAppStore.getState().moveTimelineClip(clipA.id, { trackId: altTrack.id, startMs: 500 });
      state = useAppStore.getState();
      movedA = state.timelineClips.find((clip) => clip.id === clipA.id)!;
      expect(movedA.trackId).toBe(altTrack.id);

      useAppStore.getState().trimTimelineClip(clipA.id, { endMs: 1800 });
      state = useAppStore.getState();
      movedA = state.timelineClips.find((clip) => clip.id === clipA.id)!;
      expect(movedA.durationMs).toBeGreaterThanOrEqual(1200);

      useAppStore.getState().setTimelineClipTransition(clipA.id, 'in', {
        type: 'fade',
        durationMs: 400,
      });
      useAppStore.getState().setTimelineSequencePlayRange(sequence.id, {
        startMs: 500,
        endMs: 2500,
      });

      state = useAppStore.getState();
      expect(state.timelineClips.find((clip) => clip.id === clipA.id)?.transitionIn).toEqual({
        type: 'fade',
        durationMs: 400,
      });
      expect(state.timelineSequences.find((item) => item.id === sequence.id)?.playRange).toEqual({
        startMs: 500,
        endMs: 2500,
      });
    });

    it('splits duplicates and deletes clips while keeping selection valid', () => {
      const state = useAppStore.getState();
      const project = state.createProject('Split Timeline');
      const sequence = state.ensureTimelineSequenceForProject(project.id)!;
      const track = useAppStore.getState().timelineTracks.find((item) => item.sequenceId === sequence.id)!;

      state.upsertMediaAsset({
        id: 'split-media',
        name: 'Split Source',
        type: 'video',
        source: 'generated',
        path: '/outputs/split.mp4',
        previewUrl: '/outputs/split.mp4',
        thumbnailUrl: '/outputs/split.jpg',
        posterUrl: '/outputs/split.jpg',
        durationMs: 5000,
        fps: 24,
        metadata: {},
        createdAt: '2026-04-22T00:00:00.000Z',
      });

      const clip = state.createTimelineClip({
        trackId: track.id,
        mediaAssetId: 'split-media',
        startMs: 0,
        durationMs: 2000,
        label: 'Hero Clip',
      })!;

      const splitResult = useAppStore.getState().splitTimelineClip(clip.id, 1000);
      expect(splitResult).not.toBeNull();
      expect(useAppStore.getState().timelineClips).toHaveLength(2);
      expect(useAppStore.getState().activeTimelineClipId).toBe(splitResult?.rightClipId ?? null);

      const duplicate = useAppStore.getState().duplicateTimelineClip(splitResult!.rightClipId);
      expect(duplicate).not.toBeNull();
      expect(useAppStore.getState().timelineClips).toHaveLength(3);

      useAppStore.getState().deleteTimelineClip(duplicate!.id);
      expect(useAppStore.getState().timelineClips).toHaveLength(2);
      expect(useAppStore.getState().activeTimelineClipId).not.toBe(duplicate!.id);
    });
  });

  describe('storyboard timeline derivation', () => {
    it('derives scene clips once per scene and preserves beat markers and references', () => {
      const state = useAppStore.getState();
      const project = state.createProject('Storyboard Timeline');
      const firstScene = state.addScene(project.id, {
        name: 'Scene 1',
        referenceSetIds: ['scene-ref'],
        elementIds: ['element-1'],
        shotBeats: [
          {
            id: 'beat-1',
            summary: 'Wide reveal',
            promptSeed: 'wide reveal',
            notes: '',
            orderIndex: 0,
            durationMs: 1000,
            elementIds: ['element-1'],
            metadata: {},
          },
        ],
        thumbnail: 'http://localhost:8000/outputs/scenes/scene-1.png',
      });
      const secondScene = state.addScene(project.id, {
        name: 'Scene 2',
        shotBeats: [],
      });

      useAppStore.setState((current) => ({
        projects: current.projects.map((item) =>
          item.id !== project.id
            ? item
            : {
                ...item,
                elements: [
                  {
                    id: 'element-1',
                    projectId: project.id,
                    type: 'character',
                    name: 'Captain Nova',
                    aliases: [],
                    description: '',
                    tags: [],
                    continuityNotes: '',
                    referenceSetIds: ['element-ref'],
                    heroMediaAssetId: null,
                    status: 'approved',
                    color: '#ffffff',
                    metadata: {},
                  },
                ],
              },
        ),
        assetLibrary: [
          {
            id: 'asset-scene-1',
            jobId: 'job-scene-1',
            name: 'Scene 1 Output',
            type: 'image',
            path: 'C:/vision-studio-output/scenes/scene-1.png',
            previewUrl: 'http://localhost:8000/outputs/scenes/scene-1.png',
            thumbnail: 'http://localhost:8000/outputs/scenes/scene-1.png',
            createdAt: '2026-04-23T00:00:00.000Z',
            prompt: 'scene 1',
            negativePrompt: '',
            favorite: false,
            params: {
              source: 'generated',
            },
          },
        ],
      }) as any);

      const result = useAppStore.getState().deriveStoryboardTimeline(project.id);

      expect(result).not.toBeNull();
      expect(result).toMatchObject({
        added: 2,
        updated: 0,
        skipped: 0,
        placeholders: 1,
      });

      const nextState = useAppStore.getState();
      const sequenceId = nextState.projects.find((item) => item.id === project.id)?.timelineSequenceId;
      expect(sequenceId).not.toBeNull();
      expect(nextState.timelineClips).toHaveLength(2);

      const derivedSceneOneClip = nextState.timelineClips.find((clip) => clip.sceneId === firstScene.id);
      const derivedSceneTwoClip = nextState.timelineClips.find((clip) => clip.sceneId === secondScene.id);
      expect(derivedSceneOneClip?.storyboardDerived).toBe(true);
      expect(derivedSceneOneClip?.storyboardBeatMarkers).toHaveLength(1);
      expect(derivedSceneOneClip?.referenceSetIds).toEqual(['scene-ref', 'element-ref']);
      expect(derivedSceneTwoClip?.storyboardDerived).toBe(true);

      const updatedProject = nextState.projects.find((item) => item.id === project.id);
      expect(updatedProject?.scenes.find((scene) => scene.id === firstScene.id)?.timelineClipIds).toContain(
        derivedSceneOneClip?.id ?? '',
      );
      expect(updatedProject?.scenes.find((scene) => scene.id === secondScene.id)?.timelineClipIds).toContain(
        derivedSceneTwoClip?.id ?? '',
      );

      const placeholderAsset = nextState.mediaAssets.find((asset) => asset.id === derivedSceneTwoClip?.mediaAssetId);
      expect(placeholderAsset?.metadata.storyboardPlaceholder).toBe(true);
    });

    it('reuses the existing derived clip on rerun instead of duplicating the scene', () => {
      const state = useAppStore.getState();
      const project = state.createProject('Storyboard Rerun');
      state.addScene(project.id, {
        name: 'Scene 1',
        thumbnail: 'http://localhost:8000/outputs/scenes/scene-1.png',
      });

      useAppStore.setState({
        assetLibrary: [
          {
            id: 'asset-scene-1',
            jobId: 'job-scene-1',
            name: 'Scene 1 Output',
            type: 'image',
            path: 'C:/vision-studio-output/scenes/scene-1.png',
            previewUrl: 'http://localhost:8000/outputs/scenes/scene-1.png',
            thumbnail: 'http://localhost:8000/outputs/scenes/scene-1.png',
            createdAt: '2026-04-23T00:00:00.000Z',
            prompt: 'scene 1',
            negativePrompt: '',
            favorite: false,
            params: {
              source: 'generated',
            },
          },
        ],
      } as any);

      const firstResult = useAppStore.getState().deriveStoryboardTimeline(project.id);
      const firstClipCount = useAppStore.getState().timelineClips.length;
      const secondResult = useAppStore.getState().deriveStoryboardTimeline(project.id);

      expect(firstResult?.added).toBe(1);
      expect(secondResult).toMatchObject({
        added: 0,
        updated: 0,
        skipped: 1,
      });
      expect(useAppStore.getState().timelineClips).toHaveLength(firstClipCount);
    });

    it('derives only the requested scene when sceneIds are provided', () => {
      const state = useAppStore.getState();
      const project = state.createProject('Storyboard Partial');
      const firstScene = state.addScene(project.id, {
        name: 'Scene 1',
        thumbnail: 'http://localhost:8000/outputs/scenes/scene-1.png',
      });
      const secondScene = state.addScene(project.id, {
        name: 'Scene 2',
        thumbnail: 'http://localhost:8000/outputs/scenes/scene-2.png',
      });

      useAppStore.setState({
        assetLibrary: [
          {
            id: 'asset-scene-1',
            jobId: 'job-scene-1',
            name: 'Scene 1 Output',
            type: 'image',
            path: 'C:/vision-studio-output/scenes/scene-1.png',
            previewUrl: 'http://localhost:8000/outputs/scenes/scene-1.png',
            thumbnail: 'http://localhost:8000/outputs/scenes/scene-1.png',
            createdAt: '2026-04-23T00:00:00.000Z',
            prompt: 'scene 1',
            negativePrompt: '',
            favorite: false,
            params: {
              source: 'generated',
            },
          },
          {
            id: 'asset-scene-2',
            jobId: 'job-scene-2',
            name: 'Scene 2 Output',
            type: 'image',
            path: 'C:/vision-studio-output/scenes/scene-2.png',
            previewUrl: 'http://localhost:8000/outputs/scenes/scene-2.png',
            thumbnail: 'http://localhost:8000/outputs/scenes/scene-2.png',
            createdAt: '2026-04-23T00:00:00.000Z',
            prompt: 'scene 2',
            negativePrompt: '',
            favorite: false,
            params: {
              source: 'generated',
            },
          },
        ],
      } as any);

      const result = useAppStore.getState().deriveStoryboardTimeline(project.id, {
        sceneIds: [firstScene.id],
      });

      expect(result).toMatchObject({
        sceneIds: [firstScene.id],
        added: 1,
        updated: 0,
        skipped: 0,
        placeholders: 0,
      });

      const nextState = useAppStore.getState();
      expect(nextState.timelineClips).toHaveLength(1);
      expect(nextState.timelineClips[0]?.sceneId).toBe(firstScene.id);

      const updatedProject = nextState.projects.find((item) => item.id === project.id);
      expect(updatedProject?.scenes.find((scene) => scene.id === firstScene.id)?.timelineClipIds).toHaveLength(1);
      expect(updatedProject?.scenes.find((scene) => scene.id === secondScene.id)?.timelineClipIds).toHaveLength(0);
    });
  });

  describe('timeline playback transport', () => {
    function seedTimelinePlayback() {
      const state = useAppStore.getState();
      const project = state.createProject('Playback Timeline');
      const sequence = state.ensureTimelineSequenceForProject(project.id, { fps: 12 })!;
      state.setActiveTimelineSequence(sequence.id);

      return { sequence };
    }

    it('restarts playback from the active play-range start when play begins at the end', () => {
      const { sequence } = seedTimelinePlayback();

      useAppStore.getState().setTimelineSequencePlayRange(sequence.id, {
        startMs: 800,
        endMs: 1800,
      });
      useAppStore.getState().seekTo(1800);
      useAppStore.getState().timelinePlay();

      expect(useAppStore.getState().playState).toBe('playing');
      expect(useAppStore.getState().currentTime).toBe(800);
    });

    it('resets stop to the play-range start and toggle play also restarts from range end', () => {
      const { sequence } = seedTimelinePlayback();

      useAppStore.getState().setTimelineSequencePlayRange(sequence.id, {
        startMs: 400,
        endMs: 1200,
      });
      useAppStore.getState().seekTo(900);
      useAppStore.getState().timelineStop();
      expect(useAppStore.getState().currentTime).toBe(400);

      useAppStore.getState().seekTo(1200);
      useAppStore.getState().toggleTimelinePlayback();

      expect(useAppStore.getState().playState).toBe('playing');
      expect(useAppStore.getState().currentTime).toBe(400);
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

    it('toggles comparison ids as an ordered set', () => {
      const job1 = makeIterationJob('iter-1');
      const job2 = makeIterationJob('iter-2');
      useAppStore.getState().addIteration({ job: job1, parentId: null, thumbnail: 'thumb1' });
      useAppStore.getState().addIteration({ job: job2, parentId: null, thumbnail: 'thumb2' });

      useAppStore.getState().toggleIterationComparison('iter-1');
      expect(useAppStore.getState().comparisonIds).toEqual(['iter-1']);

      useAppStore.getState().toggleIterationComparison('iter-2');
      expect(useAppStore.getState().comparisonIds).toEqual(['iter-1', 'iter-2']);

      useAppStore.getState().toggleIterationComparison('iter-1');
      expect(useAppStore.getState().comparisonIds).toEqual(['iter-2']);
    });

    it('replaces the oldest comparison id when selecting a third node', () => {
      const job1 = makeIterationJob('iter-1');
      const job2 = makeIterationJob('iter-2');
      const job3 = makeIterationJob('iter-3');
      useAppStore.getState().addIteration({ job: job1, parentId: null, thumbnail: 'thumb1' });
      useAppStore.getState().addIteration({ job: job2, parentId: null, thumbnail: 'thumb2' });
      useAppStore.getState().addIteration({ job: job3, parentId: null, thumbnail: 'thumb3' });

      useAppStore.getState().toggleIterationComparison('iter-1');
      useAppStore.getState().toggleIterationComparison('iter-2');
      useAppStore.getState().toggleIterationComparison('iter-3');

      expect(useAppStore.getState().comparisonIds).toEqual(['iter-2', 'iter-3']);
    });

    it('swaps and clears comparison ids', () => {
      const job1 = makeIterationJob('iter-1');
      const job2 = makeIterationJob('iter-2');
      useAppStore.getState().addIteration({ job: job1, parentId: null, thumbnail: 'thumb1' });
      useAppStore.getState().addIteration({ job: job2, parentId: null, thumbnail: 'thumb2' });

      useAppStore.getState().toggleIterationComparison('iter-1');
      useAppStore.getState().toggleIterationComparison('iter-2');
      useAppStore.getState().swapIterationComparison();
      expect(useAppStore.getState().comparisonIds).toEqual(['iter-2', 'iter-1']);

      useAppStore.getState().clearIterationComparison();
      expect(useAppStore.getState().comparisonIds).toBeNull();
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

    it('prunes deleted branch ids from comparison state', () => {
      const job1 = makeIterationJob('iter-1');
      useAppStore.getState().addIteration({ job: job1, parentId: null, thumbnail: 'thumb1' });
      const branch1Id = useAppStore.getState().iterationBranches[0].id;
      const job2 = makeIterationJob('iter-2');
      useAppStore.getState().addIteration({ job: job2, parentId: 'iter-1', thumbnail: 'thumb2', branchId: branch1Id });
      const job3 = makeIterationJob('iter-3');
      useAppStore.getState().forkIteration({ job: job3, parentId: 'iter-1', thumbnail: 'thumb3' });

      useAppStore.getState().toggleIterationComparison('iter-2');
      useAppStore.getState().toggleIterationComparison('iter-3');
      expect(useAppStore.getState().comparisonIds).toEqual(['iter-2', 'iter-3']);

      const forkedBranchId = useAppStore.getState().iterationBranches.find((branch) => branch.id !== branch1Id)?.id;
      if (forkedBranchId) {
        useAppStore.getState().deleteIterationBranch(forkedBranchId);
      }

      expect(useAppStore.getState().comparisonIds).toEqual(['iter-2']);
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
