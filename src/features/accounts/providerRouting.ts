import type { UserAccountSummary, UserAccountsSnapshot } from '@/types/electron';

export type HostedProvider = 'local' | 'openrouter';

export interface ProviderRouteState {
  activeAccount: UserAccountSummary | null;
  provider: HostedProvider;
  providerLabel: string;
  model: string;
  configured: boolean;
  supportsOffline: boolean;
  error: string | null;
}

export function getActiveUserAccount(snapshot?: UserAccountsSnapshot | null) {
  if (!snapshot) {
    return null;
  }

  const accounts = Array.isArray(snapshot.accounts) ? snapshot.accounts : [];

  return accounts.find((account) => account.id === snapshot.activeAccountId) ?? accounts[0] ?? null;
}

export function resolveStillImageRoute(activeAccount: UserAccountSummary | null): ProviderRouteState {
  const provider = activeAccount?.preferences.imageGenerationProvider ?? 'local';
  const model = activeAccount?.preferences.openRouterImageModel.trim() ?? '';

  if (provider !== 'openrouter') {
    return {
      activeAccount,
      provider: 'local',
      providerLabel: 'Local Backend',
      model,
      configured: true,
      supportsOffline: false,
      error: null,
    };
  }

  if (!activeAccount?.openRouter.apiKeyStored) {
    return {
      activeAccount,
      provider,
      providerLabel: 'OpenRouter Still Image Route',
      model,
      configured: false,
      supportsOffline: false,
      error: 'OpenRouter is selected for still images, but no API key is stored for the active account.',
    };
  }

  if (!model) {
    return {
      activeAccount,
      provider,
      providerLabel: 'OpenRouter Still Image Route',
      model,
      configured: false,
      supportsOffline: false,
      error: 'Select an OpenRouter still-image model for the active account before generating.',
    };
  }

  return {
    activeAccount,
    provider,
    providerLabel: 'OpenRouter Still Image Route',
    model,
    configured: true,
    supportsOffline: true,
    error: null,
  };
}

export function resolvePromptEnhancementRoute(
  activeAccount: UserAccountSummary | null,
): ProviderRouteState {
  const provider = activeAccount?.preferences.promptEnhancementProvider ?? 'local';
  const model = activeAccount?.preferences.openRouterModel.trim() ?? '';

  if (provider !== 'openrouter') {
    return {
      activeAccount,
      provider: 'local',
      providerLabel: 'Local Prompt Tools',
      model,
      configured: true,
      supportsOffline: false,
      error: null,
    };
  }

  if (!activeAccount?.openRouter.apiKeyStored) {
    return {
      activeAccount,
      provider,
      providerLabel: 'OpenRouter Prompt Route',
      model,
      configured: false,
      supportsOffline: false,
      error: 'OpenRouter is selected for prompt enhancement, but no API key is stored for the active account.',
    };
  }

  return {
    activeAccount,
    provider,
    providerLabel: 'OpenRouter Prompt Route',
    model,
    configured: true,
    supportsOffline: false,
    error: null,
  };
}
