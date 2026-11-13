import fs from 'fs';
import path from 'path';
import type { App, Dialog, Shell } from 'electron';

type NotificationConstructor = typeof import('electron').Notification;

import {
  isOpenablePath,
  isSafeExternalUrl,
  resolveSafeExportDestination,
} from './security';
import {
  resolveOutputPath,
  shouldRestartBackend,
  type AppSettings,
  type ResolvedAppSettings,
} from './settings';
import { type StoreSchema } from './outputRoots';
import { decodePngDataUrl } from './dataUrlAsset';
import { sniffImageMime } from './imageMagic';
import { fileURLToPath } from 'url';
import { validateOutputRoot, type OutputRootPolicyContext } from './outputRootPolicy';
import { hasForbiddenPathSyntax, toNativePath, type RealpathFn } from './pathSafety';
import { createMediaImportGrants, type MediaImportGrants } from './mediaImportGrants';
import type { OpenRouterKeyInfo, OpenRouterModelSummary } from './openRouter';
import type { UserAccountRecord, UserAccountsSnapshot } from './userAccounts';
import { handleIpc, type IpcHandler, type IpcMainLike } from '../ipc-handlers/ipcHandle';
import type { IpcSenderEvent } from '../ipc-handlers/ipcSenderPolicy';
import type { AccountPatch, IpcChannel, SettingsPatch } from '../../shared/ipcContract';
import type {
  BackendStatus,
  ImportedAssetFile,
  OpenRouterKeyInfoResult,
  OpenRouterModelListResult,
  SystemInfo,
  UpdaterStatus,
} from '../../shared/ipcTypes';

// Windows and default macOS volumes treat "Shot.png" and "shot.png" as the
// same file, so collisions must be checked case-insensitively there.
const CASE_INSENSITIVE_FILESYSTEM = process.platform === 'win32' || process.platform === 'darwin';

function fileNameKey(name: string, caseInsensitive: boolean) {
  return caseInsensitive ? name.toLowerCase() : name;
}

/**
 * Names already present in a destination directory, read once. Replaces a
 * synchronous existsSync probe per candidate name per file, which blocked the
 * main process for the whole import / export of a large selection.
 */
export async function readTakenFileNames(
  dir: string,
  caseInsensitive: boolean = CASE_INSENSITIVE_FILESYSTEM,
): Promise<Set<string>> {
  try {
    const names = await fs.promises.readdir(dir);
    return new Set(names.map((name) => fileNameKey(name, caseInsensitive)));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return new Set();
    }
    throw error;
  }
}

/** Largest managed image the Canvas editor may read back through the bridge. */
export const MAX_READ_DATA_URL_BYTES = 100 * 1024 * 1024;

/**
 * Read a managed image as a data URL for the Canvas editor. A file:// image
 * drawn into the packaged (file://) renderer taints the canvas, because
 * Chromium gives every file URL an opaque origin; a data URL never does.
 * Only paths inside the managed output roots resolve, and only real image
 * bytes (by signature, not extension) are returned.
 */
export async function readManagedImageDataUrl(
  assetPath: unknown,
  resolveManagedAssetPath: (assetPath: string) => string,
) {
  if (typeof assetPath !== 'string' || assetPath.length === 0) {
    return { success: false as const, error: 'No image path was given.' };
  }
  const localPath = /^file:\/\//i.test(assetPath) ? fileURLToPath(assetPath) : assetPath;
  const resolved = resolveManagedAssetPath(localPath);
  const stat = await fs.promises.stat(resolved);
  if (!stat.isFile() || stat.size > MAX_READ_DATA_URL_BYTES) {
    return { success: false as const, error: 'The image is too large to edit.' };
  }
  const bytes = await fs.promises.readFile(resolved);
  const mime = sniffImageMime(bytes);
  if (!mime) {
    return { success: false as const, error: 'The file is not a supported image.' };
  }
  return { success: true as const, dataUrl: `data:${mime};base64,${bytes.toString('base64')}` };
}

/**
 * Write a flattened Canvas edit (PNG data URL from the renderer) into
 * `<outputRoot>/edits/`, under a collision-free sanitized name. Returns the
 * same record shape `assets:import-files` returns for each file.
 */
export async function writeDataUrlAsset(outputRoot: string, dataUrl: unknown, fileName: unknown) {
  const decoded = decodePngDataUrl(dataUrl, fileName);
  if (!decoded.ok) {
    return { success: false as const, error: decoded.error };
  }

  const editsDir = path.join(outputRoot, 'edits');
  await fs.promises.mkdir(editsDir, { recursive: true });
  const takenNames = await readTakenFileNames(editsDir);
  const candidateName = reserveUniqueFileName(decoded.baseName, '.png', takenNames);
  const writtenPath = path.join(editsDir, candidateName);
  // 'wx' never overwrites: a name raced into existence fails loudly instead.
  await fs.promises.writeFile(writtenPath, decoded.bytes, { flag: 'wx' });

  const normalized = writtenPath.replace(/\\/g, '/');
  return {
    success: true as const,
    file: {
      originalPath: normalized,
      importedPath: normalized,
      name: path.parse(candidateName).name,
      type: 'image' as const,
      importedAt: new Date().toISOString(),
    },
  };
}

/**
 * First free `<name><ext>`, `<name>-1<ext>`, ... against `taken`, and reserve
 * it there so later files in the same batch cannot claim it too.
 */
export function reserveUniqueFileName(
  name: string,
  ext: string,
  taken: Set<string>,
  caseInsensitive: boolean = CASE_INSENSITIVE_FILESYSTEM,
): string {
  let candidate = `${name}${ext}`;
  let counter = 1;
  while (taken.has(fileNameKey(candidate, caseInsensitive))) {
    candidate = `${name}-${counter}${ext}`;
    counter += 1;
  }
  taken.add(fileNameKey(candidate, caseInsensitive));
  return candidate;
}

type StoreLike = {
  get: <K extends keyof StoreSchema>(key: K) => StoreSchema[K];
  set: <K extends keyof StoreSchema>(key: K, value: StoreSchema[K]) => void;
};

type BackendServiceLike = {
  restartIfRunning: () => Promise<boolean>;
  startOrRecover: () => Promise<{ success: boolean; error?: string; restarted?: boolean }>;
  getStatus: () => Promise<BackendStatus>;
  getSystemInfo: () => Promise<SystemInfo>;
};

type OutputRootServiceLike = {
  getAppSettings: () => ResolvedAppSettings;
  getInternalOutputDirectory: () => string;
  rememberOutputRoot: (outputRoot: string) => void;
  resolveManagedAssetPath: (assetPath: string) => string;
};

// Writes and secret reads are async: secrets go through safeStorage's async
// API, and the service serializes every write (userAccounts.ts).
type UserAccountsServiceLike = {
  listAccounts: () => UserAccountsSnapshot;
  createAccount: (name?: string) => Promise<UserAccountsSnapshot>;
  updateAccount: (accountId: string, patch: AccountPatch) => Promise<UserAccountsSnapshot>;
  deleteAccount: (accountId: string) => Promise<UserAccountsSnapshot>;
  setActiveAccount: (accountId: string) => Promise<UserAccountsSnapshot>;
  getAccount: (accountId: string | null | undefined) => UserAccountRecord | null;
  setOpenRouterApiKey: (accountId: string, apiKey: string) => Promise<UserAccountsSnapshot>;
  clearOpenRouterApiKey: (accountId: string) => Promise<UserAccountsSnapshot>;
  getOpenRouterApiKey: (accountId?: string | null) => Promise<string | null>;
  markOpenRouterVerified: (
    accountId: string,
    details: { label?: string | null }
  ) => Promise<UserAccountsSnapshot>;
  setHuggingFaceToken: (accountId: string, token: string) => Promise<UserAccountsSnapshot>;
  clearHuggingFaceToken: (accountId: string) => Promise<UserAccountsSnapshot>;
};

type OpenRouterServiceLike = {
  getKeyInfo: (apiKey: string) => Promise<OpenRouterKeyInfo>;
  listTextModels: (apiKey: string) => Promise<OpenRouterModelSummary[]>;
  listImageModels: (apiKey: string) => Promise<OpenRouterModelSummary[]>;
};

type UpdaterServiceLike = {
  getStatus: () => UpdaterStatus;
  check: () => Promise<UpdaterStatus>;
  download: () => Promise<UpdaterStatus>;
  install: () => void | Promise<void>;
};

type MainIpcOptions = {
  app: Pick<App, 'getVersion' | 'getPath'>;
  ipcMain: IpcMainLike;
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
  logger?: Pick<Console, 'warn' | 'error'>;
  /** Frames allowed to invoke (default: the app's own renderer page). */
  isTrustedSender?: (event: IpcSenderEvent) => boolean;
  /** Output-root rules context (default: this machine's home / app data / platform). */
  outputRootPolicy?: OutputRootPolicyContext;
  /** One-time grants for assets:import-files (default: a fresh 10-minute grant set). */
  importGrants?: MediaImportGrants;
  /** realpath for export/open containment checks (default fs.realpathSync.native). */
  realpath?: RealpathFn;
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
  outputRoots: Pick<OutputRootServiceLike, 'resolveManagedAssetPath'>,
  allowedExportRoots: string[],
  realpath?: RealpathFn,
): string {
  try {
    return outputRoots.resolveManagedAssetPath(filePath);
  } catch {
    // Not a managed asset. Allow it only if it resolves inside an allowed
    // export root (the user's chosen export destination, e.g. Desktop). Any
    // other renderer-supplied path is refused rather than handed to the OS
    // shell, which would otherwise open/execute an arbitrary path.
    const exportPath = resolveSafeExportDestination(filePath, allowedExportRoots, realpath ? { realpath } : {});
    if (!exportPath) {
      throw new Error('Refusing to open a path outside managed or export locations.');
    }
    return exportPath;
  }
}

/** Disk side of the output-folder rules: the folder must exist or be creatable, and be writable. */
export async function ensureWritableDirectory(directory: string): Promise<string | null> {
  try {
    await fs.promises.mkdir(directory, { recursive: true });
    const stat = await fs.promises.stat(directory);
    if (!stat.isDirectory()) {
      return 'The output folder path points to a file, not a folder.';
    }
    await fs.promises.access(directory, fs.constants.W_OK);
    return null;
  } catch {
    return 'The output folder could not be created or is not writable.';
  }
}

/**
 * Check a settings:update patch beyond its schema: the output folder must pass
 * the output-root rules and be creatable. Returns the patch with the output
 * folder canonicalized.
 */
export async function validateSettingsPatch(
  patch: SettingsPatch,
  policy: OutputRootPolicyContext,
): Promise<{ ok: true; patch: SettingsPatch } | { ok: false; error: string }> {
  const next: SettingsPatch = { ...patch };

  if (typeof next.defaultOutputPath === 'string') {
    const trimmed = next.defaultOutputPath.trim();
    if (trimmed) {
      const verdict = validateOutputRoot(trimmed, policy);
      if (!verdict.ok) {
        return { ok: false, error: verdict.reason };
      }
      const diskError = await ensureWritableDirectory(verdict.path);
      if (diskError) {
        return { ok: false, error: diskError };
      }
      next.defaultOutputPath = verdict.path;
    } else {
      next.defaultOutputPath = '';
    }
  }

  return { ok: true, patch: next };
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
  isTrustedSender,
  outputRootPolicy,
  importGrants = createMediaImportGrants(),
  realpath,
}: MainIpcOptions) {
  const handlerOptions = { logger, ...(isTrustedSender ? { isTrustedSender } : {}) };
  const on = <C extends IpcChannel>(channel: C, handler: IpcHandler<C>) =>
    handleIpc(ipcMain, channel, handler, handlerOptions);

  const policy = (): OutputRootPolicyContext =>
    outputRootPolicy ?? {
      homeDir: app.getPath('home'),
      userDataPath: app.getPath('userData'),
      platform: process.platform,
      env: process.env,
    };
  const containment = realpath ? { realpath } : {};

  on('app:get-version', () => app.getVersion());

  // #34 installer PR4: auto-update surface. Status pushes arrive separately
  // over 'updater:status' (see services/updater.ts).
  on('updater:get-status', () => updater.getStatus());
  on('updater:check', () => updater.check());
  // Downloads are explicit (autoDownload is off): installers are multi-GB.
  on('updater:download', () => updater.download());
  on('updater:install', () => updater.install());

  on('app:open-external', (_event, url) => {
    if (!isSafeExternalUrl(url)) {
      logger.warn('Blocked open-external for an unsafe URL.');
      return;
    }
    void shell.openExternal(url);
  });

  on('app:open-path', async (_event, filePath) => {
    let resolved: string;
    try {
      resolved = resolveShellPath(filePath, outputRoots, getAllowedExportRoots(app), realpath);
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Refused to open path.' };
    }
    let isDirectory: boolean;
    try {
      isDirectory = (await fs.promises.stat(resolved)).isDirectory();
    } catch {
      return { success: false, error: 'The file no longer exists.' };
    }
    if (!isOpenablePath(resolved, isDirectory)) {
      return { success: false, error: 'This file type cannot be opened from Vision Studio.' };
    }
    const error = await shell.openPath(toNativePath(resolved));
    return error ? { success: false, error } : { success: true };
  });

  on('dialog:select-folder', async () => {
    const result = await dialog.showOpenDialog(getMainWindow()!, {
      properties: ['openDirectory'],
    });
    return result.filePaths[0] || null;
  });

  on('dialog:select-media-files', async () => {
    const result = await dialog.showOpenDialog(getMainWindow()!, {
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Media Files', extensions: ['png', 'jpg', 'jpeg', 'webp', 'mp4', 'webm', 'mov', 'm4v', 'avi', 'gif', 'wav', 'mp3', 'm4a', 'flac'] },
        { name: 'Image Files', extensions: ['png', 'jpg', 'jpeg', 'webp'] },
        { name: 'Video Files', extensions: ['mp4', 'webm', 'mov', 'm4v', 'avi', 'gif'] },
        { name: 'Audio Files', extensions: ['wav', 'mp3', 'm4a', 'flac'] },
      ],
    });

    const selected = result.filePaths.map((filePath) => filePath.replace(/\\/g, '/'));
    // Only paths the native picker produced may be imported (S7).
    importGrants.grant(selected);
    return selected;
  });

  on('dialog:save-file', async (_event, options) => {
    const result = await dialog.showSaveDialog(getMainWindow()!, {
      defaultPath: options?.defaultPath,
      filters: options?.filters,
    });
    return result.filePath || null;
  });

  on('settings:get', () => outputRoots.getAppSettings());

  on('settings:update', async (_event, patch) => {
    const checked = await validateSettingsPatch(patch, policy());
    if (!checked.ok) {
      throw new Error(checked.error);
    }

    const currentSettings = outputRoots.getAppSettings();
    const nextSettings: AppSettings = {
      ...currentSettings,
      ...checked.patch,
    };

    store.set('settings', nextSettings);
    outputRoots.rememberOutputRoot(resolveOutputPath(nextSettings, app.getPath('userData')));

    if (shouldRestartBackend(currentSettings, nextSettings)) {
      const restarted = await backend.restartIfRunning();
      if (!restarted) {
        throw new Error('Backend restart failed after settings update');
      }
    }

    return outputRoots.getAppSettings();
  });

  on('accounts:list', () => userAccounts.listAccounts());

  on('accounts:create', (_event, payload) => userAccounts.createAccount(payload?.name));

  on('accounts:update', (_event, accountId, patch) => userAccounts.updateAccount(accountId, patch));

  on('accounts:delete', (_event, accountId) => userAccounts.deleteAccount(accountId));

  on('accounts:set-active', (_event, accountId) => userAccounts.setActiveAccount(accountId));

  on('accounts:set-openrouter-api-key', (_event, payload) =>
    userAccounts.setOpenRouterApiKey(payload.accountId, payload.apiKey),
  );

  on('accounts:clear-openrouter-api-key', (_event, accountId) => userAccounts.clearOpenRouterApiKey(accountId));

  on('accounts:set-huggingface-token', (_event, payload) =>
    userAccounts.setHuggingFaceToken(payload.accountId, payload.token),
  );

  on('accounts:clear-huggingface-token', (_event, accountId) => userAccounts.clearHuggingFaceToken(accountId));

  /** Resolve the account's stored OpenRouter key, or the failure to report. */
  async function resolveOpenRouterKey(accountId: string | undefined) {
    const account = userAccounts.getAccount(accountId);
    if (!account) {
      return { ok: false as const, error: 'No active account is available.' };
    }
    const apiKey = await userAccounts.getOpenRouterApiKey(account.id);
    if (!apiKey) {
      return { ok: false as const, error: 'No OpenRouter API key is stored for this account.' };
    }
    return { ok: true as const, account, apiKey };
  }

  // test-connection and get-key-info are the same operation (validate the key
  // via GET /key and record the verification); only the failure wording differs.
  async function verifyOpenRouterKey(
    accountId: string | undefined,
    failureMessage: string,
  ): Promise<OpenRouterKeyInfoResult> {
    const resolved = await resolveOpenRouterKey(accountId);
    if (!resolved.ok) {
      return { success: false, error: resolved.error };
    }
    try {
      const keyInfo = await openRouter.getKeyInfo(resolved.apiKey);
      const accounts = await userAccounts.markOpenRouterVerified(resolved.account.id, { label: keyInfo.label });
      return { success: true, keyInfo, accounts };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : failureMessage };
    }
  }

  async function listOpenRouterModels(
    accountId: string | undefined,
    list: (apiKey: string) => Promise<OpenRouterModelSummary[]>,
    failureMessage: string,
  ): Promise<OpenRouterModelListResult> {
    const resolved = await resolveOpenRouterKey(accountId);
    if (!resolved.ok) {
      return { success: false, error: resolved.error, models: [] };
    }
    try {
      return { success: true, models: await list(resolved.apiKey) };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : failureMessage, models: [] };
    }
  }

  on('openrouter:test-connection', (_event, accountId) =>
    verifyOpenRouterKey(accountId, 'OpenRouter connection failed.'),
  );

  on('openrouter:get-key-info', (_event, accountId) =>
    verifyOpenRouterKey(accountId, 'Could not load OpenRouter key information.'),
  );

  on('openrouter:list-models', (_event, accountId) =>
    listOpenRouterModels(accountId, (apiKey) => openRouter.listTextModels(apiKey), 'Could not load OpenRouter models.'),
  );

  on('openrouter:list-image-models', (_event, accountId) =>
    listOpenRouterModels(
      accountId,
      (apiKey) => openRouter.listImageModels(apiKey),
      'Could not load OpenRouter image models.',
    ),
  );

  on('assets:export', async (_event, sourcePath, destinationPath) => {
    try {
      const resolvedSource = outputRoots.resolveManagedAssetPath(sourcePath);
      const resolvedDest = resolveSafeExportDestination(destinationPath, getAllowedExportRoots(app), containment);
      if (!resolvedDest) {
        return { success: false, error: 'Invalid destination path' };
      }
      await fs.promises.mkdir(path.dirname(resolvedDest), { recursive: true });
      await fs.promises.copyFile(resolvedSource, resolvedDest);
      return { success: true, destinationPath: resolvedDest };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Export failed.' };
    }
  });

  on('assets:import-files', async (_event, sourcePaths) => {
    try {
      const appSettings = outputRoots.getAppSettings();
      const outputRoot = resolveOutputPath(appSettings, app.getPath('userData'));
      const importsDir = path.join(outputRoot, 'imports');
      await fs.promises.mkdir(importsDir, { recursive: true });
      outputRoots.rememberOutputRoot(outputRoot);

      const takenNames = await readTakenFileNames(importsDir);
      const importedAt = new Date().toISOString();
      const files: ImportedAssetFile[] = [];
      let refused = 0;

      for (const sourcePath of sourcePaths) {
        const normalizedSource = sourcePath.replace(/\\/g, '/');
        // Only a path the native picker just produced, once, and never a
        // UNC / device path (opening one leaks NTLM credentials).
        if (hasForbiddenPathSyntax(sourcePath) || !importGrants.consume(normalizedSource)) {
          refused += 1;
          continue;
        }
        const resolvedType = resolveImportedMediaType(normalizedSource);
        if (!resolvedType) {
          continue;
        }
        const sourceStat = await fs.promises.stat(normalizedSource);
        if (!sourceStat.isFile()) {
          continue;
        }

        const parsed = path.parse(normalizedSource);
        const candidateName = reserveUniqueFileName(parsed.name, parsed.ext, takenNames);
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

      if (refused > 0) {
        logger.warn(`[assets:import-files] Refused ${refused} path(s) not chosen in the file picker.`);
        if (files.length === 0) {
          return {
            success: false,
            error: 'Choose the files to import with the Import button. Network (UNC) paths cannot be imported; copy the files locally first.',
          };
        }
      }

      return { success: true, files };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Import failed.' };
    }
  });

  on('assets:read-data-url', async (_event, assetPath) => {
    try {
      return await readManagedImageDataUrl(assetPath, (p) => outputRoots.resolveManagedAssetPath(p));
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Could not read the image.' };
    }
  });

  on('assets:save-data-url', async (_event, params) => {
    try {
      const outputRoot = resolveOutputPath(outputRoots.getAppSettings(), app.getPath('userData'));
      outputRoots.rememberOutputRoot(outputRoot);
      return await writeDataUrlAsset(outputRoot, params.dataUrl, params.fileName);
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Could not save the edited image.' };
    }
  });

  on('assets:export-many', async (_event, sourcePaths, destinationDir) => {
    try {
      const resolvedDestDir = resolveSafeExportDestination(destinationDir, getAllowedExportRoots(app), containment);
      if (!resolvedDestDir) {
        return { success: false, error: 'Invalid destination directory' };
      }
      await fs.promises.mkdir(resolvedDestDir, { recursive: true });
      const takenNames = await readTakenFileNames(resolvedDestDir);

      for (const sourcePath of sourcePaths) {
        const resolvedSource = outputRoots.resolveManagedAssetPath(sourcePath);
        const parsed = path.parse(resolvedSource);
        const candidateName = reserveUniqueFileName(parsed.name, parsed.ext, takenNames);
        await fs.promises.copyFile(resolvedSource, path.join(resolvedDestDir, candidateName));
      }

      return { success: true, exportedCount: sourcePaths.length };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Export failed.' };
    }
  });

  on('assets:delete', async (_event, sourcePath) => {
    try {
      const resolvedSource = outputRoots.resolveManagedAssetPath(sourcePath);
      await fs.promises.rm(resolvedSource, { force: true });
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Delete failed.' };
    }
  });

  on('assets:reveal', async (_event, sourcePath) => {
    try {
      shell.showItemInFolder(
        toNativePath(resolveShellPath(sourcePath, outputRoots, getAllowedExportRoots(app), realpath)),
      );
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Could not reveal the file.' };
    }
  });

  on('assets:clear-cache', async () => {
    try {
      const outputDirectory = outputRoots.getInternalOutputDirectory();
      await fs.promises.rm(outputDirectory, { recursive: true, force: true });
      await fs.promises.mkdir(outputDirectory, { recursive: true });
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Could not clear the cache.' };
    }
  });

  on('notifications:notify', async (_event, type, payload) => {
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
  });

  on('system:get-info', () => backend.getSystemInfo());
  on('backend:start', () => backend.startOrRecover());
  on('backend:status', () => backend.getStatus());
  on('app:get-path', (_event, name) => app.getPath(name));
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
