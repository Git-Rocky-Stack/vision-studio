import { describe, expect, it } from 'vitest';
import type { ProvisionModel } from '@/types/model';
import {
  defaultCustomSelection,
  groupByTier,
  installChoices,
  modelRemainingBytes,
  modelSize,
} from './provisionSelection';

const GB = 1024 ** 3;

function model(over: Partial<ProvisionModel> = {}): ProvisionModel {
  return {
    id: 'm', name: 'M', license: null, attribution: null, approx_bytes: 4 * GB, format: 'safetensors',
    gated: false, status: 'missing', progress: 0, error: null, gate_url: null, ...over,
  };
}

describe('provisionSelection', () => {
  it('prefers the exact K3 size over the registry estimate', () => {
    expect(modelSize(model())).toBe(4 * GB);
    expect(modelSize(model({ size_bytes: 3 * GB }))).toBe(3 * GB);
    expect(modelSize(model({ size_bytes: Number.NaN }))).toBe(4 * GB);
  });

  it('counts only the unfetched share of a resumable model', () => {
    expect(modelRemainingBytes(model({ status: 'cancelled', progress: 0.25 }))).toBe(3 * GB);
    expect(modelRemainingBytes(model({ status: 'ready', progress: 1 }))).toBe(0);
  });

  it('treats a tierless model as core when the backend reports tiers for others', () => {
    const models = [model({ id: 'a', tier: 'extended' }), model({ id: 'b' })];
    expect(installChoices(models).core?.ids).toEqual(['b']);
    expect(groupByTier(models).map((g) => g.tier)).toEqual(['core', 'extended']);
  });

  it('offers no core choice for a backend without tiers', () => {
    const models = [model({ id: 'a' }), model({ id: 'b' })];
    const choices = installChoices(models);
    expect(choices.tiered).toBe(false);
    expect(choices.core).toBeNull();
    expect(choices.everything.ids).toEqual(['a', 'b']);
    expect(groupByTier(models)).toHaveLength(1);
  });

  it('leaves paused and failed models to Resume / Retry rather than the install choices', () => {
    const models = [
      model({ id: 'paused', status: 'paused', tier: 'core' }),
      model({ id: 'failed', status: 'error', tier: 'core' }),
      model({ id: 'fresh', tier: 'core' }),
    ];
    expect(installChoices(models).everything.ids).toEqual(['fresh']);
    expect([...defaultCustomSelection(models)]).toEqual(['fresh']);
  });
});
