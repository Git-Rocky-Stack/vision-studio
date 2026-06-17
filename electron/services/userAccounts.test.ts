import { describe, expect, it } from 'vitest';
import { createUserAccountsService } from './userAccounts';

function createSafeStorage(available = true) {
  return {
    isEncryptionAvailable: () => available,
    encryptString: (plainText: string) => Buffer.from(`secure:${plainText}`, 'utf8'),
    decryptString: (encrypted: Buffer) => encrypted.toString('utf8').replace(/^secure:/, ''),
  };
}

function createStore() {
  let state: Record<string, unknown> = {};

  return {
    get: (key: string) => state[key] as any,
    set: (key: string, value: unknown) => {
      state = {
        ...state,
        [key]: value,
      };
    },
    peek: () => state,
  };
}

describe('createUserAccountsService', () => {
  it('creates a default primary account on first read', () => {
    const store = createStore();
    const service = createUserAccountsService({
      store,
      safeStorage: createSafeStorage(),
    });

    const snapshot = service.listAccounts();

    expect(snapshot.accounts).toHaveLength(1);
    expect(snapshot.accounts[0].name).toBe('Primary');
    expect(snapshot.activeAccountId).toBe(snapshot.accounts[0].id);
  });

  it('stores and decrypts an OpenRouter key without exposing it in account metadata', () => {
    const store = createStore();
    const service = createUserAccountsService({
      store,
      safeStorage: createSafeStorage(),
    });
    const accountId = service.listAccounts().accounts[0].id;

    const snapshot = service.setOpenRouterApiKey(accountId, 'sk-or-v1-test-key');

    expect(snapshot.accounts[0].openRouter.apiKeyStored).toBe(true);
    expect(service.getOpenRouterApiKey(accountId)).toBe('sk-or-v1-test-key');

    const persisted = store.peek().userAccounts as {
      secrets: Record<string, { openRouterApiKey?: string }>;
    };
    expect(persisted.secrets[accountId].openRouterApiKey).not.toContain('sk-or-v1-test-key');
  });

  it('falls back to local enhancement when an OpenRouter key is cleared', () => {
    const store = createStore();
    const service = createUserAccountsService({
      store,
      safeStorage: createSafeStorage(),
    });
    const accountId = service.listAccounts().accounts[0].id;

    service.updateAccount(accountId, {
      promptEnhancementProvider: 'openrouter',
      openRouterModel: 'openai/gpt-4o-mini',
      imageGenerationProvider: 'openrouter',
      openRouterImageModel: 'google/gemini-2.5-flash-image',
    });
    service.setOpenRouterApiKey(accountId, 'sk-or-v1-test-key');

    const snapshot = service.clearOpenRouterApiKey(accountId);

    expect(snapshot.accounts[0].openRouter.apiKeyStored).toBe(false);
    expect(snapshot.accounts[0].preferences.promptEnhancementProvider).toBe('local');
    expect(snapshot.accounts[0].preferences.imageGenerationProvider).toBe('local');
    expect(service.getOpenRouterApiKey(accountId)).toBeNull();
  });
});

describe('HuggingFace BYOK token', () => {
  it('stores and decrypts an HF token without exposing it in account metadata', () => {
    const store = createStore();
    const service = createUserAccountsService({ store, safeStorage: createSafeStorage() });
    const accountId = service.listAccounts().accounts[0].id;

    const snapshot = service.setHuggingFaceToken(accountId, 'hf_secrettoken');

    expect(snapshot.accounts[0].huggingFace.tokenStored).toBe(true);
    expect(service.getHuggingFaceToken(accountId)).toBe('hf_secrettoken');
    const persisted = store.peek().userAccounts as {
      secrets: Record<string, { huggingFaceToken?: string }>;
    };
    expect(persisted.secrets[accountId].huggingFaceToken).not.toContain('hf_secrettoken');
  });

  it('reverts huggingface provider preferences to local when the HF token is cleared', () => {
    const store = createStore();
    const service = createUserAccountsService({ store, safeStorage: createSafeStorage() });
    const accountId = service.listAccounts().accounts[0].id;

    service.updateAccount(accountId, {
      imageGenerationProvider: 'huggingface',
      huggingFaceImageModel: 'black-forest-labs/FLUX.1-schnell',
    });
    service.setHuggingFaceToken(accountId, 'hf_secrettoken');

    const snapshot = service.clearHuggingFaceToken(accountId);

    expect(snapshot.accounts[0].huggingFace.tokenStored).toBe(false);
    expect(snapshot.accounts[0].preferences.imageGenerationProvider).toBe('local');
    expect(service.getHuggingFaceToken(accountId)).toBeNull();
  });

  it('persists a fallbackProvider preference', () => {
    const store = createStore();
    const service = createUserAccountsService({ store, safeStorage: createSafeStorage() });
    const accountId = service.listAccounts().accounts[0].id;

    const snapshot = service.updateAccount(accountId, { fallbackProvider: 'huggingface' });

    expect(snapshot.accounts[0].preferences.fallbackProvider).toBe('huggingface');
  });
});
