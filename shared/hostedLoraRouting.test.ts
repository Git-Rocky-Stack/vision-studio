import { describe, expect, it } from 'vitest';

import {
  OPENROUTER_LORA_UNSUPPORTED_MESSAGE,
  resolveHuggingFaceLoraAdapter,
  validateHuggingFaceLoraDispatch,
} from './hostedLoraRouting';

const HUB_FLUX_LORA = {
  id: 'flux-realism',
  name: 'FLUX Realism',
  artifact_type: 'lora',
  base_architecture: 'flux',
  repo_id: 'XLabs-AI/flux-RealismLora',
};

const LOCAL_FLUX_LORA = {
  id: 'flux-ink',
  name: 'Flux Ink',
  artifact_type: 'lora',
  base_architecture: 'flux',
  repo_id: null,
};

const HUB_SDXL_LORA = {
  id: 'detail-tweaker',
  name: 'Detail Tweaker',
  artifact_type: 'lora',
  base_architecture: 'sdxl',
  repo_id: 'someone/detail-tweaker-xl',
};

const MODELS = [HUB_FLUX_LORA, LOCAL_FLUX_LORA, HUB_SDXL_LORA];

describe('resolveHuggingFaceLoraAdapter', () => {
  it('accepts exactly one flux Hub-hosted LoRA at weight 1.0 and returns its repo id', () => {
    const decision = resolveHuggingFaceLoraAdapter([{ id: 'flux-realism', weight: 1 }], MODELS);
    expect(decision).toEqual({ ok: true, adapterRepoId: 'XLabs-AI/flux-RealismLora' });
  });

  it('declines more than one LoRA, naming the exactly-one condition', () => {
    const decision = resolveHuggingFaceLoraAdapter(
      [
        { id: 'flux-realism', weight: 1 },
        { id: 'detail-tweaker', weight: 1 },
      ],
      MODELS,
    );
    expect(decision.ok).toBe(false);
    if (!decision.ok) {
      expect(decision.reason).toMatch(/exactly one LoRA/);
      expect(decision.reason).toMatch(/back to Local/);
    }
  });

  it('declines a non-1.0 weight, naming the weight condition', () => {
    const decision = resolveHuggingFaceLoraAdapter([{ id: 'flux-realism', weight: 0.8 }], MODELS);
    expect(decision.ok).toBe(false);
    if (!decision.ok) {
      expect(decision.reason).toMatch(/weight 1\.0/);
      expect(decision.reason).toMatch(/back to Local/);
    }
  });

  it('declines a LoRA without a HuggingFace repo id, naming the Hub-hosted condition', () => {
    const decision = resolveHuggingFaceLoraAdapter([{ id: 'flux-ink', weight: 1 }], MODELS);
    expect(decision.ok).toBe(false);
    if (!decision.ok) {
      expect(decision.reason).toMatch(/Hub-hosted/);
      expect(decision.reason).toMatch(/Flux Ink/);
    }
  });

  it('declines a non-flux family, naming the FLUX-family condition', () => {
    const decision = resolveHuggingFaceLoraAdapter([{ id: 'detail-tweaker', weight: 1 }], MODELS);
    expect(decision.ok).toBe(false);
    if (!decision.ok) {
      expect(decision.reason).toMatch(/FLUX-family/);
      expect(decision.reason).toMatch(/sdxl/);
    }
  });

  it('declines a selection that is not in the installed library', () => {
    const decision = resolveHuggingFaceLoraAdapter([{ id: 'never-installed', weight: 1 }], MODELS);
    expect(decision.ok).toBe(false);
    if (!decision.ok) {
      expect(decision.reason).toMatch(/installed library/);
    }
  });

  it('never resolves through a non-LoRA record that shares the id', () => {
    const decision = resolveHuggingFaceLoraAdapter(
      [{ id: 'flux-checkpoint', weight: 1 }],
      [
        {
          id: 'flux-checkpoint',
          name: 'FLUX.1 dev',
          artifact_type: 'checkpoint',
          base_architecture: 'flux',
          repo_id: 'black-forest-labs/FLUX.1-dev',
        },
      ],
    );
    expect(decision.ok).toBe(false);
  });

  it('declines a malformed repo id instead of forwarding it to dispatch', () => {
    const decision = resolveHuggingFaceLoraAdapter(
      [{ id: 'weird', weight: 1 }],
      [
        {
          id: 'weird',
          name: 'Weird',
          artifact_type: 'lora',
          base_architecture: 'flux',
          repo_id: '../not/a/repo',
        },
      ],
    );
    expect(decision.ok).toBe(false);
    if (!decision.ok) {
      expect(decision.reason).toMatch(/Hub-hosted/);
    }
  });

  it('declines an empty selection list (nothing to route)', () => {
    const decision = resolveHuggingFaceLoraAdapter([], MODELS);
    expect(decision.ok).toBe(false);
  });
});

describe('validateHuggingFaceLoraDispatch', () => {
  it('passes a request without LoRAs untouched', () => {
    expect(validateHuggingFaceLoraDispatch(undefined, undefined)).toEqual({
      ok: true,
      adapterRepoId: null,
    });
    expect(validateHuggingFaceLoraDispatch([], undefined)).toEqual({
      ok: true,
      adapterRepoId: null,
    });
  });

  it('passes a single weight-1.0 LoRA with a well-formed adapter repo id', () => {
    expect(
      validateHuggingFaceLoraDispatch(
        [{ id: 'flux-realism', weight: 1 }],
        'XLabs-AI/flux-RealismLora',
      ),
    ).toEqual({ ok: true, adapterRepoId: 'XLabs-AI/flux-RealismLora' });
  });

  it('fails multiple LoRAs at the authoritative layer', () => {
    const verdict = validateHuggingFaceLoraDispatch(
      [
        { id: 'a', weight: 1 },
        { id: 'b', weight: 1 },
      ],
      'XLabs-AI/flux-RealismLora',
    );
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.reason).toMatch(/exactly one LoRA/);
  });

  it('fails a non-1.0 weight at the authoritative layer', () => {
    const verdict = validateHuggingFaceLoraDispatch(
      [{ id: 'a', weight: 0.5 }],
      'XLabs-AI/flux-RealismLora',
    );
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.reason).toMatch(/weight 1\.0/);
  });

  it('fails LoRA-bearing requests that carry no resolved adapter', () => {
    const verdict = validateHuggingFaceLoraDispatch([{ id: 'a', weight: 1 }], undefined);
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.reason).toMatch(/back to Local/);
  });

  it('fails a malformed adapter repo id instead of interpolating it into a URL', () => {
    for (const bad of ['../evil', 'a/b/c', 'https://example.com/x', ' ', 'no slash here']) {
      const verdict = validateHuggingFaceLoraDispatch([{ id: 'a', weight: 1 }], bad);
      expect(verdict.ok).toBe(false);
    }
  });

  it('fails malformed lora entries instead of trusting renderer input', () => {
    const verdict = validateHuggingFaceLoraDispatch(
      [{ id: 42, weight: 'heavy' }],
      'XLabs-AI/flux-RealismLora',
    );
    expect(verdict.ok).toBe(false);
  });
});

describe('OPENROUTER_LORA_UNSUPPORTED_MESSAGE', () => {
  it('states the prompt-only posture and the missing LoRA contract', () => {
    expect(OPENROUTER_LORA_UNSUPPORTED_MESSAGE).toMatch(/prompt-only/);
    expect(OPENROUTER_LORA_UNSUPPORTED_MESSAGE).toMatch(/no LoRA contract/);
    expect(OPENROUTER_LORA_UNSUPPORTED_MESSAGE).toMatch(/back to Local/);
  });
});
