import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAppStore } from '../appStore';
import { selectModelsByCapability } from './modelsSlice';
import type { ModelRecord } from '@/types/model';

function record(over: Partial<ModelRecord>): ModelRecord {
  return {
    id: 'flux-dev', name: 'FLUX.1 [dev]', artifact_type: 'checkpoint', capability: 'image',
    base_architecture: 'flux', source: 'huggingface', repo_id: 'org/x', revision: 'main',
    aux_repo_id: null, size: '1 GB', status: 'ready', tier: 'verified', quality: 'pro',
    runtime: 'local', hardware_class: 'workstation', vram: '1 GB', description: '', license: null,
    gated: false, ...over,
  };
}

describe('modelsSlice', () => {
  beforeEach(() => {
    useAppStore.setState({ availableModels: [] });
  });

  it('setAvailableModels replaces the catalog', () => {
    useAppStore.getState().setAvailableModels([record({ id: 'a' }), record({ id: 'b' })]);
    expect(useAppStore.getState().availableModels.map((m) => m.id)).toEqual(['a', 'b']);
  });

  it('loadModels fetches records from the backend bridge and stores them', async () => {
    const list = vi.fn().mockResolvedValue([record({ id: 'flux-dev' }), record({ id: 'ltx-video', capability: 'video' })]);
    (globalThis as any).window = { electron: { models: { list } } };

    await useAppStore.getState().loadModels();

    expect(list).toHaveBeenCalledOnce();
    expect(useAppStore.getState().availableModels).toHaveLength(2);
  });

  it('loadModels swallows backend errors and leaves the catalog intact', async () => {
    useAppStore.getState().setAvailableModels([record({ id: 'keep' })]);
    const list = vi.fn().mockRejectedValue(new Error('backend down'));
    (globalThis as any).window = { electron: { models: { list } } };

    await useAppStore.getState().loadModels();

    expect(useAppStore.getState().availableModels.map((m) => m.id)).toEqual(['keep']);
  });
});

describe('selectModelsByCapability artifact-type allowlist (#34)', () => {
  it('keeps auxiliary records out of the generation pickers', () => {
    const models = [
      record({ id: 'sd-1-5', artifact_type: 'checkpoint', capability: 'image' }),
      record({ id: 'pipeline', artifact_type: 'diffusers-pipeline', capability: 'image' }),
      record({ id: 'controlnet-canny-sd15', artifact_type: 'controlnet', capability: 'image' }),
      record({ id: 'annotator-midas', artifact_type: 'annotator', capability: 'image' }),
      record({ id: 'some-lora', artifact_type: 'lora', capability: 'image' }),
      record({ id: 'ip-adapter-sd15', artifact_type: 'ip-adapter', capability: 'image' }),
      record({ id: 'edit-u2net', artifact_type: 'edit-model', capability: 'edit', source: 'github' }),
    ];
    expect(selectModelsByCapability(models, 'image').map((m) => m.id)).toEqual([
      'sd-1-5',
      'pipeline',
    ]);
  });

  it('video pickers stay checkpoint-only too', () => {
    const models = [
      record({ id: 'ltx-video', artifact_type: 'diffusers-pipeline', capability: 'video' }),
      record({ id: 'video-lora', artifact_type: 'lora', capability: 'video' }),
    ];
    expect(selectModelsByCapability(models, 'video').map((m) => m.id)).toEqual(['ltx-video']);
  });
});
