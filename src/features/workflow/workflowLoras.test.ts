import { describe, expect, it } from 'vitest';

import type { ModelRecord } from '@/types/model';
import type { WorkflowGraph } from '@/types/workflow';
import {
  buildLoraNodeOptions,
  comfyLoraName,
  graphCheckpointName,
  resolveCheckpointRecord,
  resolveLoraByComfyName,
} from './workflowLoras';

function record(overrides: Partial<ModelRecord>): ModelRecord {
  return {
    id: 'record',
    name: 'Record',
    artifact_type: 'checkpoint',
    capability: 'image',
    base_architecture: 'sdxl',
    source: 'local',
    repo_id: null,
    revision: null,
    aux_repo_id: null,
    size: '1 GB',
    status: 'ready',
    tier: 'verified',
    quality: 'balanced',
    runtime: 'local',
    hardware_class: 'creator',
    vram: '8 GB',
    description: '',
    license: null,
    gated: false,
    ...overrides,
  };
}

const SDXL_LORA = record({
  id: 'detail-tweaker',
  name: 'Detail Tweaker',
  artifact_type: 'lora',
  base_architecture: 'sdxl',
  locations: ['C:\\models\\loras\\detail-tweaker-xl.safetensors'],
});

const FLUX_LORA = record({
  id: 'flux-ink',
  name: 'Flux Ink',
  artifact_type: 'lora',
  base_architecture: 'flux',
  locations: ['/data/loras/flux-ink.safetensors'],
});

const UNAVAILABLE_LORA = record({
  id: 'gone-lora',
  name: 'Gone LoRA',
  artifact_type: 'lora',
  base_architecture: 'sdxl',
  availability: 'unavailable',
});

const FLUX_CHECKPOINT = record({
  id: 'flux-dev',
  name: 'FLUX.1 dev',
  artifact_type: 'checkpoint',
  base_architecture: 'flux',
  locations: ['C:/models/checkpoints/flux-dev.safetensors'],
});

describe('comfyLoraName', () => {
  it('uses the basename of the first indexed location, windows or posix', () => {
    expect(comfyLoraName(SDXL_LORA)).toBe('detail-tweaker-xl.safetensors');
    expect(comfyLoraName(FLUX_LORA)).toBe('flux-ink.safetensors');
  });

  it('falls back to an id-derived filename when no location is indexed', () => {
    expect(comfyLoraName(record({ id: 'no-files', artifact_type: 'lora' }))).toBe(
      'no-files.safetensors',
    );
  });
});

describe('buildLoraNodeOptions', () => {
  const models = [SDXL_LORA, FLUX_LORA, UNAVAILABLE_LORA, FLUX_CHECKPOINT];

  it('offers only installed LoRA records', () => {
    const options = buildLoraNodeOptions(models, null);
    expect(options.map((option) => option.value)).toEqual([
      'detail-tweaker-xl.safetensors',
      'flux-ink.safetensors',
    ]);
    expect(options.map((option) => option.label)).toEqual(['Detail Tweaker', 'Flux Ink']);
  });

  it('flags base-architecture compatibility against the graph checkpoint', () => {
    const options = buildLoraNodeOptions(models, 'flux');
    expect(options.find((option) => option.value === 'flux-ink.safetensors')?.compatible).toBe(true);
    expect(
      options.find((option) => option.value === 'detail-tweaker-xl.safetensors')?.compatible,
    ).toBe(false);
  });

  it('treats every LoRA as selectable when the checkpoint family is unknown', () => {
    const options = buildLoraNodeOptions(models, null);
    expect(options.every((option) => option.compatible)).toBe(true);
  });
});

describe('resolveLoraByComfyName', () => {
  const models = [SDXL_LORA, FLUX_LORA, FLUX_CHECKPOINT];

  it('matches the ComfyUI-visible filename case-insensitively', () => {
    expect(resolveLoraByComfyName('Detail-Tweaker-XL.safetensors', models)?.id).toBe('detail-tweaker');
  });

  it('matches by record id and display name as fallbacks', () => {
    expect(resolveLoraByComfyName('flux-ink', models)?.id).toBe('flux-ink');
    expect(resolveLoraByComfyName('Detail Tweaker', models)?.id).toBe('detail-tweaker');
  });

  it('never resolves to a non-LoRA record and returns null for unknowns', () => {
    expect(resolveLoraByComfyName('flux-dev.safetensors', models)).toBeNull();
    expect(resolveLoraByComfyName('never-heard-of-it.safetensors', models)).toBeNull();
  });
});

describe('resolveCheckpointRecord', () => {
  const models = [FLUX_CHECKPOINT, SDXL_LORA];

  it('matches by id, name, and filename stem', () => {
    expect(resolveCheckpointRecord('flux-dev', models)?.id).toBe('flux-dev');
    expect(resolveCheckpointRecord('FLUX.1 dev', models)?.id).toBe('flux-dev');
    expect(resolveCheckpointRecord('flux-dev.safetensors', models)?.id).toBe('flux-dev');
  });

  it('never resolves to a LoRA record and returns null for unknowns', () => {
    expect(resolveCheckpointRecord('detail-tweaker', models)).toBeNull();
    expect(resolveCheckpointRecord('mystery.safetensors', models)).toBeNull();
  });
});

describe('graphCheckpointName', () => {
  it('reads the first checkpoint loader ckpt_name literal', () => {
    const graph: WorkflowGraph = {
      nodes: {
        model: {
          id: 'model',
          classType: 'CheckpointLoaderSimple',
          label: 'Model Loader',
          position: { x: 0, y: 0 },
          inputs: { ckpt_name: { kind: 'literal', value: 'flux-dev.safetensors' } },
        },
      },
      edges: [],
    };
    expect(graphCheckpointName(graph)).toBe('flux-dev.safetensors');
  });

  it('returns null when the graph has no checkpoint loader', () => {
    expect(graphCheckpointName({ nodes: {}, edges: [] })).toBeNull();
  });
});
