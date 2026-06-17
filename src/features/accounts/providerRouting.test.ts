import { describe, expect, it } from 'vitest';

import type { UserAccountSummary, UserAccountsSnapshot } from '@/types/electron';

import {
  getActiveUserAccount,
  isHostedStillImageRoute,
  isHostedVideoRoute,
  resolvePromptEnhancementRoute,
  resolveStillImageRoute,
  resolveVideoRoute,
} from './providerRouting';

type AccountOverrides = {
  id?: string;
  name?: string;
  createdAt?: string;
  updatedAt?: string;
  preferences?: Partial<UserAccountSummary['preferences']>;
  openRouter?: Partial<UserAccountSummary['openRouter']>;
  huggingFace?: Partial<UserAccountSummary['huggingFace']>;
};

function makeAccount(overrides?: AccountOverrides): UserAccountSummary {
  return {
    id: overrides?.id ?? 'account-primary',
    name: overrides?.name ?? 'Primary',
    createdAt: overrides?.createdAt ?? '2026-04-24T00:00:00.000Z',
    updatedAt: overrides?.updatedAt ?? '2026-04-24T00:00:00.000Z',
    preferences: {
      promptEnhancementProvider: 'local',
      openRouterModel: '',
      imageGenerationProvider: 'local',
      videoGenerationProvider: 'local',
      openRouterImageModel: '',
      huggingFaceModel: '',
      huggingFaceImageModel: '',
      huggingFaceVideoModel: '',
      fallbackProvider: null,
      ...overrides?.preferences,
    },
    openRouter: {
      apiKeyStored: false,
      keyLabel: null,
      lastValidatedAt: null,
      ...overrides?.openRouter,
    },
    huggingFace: {
      tokenStored: false,
      keyLabel: null,
      lastValidatedAt: null,
      ...overrides?.huggingFace,
    },
  };
}

describe('providerRouting', () => {
  it('resolves the active account from the snapshot', () => {
    const secondary = makeAccount({ id: 'account-secondary', name: 'Secondary' });
    const snapshot: UserAccountsSnapshot = {
      activeAccountId: 'account-secondary',
      accounts: [makeAccount(), secondary],
    };

    expect(getActiveUserAccount(snapshot)).toMatchObject({
      id: 'account-secondary',
      name: 'Secondary',
    });
  });

  it('marks the hosted still-image route ready when an OpenRouter account is configured', () => {
    const route = resolveStillImageRoute(
      makeAccount({
        preferences: {
          promptEnhancementProvider: 'local',
          openRouterModel: '',
          imageGenerationProvider: 'openrouter',
          openRouterImageModel: 'google/gemini-2.5-flash-image',
        },
        openRouter: {
          apiKeyStored: true,
          keyLabel: 'Primary Key',
          lastValidatedAt: '2026-04-24T01:00:00.000Z',
        },
      }),
    );

    expect(route).toMatchObject({
      provider: 'openrouter',
      configured: true,
      supportsOffline: true,
      model: 'google/gemini-2.5-flash-image',
      error: null,
    });
  });

  it('returns a configuration error when the hosted still-image route is missing a model', () => {
    const route = resolveStillImageRoute(
      makeAccount({
        preferences: {
          promptEnhancementProvider: 'local',
          openRouterModel: '',
          imageGenerationProvider: 'openrouter',
          openRouterImageModel: '',
        },
        openRouter: {
          apiKeyStored: true,
          keyLabel: 'Primary Key',
          lastValidatedAt: '2026-04-24T01:00:00.000Z',
        },
      }),
    );

    expect(route.configured).toBe(false);
    expect(route.error).toContain('Select an OpenRouter still-image model');
  });

  it('marks the still-image route ready when a HuggingFace account is configured', () => {
    const route = resolveStillImageRoute(
      makeAccount({
        preferences: {
          imageGenerationProvider: 'huggingface',
          huggingFaceImageModel: 'black-forest-labs/FLUX.1-schnell',
        },
        huggingFace: { tokenStored: true, keyLabel: 'HF Key', lastValidatedAt: null },
      }),
    );

    expect(route).toMatchObject({
      provider: 'huggingface',
      configured: true,
      supportsOffline: true,
      model: 'black-forest-labs/FLUX.1-schnell',
      error: null,
    });
  });

  it('flags the HuggingFace still-image route when no token is stored', () => {
    const route = resolveStillImageRoute(
      makeAccount({
        preferences: {
          imageGenerationProvider: 'huggingface',
          huggingFaceImageModel: 'black-forest-labs/FLUX.1-schnell',
        },
      }),
    );

    expect(route.provider).toBe('huggingface');
    expect(route.configured).toBe(false);
    expect(route.error).toContain('no token is stored');
  });

  it('flags the HuggingFace still-image route when no model is selected', () => {
    const route = resolveStillImageRoute(
      makeAccount({
        preferences: {
          imageGenerationProvider: 'huggingface',
          huggingFaceImageModel: '',
        },
        huggingFace: { tokenStored: true, keyLabel: 'HF Key', lastValidatedAt: null },
      }),
    );

    expect(route.configured).toBe(false);
    expect(route.error).toContain('Select a HuggingFace image model');
  });

  it('treats OpenRouter and HuggingFace as hosted routes, local as not hosted', () => {
    const openRouter = resolveStillImageRoute(
      makeAccount({
        preferences: { imageGenerationProvider: 'openrouter', openRouterImageModel: 'x' },
        openRouter: { apiKeyStored: true, keyLabel: 'k', lastValidatedAt: null },
      }),
    );
    const huggingFace = resolveStillImageRoute(
      makeAccount({
        preferences: { imageGenerationProvider: 'huggingface', huggingFaceImageModel: 'm' },
        huggingFace: { tokenStored: true, keyLabel: 'k', lastValidatedAt: null },
      }),
    );
    const local = resolveStillImageRoute(makeAccount());

    expect(isHostedStillImageRoute(openRouter)).toBe(true);
    expect(isHostedStillImageRoute(huggingFace)).toBe(true);
    expect(isHostedStillImageRoute(local)).toBe(false);
  });

  it('treats a misconfigured HuggingFace route as hosted (config error, not a backend error)', () => {
    const huggingFace = resolveStillImageRoute(
      makeAccount({ preferences: { imageGenerationProvider: 'huggingface' } }),
    );

    expect(isHostedStillImageRoute(huggingFace)).toBe(true);
    expect(huggingFace.configured).toBe(false);
  });

  it('marks the HuggingFace video route ready and hosted when token + model are configured', () => {
    const route = resolveVideoRoute(
      makeAccount({
        preferences: {
          videoGenerationProvider: 'huggingface',
          huggingFaceVideoModel: 'Lightricks/LTX-Video',
        },
        huggingFace: { tokenStored: true, keyLabel: 'HF Key', lastValidatedAt: null },
      }),
    );

    expect(route).toMatchObject({
      provider: 'huggingface',
      configured: true,
      supportsOffline: true,
      model: 'Lightricks/LTX-Video',
      error: null,
    });
    expect(isHostedVideoRoute(route)).toBe(true);
  });

  it('flags the HuggingFace video route when no token is stored (matches the main guard string)', () => {
    const route = resolveVideoRoute(
      makeAccount({
        preferences: {
          videoGenerationProvider: 'huggingface',
          huggingFaceVideoModel: 'Lightricks/LTX-Video',
        },
      }),
    );

    expect(route.provider).toBe('huggingface');
    expect(route.configured).toBe(false);
    // A misconfigured hosted route is still hosted: a config error, not a
    // backend-offline error, must surface.
    expect(isHostedVideoRoute(route)).toBe(true);
    expect(route.error).toBe(
      'HuggingFace is selected for video, but no token is stored for the active account.',
    );
  });

  it('flags the HuggingFace video route when no model is selected (matches the main guard string)', () => {
    const route = resolveVideoRoute(
      makeAccount({
        preferences: { videoGenerationProvider: 'huggingface', huggingFaceVideoModel: '' },
        huggingFace: { tokenStored: true, keyLabel: 'HF Key', lastValidatedAt: null },
      }),
    );

    expect(route.configured).toBe(false);
    expect(route.error).toBe('Select a HuggingFace video model for the active account before generating.');
  });

  it('resolves video to the local backend (not hosted) when no hosted video provider is selected', () => {
    const local = resolveVideoRoute(makeAccount());
    expect(local.provider).toBe('local');
    expect(local.supportsOffline).toBe(false);
    expect(isHostedVideoRoute(local)).toBe(false);
  });

  it('returns a configuration error when the OpenRouter prompt route is missing an API key', () => {
    const route = resolvePromptEnhancementRoute(
      makeAccount({
        preferences: {
          promptEnhancementProvider: 'openrouter',
          openRouterModel: 'openai/gpt-4o-mini',
          imageGenerationProvider: 'local',
          openRouterImageModel: '',
        },
      }),
    );

    expect(route.configured).toBe(false);
    expect(route.error).toContain('no API key is stored');
  });

  it('routes prompt enhancement to HuggingFace when the account is configured', () => {
    const route = resolvePromptEnhancementRoute(
      makeAccount({
        preferences: {
          promptEnhancementProvider: 'huggingface',
          huggingFaceModel: 'meta-llama/Llama-3.1-8B-Instruct',
        },
        huggingFace: { tokenStored: true, keyLabel: null, lastValidatedAt: null },
      }),
    );

    expect(route).toMatchObject({ provider: 'huggingface', configured: true, error: null });
  });

  it('flags the HuggingFace prompt route when no token is stored', () => {
    const route = resolvePromptEnhancementRoute(
      makeAccount({ preferences: { promptEnhancementProvider: 'huggingface' } }),
    );

    expect(route.configured).toBe(false);
    expect(route.error).toContain('no token is stored');
  });
});
