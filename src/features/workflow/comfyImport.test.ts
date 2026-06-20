import { describe, expect, it } from 'vitest';
import { importComfyPromptToWorkflowGraph } from './comfyImport';
import type { ComfyPrompt } from './comfyExport';

const nativePrompt: ComfyPrompt = {
  '1': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: 'flux1-dev.safetensors' }, _meta: { title: 'Loader' } },
  '2': { class_type: 'CLIPTextEncode', inputs: { text: 'a city', clip: ['1', 1] } },
  '3': { class_type: 'KSampler', inputs: { steps: 20, model: ['1', 0], positive: ['2', 0] } },
};

describe('importComfyPromptToWorkflowGraph', () => {
  it('maps integer slots back to named outputs and synthesizes consistent edges', () => {
    const { graph } = importComfyPromptToWorkflowGraph(nativePrompt, { knownModelFilenames: ['flux1-dev.safetensors'] });
    const clip = graph.nodes['2'].inputs.clip;
    expect(clip).toEqual({ kind: 'link', nodeId: '1', output: 'CLIP' });
    const modelLink = graph.nodes['3'].inputs.model;
    expect(modelLink).toEqual({ kind: 'link', nodeId: '1', output: 'MODEL' });
    // every link input has a matching edge
    const edgeKeys = graph.edges.map((e) => `${e.sourceNodeId}:${e.targetNodeId}:${e.targetInput}`);
    expect(edgeKeys).toContain('1:2:clip');
    expect(edgeKeys).toContain('1:3:model');
    expect(edgeKeys).toContain('2:3:positive');
  });

  it('preserves literals and node titles', () => {
    const { graph } = importComfyPromptToWorkflowGraph(nativePrompt, { knownModelFilenames: ['flux1-dev.safetensors'] });
    expect(graph.nodes['3'].inputs.steps).toEqual({ kind: 'literal', value: 20 });
    expect(graph.nodes['1'].label).toBe('Loader');
  });

  it('lays out nodes deterministically by link depth', () => {
    const { graph } = importComfyPromptToWorkflowGraph(nativePrompt, { knownModelFilenames: [] });
    expect(graph.nodes['1'].position.x).toBe(0); // depth 0
    expect(graph.nodes['2'].position.x).toBe(280); // depth 1
    expect(graph.nodes['3'].position.x).toBe(560); // depth 2
  });

  it('classifies opaque nodes and reports them as not executable', () => {
    const prompt: ComfyPrompt = {
      '1': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: 'flux1-dev.safetensors' } },
      '2': { class_type: 'WeirdCustomNode', inputs: { x: 1 } },
    };
    const { report } = importComfyPromptToWorkflowGraph(prompt, { knownModelFilenames: ['flux1-dev.safetensors'] });
    expect(report.opaqueNodes).toEqual([{ id: '2', classType: 'WeirdCustomNode' }]);
    expect(report.firstClassNodes).toBe(1);
    expect(report.executable).toBe(false);
  });

  it('reports unresolved models (advisory) but matches across known drift', () => {
    const prompt: ComfyPrompt = {
      '1': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: 'flux-dev.safetensors' } },
    };
    const resolved = importComfyPromptToWorkflowGraph(prompt, { knownModelFilenames: ['flux1-dev.safetensors'] });
    expect(resolved.report.unresolvedModels).toEqual([]); // flux-dev ~ flux1-dev
    const missing = importComfyPromptToWorkflowGraph(prompt, { knownModelFilenames: ['sdxl_base.safetensors'] });
    expect(missing.report.unresolvedModels).toEqual([{ nodeId: '1', field: 'ckpt_name', value: 'flux-dev.safetensors' }]);
  });
});
