import { describe, expect, it } from 'vitest';
import type { UserAccountSummary } from '@/types/electron';
import { configuredHostedProviders, buildRouteResolverInput } from './buildRouteResolverInput';

function account(overrides?: {
  preferences?: Partial<UserAccountSummary['preferences']>;
  openRouter?: Partial<UserAccountSummary['openRouter']>;
  huggingFace?: Partial<UserAccountSummary['huggingFace']>;
}): UserAccountSummary {
  return {
    id: 'a1',
    name: 'Primary',
    createdAt: '',
    updatedAt: '',
    preferences: {
      promptEnhancementProvider: 'local',
      openRouterModel: '',
      imageGenerationProvider: 'local',
      openRouterImageModel: '',
      huggingFaceModel: '',
      huggingFaceImageModel: '',
      huggingFaceVideoModel: '',
      fallbackProvider: null,
      ...overrides?.preferences,
    },
    openRouter: { apiKeyStored: false, keyLabel: null, lastValidatedAt: null, ...overrides?.openRouter },
    huggingFace: { tokenStored: false, keyLabel: null, lastValidatedAt: null, ...overrides?.huggingFace },
  };
}

describe('configuredHostedProviders', () => {
  it('reports a hosted provider configured only with a key AND a model for the modality', () => {
    const ready = account({
      openRouter: { apiKeyStored: true },
      preferences: { openRouterImageModel: 'x/y' },
    });
    expect(configuredHostedProviders(ready, 'still-image')).toEqual(['openrouter']);
  });

  it('treats HF as configured for video only with a token + video model', () => {
    const ready = account({
      huggingFace: { tokenStored: true },
      preferences: { huggingFaceVideoModel: 'Lightricks/LTX-Video', fallbackProvider: 'huggingface' },
    });
    expect(configuredHostedProviders(ready, 'video')).toEqual(['huggingface']);
  });

  it('does not report HF for video when only an image model is set', () => {
    const partial = account({
      huggingFace: { tokenStored: true },
      preferences: { huggingFaceImageModel: 'black-forest-labs/FLUX.1-schnell' },
    });
    expect(configuredHostedProviders(partial, 'video')).toEqual([]);
    expect(configuredHostedProviders(partial, 'still-image')).toEqual(['huggingface']);
  });
});

describe('buildRouteResolverInput', () => {
  it('assembles a resolver input from the account + settings + fit', () => {
    const input = buildRouteResolverInput({
      account: account({ preferences: { fallbackProvider: 'huggingface' } }),
      modality: 'still-image',
      requested: 'local',
      autoRouteOnOverBudget: true,
      fit: 'over-budget',
    });
    expect(input).toMatchObject({
      modality: 'still-image',
      requested: 'local',
      autoRouteOnOverBudget: true,
      fit: 'over-budget',
      fallbackProvider: 'huggingface',
    });
  });
});
