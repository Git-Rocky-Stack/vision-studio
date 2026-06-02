import {
  resolveAssetPathFromRoots,
  isPathInsideRoots,
} from './assets';
import {
  resolveOutputPath,
  type AppSettings,
} from './settings';
import type { UserAccountsState } from './userAccounts';

export interface StoreSchema {
  recentProjects: string[];
  settings: AppSettings;
  firstRun: boolean;
  modelsDownloaded: string[];
  managedOutputRoots: string[];
  userAccounts: UserAccountsState;
}

export const DEFAULT_SETTINGS: Required<Omit<AppSettings, 'pythonPath'>> = {
  theme: 'dark',
  autoSave: true,
  defaultOutputPath: '',
  backendAutostart: true,
  notifyOnGenerationComplete: true,
  notifyOnGenerationFailed: true,
  notifyOnModelDownloads: true,
};

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
};

export function createOutputRootService({
  userDataPath,
  store,
  exists,
}: OutputRootServiceOptions) {
  function getAppSettings() {
    return {
      ...DEFAULT_SETTINGS,
      ...store.get('settings'),
    };
  }

  function getResolvedOutputDirectory() {
    return resolveOutputPath(getAppSettings(), userDataPath);
  }

  function getInternalOutputDirectory() {
    return resolveOutputPath({ defaultOutputPath: '' }, userDataPath);
  }

  function getManagedOutputRoots() {
    return Array.from(
      new Set([
        getInternalOutputDirectory(),
        getResolvedOutputDirectory(),
        ...store.get('managedOutputRoots'),
      ])
    );
  }

  function rememberOutputRoot(outputRoot: string) {
    const normalizedRoot = outputRoot.replace(/\\/g, '/').replace(/\/$/, '');
    const nextRoots = Array.from(
      new Set([...store.get('managedOutputRoots'), normalizedRoot])
    );
    store.set('managedOutputRoots', nextRoots);
  }

  function resolveManagedAssetPath(assetPath: string) {
    const managedRoots = getManagedOutputRoots();
    const resolvedPath = resolveAssetPathFromRoots(
      assetPath,
      getResolvedOutputDirectory(),
      managedRoots,
      exists
    );

    if (!isPathInsideRoots(resolvedPath, managedRoots)) {
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
