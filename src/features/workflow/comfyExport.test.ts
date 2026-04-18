import { describe, expect, it } from 'vitest';

import type { WorkflowGraph } from '@/store/appStore';
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
});
