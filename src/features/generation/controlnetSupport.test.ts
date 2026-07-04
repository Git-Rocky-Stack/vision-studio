import { describe, expect, it } from 'vitest';

import { resolveControlNetPreflight } from './controlnetSupport';
import type { GenerationControlNetLayerPayload } from '@/types/generation';
import type { ModelRecord } from '@/types/model';

function buildLayer(overrides: Partial<GenerationControlNetLayerPayload> = {}): GenerationControlNetLayerPayload {
  return {
    layer_id: 'c1',
    layer_name: 'Pose Guide',
    source_path: 'C:/inputs/pose.png',
    preprocessor: 'openpose',
    strength: 1,
    start_step: 0,
    end_step: 1,
    mask: { type: 'rectangle', points: [{ x: 0, y: 0 }], bounds: { x: 0, y: 0, width: 8, height: 8 } },
    ...overrides,
  };
}

function buildRecord(overrides: Partial<ModelRecord>): ModelRecord {
  // Only the required (M1) ModelRecord fields; the M3+ fields are optional.
  return {
    id: 'record',
    name: 'Record',
    artifact_type: 'controlnet',
    capability: 'image',
    base_architecture: 'sd15',
    source: 'huggingface',
    repo_id: null,
    revision: null,
    aux_repo_id: null,
    size: 'Unknown',
    status: 'ready',
    tier: 'verified',
    quality: 'balanced',
    runtime: 'local',
    hardware_class: 'laptop',
    vram: 'Unknown',
    description: '',
    license: null,
    gated: false,
    ...overrides,
  };
}

describe('resolveControlNetPreflight', () => {
  it('stays silent with no layers or an unresolved family', () => {
    expect(resolveControlNetPreflight([], 'sd15', [])).toEqual({ errors: [], missingRecordIds: [] });
    expect(resolveControlNetPreflight([buildLayer()], null, [])).toEqual({ errors: [], missingRecordIds: [] });
  });

  it('declines unsupported families with the PR3 message', () => {
    const result = resolveControlNetPreflight([buildLayer()], 'flux', []);
    expect(result.errors[0]).toMatch(/FLUX/);
    expect(result.errors[0]).toMatch(/#34 PR3/);
    expect(result.missingRecordIds).toEqual([]);
  });

  it('declines preprocessors with no model on the family', () => {
    const result = resolveControlNetPreflight([buildLayer({ preprocessor: 'scribble' })], 'sdxl', []);
    expect(result.errors[0]).toMatch(/scribble/);
    expect(result.errors[0]).toMatch(/SDXL/);
  });

  it('reports uninstalled ControlNet and annotator records', () => {
    const result = resolveControlNetPreflight([buildLayer()], 'sd15', [
      buildRecord({ id: 'controlnet-openpose-sd15', status: 'not_found' }),
    ]);
    expect(result.missingRecordIds).toEqual(['controlnet-openpose-sd15', 'annotator-openpose']);
    expect(result.errors[0]).toMatch(/Foundry/);
  });

  it('passes when every required record is ready', () => {
    const result = resolveControlNetPreflight([buildLayer()], 'sd15', [
      buildRecord({ id: 'controlnet-openpose-sd15' }),
      buildRecord({ id: 'annotator-openpose', artifact_type: 'annotator' }),
    ]);
    expect(result).toEqual({ errors: [], missingRecordIds: [] });
  });
});
