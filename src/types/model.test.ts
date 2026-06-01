import { describe, expect, it } from 'vitest';
import { isImageCapability, type ModelInfo, type ModelRecord } from './model';

const sample: ModelRecord = {
  id: 'flux-dev',
  name: 'FLUX.1 [dev]',
  artifact_type: 'checkpoint',
  capability: 'image',
  base_architecture: 'flux',
  source: 'huggingface',
  repo_id: 'black-forest-labs/FLUX.1-dev',
  revision: 'main',
  aux_repo_id: null,
  size: '23.8 GB',
  status: 'not_found',
  tier: 'verified',
  quality: 'pro',
  runtime: 'byom',
  hardware_class: 'workstation',
  vram: '23.8 GB',
  description: 'desc',
  license: 'flux-1-dev-non-commercial',
  gated: true,
};

describe('ModelRecord', () => {
  it('isImageCapability is true for image and inpaint/edit, false for video', () => {
    expect(isImageCapability(sample)).toBe(true);
    expect(isImageCapability({ ...sample, capability: 'inpaint' })).toBe(true);
    expect(isImageCapability({ ...sample, capability: 'edit' })).toBe(true);
    expect(isImageCapability({ ...sample, capability: 'video' })).toBe(false);
  });

  it('a ModelRecord is assignable where the legacy ModelInfo is expected', () => {
    // Compile-time guarantee that existing ModelInfo consumers keep working.
    const asInfo: ModelInfo = sample;
    expect(asInfo.id).toBe('flux-dev');
  });
});
