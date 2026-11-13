import fs from 'fs';

import {
  resolveAssetPathFromRoots,
  isPathInsideRoots,
} from './assets';
import {
  resolveOutputPath,
  type AppSettings,
  type ResolvedAppSettings,
} from './settings';
import {
  defaultOutputRootPolicyContext,
  validateOutputRoot,
  type OutputRootPolicyContext,
} from './outputRootPolicy';
import { canonicalizePath, hasForbiddenPathSyntax, pathFlavorFor, type RealpathFn } from './pathSafety';
import { AI_DIRECTOR_DEFAULTS } from '../../shared/retrieval';
import type { UserAccountsState } from './userAccounts';
import type { DownloadTokensState } from './downloadTokens';

export interface StoreSchema {
  recentProjects: string[];
  settings: AppSettings;
  firstRun: boolean;
  modelsDownloaded: string[];
  managedOutputRoots: string[];
  userAccounts: UserAccountsState;
  downloadTokens: DownloadTokensState;
}

export const DEFAULT_SETTINGS: Required<AppSettings> = {
  theme: 'dark',
  defaultOutputPath: '',
  backendAutostart: true,
  notifyOnGenerationComplete: true,
  notifyOnGenerationFailed: true,
  notifyOnModelDownloads: true,
  autoRouteOnOverBudget: false,
  aiDirector: AI_DIRECTOR_DEFAULTS,
};

/** Bound on remembered historical roots (most recent kept). */
export const MAX_REMEMBERED_OUTPUT_ROOTS = 64;

/**
 * Keys a stored settings object may carry; anything else (the retired
 * autoSave and pythonPath) is dropped on read.
 */
const SETTINGS_KEYS = new Set<keyof AppSettings>([
  'theme',
  'defaultOutputPath',
  'backendAutostart',
  'notifyOnGenerationComplete',
  'notifyOnGenerationFailed',
  'notifyOnModelDownloads',
  'autoRouteOnOverBudget',
  'aiDirector',
]);

export type OutputRootStore = {
  get: {
    (key: 'settings'): AppSettings;
    (key: 'managedOutputRoots'): string[];
  };
  set: {
    (key: 'settings', value: AppSettings): void;
    (key: 'managedOutputRoots', value: string[]): void;
  };
};

type OutputRootServiceOptions = {
  userDataPath: string;
  store: OutputRootStore;
  exists: (candidatePath: string) => boolean;
  /** Home / platform / env for the output-root rules (defaults: this machine). */
  policy?: OutputRootPolicyContext;
  /** realpath for containment checks (default fs.realpathSync.native). */
  realpath?: RealpathFn;
  logger?: Pick<Console, 'warn'>;
};

function rootKey(root: string, platform: NodeJS.Platform) {
  return pathFlavorFor(root, platform) === 'win32' ? root.toLowerCase() : root;
}

export function createOutputRootService({
  userDataPath,
  store,
  exists,
  policy = defaultOutputRootPolicyContext(userDataPath),
  realpath = (candidatePath) => fs.realpathSync.native(candidatePath),
  logger = console,
}: OutputRootServiceOptions) {
  const { platform } = policy;

  function getInternalOutputDirectory() {
    return resolveOutputPath({ defaultOutputPath: '' }, userDataPath);
  }

  /** Canonical form of a root, or null when it may not be managed. */
  function acceptRoot(root: unknown): string | null {
    if (typeof root !== 'string' || !root.trim()) {
      return null;
    }
    const internal = canonicalizePath(getInternalOutputDirectory(), platform);
    const canonical = canonicalizePath(root.trim(), platform);
    if (canonical && internal && rootKey(canonical, platform) === rootKey(internal, platform)) {
      return canonical;
    }
    const verdict = validateOutputRoot(root, policy);
    return verdict.ok ? verdict.path : null;
  }

  function readStoredSettings(): AppSettings {
    const stored = store.get('settings');
    const settings: AppSettings = {};
    if (stored && typeof stored === 'object') {
      for (const [key, value] of Object.entries(stored)) {
        if (SETTINGS_KEYS.has(key as keyof AppSettings)) {
          (settings as Record<string, unknown>)[key] = value;
        }
      }
    }
    return settings;
  }

  function getAppSettings(): ResolvedAppSettings {
    const settings: ResolvedAppSettings = {
      ...DEFAULT_SETTINGS,
      ...readStoredSettings(),
    };
    // A stored output path that fails the root rules (written before they
    // existed, or by hand) must not become a managed root: fall back to the
    // internal default, where the backend can always write.
    if (settings.defaultOutputPath && !acceptRoot(settings.defaultOutputPath)) {
      logger.warn('[OutputRoots] Ignoring an output folder that is not allowed; using the default.');
      settings.defaultOutputPath = '';
    }
    return settings;
  }

  function getResolvedOutputDirectory() {
    return resolveOutputPath(getAppSettings(), userDataPath);
  }

  function readStoredRoots(): string[] {
    const stored = store.get('managedOutputRoots');
    return Array.isArray(stored) ? stored : [];
  }

  /** Validate, canonicalize, de-duplicate (case-insensitively on Windows) and bound a root list. */
  function sanitizeRoots(roots: unknown[]): string[] {
    const seen = new Set<string>();
    const accepted: string[] = [];
    for (const root of roots) {
      const canonical = acceptRoot(root);
      if (!canonical) {
        continue;
      }
      const key = rootKey(canonical, platform);
      if (!seen.has(key)) {
        seen.add(key);
        accepted.push(canonical);
      }
    }
    return accepted.slice(-MAX_REMEMBERED_OUTPUT_ROOTS);
  }

  // On load: drop stored roots that fail the rules (a drive root, the profile,
  // a system folder, a UNC share), keeping every legitimate historical root so
  // assets written there stay reachable.
  {
    const stored = readStoredRoots();
    const sanitized = sanitizeRoots(stored);
    if (sanitized.length !== stored.length || sanitized.some((root, index) => root !== stored[index])) {
      if (sanitized.length < stored.length) {
        logger.warn(`[OutputRoots] Dropped ${stored.length - sanitized.length} stored output root(s) that are not allowed.`);
      }
      store.set('managedOutputRoots', sanitized);
    }
  }

  function getManagedOutputRoots() {
    return sanitizeRoots([
      getInternalOutputDirectory(),
      getResolvedOutputDirectory(),
      ...readStoredRoots(),
    ]);
  }

  function rememberOutputRoot(outputRoot: string) {
    const canonical = acceptRoot(outputRoot);
    if (!canonical) {
      logger.warn('[OutputRoots] Refused to remember an output root that is not allowed.');
      return;
    }
    const key = rootKey(canonical, platform);
    const others = sanitizeRoots(readStoredRoots()).filter((root) => rootKey(root, platform) !== key);
    store.set('managedOutputRoots', [...others, canonical].slice(-MAX_REMEMBERED_OUTPUT_ROOTS));
  }

  function resolveManagedAssetPath(assetPath: string) {
    if (typeof assetPath !== 'string' || hasForbiddenPathSyntax(assetPath, platform)) {
      throw new Error('Asset path is outside managed output directories');
    }
    const managedRoots = getManagedOutputRoots();
    const resolvedPath = resolveAssetPathFromRoots(
      assetPath,
      getResolvedOutputDirectory(),
      managedRoots,
      exists
    );

    if (!isPathInsideRoots(resolvedPath, managedRoots, { platform, realpath })) {
      throw new Error('Asset path is outside managed output directories');
    }

    return resolvedPath;
  }

  return {
    getAppSettings,
    getResolvedOutputDirectory,
    getInternalOutputDirectory,
    getManagedOutputRoots,
    rememberOutputRoot,
    resolveManagedAssetPath,
  };
}

export type OutputRootService = ReturnType<typeof createOutputRootService>;
