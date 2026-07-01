import { describe, expect, it } from 'vitest';
import { selectInstalledLoras, isLoraCompatible } from './modelsSlice';
import type { ModelRecord } from '@/types/model';

function rec(over: Partial<ModelRecord>): ModelRecord {
  return {
    id: 'x', name: 'X', artifact_type: 'checkpoint', capability: 'image',
    base_architecture: 'sdxl', source: 'local', repo_id: null, revision: null,
    aux_repo_id: null, size: '144 MB', status: 'ready', tier: 'compatible',
    quality: 'balanced', runtime: 'local', hardware_class: 'creator', vram: '',
    description: '', license: null, gated: false, ...over,
  };
}

describe('selectInstalledLoras', () => {
  it('returns only installed lora records', () => {
    const models = [
      rec({ id: 'a', artifact_type: 'lora', base_architecture: 'sdxl' }),
      rec({ id: 'b', artifact_type: 'checkpoint' }),
      rec({ id: 'c', artifact_type: 'lora', availability: 'unavailable' }),
    ];
    expect(selectInstalledLoras(models).map((m) => m.id)).toEqual(['a']);
  });
});

describe('isLoraCompatible', () => {
  it('accepts matching and sd-unet-family loras, rejects cross-family', () => {
    expect(isLoraCompatible('sdxl', 'sdxl')).toBe(true);
    expect(isLoraCompatible('sdxl', 'sd-unet-family')).toBe(true);
    expect(isLoraCompatible('sdxl', 'flux')).toBe(false);
    expect(isLoraCompatible('animatediff', 'sd-unet-family')).toBe(true);
  });
  it('rejects everything for svd and a null checkpoint', () => {
    expect(isLoraCompatible('svd', 'sd15')).toBe(false);
    expect(isLoraCompatible(null, 'sdxl')).toBe(false);
    expect(isLoraCompatible('flux', 'unrecognized')).toBe(false);
  });
});
