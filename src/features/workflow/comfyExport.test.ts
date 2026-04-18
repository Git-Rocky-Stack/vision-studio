import { describe, expect, it } from 'vitest';

import type { WorkflowGraph } from '@/types/workflow';
import { exportWorkflowGraphToComfyPrompt } from './comfyExport';

const graph: WorkflowGraph = {
  nodes: {
    prompt: {
      id: 'prompt',
      classType: 'CLIPTextEncode',
      label: 'Prompt Encode',
      position: { x: 0, y: 0 },
      inputs: {
        text: { kind: 'literal', value: 'cinematic frame' },
      },
    },
    sampler: {
      id: 'sampler',
      classType: 'KSampler',
      label: 'Sampler',
      position: { x: 240, y: 0 },
      inputs: {
        positive: { kind: 'link', nodeId: 'prompt', output: 'CONDITIONING' },
        steps: { kind: 'literal', value: 25 },
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
  ],
};

describe('exportWorkflowGraphToComfyPrompt', () => {
  it('exports literal and linked inputs to ComfyUI API prompt JSON', () => {
    expect(exportWorkflowGraphToComfyPrompt(graph)).toEqual({
      prompt: {
        class_type: 'CLIPTextEncode',
        inputs: {
          text: 'cinematic frame',
        },
        _meta: {
          title: 'Prompt Encode',
        },
      },
      sampler: {
        class_type: 'KSampler',
        inputs: {
          positive: ['prompt', 'CONDITIONING'],
          steps: 25,
        },
        _meta: {
          title: 'Sampler',
        },
      },
    });
  });

  it('throws for links that reference missing source nodes', () => {
    expect(() =>
      exportWorkflowGraphToComfyPrompt({
        ...graph,
        nodes: {
          sampler: graph.nodes.sampler,
        },
      })
    ).toThrow('Workflow graph link references missing source node "prompt"');
  });

  it('throws for self-referencing edges', () => {
    expect(() =>
      exportWorkflowGraphToComfyPrompt({
        ...graph,
        edges: [
          ...graph.edges,
          {
            id: 'edge-self-loop',
            sourceNodeId: 'sampler',
            sourceOutput: 'IMAGE',
            targetNodeId: 'sampler',
            targetInput: 'positive',
          },
        ],
      })
    ).toThrow('cannot connect a node to itself');
  });

  it('throws for edges referencing missing source nodes', () => {
    expect(() =>
      exportWorkflowGraphToComfyPrompt({
        ...graph,
        edges: [
          ...graph.edges,
          {
            id: 'edge-missing-source',
            sourceNodeId: 'nonexistent',
            sourceOutput: 'IMAGE',
            targetNodeId: 'sampler',
            targetInput: 'latent_image',
          },
        ],
      })
    ).toThrow('references missing source node "nonexistent"');
  });

  it('throws for edges referencing missing target nodes', () => {
    expect(() =>
      exportWorkflowGraphToComfyPrompt({
        ...graph,
        edges: [
          ...graph.edges,
          {
            id: 'edge-missing-target',
            sourceNodeId: 'prompt',
            sourceOutput: 'CONDITIONING',
            targetNodeId: 'nonexistent',
            targetInput: 'positive',
          },
        ],
      })
    ).toThrow('references missing target node "nonexistent"');
  });

  it('throws for duplicate links targeting the same input', () => {
    expect(() =>
      exportWorkflowGraphToComfyPrompt({
        ...graph,
        edges: [
          ...graph.edges,
          {
            id: 'edge-duplicate-link',
            sourceNodeId: 'prompt',
            sourceOutput: 'CONDITIONING',
            targetNodeId: 'sampler',
            targetInput: 'positive',
          },
        ],
      })
    ).toThrow('duplicate links for input');
  });

  it('exports an empty graph as an empty prompt', () => {
    expect(exportWorkflowGraphToComfyPrompt({ nodes: {}, edges: [] })).toEqual({});
  });

  it('exports nodes with boolean and null literal values', () => {
    const graphWithBool: WorkflowGraph = {
      nodes: {
        node1: {
          id: 'node1',
          classType: 'TestNode',
          label: 'Test',
          position: { x: 0, y: 0 },
          inputs: {
            flag: { kind: 'literal', value: true },
            empty: { kind: 'literal', value: null },
          },
        },
      },
      edges: [],
    };

    expect(exportWorkflowGraphToComfyPrompt(graphWithBool)).toEqual({
      node1: {
        class_type: 'TestNode',
        inputs: { flag: true, empty: null },
        _meta: { title: 'Test' },
      },
    });
  });
});
