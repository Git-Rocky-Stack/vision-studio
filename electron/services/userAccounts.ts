import crypto from 'node:crypto';

export type PromptEnhancementProvider = 'local' | 'openrouter' | 'huggingface';
export type ImageGenerationProvider = 'local' | 'openrouter' | 'huggingface';
export type VideoGenerationProvider = 'local' | 'openrouter' | 'huggingface';
export type FallbackProvider = 'openrouter' | 'huggingface';

export interface UserAccountRecord {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  preferences: {
    promptEnhancementProvider: PromptEnhancementProvider;
    openRouterModel: string;
    imageGenerationProvider: ImageGenerationProvider;
    videoGenerationProvider: VideoGenerationProvider;
    openRouterImageModel: string;
    huggingFaceModel: string;
    huggingFaceImageModel: string;
    huggingFaceVideoModel: string;
    fallbackProvider: FallbackProvider | null;
  };
  openRouter: {
    apiKeyStored: boolean;
    keyLabel: string | null;
    lastValidatedAt: string | null;
  };
  huggingFace: {
    tokenStored: boolean;
    keyLabel: string | null;
    lastValidatedAt: string | null;
  };
}

export interface UserAccountsState {
  activeAccountId: string | null;
  accounts: UserAccountRecord[];
  secrets: Record<string, { openRouterApiKey?: string; huggingFaceToken?: string }>;
}

export interface UserAccountsSnapshot {
  activeAccountId: string | null;
  accounts: UserAccountRecord[];
}

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

type SafeStorageLike = {
  isEncryptionAvailable: () => boolean;
  encryptString: (plainText: string) => Buffer;
  decryptString: (encrypted: Buffer) => string;
};

type LoggerLike = {
  warn: (...args: unknown[]) => void;
};

type UserAccountsStore = {
  get: (key: 'userAccounts') => UserAccountsState | undefined;
  set: (key: 'userAccounts', value: UserAccountsState) => void;
};

type CreateUserAccountsServiceOptions = {
  store: UserAccountsStore;
  safeStorage: SafeStorageLike;
  logger?: LoggerLike;
};

const DEFAULT_PRIMARY_ACCOUNT_NAME = 'Primary';

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
}: CreateUserAccountsServiceOptions) {
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

  function listAccounts() {
    return toSnapshot(readState());
  }

  function createAccount(name?: string) {
    const state = readState();
    const fallbackName = `Account ${state.accounts.length + 1}`;
    const account = createAccountRecord(normalizeAccountName(name, fallbackName));
    const nextState: UserAccountsState = {
      ...state,
      activeAccountId: account.id,
      accounts: [...state.accounts, account],
    };
    return writeState(nextState);
  }

  function updateAccount(accountId: string, patch: UserAccountUpdatePatch) {
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

    const nextState: UserAccountsState = {
      ...state,
      accounts: state.accounts.map((candidate) =>
        candidate.id === accountId ? nextAccount : candidate,
      ),
    };

    return writeState(nextState);
  }

  function deleteAccount(accountId: string) {
    const state = readState();
    resolveAccount(state, accountId);

    const remainingAccounts = state.accounts.filter((account) => account.id !== accountId);
    const nextSecrets = { ...state.secrets };
    delete nextSecrets[accountId];

    if (remainingAccounts.length === 0) {
      const resetState = createDefaultState();
      return writeState(resetState);
    }

    const nextState: UserAccountsState = {
      activeAccountId:
        state.activeAccountId === accountId ? remainingAccounts[0].id : state.activeAccountId,
      accounts: remainingAccounts,
      secrets: nextSecrets,
    };

    return writeState(nextState);
  }

  function setActiveAccount(accountId: string) {
    const state = readState();
    resolveAccount(state, accountId);
    return writeState({
      ...state,
      activeAccountId: accountId,
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

  function encryptSecret(value: string) {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('Secure storage is unavailable on this system. BYOK keys cannot be stored.');
    }

    return safeStorage.encryptString(value).toString('base64');
  }

  function decryptSecret(value: string | undefined) {
    if (!value) {
      return null;
    }

    try {
      return safeStorage.decryptString(Buffer.from(value, 'base64'));
    } catch {
      logger.warn('[Accounts] Could not decrypt a stored OpenRouter key.');
      return null;
    }
  }

  function setOpenRouterApiKey(accountId: string, apiKey: string) {
    const normalizedKey = apiKey.trim();
    if (!normalizedKey) {
      throw new Error('OpenRouter API key cannot be empty.');
    }

    const state = readState();
    const account = resolveAccount(state, accountId);
    const nextSecrets = {
      ...state.secrets,
      [accountId]: {
        ...(state.secrets[accountId] ?? {}),
        openRouterApiKey: encryptSecret(normalizedKey),
      },
    };
    const nextAccount: UserAccountRecord = {
      ...account,
      updatedAt: new Date().toISOString(),
      openRouter: {
        ...account.openRouter,
        apiKeyStored: true,
        keyLabel: null,
        lastValidatedAt: null,
      },
    };

    return writeState({
      ...state,
      accounts: state.accounts.map((candidate) =>
        candidate.id === accountId ? nextAccount : candidate,
      ),
      secrets: nextSecrets,
    });
  }

  function clearOpenRouterApiKey(accountId: string) {
    const state = readState();
    const account = resolveAccount(state, accountId);
    const nextSecrets = { ...state.secrets };
    delete nextSecrets[accountId];

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

    return writeState({
      ...state,
      accounts: state.accounts.map((candidate) =>
        candidate.id === accountId ? nextAccount : candidate,
      ),
      secrets: nextSecrets,
    });
  }

  function getOpenRouterApiKey(accountId?: string | null) {
    const state = readState();
    const resolvedAccountId = accountId ?? state.activeAccountId;
    if (!resolvedAccountId) {
      return null;
    }

    return decryptSecret(state.secrets[resolvedAccountId]?.openRouterApiKey);
  }

  function markOpenRouterVerified(accountId: string, details: { label?: string | null }) {
    const state = readState();
    const account = resolveAccount(state, accountId);
    const nextAccount: UserAccountRecord = {
      ...account,
      updatedAt: new Date().toISOString(),
      openRouter: {
        ...account.openRouter,
        apiKeyStored: true,
        keyLabel: details.label?.trim() || account.openRouter.keyLabel,
        lastValidatedAt: new Date().toISOString(),
      },
    };

    return writeState({
      ...state,
      accounts: state.accounts.map((candidate) =>
        candidate.id === accountId ? nextAccount : candidate,
      ),
    });
  }

  function setHuggingFaceToken(accountId: string, token: string) {
    const normalized = token.trim();
    if (!normalized) {
      throw new Error('HuggingFace token cannot be empty.');
    }

    const state = readState();
    const account = resolveAccount(state, accountId);
    const nextSecrets = {
      ...state.secrets,
      [accountId]: {
        ...(state.secrets[accountId] ?? {}),
        huggingFaceToken: encryptSecret(normalized),
      },
    };
    const nextAccount: UserAccountRecord = {
      ...account,
      updatedAt: new Date().toISOString(),
      huggingFace: {
        ...account.huggingFace,
        tokenStored: true,
        keyLabel: null,
        lastValidatedAt: null,
      },
    };

    return writeState({
      ...state,
      accounts: state.accounts.map((candidate) =>
        candidate.id === accountId ? nextAccount : candidate,
      ),
      secrets: nextSecrets,
    });
  }

  function clearHuggingFaceToken(accountId: string) {
    const state = readState();
    const account = resolveAccount(state, accountId);
    const nextSecrets = { ...state.secrets };
    const accountSecrets = { ...(nextSecrets[accountId] ?? {}) };
    delete accountSecrets.huggingFaceToken;
    nextSecrets[accountId] = accountSecrets;

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

    return writeState({
      ...state,
      accounts: state.accounts.map((candidate) =>
        candidate.id === accountId ? nextAccount : candidate,
      ),
      secrets: nextSecrets,
    });
  }

  function getHuggingFaceToken(accountId?: string | null) {
    const state = readState();
    const resolvedAccountId = accountId ?? state.activeAccountId;
    if (!resolvedAccountId) {
      return null;
    }

    return decryptSecret(state.secrets[resolvedAccountId]?.huggingFaceToken);
  }

  function markHuggingFaceVerified(accountId: string, details: { label?: string | null }) {
    const state = readState();
    const account = resolveAccount(state, accountId);
    const nextAccount: UserAccountRecord = {
      ...account,
      updatedAt: new Date().toISOString(),
      huggingFace: {
        ...account.huggingFace,
        tokenStored: true,
        keyLabel: details.label?.trim() || account.huggingFace.keyLabel,
        lastValidatedAt: new Date().toISOString(),
      },
    };

    return writeState({
      ...state,
      accounts: state.accounts.map((candidate) =>
        candidate.id === accountId ? nextAccount : candidate,
      ),
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
