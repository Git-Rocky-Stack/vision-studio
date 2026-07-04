import { describe, expect, it } from 'vitest';

import {
  requiredRecordsFor,
  resolveControlNetPreflight,
  supportedPreprocessors,
} from './controlnetSupport';
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

  it('declines truly unsupported families', () => {
    const result = resolveControlNetPreflight([buildLayer()], 'svd', []);
    expect(result.errors[0]).toMatch(/not supported/);
    expect(result.errors[0]).toMatch(/SD 3.5 Large/);
    expect(result.missingRecordIds).toEqual([]);
  });

  it('declines preprocessors with no model on the family', () => {
    const result = resolveControlNetPreflight([buildLayer({ preprocessor: 'scribble' })], 'flux', []);
    expect(result.errors[0]).toMatch(/scribble/);
    expect(result.errors[0]).toMatch(/FLUX/);
    expect(result.errors[0]).toMatch(/canny/); // lists what IS supported
  });

  it('routes flux layers through the union record', () => {
    const result = resolveControlNetPreflight([buildLayer({ preprocessor: 'canny' })], 'flux', []);
    expect(result.missingRecordIds).toEqual(['controlnet-union-flux']);

    const ready = resolveControlNetPreflight([buildLayer({ preprocessor: 'canny' })], 'flux', [
      buildRecord({ id: 'controlnet-union-flux' }),
    ]);
    expect(ready).toEqual({ errors: [], missingRecordIds: [] });
  });

  it('routes a mixed sdxl stack entirely through the union', () => {
    const result = resolveControlNetPreflight(
      [buildLayer({ preprocessor: 'canny' }), buildLayer({ layer_id: 'c2', preprocessor: 'scribble' })],
      'sdxl',
      [buildRecord({ id: 'controlnet-canny-sdxl' })],
    );
    expect(result.missingRecordIds).toEqual(['controlnet-union-sdxl']);
  });

  it('declines known-incompatible checkpoints by id', () => {
    const schnell = resolveControlNetPreflight([buildLayer({ preprocessor: 'canny' })], 'flux', [], {
      modelId: 'flux-schnell',
    });
    expect(schnell.errors[0]).toMatch(/FLUX.1 \[dev\]/);

    const medium = resolveControlNetPreflight([buildLayer({ preprocessor: 'canny' })], 'sd35', [], {
      modelId: 'sd3.5-medium',
    });
    expect(medium.errors[0]).toMatch(/SD 3.5 Large/);
  });

  it('declines composition kinds diffusers does not ship', () => {
    const fluxInpaint = resolveControlNetPreflight([buildLayer({ preprocessor: 'canny' })], 'flux', [
      buildRecord({ id: 'controlnet-union-flux' }),
    ], { kind: 'inpaint' });
    expect(fluxInpaint.errors[0]).toMatch(/FLUX.1 Fill/);

    const sd35Img2img = resolveControlNetPreflight([buildLayer({ preprocessor: 'canny' })], 'sd35', [
      buildRecord({ id: 'controlnet-canny-sd35' }),
    ], { kind: 'img2img' });
    expect(sd35Img2img.errors[0]).toMatch(/SD 3.5/);
  });

  it('exposes per-family supported preprocessors and per-layer record needs', () => {
    expect(supportedPreprocessors('sdxl')).toEqual(['canny', 'depth', 'normal', 'openpose', 'scribble']);
    expect(supportedPreprocessors('flux')).toEqual(['canny', 'depth', 'openpose']);
    expect(supportedPreprocessors('sd35')).toEqual(['canny', 'depth']);
    expect(requiredRecordsFor('scribble', 'sdxl')).toEqual(['controlnet-union-sdxl']);
    expect(requiredRecordsFor('depth', 'sd15')).toEqual(['controlnet-depth-sd15', 'annotator-midas']);
    expect(requiredRecordsFor('scribble', 'flux')).toEqual([]);
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
