import type { UserAccountSummary } from '@/types/electron';
import type { ProviderId, RequestModality, FitVerdict } from '../../../shared/providerRouting';
import type { RouteResolverInput } from '../../../shared/resolveRoute';

/**
 * Renderer adapter (M6, S3). Translates the account + settings + fit verdict
 * into the narrow, dependency-free input the shared resolver consumes, deciding
 * which hosted providers are configured (key + a model for the modality).
 */

function hostedHasModelForModality(
  account: UserAccountSummary,
  provider: Exclude<ProviderId, 'local'>,
  modality: RequestModality,
): boolean {
  if (provider === 'openrouter') {
    // OpenRouter supports still-image + llm only; capability gating handles the rest.
    if (modality === 'still-image') return Boolean(account.preferences.openRouterImageModel.trim());
    if (modality === 'llm-assist') return Boolean(account.preferences.openRouterModel.trim());
    return false;
  }
  // huggingface
  if (modality === 'video') return Boolean(account.preferences.huggingFaceVideoModel.trim());
  if (modality === 'llm-assist') return Boolean(account.preferences.huggingFaceModel.trim());
  // still-image / controlnet / inpaint share the image model
  return Boolean(account.preferences.huggingFaceImageModel.trim());
}

export function configuredHostedProviders(
  account: UserAccountSummary | null,
  modality: RequestModality,
): ProviderId[] {
  if (!account) return [];
  const result: ProviderId[] = [];
  if (account.openRouter.apiKeyStored && hostedHasModelForModality(account, 'openrouter', modality)) {
    result.push('openrouter');
  }
  if (account.huggingFace.tokenStored && hostedHasModelForModality(account, 'huggingface', modality)) {
    result.push('huggingface');
  }
  return result;
}

export function buildRouteResolverInput({
  account,
  modality,
  requested,
  autoRouteOnOverBudget,
  fit,
}: {
  account: UserAccountSummary | null;
  modality: RequestModality;
  requested: ProviderId;
  autoRouteOnOverBudget: boolean;
  fit?: FitVerdict | null;
}): RouteResolverInput {
  return {
    modality,
    requested,
    configuredHosted: configuredHostedProviders(account, modality),
    autoRouteOnOverBudget,
    fit: fit ?? null,
    fallbackProvider: account?.preferences.fallbackProvider ?? null,
  };
}
