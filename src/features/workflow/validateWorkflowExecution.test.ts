import { describe, expect, it } from 'vitest';

import type { WorkflowGraph, WorkflowRecord } from '@/types/workflow';
import { validateWorkflowExecution } from './validateWorkflowExecution';

describe('validateWorkflowExecution', () => {
  it('reports unsupported node classes as execution errors', () => {
    const workflow = makeWorkflow({
      nodes: {
        ...makeBaseGraph().nodes,
        custom: {
          id: 'custom',
          classType: 'UpscaleModelLoader',
          label: 'Upscale',
          position: { x: 900, y: 120 },
          inputs: {},
        },
      },
    });

    const result = validateWorkflowExecution(workflow, makeWorkflowExecutionContext());

    expect(result.issues).toContainEqual(
      expect.objectContaining({
        severity: 'error',
        code: 'unsupported-node',
        nodeId: 'custom',
      })
    );
  });

  it('reports missing prompt and model wiring as execution errors', () => {
    const workflow = makeWorkflowWithoutSamplerLinks();

    const result = validateWorkflowExecution(workflow, makeWorkflowExecutionContext());

    expect(result.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(['missing-prompt', 'missing-model'])
    );
  });
});

function makeWorkflow(graphOverride?: Partial<WorkflowGraph>): WorkflowRecord {
  const graph = makeBaseGraph();
  return {
    id: 'workflow-under-test',
    name: 'Workflow under test',
    status: 'draft',
    description: '',
    tags: [],
    notes: '',
    profile: 'Balanced image run',
    summary: '1024 x 1024, 25 steps, CFG 7.5',
    settings: {
      width: 1024,
      height: 1024,
      steps: 25,
      cfgScale: 7.5,
    },
    inputs: ['Prompt'],
    steps: [],
    graph: {
      ...graph,
      ...graphOverride,
      nodes: {
        ...graph.nodes,
        ...(graphOverride?.nodes ?? {}),
      },
      edges: graphOverride?.edges ?? graph.edges,
    },
    runOutputSummary: null,
    runHistory: [],
  };
}

function makeBaseGraph(): WorkflowGraph {
  return {
    nodes: {
      prompt: {
        id: 'prompt',
        classType: 'CLIPTextEncode',
        label: 'Prompt Encode',
        position: { x: 40, y: 120 },
        inputs: {
          text: { kind: 'literal', value: '' },
        },
      },
      model: {
        id: 'model',
        classType: 'CheckpointLoaderSimple',
        label: 'Model Loader',
        position: { x: 40, y: 300 },
        inputs: {
          ckpt_name: { kind: 'literal', value: 'flux-dev.safetensors' },
        },
      },
      sampler: {
        id: 'sampler',
        classType: 'KSampler',
        label: 'Sampler',
        position: { x: 360, y: 200 },
        inputs: {
          positive: { kind: 'link', nodeId: 'prompt', output: 'CONDITIONING' },
          model: { kind: 'link', nodeId: 'model', output: 'MODEL' },
          seed: { kind: 'literal', value: 1 },
          steps: { kind: 'literal', value: 25 },
          cfg: { kind: 'literal', value: 7.5 },
        },
      },
      preview: {
        id: 'preview',
        classType: 'PreviewImage',
        label: 'Preview',
        position: { x: 620, y: 120 },
        inputs: {
          images: { kind: 'link', nodeId: 'sampler', output: 'IMAGE' },
        },
      },
      save: {
        id: 'save',
        classType: 'SaveImage',
        label: 'Save Output',
        position: { x: 620, y: 300 },
        inputs: {
          images: { kind: 'link', nodeId: 'sampler', output: 'IMAGE' },
          filename_prefix: { kind: 'literal', value: 'vision-studio' },
        },
      },
    },
    edges: [
      {
        id: 'edge-prompt-sampler-positive',
        sourceNodeId: 'prompt',
        sourceOutput: 'CONDITIONING',
        targetNodeId: 'sampler',
        targetInput: 'positive',
      },
      {
        id: 'edge-model-sampler-model',
        sourceNodeId: 'model',
        sourceOutput: 'MODEL',
        targetNodeId: 'sampler',
        targetInput: 'model',
      },
      {
        id: 'edge-sampler-preview-images',
        sourceNodeId: 'sampler',
        sourceOutput: 'IMAGE',
        targetNodeId: 'preview',
        targetInput: 'images',
      },
      {
        id: 'edge-sampler-save-images',
        sourceNodeId: 'sampler',
        sourceOutput: 'IMAGE',
        targetNodeId: 'save',
        targetInput: 'images',
      },
    ],
    viewport: { x: 0, y: 0, zoom: 1 },
  };
}

function makeWorkflowWithoutSamplerLinks(): WorkflowRecord {
  const graph = makeBaseGraph();
  return makeWorkflow({
    nodes: {
      ...graph.nodes,
      sampler: {
        ...graph.nodes.sampler,
        inputs: {
          seed: { kind: 'literal', value: 1 },
          steps: { kind: 'literal', value: 25 },
          cfg: { kind: 'literal', value: 7.5 },
        },
      },
    },
    edges: graph.edges.filter(
      (edge) =>
        !(
          edge.targetNodeId === 'sampler' &&
          (edge.targetInput === 'positive' || edge.targetInput === 'model')
        )
    ),
  });
}

function makeWorkflowExecutionContext() {
  return {
    activeScenePrompt: null,
    activeSceneNegativePrompt: null,
    generationDraft: null,
    availableModels: [],
  };
}
