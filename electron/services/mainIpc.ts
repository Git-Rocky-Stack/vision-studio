import fs from 'fs';
import path from 'path';
import type { App, Dialog, IpcMain, Shell } from 'electron';

type NotificationConstructor = typeof import('electron').Notification;

import {
  isAllowedStoreKey,
  isExecutablePath,
  isSafeExternalUrl,
  resolveSafeExportDestination,
} from './security';
import {
  resolveOutputPath,
  shouldRestartBackend,
  type AppSettings,
} from './settings';
import { DEFAULT_SETTINGS, type StoreSchema } from './outputRoots';
import type {
  OpenRouterKeyInfo,
  OpenRouterModelSummary,
} from './openRouter';
import type {
  ImageGenerationProvider,
  VideoGenerationProvider,
  PromptEnhancementProvider,
  UserAccountRecord,
  UserAccountsSnapshot,
} from './userAccounts';

type StoreLike = {
  get: <K extends keyof StoreSchema>(key: K) => StoreSchema[K];
  set: <K extends keyof StoreSchema>(key: K, value: StoreSchema[K]) => void;
  clear: () => void;
};

type BackendServiceLike = {
  restart: () => Promise<boolean>;
  restartIfRunning: () => Promise<boolean>;
  startOrRecover: () => Promise<{ success: boolean; error?: string; restarted?: boolean }>;
  stop: () => void;
  getStatus: () => Promise<{ running: boolean; pid: number | null; bundled: boolean }>;
  getSystemInfo: () => Promise<unknown>;
  getBundledBackendPath: () => string | null;
};

type OutputRootServiceLike = {
  getAppSettings: () => Required<Omit<AppSettings, 'pythonPath'>> & AppSettings;
  getInternalOutputDirectory: () => string;
  rememberOutputRoot: (outputRoot: string) => void;
  resolveManagedAssetPath: (assetPath: string) => string;
};

type UserAccountsServiceLike = {
  listAccounts: () => UserAccountsSnapshot;
  createAccount: (name?: string) => UserAccountsSnapshot;
  updateAccount: (
    accountId: string,
    patch: {
      name?: string;
      promptEnhancementProvider?: PromptEnhancementProvider;
      openRouterModel?: string;
      imageGenerationProvider?: ImageGenerationProvider;
      videoGenerationProvider?: VideoGenerationProvider;
      openRouterImageModel?: string;
      huggingFaceModel?: string;
      huggingFaceImageModel?: string;
      huggingFaceVideoModel?: string;
      fallbackProvider?: 'openrouter' | 'huggingface' | null;
    }
  ) => UserAccountsSnapshot;
  deleteAccount: (accountId: string) => UserAccountsSnapshot;
  setActiveAccount: (accountId: string) => UserAccountsSnapshot;
  getAccount: (accountId: string | null | undefined) => UserAccountRecord | null;
  setOpenRouterApiKey: (accountId: string, apiKey: string) => UserAccountsSnapshot;
  clearOpenRouterApiKey: (accountId: string) => UserAccountsSnapshot;
  getOpenRouterApiKey: (accountId?: string | null) => string | null;
  markOpenRouterVerified: (
    accountId: string,
    details: { label?: string | null }
  ) => UserAccountsSnapshot;
  setHuggingFaceToken: (accountId: string, token: string) => UserAccountsSnapshot;
  clearHuggingFaceToken: (accountId: string) => UserAccountsSnapshot;
  getHuggingFaceToken: (accountId?: string | null) => string | null;
  markHuggingFaceVerified: (
    accountId: string,
    details: { label?: string | null }
  ) => UserAccountsSnapshot;
};

type OpenRouterServiceLike = {
  getKeyInfo: (apiKey: string) => Promise<OpenRouterKeyInfo>;
  listTextModels: (apiKey: string) => Promise<OpenRouterModelSummary[]>;
  listImageModels: (apiKey: string) => Promise<OpenRouterModelSummary[]>;
};

type UpdaterServiceLike = {
  getStatus: () => unknown;
  check: () => Promise<unknown>;
  install: () => void;
};

type MainIpcOptions = {
  app: Pick<App, 'getVersion' | 'getPath'>;
  ipcMain: Pick<IpcMain, 'handle'>;
  dialog: Pick<Dialog, 'showOpenDialog' | 'showSaveDialog'>;
  shell: Pick<Shell, 'openExternal' | 'openPath' | 'showItemInFolder'>;
  Notification: Pick<NotificationConstructor, 'isSupported'> & {
    new(options: Electron.NotificationConstructorOptions): Electron.Notification;
  };
  store: StoreLike;
  outputRoots: OutputRootServiceLike;
  backend: BackendServiceLike;
  userAccounts: UserAccountsServiceLike;
  openRouter: OpenRouterServiceLike;
  updater: UpdaterServiceLike;
  getMainWindow: () => Electron.BrowserWindow | null;
  logger?: Pick<Console, 'warn'>;
};

const IMAGE_IMPORT_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp']);
const VIDEO_IMPORT_EXTENSIONS = new Set(['.mp4', '.webm', '.mov', '.m4v', '.avi', '.gif']);
const AUDIO_IMPORT_EXTENSIONS = new Set(['.wav', '.mp3', '.m4a', '.flac']);

function resolveImportedMediaType(filePath: string): 'image' | 'video' | 'audio' | null {
  const extension = path.extname(filePath).toLowerCase();

  if (IMAGE_IMPORT_EXTENSIONS.has(extension)) {
    return 'image';
  }

  if (VIDEO_IMPORT_EXTENSIONS.has(extension)) {
    return 'video';
  }

  if (AUDIO_IMPORT_EXTENSIONS.has(extension)) {
    return 'audio';
  }

  return null;
}

export function resolveShellPath(
  filePath: string,
  outputRoots: OutputRootServiceLike,
  allowedExportRoots: string[],
): string {
  try {
    return outputRoots.resolveManagedAssetPath(filePath);
  } catch {
    // Not a managed asset. Allow it only if it resolves inside an allowed
    // export root (the user's chosen export destination, e.g. Desktop). Any
    // other renderer-supplied path is refused rather than handed to the OS
    // shell, which would otherwise open/execute an arbitrary path.
    const exportPath = resolveSafeExportDestination(filePath, allowedExportRoots);
    if (!exportPath) {
      throw new Error('Refusing to open a path outside managed or export locations.');
    }
    return exportPath;
  }
}

export function registerMainIpcHandlers({
  app,
  ipcMain,
  dialog,
  shell,
  Notification,
  store,
  outputRoots,
  backend,
  userAccounts,
  openRouter,
  updater,
  getMainWindow,
  logger = console,
}: MainIpcOptions) {
  ipcMain.handle('app:get-version', () => app.getVersion());

  // #34 installer PR4: auto-update surface. Status pushes arrive separately
  // over 'updater:status' (see services/updater.ts).
  ipcMain.handle('updater:get-status', () => updater.getStatus());
  ipcMain.handle('updater:check', () => updater.check());
  ipcMain.handle('updater:install', () => updater.install());

  ipcMain.handle('app:open-external', (_event, url: string) => {
    if (!isSafeExternalUrl(url)) {
      logger.warn('Blocked open-external for unsafe URL:', url);
      return;
    }
    void shell.openExternal(url);
  });

  ipcMain.handle('app:open-path', async (_event, filePath: string) => {
    let resolved: string;
    try {
      resolved = resolveShellPath(filePath, outputRoots, getAllowedExportRoots(app));
    } catch (error: any) {
      return { success: false, error: error?.message ?? 'Refused to open path.' };
    }
    if (isExecutablePath(resolved)) {
      return { success: false, error: 'Refusing to open an executable file.' };
    }
    const error = await shell.openPath(resolved);
    return error ? { success: false, error } : { success: true };
  });

  ipcMain.handle('dialog:select-folder', async () => {
    const result = await dialog.showOpenDialog(getMainWindow()!, {
      properties: ['openDirectory'],
    });
    return result.filePaths[0] || null;
  });

  ipcMain.handle('dialog:select-media-files', async () => {
    const result = await dialog.showOpenDialog(getMainWindow()!, {
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Media Files', extensions: ['png', 'jpg', 'jpeg', 'webp', 'mp4', 'webm', 'mov', 'm4v', 'avi', 'gif', 'wav', 'mp3', 'm4a', 'flac'] },
        { name: 'Image Files', extensions: ['png', 'jpg', 'jpeg', 'webp'] },
        { name: 'Video Files', extensions: ['mp4', 'webm', 'mov', 'm4v', 'avi', 'gif'] },
        { name: 'Audio Files', extensions: ['wav', 'mp3', 'm4a', 'flac'] },
      ],
    });

    return result.filePaths.map((filePath) => filePath.replace(/\\/g, '/'));
  });

  ipcMain.handle('dialog:save-file', async (_event, options: { defaultPath?: string; filters?: Electron.FileFilter[] }) => {
    const result = await dialog.showSaveDialog(getMainWindow()!, {
      defaultPath: options.defaultPath,
      filters: options.filters,
    });
    return result.filePath || null;
  });

  ipcMain.handle('store:get', (_event, key: string) => {
    if (!isAllowedStoreKey(key)) {
      logger.warn(`Blocked store:get for unknown key: ${key}`);
      return undefined;
    }
    return store.get(key as keyof StoreSchema);
  });

  ipcMain.handle('store:set', (_event, key: string, value: unknown) => {
    if (!isAllowedStoreKey(key)) {
      logger.warn(`Blocked store:set for unknown key: ${key}`);
      return;
    }
    store.set(key as keyof StoreSchema, value as never);
  });

  ipcMain.handle('store:reset', () => {
    store.clear();
  });

  ipcMain.handle('settings:get', () => outputRoots.getAppSettings());

  ipcMain.handle('settings:update', async (_event, patch: Partial<AppSettings>) => {
    const currentSettings = outputRoots.getAppSettings();
    const nextSettings = {
      ...currentSettings,
      ...patch,
    };

    store.set('settings', nextSettings);
    outputRoots.rememberOutputRoot(resolveOutputPath(nextSettings, app.getPath('userData')));

    if (shouldRestartBackend(currentSettings, nextSettings)) {
      const restarted = await backend.restartIfRunning();
      if (!restarted) {
        throw new Error('Backend restart failed after settings update');
      }
    }

    return nextSettings;
  });

  ipcMain.handle('settings:reset', async () => {
    const currentSettings = outputRoots.getAppSettings();
    const nextSettings = DEFAULT_SETTINGS;
    store.set('settings', nextSettings);
    outputRoots.rememberOutputRoot(outputRoots.getInternalOutputDirectory());

    if (shouldRestartBackend(currentSettings, nextSettings)) {
      const restarted = await backend.restartIfRunning();
      if (!restarted) {
        throw new Error('Backend restart failed after settings reset');
      }
    }

    return outputRoots.getAppSettings();
  });

  ipcMain.handle('accounts:list', () => userAccounts.listAccounts());

  ipcMain.handle('accounts:create', (_event, payload?: { name?: string }) => {
    return userAccounts.createAccount(payload?.name);
  });

  ipcMain.handle(
    'accounts:update',
    (
      _event,
      accountId: string,
      patch: {
        name?: string;
        promptEnhancementProvider?: PromptEnhancementProvider;
        openRouterModel?: string;
        imageGenerationProvider?: ImageGenerationProvider;
        videoGenerationProvider?: VideoGenerationProvider;
        openRouterImageModel?: string;
        huggingFaceModel?: string;
        huggingFaceImageModel?: string;
        huggingFaceVideoModel?: string;
        fallbackProvider?: 'openrouter' | 'huggingface' | null;
      },
    ) => userAccounts.updateAccount(accountId, patch),
  );

  ipcMain.handle('accounts:delete', (_event, accountId: string) => {
    return userAccounts.deleteAccount(accountId);
  });

  ipcMain.handle('accounts:set-active', (_event, accountId: string) => {
    return userAccounts.setActiveAccount(accountId);
  });

  ipcMain.handle(
    'accounts:set-openrouter-api-key',
    (_event, payload: { accountId: string; apiKey: string }) => {
      return userAccounts.setOpenRouterApiKey(payload.accountId, payload.apiKey);
    },
  );

  ipcMain.handle('accounts:clear-openrouter-api-key', (_event, accountId: string) => {
    return userAccounts.clearOpenRouterApiKey(accountId);
  });

  ipcMain.handle(
    'accounts:set-huggingface-token',
    (_event, payload: { accountId: string; token: string }) => {
      return userAccounts.setHuggingFaceToken(payload.accountId, payload.token);
    },
  );

  ipcMain.handle('accounts:clear-huggingface-token', (_event, accountId: string) => {
    return userAccounts.clearHuggingFaceToken(accountId);
  });

  ipcMain.handle('openrouter:test-connection', async (_event, accountId?: string) => {
    const account = userAccounts.getAccount(accountId);
    if (!account) {
      return {
        success: false,
        error: 'No active account is available.',
      };
    }

    const apiKey = userAccounts.getOpenRouterApiKey(account.id);
    if (!apiKey) {
      return {
        success: false,
        error: 'No OpenRouter API key is stored for this account.',
      };
    }

    try {
      const keyInfo = await openRouter.getKeyInfo(apiKey);
      const accounts = userAccounts.markOpenRouterVerified(account.id, {
        label: keyInfo.label,
      });
      return {
        success: true,
        keyInfo,
        accounts,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'OpenRouter connection failed.',
      };
    }
  });

  ipcMain.handle('openrouter:get-key-info', async (_event, accountId?: string) => {
    const account = userAccounts.getAccount(accountId);
    if (!account) {
      return {
        success: false,
        error: 'No active account is available.',
      };
    }

    const apiKey = userAccounts.getOpenRouterApiKey(account.id);
    if (!apiKey) {
      return {
        success: false,
        error: 'No OpenRouter API key is stored for this account.',
      };
    }

    try {
      const keyInfo = await openRouter.getKeyInfo(apiKey);
      const accounts = userAccounts.markOpenRouterVerified(account.id, {
        label: keyInfo.label,
      });
      return {
        success: true,
        keyInfo,
        accounts,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Could not load OpenRouter key information.',
      };
    }
  });

  ipcMain.handle('openrouter:list-models', async (_event, accountId?: string) => {
    const account = userAccounts.getAccount(accountId);
    if (!account) {
      return {
        success: false,
        error: 'No active account is available.',
        models: [],
      };
    }

    const apiKey = userAccounts.getOpenRouterApiKey(account.id);
    if (!apiKey) {
      return {
        success: false,
        error: 'No OpenRouter API key is stored for this account.',
        models: [],
      };
    }

    try {
      const models = await openRouter.listTextModels(apiKey);
      return {
        success: true,
        models,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Could not load OpenRouter models.',
        models: [],
      };
    }
  });

  ipcMain.handle('openrouter:list-image-models', async (_event, accountId?: string) => {
    const account = userAccounts.getAccount(accountId);
    if (!account) {
      return {
        success: false,
        error: 'No active account is available.',
        models: [],
      };
    }

    const apiKey = userAccounts.getOpenRouterApiKey(account.id);
    if (!apiKey) {
      return {
        success: false,
        error: 'No OpenRouter API key is stored for this account.',
        models: [],
      };
    }

    try {
      const models = await openRouter.listImageModels(apiKey);
      return {
        success: true,
        models,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Could not load OpenRouter image models.',
        models: [],
      };
    }
  });

  ipcMain.handle('assets:export', async (_event, sourcePath: string, destinationPath: string) => {
    try {
      const resolvedSource = outputRoots.resolveManagedAssetPath(sourcePath);
      const resolvedDest = resolveSafeExportDestination(destinationPath, getAllowedExportRoots(app));
      if (!resolvedDest) {
        return { success: false, error: 'Invalid destination path' };
      }
      await fs.promises.mkdir(path.dirname(resolvedDest), { recursive: true });
      await fs.promises.copyFile(resolvedSource, resolvedDest);
      return { success: true, destinationPath: resolvedDest };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('assets:import-files', async (_event, sourcePaths: string[]) => {
    try {
      const appSettings = outputRoots.getAppSettings();
      const outputRoot = resolveOutputPath(appSettings, app.getPath('userData'));
      const importsDir = path.join(outputRoot, 'imports');
      await fs.promises.mkdir(importsDir, { recursive: true });
      outputRoots.rememberOutputRoot(outputRoot);

      const usedNames = new Set<string>();
      const importedAt = new Date().toISOString();
      const files: Array<{
        originalPath: string;
        importedPath: string;
        name: string;
        type: 'image' | 'video' | 'audio';
        importedAt: string;
      }> = [];

      for (const sourcePath of sourcePaths) {
        const normalizedSource = sourcePath.replace(/\\/g, '/');
        const resolvedType = resolveImportedMediaType(normalizedSource);
        if (!resolvedType) {
          continue;
        }

        const parsed = path.parse(normalizedSource);
        let candidateName = parsed.base;
        let counter = 1;

        while (usedNames.has(candidateName) || fs.existsSync(path.join(importsDir, candidateName))) {
          candidateName = `${parsed.name}-${counter}${parsed.ext}`;
          counter += 1;
        }

        usedNames.add(candidateName);
        const importedPath = path.join(importsDir, candidateName);
        await fs.promises.copyFile(normalizedSource, importedPath);

        files.push({
          originalPath: normalizedSource,
          importedPath: importedPath.replace(/\\/g, '/'),
          name: path.parse(candidateName).name,
          type: resolvedType,
          importedAt,
        });
      }

      return { success: true, files };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('assets:export-many', async (_event, sourcePaths: string[], destinationDir: string) => {
    try {
      const resolvedDestDir = resolveSafeExportDestination(destinationDir, getAllowedExportRoots(app));
      if (!resolvedDestDir) {
        return { success: false, error: 'Invalid destination directory' };
      }
      await fs.promises.mkdir(resolvedDestDir, { recursive: true });
      const usedNames = new Set<string>();

      for (const sourcePath of sourcePaths) {
        const resolvedSource = outputRoots.resolveManagedAssetPath(sourcePath);
        const parsed = path.parse(resolvedSource);
        let candidateName = `${parsed.name}${parsed.ext}`;
        let counter = 1;

        while (usedNames.has(candidateName) || fs.existsSync(path.join(resolvedDestDir, candidateName))) {
          candidateName = `${parsed.name}-${counter}${parsed.ext}`;
          counter += 1;
        }

        usedNames.add(candidateName);
        await fs.promises.copyFile(resolvedSource, path.join(resolvedDestDir, candidateName));
      }

      return { success: true, exportedCount: sourcePaths.length };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('assets:delete', async (_event, sourcePath: string) => {
    try {
      const resolvedSource = outputRoots.resolveManagedAssetPath(sourcePath);
      await fs.promises.rm(resolvedSource, { force: true });
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('assets:reveal', async (_event, sourcePath: string) => {
    try {
      shell.showItemInFolder(resolveShellPath(sourcePath, outputRoots, getAllowedExportRoots(app)));
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('assets:clear-cache', async () => {
    try {
      const outputDirectory = outputRoots.getInternalOutputDirectory();
      await fs.promises.rm(outputDirectory, { recursive: true, force: true });
      await fs.promises.mkdir(outputDirectory, { recursive: true });
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle(
    'notifications:notify',
    async (
      _event,
      type: 'generation_complete' | 'generation_failed' | 'model_download',
      payload: { title: string; body: string }
    ) => {
      const settings = outputRoots.getAppSettings();
      const enabled =
        (type === 'generation_complete' && settings.notifyOnGenerationComplete) ||
        (type === 'generation_failed' && settings.notifyOnGenerationFailed) ||
        (type === 'model_download' && settings.notifyOnModelDownloads);

      if (!enabled) {
        return { success: true, skipped: true };
      }

      if (Notification.isSupported()) {
        new Notification({
          title: payload.title,
          body: payload.body,
        }).show();
      }

      return { success: true };
    }
  );

  ipcMain.handle('system:get-info', () => backend.getSystemInfo());
  ipcMain.handle('backend:start', () => backend.startOrRecover());
  ipcMain.handle('backend:stop', () => {
    backend.stop();
    return { success: true };
  });
  ipcMain.handle('backend:status', () => backend.getStatus());
  ipcMain.handle('backend:check-bundled', () => {
    const bundledPath = backend.getBundledBackendPath();
    return { exists: bundledPath !== null, path: bundledPath };
  });
  ipcMain.handle('app:get-path', (_event, name: 'userData' | 'documents' | 'downloads' | 'pictures') => {
    return app.getPath(name);
  });
}

// Roots a renderer-supplied path may resolve into for export (write) and for
// open/reveal (shell). Deliberately the standard user content directories and
// NOT app.getPath('home'): including the whole home folder would widen
// acceptance to the entire profile (AppData, dotfiles, Startup) and let
// shell.openPath reach sensitive or executable files anywhere under it.
export function getAllowedExportRoots(app: Pick<App, 'getPath'>) {
  return [
    app.getPath('desktop'),
    app.getPath('documents'),
    app.getPath('downloads'),
    app.getPath('pictures'),
    app.getPath('videos'),
  ];
}
