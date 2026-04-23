import { describe, expect, it } from 'vitest';

import type { WorkflowExecutionContext, WorkflowGraph, WorkflowRecord } from '@/types/workflow';
import { resolveWorkflowGenerationRequest } from './resolveWorkflowGenerationRequest';

describe('resolveWorkflowGenerationRequest', () => {
  it('prefers graph prompt and model literals over app-context fallbacks', () => {
    const workflow = makeWorkflow();

    const result = resolveWorkflowGenerationRequest(
      workflow,
      makeWorkflowExecutionContext({
        activeScenePrompt: 'scene prompt',
        activeSceneNegativePrompt: 'scene negative',
        generationDraft: {
          prompt: 'draft prompt',
          negativePrompt: 'draft negative',
          model: 'draft-model',
          width: 512,
          height: 512,
          steps: 20,
          cfgScale: 6,
          scheduler: 'Euler a',
          seed: 99,
          generationType: 'image',
        },
      })
    );

    expect(result.request).toMatchObject({
      prompt: 'graph prompt',
      negative_prompt: 'scene negative',
      model: 'flux-dev.safetensors',
      width: 1024,
      height: 1024,
      steps: 25,
      cfg_scale: 7.5,
      seed: 1,
    });
  });

  it('falls back to scene or draft context when graph literals are empty', () => {
    const workflow = makeWorkflowWithEmptyPromptAndModel();

    const result = resolveWorkflowGenerationRequest(
      workflow,
      makeWorkflowExecutionContext({
        activeScenePrompt: 'fallback scene prompt',
        activeSceneNegativePrompt: 'fallback negative',
        generationDraft: {
          prompt: 'draft prompt',
          negativePrompt: 'draft negative',
          model: 'draft-model',
          width: 768,
          height: 768,
          steps: 18,
          cfgScale: 5.5,
          scheduler: 'Euler a',
          seed: 12,
          generationType: 'image',
        },
      })
    );

    expect(result.request?.prompt).toBe('fallback scene prompt');
    expect(result.request?.negative_prompt).toBe('fallback negative');
    expect(result.request?.model).toBe('draft-model');
  });

  it('returns validation errors for invalid sampler values', () => {
    const workflow = makeWorkflowWithSamplerValues({ steps: 'abc', cfg: -1 });

    const result = resolveWorkflowGenerationRequest(workflow, makeWorkflowExecutionContext());

    expect(result.issues.map((issue) => issue.code)).toContain('invalid-sampler-value');
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
          text: { kind: 'literal', value: 'graph prompt' },
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

function makeWorkflowWithEmptyPromptAndModel(): WorkflowRecord {
  const graph = makeBaseGraph();
  return makeWorkflow({
    nodes: {
      ...graph.nodes,
      prompt: {
        ...graph.nodes.prompt,
        inputs: {
          text: { kind: 'literal', value: '' },
        },
      },
      model: {
        ...graph.nodes.model,
        inputs: {
          ckpt_name: { kind: 'literal', value: '' },
        },
      },
    },
  });
}

function makeWorkflowWithSamplerValues(values: { steps: string | number; cfg: string | number }) {
  const graph = makeBaseGraph();
  return makeWorkflow({
    nodes: {
      ...graph.nodes,
      sampler: {
        ...graph.nodes.sampler,
        inputs: {
          ...graph.nodes.sampler.inputs,
          steps: { kind: 'literal', value: values.steps },
          cfg: { kind: 'literal', value: values.cfg },
        },
      },
    },
  });
}

function makeWorkflowExecutionContext(
  overrides?: Partial<WorkflowExecutionContext>
): WorkflowExecutionContext {
  return {
    activeScenePrompt: null,
    activeSceneNegativePrompt: null,
    generationDraft: null,
    availableModels: [],
    ...overrides,
  };
}
