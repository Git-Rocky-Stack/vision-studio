import { describe, it, expect } from 'vitest';
import { foundryFit } from './foundryFit';
import type { RuntimePlan } from '@/types/model';

const base: RuntimePlan = {
  pipeline_class: null,
  precision: null,
  offload: false,
  vae_tiling: false,
  attention_slicing: false,
  single_file: false,
  config_catalog_id: null,
  vram_plan: null,
  fit: null,
  missing_components: [],
  fallback_ladder: [],
  readiness: '',
  refusal: null,
};

describe('foundryFit', () => {
  it('maps fit verdicts to LED tones', () => {
    expect(foundryFit({ ...base, fit: 'fits', readiness: 'Fits comfortably' }).tone).toBe('play');
    expect(foundryFit({ ...base, fit: 'fits-with-offload', readiness: 'Fits with offload' }).tone).toBe('cue');
    expect(foundryFit({ ...base, fit: 'over-budget', readiness: 'Over budget' }).tone).toBe('rec');
    expect(foundryFit({ ...base, fit: 'cpu-only', readiness: 'CPU only' }).tone).toBe('rec');
  });

  it('uses the readiness string as the label', () => {
    expect(foundryFit({ ...base, fit: 'fits', readiness: 'Fits comfortably' }).label).toBe('Fits comfortably');
  });

  it('prefers a refusal over the fit tone', () => {
    const result = foundryFit({ ...base, fit: 'fits', refusal: 'Format not supported' });
    expect(result.tone).toBe('rec');
    expect(result.label).toBe('Format not supported');
  });

  it('flags missing components as a caution', () => {
    const result = foundryFit({ ...base, missing_components: ['vae'], readiness: 'Missing VAE' });
    expect(result.tone).toBe('cue');
    expect(result.label).toBe('Missing VAE');
  });

  it('returns a null tone for an unknown verdict', () => {
    expect(foundryFit({ ...base, fit: null, readiness: 'Unknown' }).tone).toBeNull();
  });
});
