import { describe, expect, it } from 'vitest';

import type { GenerationReferenceImageLayerPayload } from '@/types/generation';
import type { ModelRecord } from '@/types/model';
import {
  MSG_SD35_SINGLE_IMAGE,
  NOTICE_REFERENCE_MASKS_GLOBAL,
  requiredReferenceRecords,
  resolveReferencePreflight,
} from './referenceSupport';

const MASK = {
  type: 'rectangle' as const,
  points: [{ x: 0, y: 0 }],
  bounds: { x: 0, y: 0, width: 8, height: 8 },
};

function refLayer(id: string): GenerationReferenceImageLayerPayload {
  return { layer_id: id, layer_name: `Ref ${id}`, source_path: `${id}.png`, mask: MASK, strength: 1 };
}

function record(id: string, status = 'ready'): ModelRecord {
  return {
    id,
    name: id,
    artifact_type: 'ip-adapter',
    capability: 'image',
    base_architecture: 'unknown',
    size: '1 GB',
    status,
    tier: 'verified',
    quality: 'balanced',
    runtime: 'local',
    hardware_class: 'creator',
    vram: '1 GB',
    description: '',
    source: 'huggingface',
  } as ModelRecord;
}

const READY = [
  record('ip-adapter-sd15'),
  record('ip-adapter-sdxl'),
  record('ip-adapter-encoder-vit-h'),
  record('ip-adapter-flux'),
  record('ip-adapter-encoder-clip-vit-l'),
];

describe('requiredReferenceRecords', () => {
  it('lists adapter + encoder per family and nothing for unsupported ones', () => {
    expect(requiredReferenceRecords('sd15')).toEqual(['ip-adapter-sd15', 'ip-adapter-encoder-vit-h']);
    expect(requiredReferenceRecords('sdxl')).toEqual(['ip-adapter-sdxl', 'ip-adapter-encoder-vit-h']);
    expect(requiredReferenceRecords('flux')).toEqual(['ip-adapter-flux', 'ip-adapter-encoder-clip-vit-l']);
    expect(requiredReferenceRecords('sd35')).toEqual([]);
    expect(requiredReferenceRecords(null)).toEqual([]);
  });
});

describe('resolveReferencePreflight', () => {
  it('stays silent for zero or one reference', () => {
    expect(resolveReferencePreflight([], 'sd15', READY, {}).errors).toEqual([]);
    expect(resolveReferencePreflight([refLayer('a')], 'sd15', READY, {}).errors).toEqual([]);
  });

  it('declines multi-reference on sd35 with the backend message', () => {
    const result = resolveReferencePreflight([refLayer('a'), refLayer('b')], 'sd35', READY, {});
    expect(result.errors).toEqual([MSG_SD35_SINGLE_IMAGE]);
  });

  it('declines flux-schnell by checkpoint id', () => {
    const result = resolveReferencePreflight(
      [refLayer('a'), refLayer('b')],
      'flux',
      READY,
      { modelId: 'flux-schnell' },
    );
    expect(result.errors[0]).toContain('distilled');
  });

  it('declines unsupported families with a switch-checkpoint message', () => {
    const result = resolveReferencePreflight([refLayer('a'), refLayer('b')], 'sd2', READY, {});
    expect(result.errors[0]).toContain('Multiple reference images are not supported');
  });

  it('reports missing records with a Foundry message', () => {
    const models = [record('ip-adapter-sd15', 'not_found'), record('ip-adapter-encoder-vit-h')];
    const result = resolveReferencePreflight([refLayer('a'), refLayer('b')], 'sd15', models, {});
    expect(result.missingRecordIds).toContain('ip-adapter-sd15');
    expect(result.errors[0]).toContain('Foundry');
  });

  it('carries the flux global-application notice without blocking', () => {
    const result = resolveReferencePreflight(
      [refLayer('a'), refLayer('b')],
      'flux',
      READY,
      { modelId: 'flux-dev' },
    );
    expect(result.errors).toEqual([]);
    expect(result.notices).toEqual([NOTICE_REFERENCE_MASKS_GLOBAL]);
  });

  it('mirrors the inpaint-plus-reference decline', () => {
    const result = resolveReferencePreflight([refLayer('a')], 'sd15', READY, { hasInpaint: true });
    expect(result.errors[0]).toContain('inpaint mask or a reference image');
  });

  it('stays silent when the family is unknown (backend is authoritative)', () => {
    expect(resolveReferencePreflight([refLayer('a'), refLayer('b')], null, READY, {}).errors).toEqual([]);
  });
});
