import crypto from 'node:crypto';

import {
  createSerialQueue,
  decryptFromBase64,
  encryptToBase64,
  isAsyncEncryptionAvailable,
  type AsyncSafeStorageLike,
} from './asyncSafeStorage';
import type {
  FallbackProvider,
  ImageGenerationProvider,
  PromptEnhancementProvider,
  UserAccountRecord,
  UserAccountsSnapshot,
  VideoGenerationProvider,
} from '../../shared/ipcTypes';

// The account shapes cross the IPC bridge, so they live in the shared wire
// types; re-exported here for the main-process callers.
export type {
  FallbackProvider,
  ImageGenerationProvider,
  PromptEnhancementProvider,
  UserAccountRecord,
  UserAccountsSnapshot,
  VideoGenerationProvider,
} from '../../shared/ipcTypes';

export interface UserAccountsState {
  activeAccountId: string | null;
  accounts: UserAccountRecord[];
  secrets: Record<string, { openRouterApiKey?: string; huggingFaceToken?: string }>;
}

/** Shown when the OS offers no real encryption for stored secrets. */
export const SECURE_STORAGE_UNAVAILABLE_MESSAGE =
  'Secure storage is unavailable on this system. BYOK keys cannot be stored.';

/**
 * Shown on Linux when Electron's safeStorage fell back to its `basic_text`
 * backend: it "encrypts" with a hard-coded key, so a stored key would be
 * readable by anything that can read the config file.
 */
export const SECURE_STORAGE_PLAINTEXT_MESSAGE =
  'No system keyring is available (Electron would store keys with a fixed, publicly known password). ' +
  'Install and unlock a keyring such as GNOME Keyring or KWallet, then restart Vision Studio to save API keys.';

type UserAccountUpdatePatch = {
  name?: string;
  promptEnhancementProvider?: PromptEnhancementProvider;
  openRouterModel?: string;
  imageGenerationProvider?: ImageGenerationProvider;
  videoGenerationProvider?: VideoGenerationProvider;
  openRouterImageModel?: string;
  huggingFaceModel?: string;
  huggingFaceImageModel?: string;
  huggingFaceVideoModel?: string;
  fallbackProvider?: FallbackProvider | null;
};

/**
 * Why secrets cannot be stored right now, or null when they can. Linux's
 * `basic_text` backend reports encryption as "available" while using a fixed
 * key, so it is treated as unavailable.
 */
export async function secureStorageRefusal(
  safeStorage: Pick<AsyncSafeStorageLike, 'isAsyncEncryptionAvailable' | 'getSelectedStorageBackend'>,
  platform: NodeJS.Platform = process.platform,
): Promise<string | null> {
  if (!(await isAsyncEncryptionAvailable(safeStorage))) {
    return SECURE_STORAGE_UNAVAILABLE_MESSAGE;
  }
  if (platform === 'linux' && typeof safeStorage.getSelectedStorageBackend === 'function') {
    try {
      if (safeStorage.getSelectedStorageBackend() === 'basic_text') {
        return SECURE_STORAGE_PLAINTEXT_MESSAGE;
      }
    } catch {
      return SECURE_STORAGE_PLAINTEXT_MESSAGE;
    }
  }
  return null;
}

type LoggerLike = {
  warn: (...args: unknown[]) => void;
};

type UserAccountsStore = {
  get: (key: 'userAccounts') => UserAccountsState | undefined;
  set: (key: 'userAccounts', value: UserAccountsState) => void;
};

type CreateUserAccountsServiceOptions = {
  store: UserAccountsStore;
  safeStorage: AsyncSafeStorageLike;
  logger?: LoggerLike;
  platform?: NodeJS.Platform;
};

const DEFAULT_PRIMARY_ACCOUNT_NAME = 'Primary';

/** The encrypted provider secrets kept per account. */
type SecretField = 'openRouterApiKey' | 'huggingFaceToken';

export const DEFAULT_USER_ACCOUNTS_STATE: UserAccountsState = {
  activeAccountId: null,
  accounts: [],
  secrets: {},
};

const noopLogger: LoggerLike = {
  warn: () => undefined,
};

function cloneAccount(account: UserAccountRecord): UserAccountRecord {
  return {
    ...account,
    preferences: { ...account.preferences },
    openRouter: { ...account.openRouter },
    huggingFace: { ...account.huggingFace },
  };
}

function cloneState(state: UserAccountsState): UserAccountsState {
  return {
    activeAccountId: state.activeAccountId,
    accounts: state.accounts.map(cloneAccount),
    secrets: { ...state.secrets },
  };
}

function normalizeAccountName(name: string | undefined, fallback: string) {
  const normalized = name?.trim();
  return normalized ? normalized.slice(0, 80) : fallback;
}

function createAccountRecord(name: string): UserAccountRecord {
  const now = new Date().toISOString();
  return {
    id: `account-${crypto.randomUUID()}`,
    name,
    createdAt: now,
    updatedAt: now,
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
    },
    openRouter: {
      apiKeyStored: false,
      keyLabel: null,
      lastValidatedAt: null,
    },
    huggingFace: {
      tokenStored: false,
      keyLabel: null,
      lastValidatedAt: null,
    },
  };
}

function createDefaultState(name: string = DEFAULT_PRIMARY_ACCOUNT_NAME): UserAccountsState {
  const account = createAccountRecord(name);
  return {
    activeAccountId: account.id,
    accounts: [account],
    secrets: {},
  };
}

function toSnapshot(state: UserAccountsState): UserAccountsSnapshot {
  return {
    activeAccountId: state.activeAccountId,
    accounts: state.accounts.map(cloneAccount),
  };
}

export function createUserAccountsService({
  store,
  safeStorage,
  logger = noopLogger,
  platform = process.platform,
}: CreateUserAccountsServiceOptions) {
  // Every write to the userAccounts key goes through this queue. Encryption
  // is asynchronous, so without it two updates could each read the state,
  // await, and write back - the later write silently dropping the earlier
  // one. Reads stay synchronous: each returns one consistent snapshot.
  const serialize = createSerialQueue();

  function readState() {
    const stored = store.get('userAccounts');
    if (!stored || !Array.isArray(stored.accounts) || stored.accounts.length === 0) {
      const nextState = createDefaultState();
      store.set('userAccounts', nextState);
      return nextState;
    }

    const normalizedState = cloneState({
      activeAccountId: stored.activeAccountId ?? stored.accounts[0].id,
      accounts: stored.accounts.map((account) => ({
        ...account,
        preferences: {
          promptEnhancementProvider: account.preferences?.promptEnhancementProvider ?? 'local',
          openRouterModel: account.preferences?.openRouterModel ?? '',
          imageGenerationProvider: account.preferences?.imageGenerationProvider ?? 'local',
          videoGenerationProvider: account.preferences?.videoGenerationProvider ?? 'local',
          openRouterImageModel: account.preferences?.openRouterImageModel ?? '',
          huggingFaceModel: account.preferences?.huggingFaceModel ?? '',
          huggingFaceImageModel: account.preferences?.huggingFaceImageModel ?? '',
          huggingFaceVideoModel: account.preferences?.huggingFaceVideoModel ?? '',
          fallbackProvider: account.preferences?.fallbackProvider ?? null,
        },
        openRouter: {
          apiKeyStored: Boolean(account.openRouter?.apiKeyStored),
          keyLabel: account.openRouter?.keyLabel ?? null,
          lastValidatedAt: account.openRouter?.lastValidatedAt ?? null,
        },
        huggingFace: {
          tokenStored: Boolean(account.huggingFace?.tokenStored),
          keyLabel: account.huggingFace?.keyLabel ?? null,
          lastValidatedAt: account.huggingFace?.lastValidatedAt ?? null,
        },
      })),
      secrets: stored.secrets ?? {},
    });

    const hasActiveAccount = normalizedState.accounts.some(
      (account) => account.id === normalizedState.activeAccountId,
    );
    if (!hasActiveAccount) {
      normalizedState.activeAccountId = normalizedState.accounts[0].id;
      store.set('userAccounts', normalizedState);
    }

    return normalizedState;
  }

  function writeState(state: UserAccountsState) {
    store.set('userAccounts', cloneState(state));
    return toSnapshot(state);
  }

  function resolveAccount(state: UserAccountsState, accountId: string) {
    const account = state.accounts.find((candidate) => candidate.id === accountId);
    if (!account) {
      throw new Error('Account not found');
    }
    return account;
  }

  /** Replace one account in `state` with `nextAccount` and persist. */
  function writeAccount(
    state: UserAccountsState,
    nextAccount: UserAccountRecord,
    secrets: UserAccountsState['secrets'] = state.secrets,
  ) {
    return writeState({
      ...state,
      accounts: state.accounts.map((candidate) =>
        candidate.id === nextAccount.id ? nextAccount : candidate,
      ),
      secrets,
    });
  }

  function listAccounts() {
    return toSnapshot(readState());
  }

  function createAccount(name?: string): Promise<UserAccountsSnapshot> {
    return serialize(() => {
      const state = readState();
      const fallbackName = `Account ${state.accounts.length + 1}`;
      const account = createAccountRecord(normalizeAccountName(name, fallbackName));
      const nextState: UserAccountsState = {
        ...state,
        activeAccountId: account.id,
        accounts: [...state.accounts, account],
      };
      return writeState(nextState);
    });
  }

  function updateAccount(accountId: string, patch: UserAccountUpdatePatch): Promise<UserAccountsSnapshot> {
    return serialize(() => {
      const state = readState();
      const account = resolveAccount(state, accountId);
      const nextAccount: UserAccountRecord = {
        ...account,
        name: patch.name !== undefined ? normalizeAccountName(patch.name, account.name) : account.name,
        updatedAt: new Date().toISOString(),
        preferences: {
          promptEnhancementProvider:
            patch.promptEnhancementProvider ?? account.preferences.promptEnhancementProvider,
          openRouterModel:
            patch.openRouterModel !== undefined
              ? patch.openRouterModel.trim()
              : account.preferences.openRouterModel,
          imageGenerationProvider:
            patch.imageGenerationProvider ?? account.preferences.imageGenerationProvider,
          videoGenerationProvider:
            patch.videoGenerationProvider ?? account.preferences.videoGenerationProvider,
          openRouterImageModel:
            patch.openRouterImageModel !== undefined
              ? patch.openRouterImageModel.trim()
              : account.preferences.openRouterImageModel,
          huggingFaceModel:
            patch.huggingFaceModel !== undefined
              ? patch.huggingFaceModel.trim()
              : account.preferences.huggingFaceModel,
          huggingFaceImageModel:
            patch.huggingFaceImageModel !== undefined
              ? patch.huggingFaceImageModel.trim()
              : account.preferences.huggingFaceImageModel,
          huggingFaceVideoModel:
            patch.huggingFaceVideoModel !== undefined
              ? patch.huggingFaceVideoModel.trim()
              : account.preferences.huggingFaceVideoModel,
          fallbackProvider:
            patch.fallbackProvider !== undefined
              ? patch.fallbackProvider
              : account.preferences.fallbackProvider,
        },
        openRouter: { ...account.openRouter },
        huggingFace: { ...account.huggingFace },
      };

      return writeAccount(state, nextAccount);
    });
  }

  function deleteAccount(accountId: string): Promise<UserAccountsSnapshot> {
    return serialize(() => {
      const state = readState();
      resolveAccount(state, accountId);

      const remainingAccounts = state.accounts.filter((account) => account.id !== accountId);
      const nextSecrets = { ...state.secrets };
      delete nextSecrets[accountId];

      if (remainingAccounts.length === 0) {
        return writeState(createDefaultState());
      }

      return writeState({
        activeAccountId:
          state.activeAccountId === accountId ? remainingAccounts[0].id : state.activeAccountId,
        accounts: remainingAccounts,
        secrets: nextSecrets,
      });
    });
  }

  function setActiveAccount(accountId: string): Promise<UserAccountsSnapshot> {
    return serialize(() => {
      const state = readState();
      resolveAccount(state, accountId);
      return writeState({
        ...state,
        activeAccountId: accountId,
      });
    });
  }

  function getActiveAccount() {
    const state = readState();
    const account = state.accounts.find((candidate) => candidate.id === state.activeAccountId);
    return account ? cloneAccount(account) : null;
  }

  function getAccount(accountId: string | null | undefined) {
    if (!accountId) {
      return getActiveAccount();
    }

    const state = readState();
    const account = state.accounts.find((candidate) => candidate.id === accountId);
    return account ? cloneAccount(account) : null;
  }

  async function encryptSecret(value: string) {
    const refusal = await secureStorageRefusal(safeStorage, platform);
    if (refusal) {
      throw new Error(refusal);
    }

    return encryptToBase64(safeStorage, value);
  }

  /**
   * Persist `plainText` re-encrypted under the OS's current key, but only if
   * the stored ciphertext is still the one that was decrypted: a key set,
   * cleared or deleted in the meantime always wins over the rewrite. Never
   * rewrites under a fixed-key backend, and never fails the read that asked.
   */
  async function reEncryptSecret(accountId: string, field: SecretField, previous: string, plainText: string) {
    try {
      await serialize(async () => {
        if ((await secureStorageRefusal(safeStorage, platform)) !== null) {
          return;
        }
        const reEncrypted = await encryptToBase64(safeStorage, plainText);
        const state = readState();
        const accountSecrets = state.secrets[accountId];
        if (!accountSecrets || accountSecrets[field] !== previous) {
          return;
        }
        store.set(
          'userAccounts',
          cloneState({
            ...state,
            secrets: { ...state.secrets, [accountId]: { ...accountSecrets, [field]: reEncrypted } },
          }),
        );
      });
    } catch {
      logger.warn('[Accounts] Could not re-encrypt a stored provider key; it stays readable with the previous key.');
    }
  }

  async function readSecret(accountId: string | null | undefined, field: SecretField): Promise<string | null> {
    const state = readState();
    const resolvedAccountId = accountId ?? state.activeAccountId;
    if (!resolvedAccountId) {
      return null;
    }

    const stored = state.secrets[resolvedAccountId]?.[field];
    if (!stored) {
      return null;
    }

    let decrypted: { result: string; shouldReEncrypt: boolean };
    try {
      decrypted = await decryptFromBase64(safeStorage, stored);
    } catch {
      logger.warn('[Accounts] Could not decrypt a stored provider key.');
      return null;
    }

    if (decrypted.shouldReEncrypt) {
      await reEncryptSecret(resolvedAccountId, field, stored, decrypted.result);
    }
    return decrypted.result;
  }

  /**
   * Encrypt and store one provider secret, marking it stored but not yet
   * verified. The account is checked before the keychain is touched, then
   * re-read after the await so the write applies to the latest state.
   */
  function storeSecret(accountId: string, field: SecretField, plainText: string): Promise<UserAccountsSnapshot> {
    return serialize(async () => {
      resolveAccount(readState(), accountId);
      const encrypted = await encryptSecret(plainText);

      const state = readState();
      const account = resolveAccount(state, accountId);
      const nextSecrets = {
        ...state.secrets,
        [accountId]: {
          ...(state.secrets[accountId] ?? {}),
          [field]: encrypted,
        },
      };
      const updatedAt = new Date().toISOString();
      const nextAccount: UserAccountRecord =
        field === 'openRouterApiKey'
          ? {
            ...account,
            updatedAt,
            openRouter: { ...account.openRouter, apiKeyStored: true, keyLabel: null, lastValidatedAt: null },
          }
          : {
            ...account,
            updatedAt,
            huggingFace: { ...account.huggingFace, tokenStored: true, keyLabel: null, lastValidatedAt: null },
          };

      return writeAccount(state, nextAccount, nextSecrets);
    });
  }

  /** Remove one provider secret; the account's other secret is left untouched. */
  function withoutSecret(state: UserAccountsState, accountId: string, field: SecretField) {
    const nextSecrets = { ...state.secrets };
    const accountSecrets = { ...(nextSecrets[accountId] ?? {}) };
    delete accountSecrets[field];
    nextSecrets[accountId] = accountSecrets;
    return nextSecrets;
  }

  async function setOpenRouterApiKey(accountId: string, apiKey: string): Promise<UserAccountsSnapshot> {
    const normalizedKey = apiKey.trim();
    if (!normalizedKey) {
      throw new Error('OpenRouter API key cannot be empty.');
    }
    return storeSecret(accountId, 'openRouterApiKey', normalizedKey);
  }

  function clearOpenRouterApiKey(accountId: string): Promise<UserAccountsSnapshot> {
    return serialize(() => {
      const state = readState();
      const account = resolveAccount(state, accountId);
      // Remove only the OpenRouter key: the account's HuggingFace token lives in
      // the same secrets entry and must survive (its tokenStored flag stays true).
      const nextSecrets = withoutSecret(state, accountId, 'openRouterApiKey');

      const nextAccount: UserAccountRecord = {
        ...account,
        updatedAt: new Date().toISOString(),
        openRouter: {
          apiKeyStored: false,
          keyLabel: null,
          lastValidatedAt: null,
        },
        preferences: {
          ...account.preferences,
          promptEnhancementProvider:
            account.preferences.promptEnhancementProvider === 'openrouter'
              ? 'local'
              : account.preferences.promptEnhancementProvider,
          imageGenerationProvider:
            account.preferences.imageGenerationProvider === 'openrouter'
              ? 'local'
              : account.preferences.imageGenerationProvider,
          videoGenerationProvider:
            account.preferences.videoGenerationProvider === 'openrouter'
              ? 'local'
              : account.preferences.videoGenerationProvider,
        },
      };

      return writeAccount(state, nextAccount, nextSecrets);
    });
  }

  function getOpenRouterApiKey(accountId?: string | null): Promise<string | null> {
    return readSecret(accountId, 'openRouterApiKey');
  }

  function markOpenRouterVerified(
    accountId: string,
    details: { label?: string | null },
  ): Promise<UserAccountsSnapshot> {
    return serialize(() => {
      const state = readState();
      const account = resolveAccount(state, accountId);
      return writeAccount(state, {
        ...account,
        updatedAt: new Date().toISOString(),
        openRouter: {
          ...account.openRouter,
          apiKeyStored: true,
          keyLabel: details.label?.trim() || account.openRouter.keyLabel,
          lastValidatedAt: new Date().toISOString(),
        },
      });
    });
  }

  async function setHuggingFaceToken(accountId: string, token: string): Promise<UserAccountsSnapshot> {
    const normalized = token.trim();
    if (!normalized) {
      throw new Error('HuggingFace token cannot be empty.');
    }
    return storeSecret(accountId, 'huggingFaceToken', normalized);
  }

  function clearHuggingFaceToken(accountId: string): Promise<UserAccountsSnapshot> {
    return serialize(() => {
      const state = readState();
      const account = resolveAccount(state, accountId);
      const nextSecrets = withoutSecret(state, accountId, 'huggingFaceToken');

      const nextAccount: UserAccountRecord = {
        ...account,
        updatedAt: new Date().toISOString(),
        huggingFace: {
          tokenStored: false,
          keyLabel: null,
          lastValidatedAt: null,
        },
        preferences: {
          ...account.preferences,
          promptEnhancementProvider:
            account.preferences.promptEnhancementProvider === 'huggingface'
              ? 'local'
              : account.preferences.promptEnhancementProvider,
          imageGenerationProvider:
            account.preferences.imageGenerationProvider === 'huggingface'
              ? 'local'
              : account.preferences.imageGenerationProvider,
          videoGenerationProvider:
            account.preferences.videoGenerationProvider === 'huggingface'
              ? 'local'
              : account.preferences.videoGenerationProvider,
          fallbackProvider:
            account.preferences.fallbackProvider === 'huggingface'
              ? null
              : account.preferences.fallbackProvider,
        },
      };

      return writeAccount(state, nextAccount, nextSecrets);
    });
  }

  function getHuggingFaceToken(accountId?: string | null): Promise<string | null> {
    return readSecret(accountId, 'huggingFaceToken');
  }

  function markHuggingFaceVerified(
    accountId: string,
    details: { label?: string | null },
  ): Promise<UserAccountsSnapshot> {
    return serialize(() => {
      const state = readState();
      const account = resolveAccount(state, accountId);
      return writeAccount(state, {
        ...account,
        updatedAt: new Date().toISOString(),
        huggingFace: {
          ...account.huggingFace,
          tokenStored: true,
          keyLabel: details.label?.trim() || account.huggingFace.keyLabel,
          lastValidatedAt: new Date().toISOString(),
        },
      });
    });
  }

  return {
    listAccounts,
    createAccount,
    updateAccount,
    deleteAccount,
    setActiveAccount,
    getActiveAccount,
    getAccount,
    setOpenRouterApiKey,
    clearOpenRouterApiKey,
    getOpenRouterApiKey,
    markOpenRouterVerified,
    setHuggingFaceToken,
    clearHuggingFaceToken,
    getHuggingFaceToken,
    markHuggingFaceVerified,
  };
}

export type UserAccountsService = ReturnType<typeof createUserAccountsService>;
