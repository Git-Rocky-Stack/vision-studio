import { describe, expect, it } from 'vitest';
import type { WorkflowGraph } from '@/types/workflow';
import type { ComfyPrompt } from './comfyExport';
import { exportWorkflowGraphToComfyPrompt } from './comfyExport';
import { importComfyPromptToWorkflowGraph } from './comfyImport';

// Structural equality that ignores positions (export drops them; import re-lays-out).
function structural(graph: WorkflowGraph) {
  return Object.fromEntries(
    Object.entries(graph.nodes).map(([id, node]) => [
      id,
      { classType: node.classType, label: node.label, inputs: node.inputs },
    ])
  );
}

const firstClassGraph: WorkflowGraph = {
  nodes: {
    '1': { id: '1', classType: 'CheckpointLoaderSimple', label: 'Loader', position: { x: 0, y: 0 }, inputs: { ckpt_name: { kind: 'literal', value: 'flux1-dev.safetensors' } } },
    '2': { id: '2', classType: 'CLIPTextEncode', label: 'Prompt', position: { x: 0, y: 0 }, inputs: { text: { kind: 'literal', value: 'a city' }, clip: { kind: 'link', nodeId: '1', output: 'CLIP' } } },
  },
  edges: [{ id: 'e1', sourceNodeId: '1', sourceOutput: 'CLIP', targetNodeId: '2', targetInput: 'clip' }],
};

describe('round-trip fidelity (S6)', () => {
  it('import(export(g)) is structurally faithful (positions excluded)', () => {
    const reimported = importComfyPromptToWorkflowGraph(
      exportWorkflowGraphToComfyPrompt(firstClassGraph),
      { knownModelFilenames: ['flux1-dev.safetensors'] }
    ).graph;
    expect(structural(reimported)).toEqual(structural(firstClassGraph));
  });

  it('export(import(p)) reproduces a first-class prompt exactly', () => {
    const prompt: ComfyPrompt = {
      '1': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: 'flux1-dev.safetensors' }, _meta: { title: 'Loader' } },
      '2': { class_type: 'CLIPTextEncode', inputs: { text: 'a city', clip: ['1', 1] }, _meta: { title: 'Prompt' } },
    };
    const reexported = exportWorkflowGraphToComfyPrompt(
      importComfyPromptToWorkflowGraph(prompt, { knownModelFilenames: ['flux1-dev.safetensors'] }).graph
    );
    expect(reexported).toEqual(prompt);
  });

  it('passes opaque-node slots through unchanged on export(import(p))', () => {
    const prompt: ComfyPrompt = {
      '1': { class_type: 'CustomLoader', inputs: {}, _meta: { title: 'Custom' } },
      '2': { class_type: 'SaveImage', inputs: { images: ['1', 3] }, _meta: { title: 'Save' } },
    };
    const reexported = exportWorkflowGraphToComfyPrompt(
      importComfyPromptToWorkflowGraph(prompt, { knownModelFilenames: [] }).graph
    );
    expect(reexported['2'].inputs.images).toEqual(['1', '3']);
  });
});
