import { describe, expect, it } from 'vitest';

import type { UserAccountSummary, UserAccountsSnapshot } from '@/types/electron';

import {
  getActiveUserAccount,
  resolvePromptEnhancementRoute,
  resolveStillImageRoute,
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
