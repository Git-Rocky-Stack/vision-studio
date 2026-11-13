import { describe, expect, it, vi } from 'vitest';
import {
  SECURE_STORAGE_PLAINTEXT_MESSAGE,
  SECURE_STORAGE_UNAVAILABLE_MESSAGE,
  createUserAccountsService,
  secureStorageRefusal,
} from './userAccounts';

/** An async safeStorage (Electron 45+) that "encrypts" by prefixing. */
function createSafeStorage(available = true) {
  return {
    isAsyncEncryptionAvailable: vi.fn(async () => available),
    encryptStringAsync: vi.fn(async (plainText: string) => Buffer.from(`secure:${plainText}`, 'utf8')),
    decryptStringAsync: vi.fn(async (encrypted: Buffer) => {
      const text = encrypted.toString('utf8');
      return { result: text.replace(/^(secure|legacy):/, ''), shouldReEncrypt: text.startsWith('legacy:') };
    }),
  };
}

/** Ciphertext the OS wants re-encrypted (rotated key), as stored base64. */
function legacyCiphertext(plainText: string) {
  return Buffer.from(`legacy:${plainText}`, 'utf8').toString('base64');
}

function createStore() {
  let state: Record<string, unknown> = {};

  return {
    get: (key: string) => state[key] as any,
    set: vi.fn((key: string, value: unknown) => {
      state = {
        ...state,
        [key]: value,
      };
    }),
    peek: () => state,
  };
}

type PersistedAccounts = {
  secrets: Record<string, { openRouterApiKey?: string; huggingFaceToken?: string }>;
};

function persistedSecrets(store: ReturnType<typeof createStore>) {
  return (store.peek().userAccounts as PersistedAccounts).secrets;
}

/** A promise plus the function that settles it, for ordering concurrent work. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
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

  it('stores and decrypts an OpenRouter key without exposing it in account metadata', async () => {
    const store = createStore();
    const service = createUserAccountsService({
      store,
      safeStorage: createSafeStorage(),
    });
    const accountId = service.listAccounts().accounts[0].id;

    const snapshot = await service.setOpenRouterApiKey(accountId, 'sk-or-v1-test-key');

    expect(snapshot.accounts[0].openRouter.apiKeyStored).toBe(true);
    await expect(service.getOpenRouterApiKey(accountId)).resolves.toBe('sk-or-v1-test-key');
    expect(persistedSecrets(store)[accountId].openRouterApiKey).not.toContain('sk-or-v1-test-key');
  });

  it('falls back to local enhancement when an OpenRouter key is cleared', async () => {
    const store = createStore();
    const service = createUserAccountsService({
      store,
      safeStorage: createSafeStorage(),
    });
    const accountId = service.listAccounts().accounts[0].id;

    await service.updateAccount(accountId, {
      promptEnhancementProvider: 'openrouter',
      openRouterModel: 'openai/gpt-4o-mini',
      imageGenerationProvider: 'openrouter',
      openRouterImageModel: 'google/gemini-2.5-flash-image',
    });
    await service.setOpenRouterApiKey(accountId, 'sk-or-v1-test-key');

    const snapshot = await service.clearOpenRouterApiKey(accountId);

    expect(snapshot.accounts[0].openRouter.apiKeyStored).toBe(false);
    expect(snapshot.accounts[0].preferences.promptEnhancementProvider).toBe('local');
    expect(snapshot.accounts[0].preferences.imageGenerationProvider).toBe('local');
    await expect(service.getOpenRouterApiKey(accountId)).resolves.toBeNull();
  });

  it('rejects an empty key and an unknown account without touching the keychain', async () => {
    const safeStorage = createSafeStorage();
    const service = createUserAccountsService({ store: createStore(), safeStorage });
    const accountId = service.listAccounts().accounts[0].id;

    await expect(service.setOpenRouterApiKey(accountId, '   ')).rejects.toThrow(/cannot be empty/);
    await expect(service.setHuggingFaceToken('account-missing', 'hf_x')).rejects.toThrow('Account not found');
    expect(safeStorage.encryptStringAsync).not.toHaveBeenCalled();
  });

  it('returns null and warns when a stored key cannot be decrypted', async () => {
    const store = createStore();
    const logger = { warn: vi.fn() };
    const safeStorage = createSafeStorage();
    const service = createUserAccountsService({ store, safeStorage, logger });
    const accountId = service.listAccounts().accounts[0].id;
    await service.setOpenRouterApiKey(accountId, 'sk-or-v1-test-key');
    safeStorage.decryptStringAsync.mockRejectedValueOnce(new Error('Error while decrypting the ciphertext'));

    await expect(service.getOpenRouterApiKey(accountId)).resolves.toBeNull();
    expect(logger.warn).toHaveBeenCalledWith('[Accounts] Could not decrypt a stored provider key.');
  });
});

describe('HuggingFace BYOK token', () => {
  it('stores and decrypts an HF token without exposing it in account metadata', async () => {
    const store = createStore();
    const service = createUserAccountsService({ store, safeStorage: createSafeStorage() });
    const accountId = service.listAccounts().accounts[0].id;

    const snapshot = await service.setHuggingFaceToken(accountId, 'hf_secrettoken');

    expect(snapshot.accounts[0].huggingFace.tokenStored).toBe(true);
    await expect(service.getHuggingFaceToken(accountId)).resolves.toBe('hf_secrettoken');
    expect(persistedSecrets(store)[accountId].huggingFaceToken).not.toContain('hf_secrettoken');
  });

  it('reverts huggingface provider preferences to local when the HF token is cleared', async () => {
    const store = createStore();
    const service = createUserAccountsService({ store, safeStorage: createSafeStorage() });
    const accountId = service.listAccounts().accounts[0].id;

    await service.updateAccount(accountId, {
      imageGenerationProvider: 'huggingface',
      videoGenerationProvider: 'huggingface',
      huggingFaceImageModel: 'black-forest-labs/FLUX.1-schnell',
      huggingFaceVideoModel: 'Lightricks/LTX-Video',
    });
    await service.setHuggingFaceToken(accountId, 'hf_secrettoken');

    const snapshot = await service.clearHuggingFaceToken(accountId);

    expect(snapshot.accounts[0].huggingFace.tokenStored).toBe(false);
    expect(snapshot.accounts[0].preferences.imageGenerationProvider).toBe('local');
    expect(snapshot.accounts[0].preferences.videoGenerationProvider).toBe('local');
    await expect(service.getHuggingFaceToken(accountId)).resolves.toBeNull();
  });

  it('persists a fallbackProvider preference', async () => {
    const store = createStore();
    const service = createUserAccountsService({ store, safeStorage: createSafeStorage() });
    const accountId = service.listAccounts().accounts[0].id;

    const snapshot = await service.updateAccount(accountId, { fallbackProvider: 'huggingface' });

    expect(snapshot.accounts[0].preferences.fallbackProvider).toBe('huggingface');
  });

  it('clearing the OpenRouter key keeps the HuggingFace token (S4)', async () => {
    const store = createStore();
    const service = createUserAccountsService({ store, safeStorage: createSafeStorage() });
    const accountId = service.listAccounts().accounts[0].id;
    await service.setOpenRouterApiKey(accountId, 'sk-or-v1-test-key');
    await service.setHuggingFaceToken(accountId, 'hf_token');

    const snapshot = await service.clearOpenRouterApiKey(accountId);

    await expect(service.getOpenRouterApiKey(accountId)).resolves.toBeNull();
    await expect(service.getHuggingFaceToken(accountId)).resolves.toBe('hf_token');
    expect(snapshot.accounts[0].openRouter.apiKeyStored).toBe(false);
    expect(snapshot.accounts[0].huggingFace.tokenStored).toBe(true);
  });

  it('clearing the HuggingFace token keeps the OpenRouter key', async () => {
    const store = createStore();
    const service = createUserAccountsService({ store, safeStorage: createSafeStorage() });
    const accountId = service.listAccounts().accounts[0].id;
    await service.setOpenRouterApiKey(accountId, 'sk-or-v1-test-key');
    await service.setHuggingFaceToken(accountId, 'hf_token');

    await service.clearHuggingFaceToken(accountId);

    await expect(service.getOpenRouterApiKey(accountId)).resolves.toBe('sk-or-v1-test-key');
    await expect(service.getHuggingFaceToken(accountId)).resolves.toBeNull();
  });

  it('refuses to store secrets on Linux basic_text storage with a clear message (S9)', async () => {
    const store = createStore();
    const service = createUserAccountsService({
      store,
      safeStorage: { ...createSafeStorage(), getSelectedStorageBackend: () => 'basic_text' },
      platform: 'linux',
    });
    const accountId = service.listAccounts().accounts[0].id;

    await expect(service.setOpenRouterApiKey(accountId, 'sk-or-v1-test-key')).rejects.toThrow(
      SECURE_STORAGE_PLAINTEXT_MESSAGE,
    );
    await expect(service.setHuggingFaceToken(accountId, 'hf_token')).rejects.toThrow(/keyring/);
    expect(JSON.stringify(store.peek())).not.toContain('sk-or-v1-test-key');
    expect(service.listAccounts().accounts[0].openRouter.apiKeyStored).toBe(false);
  });

  it('accepts a real Linux keyring backend and ignores the backend probe elsewhere', async () => {
    const safeStorage = { ...createSafeStorage(), getSelectedStorageBackend: () => 'gnome_libsecret' };
    await expect(secureStorageRefusal(safeStorage, 'linux')).resolves.toBeNull();
    await expect(
      secureStorageRefusal({ ...createSafeStorage(), getSelectedStorageBackend: () => 'basic_text' }, 'win32'),
    ).resolves.toBeNull();
    await expect(secureStorageRefusal(createSafeStorage(false), 'win32')).resolves.toMatch(/unavailable/);
  });

  it('treats a rejected availability probe or backend probe as refusal, never a crash', async () => {
    const rejecting = createSafeStorage();
    rejecting.isAsyncEncryptionAvailable.mockRejectedValueOnce(new Error('no keyring daemon'));
    await expect(secureStorageRefusal(rejecting, 'win32')).resolves.toBe(SECURE_STORAGE_UNAVAILABLE_MESSAGE);

    const throwingBackend = {
      ...createSafeStorage(),
      getSelectedStorageBackend: () => {
        throw new Error('not ready');
      },
    };
    await expect(secureStorageRefusal(throwingBackend, 'linux')).resolves.toBe(SECURE_STORAGE_PLAINTEXT_MESSAGE);
  });
});

describe('re-encryption (decryptStringAsync shouldReEncrypt)', () => {
  function seedLegacySecret(field: 'openRouterApiKey' | 'huggingFaceToken', plainText: string) {
    const store = createStore();
    const safeStorage = createSafeStorage();
    const logger = { warn: vi.fn() };
    const service = createUserAccountsService({ store, safeStorage, logger });
    const accountId = service.listAccounts().accounts[0].id;
    const state = store.peek().userAccounts as PersistedAccounts;
    store.set('userAccounts', {
      ...state,
      secrets: { [accountId]: { [field]: legacyCiphertext(plainText) } },
    });
    return { store, safeStorage, logger, service, accountId };
  }

  it('re-encrypts and persists an OpenRouter key the OS asked to re-encrypt', async () => {
    const { store, safeStorage, service, accountId } = seedLegacySecret('openRouterApiKey', 'sk-or-rotated');

    await expect(service.getOpenRouterApiKey(accountId)).resolves.toBe('sk-or-rotated');

    expect(safeStorage.encryptStringAsync).toHaveBeenCalledWith('sk-or-rotated');
    const stored = persistedSecrets(store)[accountId].openRouterApiKey!;
    expect(Buffer.from(stored, 'base64').toString('utf8')).toBe('secure:sk-or-rotated');

    // The next read finds current ciphertext and does not rewrite again.
    safeStorage.encryptStringAsync.mockClear();
    await expect(service.getOpenRouterApiKey(accountId)).resolves.toBe('sk-or-rotated');
    expect(safeStorage.encryptStringAsync).not.toHaveBeenCalled();
  });

  it('re-encrypts a HuggingFace token and leaves the other secret untouched', async () => {
    const { store, service, accountId } = seedLegacySecret('huggingFaceToken', 'hf_rotated');
    await service.setOpenRouterApiKey(accountId, 'sk-or-current');
    const openRouterBefore = persistedSecrets(store)[accountId].openRouterApiKey;

    await expect(service.getHuggingFaceToken(accountId)).resolves.toBe('hf_rotated');

    const secrets = persistedSecrets(store)[accountId];
    expect(Buffer.from(secrets.huggingFaceToken!, 'base64').toString('utf8')).toBe('secure:hf_rotated');
    expect(secrets.openRouterApiKey).toBe(openRouterBefore);
  });

  it('never overwrites a key saved between the read and its re-encryption', async () => {
    const { store, safeStorage, service, accountId } = seedLegacySecret('openRouterApiKey', 'sk-or-old');
    const gate = deferred<void>();
    // The new key's encryption stalls, so the read below still sees the old
    // ciphertext and queues its re-encrypt BEHIND the save.
    safeStorage.encryptStringAsync.mockImplementationOnce(async (plainText: string) => {
      await gate.promise;
      return Buffer.from(`secure:${plainText}`, 'utf8');
    });

    const setting = service.setOpenRouterApiKey(accountId, 'sk-or-new');
    await vi.waitFor(() => expect(safeStorage.encryptStringAsync).toHaveBeenCalledTimes(1));
    const reading = service.getOpenRouterApiKey(accountId);
    await vi.waitFor(() => expect(safeStorage.decryptStringAsync).toHaveBeenCalledTimes(1));
    gate.resolve();

    await setting;
    await expect(reading).resolves.toBe('sk-or-old');
    // The re-encrypt ran (encrypting the old key) but found newer ciphertext and wrote nothing.
    expect(safeStorage.encryptStringAsync).toHaveBeenCalledWith('sk-or-old');
    expect(Buffer.from(persistedSecrets(store)[accountId].openRouterApiKey!, 'base64').toString('utf8')).toBe(
      'secure:sk-or-new',
    );
    await expect(service.getOpenRouterApiKey(accountId)).resolves.toBe('sk-or-new');
  });

  it('never resurrects a key cleared between the read and its re-encryption', async () => {
    const { store, safeStorage, service, accountId } = seedLegacySecret('openRouterApiKey', 'sk-or-old');
    const gate = deferred<void>();
    // A stalled HF save holds the queue; the clear and then the re-encrypt queue behind it.
    safeStorage.encryptStringAsync.mockImplementationOnce(async (plainText: string) => {
      await gate.promise;
      return Buffer.from(`secure:${plainText}`, 'utf8');
    });

    const savingHf = service.setHuggingFaceToken(accountId, 'hf_token');
    await vi.waitFor(() => expect(safeStorage.encryptStringAsync).toHaveBeenCalledTimes(1));
    const clearing = service.clearOpenRouterApiKey(accountId);
    const reading = service.getOpenRouterApiKey(accountId);
    await vi.waitFor(() => expect(safeStorage.decryptStringAsync).toHaveBeenCalledTimes(1));
    gate.resolve();
    await Promise.all([savingHf, clearing]);
    await expect(reading).resolves.toBe('sk-or-old');

    expect(persistedSecrets(store)[accountId].openRouterApiKey).toBeUndefined();
    expect(service.listAccounts().accounts[0].openRouter.apiKeyStored).toBe(false);
    await expect(service.getOpenRouterApiKey(accountId)).resolves.toBeNull();
    await expect(service.getHuggingFaceToken(accountId)).resolves.toBe('hf_token');
  });

  it('still returns the key, and keeps the old ciphertext, when re-encryption fails', async () => {
    const { store, safeStorage, logger, service, accountId } = seedLegacySecret('openRouterApiKey', 'sk-or-old');
    const before = persistedSecrets(store)[accountId].openRouterApiKey;
    safeStorage.encryptStringAsync.mockRejectedValueOnce(new Error('keychain locked'));

    await expect(service.getOpenRouterApiKey(accountId)).resolves.toBe('sk-or-old');

    expect(persistedSecrets(store)[accountId].openRouterApiKey).toBe(before);
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Could not re-encrypt'));
  });

  it('does not rewrite a secret under a fixed-key (basic_text) backend', async () => {
    const store = createStore();
    const safeStorage = { ...createSafeStorage(), getSelectedStorageBackend: () => 'basic_text' };
    const service = createUserAccountsService({ store, safeStorage, platform: 'linux' });
    const accountId = service.listAccounts().accounts[0].id;
    const state = store.peek().userAccounts as PersistedAccounts;
    store.set('userAccounts', { ...state, secrets: { [accountId]: { openRouterApiKey: legacyCiphertext('sk-or') } } });

    await expect(service.getOpenRouterApiKey(accountId)).resolves.toBe('sk-or');
    expect(safeStorage.encryptStringAsync).not.toHaveBeenCalled();
  });
});

describe('serialized writes (no lost updates across async encryption)', () => {
  it('keeps a preference update made while a key is still being encrypted', async () => {
    const store = createStore();
    const safeStorage = createSafeStorage();
    const service = createUserAccountsService({ store, safeStorage });
    const accountId = service.listAccounts().accounts[0].id;
    const gate = deferred<void>();
    safeStorage.encryptStringAsync.mockImplementationOnce(async (plainText: string) => {
      await gate.promise;
      return Buffer.from(`secure:${plainText}`, 'utf8');
    });

    const settingKey = service.setOpenRouterApiKey(accountId, 'sk-or-key');
    const updating = service.updateAccount(accountId, { openRouterModel: 'openai/gpt-4o-mini' });
    gate.resolve();
    await Promise.all([settingKey, updating]);

    const account = service.listAccounts().accounts[0];
    expect(account.openRouter.apiKeyStored).toBe(true);
    expect(account.preferences.openRouterModel).toBe('openai/gpt-4o-mini');
    await expect(service.getOpenRouterApiKey(accountId)).resolves.toBe('sk-or-key');
  });

  it('keeps both secrets when an OpenRouter key and an HF token are saved at once', async () => {
    const store = createStore();
    const safeStorage = createSafeStorage();
    const service = createUserAccountsService({ store, safeStorage });
    const accountId = service.listAccounts().accounts[0].id;
    // The first encryption finishes last: without the queue, its write would drop the second.
    const gate = deferred<void>();
    safeStorage.encryptStringAsync.mockImplementationOnce(async (plainText: string) => {
      await gate.promise;
      return Buffer.from(`secure:${plainText}`, 'utf8');
    });

    const first = service.setOpenRouterApiKey(accountId, 'sk-or-key');
    const second = service.setHuggingFaceToken(accountId, 'hf_token');
    setTimeout(() => gate.resolve(), 5);
    const snapshots = await Promise.all([first, second]);

    await expect(service.getOpenRouterApiKey(accountId)).resolves.toBe('sk-or-key');
    await expect(service.getHuggingFaceToken(accountId)).resolves.toBe('hf_token');
    expect(snapshots[1].accounts[0].openRouter.apiKeyStored).toBe(true);
    expect(snapshots[1].accounts[0].huggingFace.tokenStored).toBe(true);
  });

  it('applies two saves of the same key in call order', async () => {
    const store = createStore();
    const safeStorage = createSafeStorage();
    const service = createUserAccountsService({ store, safeStorage });
    const accountId = service.listAccounts().accounts[0].id;
    const gate = deferred<void>();
    safeStorage.encryptStringAsync.mockImplementationOnce(async (plainText: string) => {
      await gate.promise;
      return Buffer.from(`secure:${plainText}`, 'utf8');
    });

    const older = service.setOpenRouterApiKey(accountId, 'sk-or-older');
    const newer = service.setOpenRouterApiKey(accountId, 'sk-or-newer');
    gate.resolve();
    await Promise.all([older, newer]);

    await expect(service.getOpenRouterApiKey(accountId)).resolves.toBe('sk-or-newer');
  });

  it('keeps accepting writes after one fails', async () => {
    const store = createStore();
    const safeStorage = createSafeStorage();
    const service = createUserAccountsService({ store, safeStorage });
    const accountId = service.listAccounts().accounts[0].id;
    safeStorage.encryptStringAsync.mockRejectedValueOnce(new Error('keychain locked'));

    const failing = service.setOpenRouterApiKey(accountId, 'sk-or-key');
    const renaming = service.updateAccount(accountId, { name: 'Studio' });

    await expect(failing).rejects.toThrow('keychain locked');
    await expect(renaming).resolves.toMatchObject({ accounts: [expect.objectContaining({ name: 'Studio' })] });
    expect(service.listAccounts().accounts[0].openRouter.apiKeyStored).toBe(false);
  });

  it('does not lose an account created while another is being renamed', async () => {
    const store = createStore();
    const service = createUserAccountsService({ store, safeStorage: createSafeStorage() });
    const accountId = service.listAccounts().accounts[0].id;

    await Promise.all([
      service.updateAccount(accountId, { name: 'Renamed' }),
      service.createAccount('Second'),
      service.markOpenRouterVerified(accountId, { label: 'main' }),
    ]);

    const accounts = service.listAccounts().accounts;
    expect(accounts.map((account) => account.name)).toEqual(['Renamed', 'Second']);
    expect(accounts[0].openRouter.keyLabel).toBe('main');
  });
});
