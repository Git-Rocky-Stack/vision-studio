import { describe, expect, it } from 'vitest';

import type { UserAccountSummary, UserAccountsSnapshot } from '@/types/electron';

import {
  getActiveUserAccount,
  resolvePromptEnhancementRoute,
  resolveStillImageRoute,
} from './providerRouting';

function makeAccount(overrides?: Partial<UserAccountSummary>): UserAccountSummary {
  const preferences = overrides?.preferences ?? {};
  const openRouter = overrides?.openRouter ?? {};

  return {
    id: 'account-primary',
    name: 'Primary',
    createdAt: '2026-04-24T00:00:00.000Z',
    updatedAt: '2026-04-24T00:00:00.000Z',
    preferences: {
      promptEnhancementProvider: 'local',
      openRouterModel: '',
      imageGenerationProvider: 'local',
      openRouterImageModel: '',
      ...preferences,
    },
    openRouter: {
      apiKeyStored: false,
      keyLabel: null,
      lastValidatedAt: null,
      ...openRouter,
    },
    ...(overrides?.id ? { id: overrides.id } : {}),
    ...(overrides?.name ? { name: overrides.name } : {}),
    ...(overrides?.createdAt ? { createdAt: overrides.createdAt } : {}),
    ...(overrides?.updatedAt ? { updatedAt: overrides.updatedAt } : {}),
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
});
