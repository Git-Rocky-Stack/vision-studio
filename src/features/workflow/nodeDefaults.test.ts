import { describe, expect, it } from 'vitest';
import { FIRST_CLASS_NODES, NODE_REGISTRY, createWorkflowNodeFromClassType } from './nodeDefaults';

describe('node registry (M8 first-class set)', () => {
  it('marks the core text-to-image pipeline first-class', () => {
    for (const classType of [
      'CheckpointLoaderSimple', 'CLIPTextEncode', 'EmptyLatentImage', 'KSampler',
      'VAEDecode', 'SaveImage', 'PreviewImage', 'LoraLoader', 'VAELoader',
    ]) {
      expect(FIRST_CLASS_NODES.has(classType)).toBe(true);
    }
    expect(FIRST_CLASS_NODES.has('SomeCustomNode')).toBe(false);
  });

  it('uses LATENT as the KSampler output (its real ComfyUI output)', () => {
    expect(NODE_REGISTRY.KSampler.defaultOutput).toBe('LATENT');
  });

  it('registers the new loader/decoder nodes', () => {
    expect(NODE_REGISTRY.EmptyLatentImage.defaultOutput).toBe('LATENT');
    expect(NODE_REGISTRY.VAEDecode.defaultOutput).toBe('IMAGE');
    expect(NODE_REGISTRY.LoraLoader.defaultOutput).toBe('MODEL');
    expect(NODE_REGISTRY.VAELoader.defaultOutput).toBe('VAE');
  });

  it('defaults a checkpoint node to the backend-aligned filename', () => {
    const node = createWorkflowNodeFromClassType('CheckpointLoaderSimple', 0);
    expect(node.inputs.ckpt_name).toEqual({ kind: 'literal', value: 'flux1-dev.safetensors' });
  });

  it('defaults a LoRA Loader node to an unselected adapter at full strength (#43)', () => {
    const node = createWorkflowNodeFromClassType('LoraLoader', 0);
    expect(node.inputs.lora_name).toEqual({ kind: 'literal', value: '' });
    expect(node.inputs.strength_model).toEqual({ kind: 'literal', value: 1 });
    expect(node.inputs.strength_clip).toEqual({ kind: 'literal', value: 1 });
  });
});
