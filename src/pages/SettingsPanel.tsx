import { useEffect, useMemo, useRef, useState } from 'react';
import packageJson from '../../package.json';
import { cn } from '@/utils/cn';
import { Button } from '@/components/ui/Button';
import { useShallow } from 'zustand/react/shallow';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useAppStore } from '@/store/appStore';
import { AI_DIRECTOR_DEFAULTS, type AiDirectorSettings } from '../../shared/retrieval';
import { buildIngestRecords } from '@/features/director/buildIngestRecords';
import { UserGuidePage } from '@/pages/UserGuidePage';
import { PerformancePanel } from '@/components/settings/PerformancePanel';
import { AboutSection } from '@/components/settings/AboutSection';
import type { DownloadStatus } from '@/types/model';
import type {
  OpenRouterKeyInfo,
  OpenRouterModelSummary,
  UserAccountSummary,
  UserAccountsSnapshot,
} from '@/types/electron';
import {
  Settings,
  Folder,
  Boxes,
  Cpu,
  Gauge,
  Palette,
  Bell,
  ChevronRight,
  Check,
  RefreshCw,
  HardDrive,
  AlertTriangle,
  Play,
  Tag,
  HelpCircle,
  Cloud,
  Key,
  Trash2,
  UserPlus,
  Users,
  Sparkles,
  Info,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

type SettingsTab = 'general' | 'ai' | 'performance' | 'appearance' | 'notifications' | 'guide' | 'about';

interface SettingsSection {
  id: SettingsTab;
  label: string;
  icon: React.ElementType;
}

interface SettingsState {
  theme: 'dark' | 'light' | 'system';
  autoSave: boolean;
  defaultOutputPath: string;
  backendAutostart: boolean;
  notifyOnGenerationComplete: boolean;
  notifyOnGenerationFailed: boolean;
  notifyOnModelDownloads: boolean;
  pythonPath?: string;
}

interface ConnectionBannerState {
  tone: 'success' | 'error' | 'info';
  message: string;
}

const sections: SettingsSection[] = [
  { id: 'general', label: 'General', icon: Settings },
  { id: 'ai', label: 'AI & Models', icon: Cpu },
  { id: 'performance', label: 'Performance', icon: Gauge },
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'guide', label: 'User Guide', icon: HelpCircle },
  { id: 'about', label: 'About', icon: Info },
];

const defaultSettingsState: SettingsState = {
  theme: 'dark',
  autoSave: true,
  defaultOutputPath: '',
  backendAutostart: true,
  notifyOnGenerationComplete: true,
  notifyOnGenerationFailed: true,
  notifyOnModelDownloads: true,
};

const defaultAccountsSnapshot: UserAccountsSnapshot = {
  activeAccountId: null,
  accounts: [],
};

/** How often the queue is re-polled while at least one download is in flight. */
const DOWNLOAD_POLL_INTERVAL_MS = 2500;
/** Download states that are still progressing and warrant continued polling. */
const ACTIVE_DOWNLOAD_STATUSES = new Set<DownloadStatus>(['queued', 'downloading', 'verifying']);
/** Download states that end the lifecycle - no further polling is needed. */
const TERMINAL_DOWNLOAD_STATUSES = new Set<DownloadStatus>(['ready', 'error', 'cancelled']);

function formatOpenRouterCurrency(value: number | null) {
  if (value === null || !Number.isFinite(value)) {
    return 'Unavailable';
  }

  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(value);
}

function formatOpenRouterLimit(limitRemaining: number | null, limit: number | null) {
  if (limitRemaining === null && limit === null) {
    return 'Unlimited';
  }

  if (limitRemaining !== null && limit !== null) {
    return `${formatOpenRouterCurrency(limitRemaining)} / ${formatOpenRouterCurrency(limit)}`;
  }

  if (limitRemaining !== null) {
    return formatOpenRouterCurrency(limitRemaining);
  }

  return formatOpenRouterCurrency(limit);
}

export function SettingsPanel() {
  const {
    assetLibrary,
    systemInfo,
    availableModels,
    downloads,
    removeAssetsByRoot,
    clearBatchResults,
    setAvailableModels,
    setSystemInfo,
    loadModels,
    refreshDownloads,
    taggingMode,
    setTaggingMode,
  } = useAppStore(useShallow((s) => ({
    assetLibrary: s.assetLibrary,
    systemInfo: s.systemInfo,
    availableModels: s.availableModels,
    downloads: s.downloads,
    removeAssetsByRoot: s.removeAssetsByRoot,
    clearBatchResults: s.clearBatchResults,
    setAvailableModels: s.setAvailableModels,
    setSystemInfo: s.setSystemInfo,
    loadModels: s.loadModels,
    refreshDownloads: s.refreshDownloads,
    taggingMode: s.taggingMode,
    setTaggingMode: s.setTaggingMode,
  })));
  const setNavTab = useAppStore((s) => s.setActiveTab);
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const [settings, setSettings] = useState<SettingsState>(defaultSettingsState);
  const [accountsSnapshot, setAccountsSnapshot] = useState<UserAccountsSnapshot>(defaultAccountsSnapshot);
  const [accountNameDraft, setAccountNameDraft] = useState('');
  const [openRouterApiKeyInput, setOpenRouterApiKeyInput] = useState('');
  const [huggingFaceTokenInput, setHuggingFaceTokenInput] = useState('');
  const [isSavingHuggingFaceToken, setIsSavingHuggingFaceToken] = useState(false);
  const [autoRouteOnOverBudget, setAutoRouteOnOverBudget] = useState(false);
  const [aiDirector, setAiDirector] = useState<AiDirectorSettings>(AI_DIRECTOR_DEFAULTS);
  const [indexStats, setIndexStats] = useState<{ count: number; mode: 'semantic' | 'lexical' }>({ count: 0, mode: 'lexical' });
  const [openRouterKeyInfo, setOpenRouterKeyInfo] = useState<OpenRouterKeyInfo | null>(null);
  const [openRouterModels, setOpenRouterModels] = useState<OpenRouterModelSummary[]>([]);
  const [openRouterImageModels, setOpenRouterImageModels] = useState<OpenRouterModelSummary[]>([]);
  const [openRouterBanner, setOpenRouterBanner] = useState<ConnectionBannerState | null>(null);
  const [activeModelId, setActiveModelId] = useState<string | null>(null);
  const [showClearCacheConfirm, setShowClearCacheConfirm] = useState(false);
  const [deleteAccountTarget, setDeleteAccountTarget] = useState<string | null>(null);
  const [isSavingOpenRouterKey, setIsSavingOpenRouterKey] = useState(false);
  const [isVerifyingOpenRouter, setIsVerifyingOpenRouter] = useState(false);
  const [isLoadingOpenRouterKeyInfo, setIsLoadingOpenRouterKeyInfo] = useState(false);
  const [isLoadingOpenRouterModels, setIsLoadingOpenRouterModels] = useState(false);
  const [isLoadingOpenRouterImageModels, setIsLoadingOpenRouterImageModels] = useState(false);
  const prevDownloadStatusRef = useRef<Record<string, DownloadStatus>>({});

  const activeAccount = useMemo<UserAccountSummary | null>(() => {
    if (accountsSnapshot.accounts.length === 0) {
      return null;
    }

    return (
      accountsSnapshot.accounts.find((account) => account.id === accountsSnapshot.activeAccountId) ??
      accountsSnapshot.accounts[0]
    );
  }, [accountsSnapshot]);

  useEffect(() => {
    const loadInitialState = async () => {
      const [loadedSettings, loadedAccounts] = await Promise.all([
        window.electron.settings.get(),
        window.electron.accounts.list(),
      ]);

      setSettings({
        theme: loadedSettings.theme,
        autoSave: loadedSettings.autoSave,
        defaultOutputPath: loadedSettings.defaultOutputPath,
        backendAutostart: loadedSettings.backendAutostart,
        notifyOnGenerationComplete: loadedSettings.notifyOnGenerationComplete,
        notifyOnGenerationFailed: loadedSettings.notifyOnGenerationFailed,
        notifyOnModelDownloads: loadedSettings.notifyOnModelDownloads,
        pythonPath: loadedSettings.pythonPath,
      });
      setAccountsSnapshot(loadedAccounts);
    };

    void loadInitialState();
    // Hydrate the live download queue so reopening Settings mid-download shows
    // current progress; the queue effect below then resumes polling if needed.
    void useAppStore.getState().refreshDownloads();
  }, []);

  // Hydrate the over-budget auto-routing preference from the app settings store.
  useEffect(() => {
    void window.electron.settings.get().then((s) => setAutoRouteOnOverBudget(Boolean(s.autoRouteOnOverBudget)));
  }, []);

  // Hydrate the AI Director (RAG) settings + index stats (M7). Guarded so the
  // panel renders when the preload API (or its director surface) is absent.
  useEffect(() => {
    const electron = window.electron;
    if (!electron?.settings || !electron?.director) return;
    void electron.settings.get().then((s) => setAiDirector(s.aiDirector ?? AI_DIRECTOR_DEFAULTS));
    void electron.director.indexStats().then(setIndexStats);
  }, []);

  const updateAiDirector = async (next: AiDirectorSettings) => {
    setAiDirector(next);
    await window.electron.settings.update({ aiDirector: next });
  };

  const rebuildDirectorIndex = async () => {
    const { promptHistory, favoritePrompts, assetLibrary, batchResults } = useAppStore.getState();
    await window.electron.director.syncCorpus(
      buildIngestRecords({ promptHistory, favoritePrompts, assetLibrary, batchResults }),
    );
    setIndexStats(await window.electron.director.indexStats());
  };

  const clearDirectorIndex = async () => {
    await window.electron.director.clearIndex();
    setIndexStats(await window.electron.director.indexStats());
  };

  // Drive the live download queue from the store slice: poll while any job is in
  // flight, and refresh the catalog + notify once a model finishes downloading.
  useEffect(() => {
    const previous = prevDownloadStatusRef.current;
    const snapshot: Record<string, DownloadStatus> = {};
    const becameReady: string[] = [];
    for (const [id, job] of Object.entries(downloads)) {
      snapshot[id] = job.status;
      if (job.status === 'ready' && previous[id] !== undefined && previous[id] !== 'ready') {
        becameReady.push(id);
      }
    }
    prevDownloadStatusRef.current = snapshot;

    // Release the per-row spinner once the clicked model reaches a terminal state.
    if (activeModelId) {
      const activeJob = downloads[activeModelId];
      if (activeJob && TERMINAL_DOWNLOAD_STATUSES.has(activeJob.status)) {
        setActiveModelId(null);
      }
    }

    if (becameReady.length > 0) {
      void (async () => {
        await loadModels();
        const installed = useAppStore.getState().availableModels;
        for (const id of becameReady) {
          const model = installed.find((entry) => entry.id === id);
          await window.electron.notifications.notify('model_download', {
            title: 'Model Ready',
            body: `${model?.name ?? 'Model'} is installed and ready to use.`,
          });
        }
      })();
    }

    const hasActiveDownload = Object.values(downloads).some((job) =>
      ACTIVE_DOWNLOAD_STATUSES.has(job.status),
    );
    if (!hasActiveDownload) {
      return;
    }
    const timer = setTimeout(() => {
      void refreshDownloads();
    }, DOWNLOAD_POLL_INTERVAL_MS);
    return () => clearTimeout(timer);
  }, [downloads, activeModelId, loadModels, refreshDownloads]);

  useEffect(() => {
    setAccountNameDraft(activeAccount?.name ?? '');
    setOpenRouterApiKeyInput('');
    setOpenRouterBanner(null);
    setOpenRouterKeyInfo(null);

    if (!activeAccount?.openRouter.apiKeyStored) {
      setIsLoadingOpenRouterKeyInfo(false);
      setOpenRouterModels([]);
      setOpenRouterImageModels([]);
      return;
    }

    const syncOpenRouterModels = async () => {
      setIsLoadingOpenRouterModels(true);
      setIsLoadingOpenRouterImageModels(true);
      const [textModelsResult, imageModelsResult] = await Promise.all([
        window.electron.openrouter.listModels(activeAccount.id),
        window.electron.openrouter.listImageModels(activeAccount.id),
      ]);
      setIsLoadingOpenRouterModels(false);
      setIsLoadingOpenRouterImageModels(false);

      setOpenRouterModels(textModelsResult.success ? textModelsResult.models : []);
      setOpenRouterImageModels(imageModelsResult.success ? imageModelsResult.models : []);
    };

    void loadOpenRouterKeyInfo(activeAccount.id, true);
    void syncOpenRouterModels();
  }, [activeAccount?.id, activeAccount?.openRouter.apiKeyStored]);

  const assetSummary = useMemo(() => {
    return `${assetLibrary.length} tracked asset${assetLibrary.length === 1 ? '' : 's'}`;
  }, [assetLibrary.length]);

  const persistSettings = async (patch: Partial<SettingsState>) => {
    const next = await window.electron.settings.update(patch);
    setSettings({
      theme: next.theme,
      autoSave: next.autoSave,
      defaultOutputPath: next.defaultOutputPath,
      backendAutostart: next.backendAutostart,
      notifyOnGenerationComplete: next.notifyOnGenerationComplete,
      notifyOnGenerationFailed: next.notifyOnGenerationFailed,
      notifyOnModelDownloads: next.notifyOnModelDownloads,
      pythonPath: next.pythonPath,
    });
    window.dispatchEvent(
      new CustomEvent('vision-studio:theme-changed', {
        detail: { theme: next.theme },
      }),
    );
  };

  const handleBrowseOutputPath = async () => {
    const selectedFolder = await window.electron.dialog.selectFolder();
    if (!selectedFolder) {
      return;
    }

    await persistSettings({ defaultOutputPath: selectedFolder });
  };

  const handleClearCache = () => {
    setShowClearCacheConfirm(true);
  };

  const confirmClearCache = async () => {
    const result = await window.electron.assets.clearCache();
    if (result.success) {
      const userDataPath = await window.electron.app.getPath('userData');
      removeAssetsByRoot(`${userDataPath.replace(/\\/g, '/')}/outputs`);
      clearBatchResults();
    }
    setShowClearCacheConfirm(false);
  };

  const loadOpenRouterModels = async (accountId: string, silentError = false) => {
    setIsLoadingOpenRouterModels(true);
    const result = await window.electron.openrouter.listModels(accountId);
    setIsLoadingOpenRouterModels(false);

    if (result.success) {
      setOpenRouterModels(result.models);
      return result.models;
    }

    setOpenRouterModels([]);
    if (!silentError) {
      setOpenRouterBanner({
        tone: 'error',
        message: result.error || 'Could not load the OpenRouter model catalog.',
      });
    }
    return [];
  };

  const loadOpenRouterImageModels = async (accountId: string, silentError = false) => {
    setIsLoadingOpenRouterImageModels(true);
    const result = await window.electron.openrouter.listImageModels(accountId);
    setIsLoadingOpenRouterImageModels(false);

    if (result.success) {
      setOpenRouterImageModels(result.models);
      return result.models;
    }

    setOpenRouterImageModels([]);
    if (!silentError) {
      setOpenRouterBanner({
        tone: 'error',
        message: result.error || 'Could not load the OpenRouter image model catalog.',
      });
    }
    return [];
  };

  async function loadOpenRouterKeyInfo(accountId: string, silentError = false) {
    setIsLoadingOpenRouterKeyInfo(true);
    const result = await window.electron.openrouter.getKeyInfo(accountId);
    setIsLoadingOpenRouterKeyInfo(false);

    if (result.success) {
      if (result.accounts) {
        setAccountsSnapshot(result.accounts);
      }
      setOpenRouterKeyInfo(result.keyInfo ?? null);
      return result.keyInfo ?? null;
    }

    setOpenRouterKeyInfo(null);
    if (!silentError) {
      setOpenRouterBanner({
        tone: 'error',
        message: result.error || 'Could not load OpenRouter key information.',
      });
    }
    return null;
  }

  const handleAccountNameCommit = async () => {
    if (!activeAccount) {
      return;
    }

    const normalized = accountNameDraft.trim();
    if (!normalized || normalized === activeAccount.name) {
      setAccountNameDraft(activeAccount.name);
      return;
    }

    const nextSnapshot = await window.electron.accounts.update(activeAccount.id, {
      name: normalized,
    });
    setAccountsSnapshot(nextSnapshot);
  };

  const handleCreateAccount = async () => {
    const nextSnapshot = await window.electron.accounts.create();
    setAccountsSnapshot(nextSnapshot);
    setOpenRouterBanner({
      tone: 'info',
      message: 'Created a new local account profile.',
    });
  };

  const handleSetActiveAccount = async (accountId: string) => {
    const nextSnapshot = await window.electron.accounts.setActive(accountId);
    setAccountsSnapshot(nextSnapshot);
  };

  const handleUpdateActiveAccount = async (
    patch: {
      name?: string;
      promptEnhancementProvider?: 'local' | 'openrouter' | 'huggingface';
      openRouterModel?: string;
      imageGenerationProvider?: 'local' | 'openrouter' | 'huggingface';
      videoGenerationProvider?: 'local' | 'openrouter' | 'huggingface';
      openRouterImageModel?: string;
      huggingFaceModel?: string;
      huggingFaceImageModel?: string;
      huggingFaceVideoModel?: string;
      fallbackProvider?: 'openrouter' | 'huggingface' | null;
    },
  ) => {
    if (!activeAccount) {
      return;
    }

    const nextSnapshot = await window.electron.accounts.update(activeAccount.id, patch);
    setAccountsSnapshot(nextSnapshot);
  };

  const handleVerifyOpenRouter = async (accountId?: string) => {
    const resolvedAccountId = accountId ?? activeAccount?.id;
    if (!resolvedAccountId) {
      return;
    }

    setIsVerifyingOpenRouter(true);
    const result = await window.electron.openrouter.testConnection(resolvedAccountId);
    setIsVerifyingOpenRouter(false);

    if (!result.success) {
      setOpenRouterBanner({
        tone: 'error',
        message: result.error || 'OpenRouter connection failed.',
      });
      return;
    }

    if (result.accounts) {
      setAccountsSnapshot(result.accounts);
    }
    setOpenRouterKeyInfo(result.keyInfo ?? null);
    setOpenRouterBanner({
      tone: 'success',
      message: result.keyInfo?.label
        ? `Connected to OpenRouter with ${result.keyInfo.label}.`
        : 'Connected to OpenRouter successfully.',
    });
    await loadOpenRouterModels(resolvedAccountId, true);
    await loadOpenRouterImageModels(resolvedAccountId, true);
  };

  const handleSaveOpenRouterKey = async () => {
    if (!activeAccount) {
      return;
    }

    const normalizedKey = openRouterApiKeyInput.trim();
    if (!normalizedKey) {
      setOpenRouterBanner({
        tone: 'error',
        message: 'Enter an OpenRouter API key before saving.',
      });
      return;
    }

    setIsSavingOpenRouterKey(true);
    try {
      const nextSnapshot = await window.electron.accounts.setOpenRouterApiKey({
        accountId: activeAccount.id,
        apiKey: normalizedKey,
      });
      setAccountsSnapshot(nextSnapshot);
      setOpenRouterApiKeyInput('');
      setOpenRouterBanner({
        tone: 'info',
        message: 'OpenRouter key stored securely. Verifying access now.',
      });
      await handleVerifyOpenRouter(activeAccount.id);
    } catch (error) {
      setOpenRouterBanner({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Could not save the OpenRouter key.',
      });
    } finally {
      setIsSavingOpenRouterKey(false);
    }
  };

  const handleClearOpenRouterKey = async () => {
    if (!activeAccount) {
      return;
    }

    const nextSnapshot = await window.electron.accounts.clearOpenRouterApiKey(activeAccount.id);
    setAccountsSnapshot(nextSnapshot);
    setOpenRouterKeyInfo(null);
    setOpenRouterModels([]);
    setOpenRouterImageModels([]);
    setOpenRouterApiKeyInput('');
    setOpenRouterBanner({
      tone: 'info',
      message: 'Removed the stored OpenRouter key for this account.',
    });
  };

  const handleSaveHuggingFaceToken = async () => {
    if (!activeAccount) {
      return;
    }

    const token = huggingFaceTokenInput.trim();
    if (!token) {
      return;
    }

    setIsSavingHuggingFaceToken(true);
    try {
      const snapshot = await window.electron.accounts.setHuggingFaceToken({
        accountId: activeAccount.id,
        token,
      });
      setAccountsSnapshot(snapshot);
      setHuggingFaceTokenInput('');
    } finally {
      setIsSavingHuggingFaceToken(false);
    }
  };

  const handleClearHuggingFaceToken = async () => {
    if (!activeAccount) {
      return;
    }

    const snapshot = await window.electron.accounts.clearHuggingFaceToken(activeAccount.id);
    setAccountsSnapshot(snapshot);
  };

  const handleUpdateAutoRoute = async (next: boolean) => {
    setAutoRouteOnOverBudget(next);
    await window.electron.settings.update({ autoRouteOnOverBudget: next });
  };

  const confirmDeleteAccount = async () => {
    if (!deleteAccountTarget) {
      return;
    }

    const nextSnapshot = await window.electron.accounts.delete(deleteAccountTarget);
    setAccountsSnapshot(nextSnapshot);
    setDeleteAccountTarget(null);
    setOpenRouterBanner({
      tone: 'info',
      message: 'Removed the selected account profile.',
    });
  };

  // Guard against account snapshots that predate the HuggingFace BYOK fields so a
  // partial/legacy snapshot from the main process can never crash the renderer.
  const hasHuggingFaceToken = Boolean(activeAccount?.huggingFace?.tokenStored);

  const openRouterStatusLabel = useMemo(() => {
    if (!activeAccount?.openRouter.apiKeyStored) {
      return 'No OpenRouter key stored for this account yet.';
    }

    const pieces = ['Key stored securely'];
    if (activeAccount.openRouter.keyLabel) {
      pieces.push(activeAccount.openRouter.keyLabel);
    }
    if (activeAccount.openRouter.lastValidatedAt) {
      pieces.push(`verified ${new Date(activeAccount.openRouter.lastValidatedAt).toLocaleString()}`);
    }
    return pieces.join(' / ');
  }, [activeAccount]);

  return (
    <div className="h-full flex bg-surface" data-testid="settings-panel">
      <h1 className="sr-only">Settings</h1>
      <div className="flex w-56 flex-col border-r border-border bg-elevated p-3">
        <nav className="space-y-1">
          {sections.map((section) => {
            const Icon = section.icon;
            return (
              <button
                key={section.id}
                onClick={() => setActiveTab(section.id)}
                aria-current={activeTab === section.id ? 'page' : undefined}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2 rounded-md transition-all text-left',
                  activeTab === section.id
                    ? 'bg-accent-primary-muted text-accent-primary border border-accent-primary-border'
                    : 'text-text-body hover:text-text-primary hover:bg-surface',
                )}
              >
                <Icon className="w-4 h-4" />
                <span className="text-sm font-medium">{section.label}</span>
                {activeTab === section.id && <ChevronRight className="w-4 h-4 ml-auto" />}
              </button>
            );
          })}
        </nav>

        <div className="mt-auto border-t border-border pt-3">
          <p className="truncate data-mono text-text-muted">{`Vision Studio v${packageJson.version}`}</p>
          <p className="mt-1 type-badge text-text-muted">Beta Release</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            transition={{ duration: 0.2 }}
            className="max-w-2xl"
          >
            {activeTab === 'general' && (
              <div className="space-y-8">
                <div>
                  <h2 className="type-title text-text-primary mb-1">
                    General Settings
                  </h2>
                  <p className="text-sm text-text-body">
                    Manage your project and output preferences
                  </p>
                </div>

                <div className="space-y-3">
                  <label
                    htmlFor="output-path-input"
                    className="text-label text-text-body flex items-center gap-2"
                  >
                    <Folder className="w-4 h-4" />
                    Default Output Location
                  </label>
                  <div className="flex gap-2">
                    <input
                      id="output-path-input"
                      type="text"
                      value={settings.defaultOutputPath || 'Using app data /outputs'}
                      readOnly
                      className="recessed-well flex-1 px-3 py-2 data-mono text-text-primary"
                    />
                    <Button variant="secondary" size="sm" onClick={handleBrowseOutputPath}>
                      Browse
                    </Button>
                  </div>
                  <p className="text-xs text-text-muted">
                    Changing the output folder automatically restarts the backend so new generations
                    write to the new location.
                  </p>
                </div>

                <div className="flex items-center justify-between py-3 border-b border-border">
                  <div>
                    <h3 className="text-sm font-medium text-text-primary">
                      Auto Save
                    </h3>
                    <p className="text-xs text-text-body mt-0.5">
                      Automatically save local project state as you work
                    </p>
                  </div>
                  <button
                    role="switch"
                    aria-checked={settings.autoSave}
                    aria-label="Toggle auto save"
                    onClick={() => persistSettings({ autoSave: !settings.autoSave })}
                    className={cn(
                      'w-9 h-5 rounded-full transition-colors relative flex-shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary focus-visible:ring-offset-2 focus-visible:ring-offset-void',
                      settings.autoSave
                        ? 'bg-accent-primary'
                        : 'bg-surface border border-border',
                    )}
                  >
                    <span
                      className={cn(
                        'absolute top-0.5 w-4 h-4 rounded-full bg-text-primary transition-transform',
                        settings.autoSave ? 'translate-x-4' : 'translate-x-0.5',
                      )}
                    />
                  </button>
                </div>

                <div className="flex items-center justify-between py-3 border-b border-border">
                  <div>
                    <h3 className="text-sm font-medium text-text-primary">
                      Backend Autostart
                    </h3>
                    <p className="text-xs text-text-body mt-0.5">
                      Start the local AI backend automatically when the app opens
                    </p>
                  </div>
                  <button
                    role="switch"
                    aria-checked={settings.backendAutostart}
                    aria-label="Toggle backend autostart"
                    onClick={() =>
                      persistSettings({ backendAutostart: !settings.backendAutostart })
                    }
                    className={cn(
                      'w-9 h-5 rounded-full transition-colors relative flex-shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary focus-visible:ring-offset-2 focus-visible:ring-offset-void',
                      settings.backendAutostart
                        ? 'bg-accent-primary'
                        : 'bg-surface border border-border',
                    )}
                  >
                    <span
                      className={cn(
                        'absolute top-0.5 w-4 h-4 rounded-full bg-text-primary transition-transform',
                        settings.backendAutostart ? 'translate-x-4' : 'translate-x-0.5',
                      )}
                    />
                  </button>
                </div>

                <div className="space-y-3">
                  <h3 className="text-label text-text-body flex items-center gap-2">
                    <HardDrive className="w-4 h-4" />
                    Storage Usage
                  </h3>
                  <div className="raised-panel p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-text-primary">
                        Generated Assets
                      </span>
                      <span className="data-mono text-text-body">{assetSummary}</span>
                    </div>
                    <div className="h-2 bg-void rounded-full overflow-hidden border border-border">
                      <div
                        className="h-full rounded-full bg-[linear-gradient(90deg,var(--color-gradient-progress-start),var(--color-gradient-progress-end))]"
                        style={{
                          width: `${Math.min(100, Math.max(8, assetLibrary.length * 8))}%`,
                        }}
                      />
                    </div>
                    <p className="data-mono text-text-muted mt-2">
                      App cache folder: internal `/outputs`. Custom output folders are preserved.
                    </p>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="mt-3"
                      icon={RefreshCw}
                      onClick={handleClearCache}
                    >
                      Clear Cache
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'ai' && (
              <div className="space-y-8">
                <div>
                  <h2 className="type-title text-text-primary mb-1">
                    AI & Models
                  </h2>
                  <p className="text-sm text-text-body">
                    Configure AI generation settings, local accounts, and optional OpenRouter BYOK.
                  </p>
                </div>

                <div className="raised-panel p-4">
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        'w-10 h-10 rounded-md flex items-center justify-center',
                        systemInfo.gpuAvailable
                          ? 'bg-status-success-muted'
                          : 'bg-status-warning-muted',
                      )}
                    >
                      <Check
                        className={cn(
                          'w-5 h-5',
                          systemInfo.gpuAvailable
                            ? 'text-status-success'
                            : 'text-status-warning',
                        )}
                      />
                    </div>
                    <div>
                      <h4 className="text-sm font-medium text-text-primary">
                        {systemInfo.gpuName || 'GPU not detected'}
                      </h4>
                      <p className="data-mono text-text-body">
                        {systemInfo.gpuVram || 'CPU mode'}, {systemInfo.cudaVersion || 'No CUDA'}
                      </p>
                    </div>
                  </div>
                </div>

                {!systemInfo.backendConnected && (
                  <div className="bg-status-error-muted border border-status-error-border rounded-md p-4">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="w-5 h-5 text-status-error mt-0.5 flex-shrink-0" />
                      <div>
                        <h4 className="text-sm font-medium text-status-error">
                          AI Backend Offline
                        </h4>
                        <p className="text-xs text-text-body mt-1">
                          The Python backend is not running. Image generation and AI features are
                          disabled.
                        </p>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="mt-3 text-status-error hover:bg-status-error-muted"
                          icon={Play}
                          onClick={async () => {
                            const result = await window.electron.backend.start();
                            if (result.success) {
                              setTimeout(async () => {
                                const [info, backendStatus] = await Promise.all([
                                  window.electron.system.getInfo(),
                                  window.electron.backend.getStatus(),
                                ]);
                                setSystemInfo({
                                  gpuAvailable: info.gpu_available,
                                  gpuName: info.gpu_name,
                                  gpuVram: info.gpu_vram,
                                  cudaVersion: info.cuda_version,
                                  comfyuiConnected: info.comfyui_connected,
                                  modelsCount: info.models_count,
                                  backendConnected: info.backendConnected ?? false,
                                  backendRunning: backendStatus.running,
                                  bundledBackend: backendStatus.bundled,
                                });
                                const models = await window.electron.models.list();
                                setAvailableModels(models);
                              }, 3000);
                            }
                          }}
                        >
                          Start Backend
                        </Button>
                      </div>
                    </div>
                  </div>
                )}

                <div className="space-y-4">
                  <h3 className="text-label text-text-body flex items-center gap-2">
                    <Users className="w-4 h-4" />
                    User Accounts & BYOK
                  </h3>
                  <p className="text-xs text-text-body">
                    Keep separate local creator profiles, each with its own OpenRouter key and
                    prompt-enhancement model. Keys stay in the main process and are encrypted with
                    OS secure storage before they are saved.
                  </p>

                  <div className="raised-panel p-4 space-y-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-end">
                      <label className="flex-1 space-y-1">
                        <span className="text-xs text-text-muted">Active account</span>
                        <select
                          aria-label="Active user account"
                          value={activeAccount?.id ?? ''}
                          onChange={(event) => void handleSetActiveAccount(event.target.value)}
                          className="recessed-well w-full px-3 py-2 text-sm text-text-primary"
                        >
                          {accountsSnapshot.accounts.map((account) => (
                            <option key={account.id} value={account.id}>
                              {account.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <div className="flex gap-2">
                        <Button variant="secondary" size="sm" icon={UserPlus} onClick={handleCreateAccount}>
                          New Account
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          icon={Trash2}
                          disabled={!activeAccount}
                          onClick={() => setDeleteAccountTarget(activeAccount?.id ?? null)}
                        >
                          Remove
                        </Button>
                      </div>
                    </div>

                    {activeAccount && (
                      <>
                        <div className="space-y-1">
                          <label htmlFor="account-name-input" className="text-xs text-text-muted">
                            Account name
                          </label>
                          <input
                            id="account-name-input"
                            type="text"
                            value={accountNameDraft}
                            onChange={(event) => setAccountNameDraft(event.target.value)}
                            onBlur={() => void handleAccountNameCommit()}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter') {
                                event.preventDefault();
                                void handleAccountNameCommit();
                              }
                            }}
                            className="recessed-well w-full px-3 py-2 text-sm text-text-primary"
                          />
                        </div>

                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <Cloud className="w-4 h-4 text-text-muted" />
                            <h4 className="text-sm font-medium text-text-primary">
                              Prompt Enhancement Provider
                            </h4>
                          </div>
                          <p className="text-xs text-text-body">
                            This controls the prompt-enhancement tools for the active account.
                          </p>
                          <div className="grid grid-cols-3 gap-2">
                            {([
                              {
                                value: 'local' as const,
                                label: 'Local',
                                description: 'Use built-in prompt heuristics with no external key.',
                              },
                              {
                                value: 'openrouter' as const,
                                label: 'OpenRouter',
                                description: 'Use the active account\'s OpenRouter key and model.',
                              },
                              {
                                value: 'huggingface' as const,
                                label: 'HuggingFace',
                                description: "Use the active account's HuggingFace BYOK token and models.",
                              },
                            ]).map((provider) => {
                              const isDisabled =
                                provider.value === 'huggingface' && !hasHuggingFaceToken;
                              return (
                                <button
                                  key={provider.value}
                                  type="button"
                                  disabled={isDisabled}
                                  onClick={() =>
                                    void handleUpdateActiveAccount({
                                      promptEnhancementProvider: provider.value,
                                    })
                                  }
                                  className={cn(
                                    'rounded-md border px-3 py-3 text-left transition-all',
                                    activeAccount.preferences.promptEnhancementProvider ===
                                      provider.value
                                      ? 'border-accent-primary-border bg-accent-primary-muted'
                                      : 'border-border bg-surface hover:border-border-hover',
                                    isDisabled && 'cursor-not-allowed opacity-50',
                                  )}
                                >
                                  <div className="text-sm font-medium text-text-primary">
                                    {provider.label}
                                  </div>
                                  <p className="mt-1 text-xs text-text-muted">
                                    {provider.description}
                                  </p>
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <Cloud className="w-4 h-4 text-text-muted" />
                            <h4 className="text-sm font-medium text-text-primary">
                              Still Image Provider
                            </h4>
                          </div>
                          <p className="text-xs text-text-body">
                            Route still-image generations through the local backend or the active
                            account&apos;s OpenRouter / HuggingFace BYOK model. Motion (video) has its
                            own provider below.
                          </p>
                          <div className="grid grid-cols-3 gap-2">
                            {([
                              {
                                value: 'local' as const,
                                label: 'Local',
                                description: 'Use the installed local image stack and advanced canvas controls.',
                              },
                              {
                                value: 'openrouter' as const,
                                label: 'OpenRouter',
                                description: 'Use the active account\'s hosted still-image model.',
                              },
                              {
                                value: 'huggingface' as const,
                                label: 'HuggingFace',
                                description: "Use the active account's HuggingFace BYOK token and models.",
                              },
                            ]).map((provider) => {
                              const isDisabled =
                                provider.value === 'huggingface' && !hasHuggingFaceToken;
                              return (
                                <button
                                  key={provider.value}
                                  type="button"
                                  disabled={isDisabled}
                                  onClick={() =>
                                    void handleUpdateActiveAccount({
                                      imageGenerationProvider: provider.value,
                                    })
                                  }
                                  className={cn(
                                    'rounded-md border px-3 py-3 text-left transition-all',
                                    activeAccount.preferences.imageGenerationProvider === provider.value
                                      ? 'border-accent-primary-border bg-accent-primary-muted'
                                      : 'border-border bg-surface hover:border-border-hover',
                                    isDisabled && 'cursor-not-allowed opacity-50',
                                  )}
                                >
                                  <div className="text-sm font-medium text-text-primary">
                                    {provider.label}
                                  </div>
                                  <p className="mt-1 text-xs text-text-muted">
                                    {provider.description}
                                  </p>
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <Cloud className="w-4 h-4 text-text-muted" />
                            <h4 className="text-sm font-medium text-text-primary">
                              Motion / Video Provider
                            </h4>
                          </div>
                          <p className="text-xs text-text-body">
                            Route video generations through the local backend or the active
                            account&apos;s HuggingFace BYOK model. OpenRouter does not support video.
                          </p>
                          <div className="grid grid-cols-3 gap-2">
                            {([
                              {
                                value: 'local' as const,
                                label: 'Local',
                                description: 'Use the installed local video stack (LTX-Video, SVD).',
                              },
                              {
                                value: 'openrouter' as const,
                                label: 'OpenRouter',
                                description: 'OpenRouter does not offer video generation.',
                              },
                              {
                                value: 'huggingface' as const,
                                label: 'HuggingFace',
                                description: "Use the active account's HuggingFace BYOK video model.",
                              },
                            ]).map((provider) => {
                              const isDisabled =
                                provider.value === 'openrouter' ||
                                (provider.value === 'huggingface' && !hasHuggingFaceToken);
                              return (
                                <button
                                  key={provider.value}
                                  type="button"
                                  disabled={isDisabled}
                                  onClick={() =>
                                    void handleUpdateActiveAccount({
                                      videoGenerationProvider: provider.value,
                                    })
                                  }
                                  className={cn(
                                    'rounded-md border px-3 py-3 text-left transition-all',
                                    activeAccount.preferences.videoGenerationProvider === provider.value
                                      ? 'border-accent-primary-border bg-accent-primary-muted'
                                      : 'border-border bg-surface hover:border-border-hover',
                                    isDisabled && 'cursor-not-allowed opacity-50',
                                  )}
                                >
                                  <div className="text-sm font-medium text-text-primary">
                                    {provider.label}
                                  </div>
                                  <p className="mt-1 text-xs text-text-muted">
                                    {provider.description}
                                  </p>
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        <div className="space-y-4 raised-panel p-4">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2 text-sm font-medium text-text-primary">
                              <Key className="w-4 h-4" />
                              OpenRouter API Key
                            </div>
                            <p className="text-xs text-text-body">
                              Save one encrypted OpenRouter key per local account to enable BYOK
                              prompt enhancement and hosted still-image generation.
                            </p>
                          </div>

                          <div className="flex flex-col gap-3 md:flex-row">
                            <input
                              type="password"
                              value={openRouterApiKeyInput}
                              onChange={(event) => setOpenRouterApiKeyInput(event.target.value)}
                              placeholder={
                                activeAccount.openRouter.apiKeyStored
                                  ? 'Stored securely. Paste a new key to replace it.'
                                  : 'Paste your OpenRouter API key'
                              }
                              className="recessed-well flex-1 px-3 py-2 text-sm text-text-primary"
                            />
                            <div className="flex gap-2">
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={handleSaveOpenRouterKey}
                                disabled={isSavingOpenRouterKey}
                              >
                                {isSavingOpenRouterKey ? 'Saving...' : 'Save Key'}
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => void handleVerifyOpenRouter()}
                                disabled={!activeAccount.openRouter.apiKeyStored || isVerifyingOpenRouter}
                              >
                                {isVerifyingOpenRouter ? 'Verifying...' : 'Verify'}
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={handleClearOpenRouterKey}
                                disabled={!activeAccount.openRouter.apiKeyStored}
                              >
                                Clear
                              </Button>
                            </div>
                          </div>

                          <p className="data-mono text-text-muted">{openRouterStatusLabel}</p>

                          {openRouterBanner && (
                            <div
                              className={cn(
                                'rounded-md border px-3 py-2 text-xs',
                                openRouterBanner.tone === 'success' &&
                                  'border-status-success-border bg-status-success-muted text-status-success',
                                openRouterBanner.tone === 'error' &&
                                  'border-status-error-border bg-status-error-muted text-status-error',
                                openRouterBanner.tone === 'info' &&
                                  'border-border bg-elevated text-text-body',
                              )}
                            >
                              {openRouterBanner.message}
                            </div>
                          )}

                          {activeAccount.openRouter.apiKeyStored && (
                            <div className="space-y-3 raised-panel p-3">
                              <div className="flex items-center justify-between gap-3">
                                <div>
                                  <p className="text-sm font-medium text-text-primary">
                                    Key Usage
                                  </p>
                                  <p className="text-xs text-text-muted">
                                    Live credit and usage data from the current OpenRouter key.
                                  </p>
                                </div>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="px-2"
                                  onClick={() => {
                                    if (activeAccount) {
                                      void loadOpenRouterKeyInfo(activeAccount.id);
                                    }
                                  }}
                                  disabled={!activeAccount.openRouter.apiKeyStored || isLoadingOpenRouterKeyInfo}
                                >
                                  {isLoadingOpenRouterKeyInfo ? 'Refreshing...' : 'Refresh Usage'}
                                </Button>
                              </div>

                              {openRouterKeyInfo ? (
                                <div className="grid grid-cols-2 gap-2">
                                  <div className="recessed-well px-3 py-2">
                                    <p className="mono-label text-text-muted">
                                      Credit Remaining
                                    </p>
                                    <p className="mt-1 text-sm font-medium text-text-primary">
                                      {formatOpenRouterLimit(
                                        openRouterKeyInfo.limitRemaining,
                                        openRouterKeyInfo.limit,
                                      )}
                                    </p>
                                  </div>
                                  <div className="recessed-well px-3 py-2">
                                    <p className="mono-label text-text-muted">
                                      Total Usage
                                    </p>
                                    <p className="mt-1 text-sm font-medium text-text-primary">
                                      {formatOpenRouterCurrency(openRouterKeyInfo.usage)}
                                    </p>
                                  </div>
                                  <div className="recessed-well px-3 py-2">
                                    <p className="mono-label text-text-muted">
                                      BYOK Usage
                                    </p>
                                    <p className="mt-1 text-sm font-medium text-text-primary">
                                      {formatOpenRouterCurrency(openRouterKeyInfo.byokUsage)}
                                    </p>
                                  </div>
                                  <div className="recessed-well px-3 py-2">
                                    <p className="mono-label text-text-muted">
                                      Tier & Expiry
                                    </p>
                                    <p className="mt-1 text-sm font-medium text-text-primary">
                                      {openRouterKeyInfo.isFreeTier ? 'Free tier' : 'Standard'}
                                    </p>
                                    <p className="mt-1 text-xs text-text-muted">
                                      {openRouterKeyInfo.expiresAt
                                        ? `Expires ${new Date(openRouterKeyInfo.expiresAt).toLocaleDateString()}`
                                        : 'No expiration reported'}
                                    </p>
                                  </div>
                                </div>
                              ) : (
                                <p className="text-xs text-text-muted">
                                  Verify or refresh this account to load current OpenRouter credit
                                  and usage data.
                                </p>
                              )}
                            </div>
                          )}

                          <div className="space-y-1">
                            <div className="flex items-center justify-between gap-2">
                              <label
                                htmlFor="openrouter-model-select"
                                className="text-xs text-text-muted"
                              >
                                Prompt model
                              </label>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="px-2"
                                onClick={() => {
                                  if (activeAccount) {
                                    void loadOpenRouterModels(activeAccount.id);
                                  }
                                }}
                                disabled={
                                  !activeAccount.openRouter.apiKeyStored || isLoadingOpenRouterModels
                                }
                              >
                                {isLoadingOpenRouterModels ? 'Refreshing...' : 'Refresh'}
                              </Button>
                            </div>
                            <select
                              id="openrouter-model-select"
                              value={activeAccount.preferences.openRouterModel}
                              onChange={(event) =>
                                void handleUpdateActiveAccount({
                                  openRouterModel: event.target.value,
                                })
                              }
                              disabled={!activeAccount.openRouter.apiKeyStored}
                              className="recessed-well w-full px-3 py-2 text-sm text-text-primary"
                            >
                              <option value="">Use the OpenRouter account default</option>
                              {openRouterModels.map((model) => (
                                <option key={model.id} value={model.id}>
                                  {model.name} ({model.id})
                                </option>
                              ))}
                            </select>
                            <p className="text-xs text-text-muted">
                              The prompt catalog is filtered to text-capable models that advertise
                              JSON response formatting support.
                            </p>
                          </div>

                          <div className="space-y-1">
                            <div className="flex items-center justify-between gap-2">
                              <label
                                htmlFor="openrouter-image-model-select"
                                className="text-xs text-text-muted"
                              >
                                Still image model
                              </label>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="px-2"
                                onClick={() => {
                                  if (activeAccount) {
                                    void loadOpenRouterImageModels(activeAccount.id);
                                  }
                                }}
                                disabled={
                                  !activeAccount.openRouter.apiKeyStored || isLoadingOpenRouterImageModels
                                }
                              >
                                {isLoadingOpenRouterImageModels ? 'Refreshing...' : 'Refresh'}
                              </Button>
                            </div>
                            <select
                              id="openrouter-image-model-select"
                              value={activeAccount.preferences.openRouterImageModel}
                              onChange={(event) =>
                                void handleUpdateActiveAccount({
                                  openRouterImageModel: event.target.value,
                                })
                              }
                              disabled={!activeAccount.openRouter.apiKeyStored}
                              className="recessed-well w-full px-3 py-2 text-sm text-text-primary"
                            >
                              <option value="">Select an OpenRouter still-image model</option>
                              {openRouterImageModels.map((model) => (
                                <option key={model.id} value={model.id}>
                                  {model.name} ({model.id})
                                </option>
                              ))}
                            </select>
                            <p className="text-xs text-text-muted">
                              The still-image catalog is filtered to models that advertise image
                              output through OpenRouter.
                            </p>
                          </div>
                        </div>

                        <div className="space-y-4 raised-panel p-4">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2 text-sm font-medium text-text-primary">
                              <Key className="w-4 h-4" />
                              HuggingFace Inference Token
                            </div>
                            <p className="text-xs text-text-body">
                              Save one encrypted HuggingFace token per local account to enable BYOK
                              prompt enhancement and hosted still-image generation through the
                              HuggingFace Inference providers.
                            </p>
                          </div>

                          <div className="flex flex-col gap-3 md:flex-row">
                            <input
                              type="password"
                              value={huggingFaceTokenInput}
                              onChange={(event) => setHuggingFaceTokenInput(event.target.value)}
                              placeholder={
                                hasHuggingFaceToken
                                  ? 'Stored securely. Paste a new token to replace it.'
                                  : 'Paste your HuggingFace access token'
                              }
                              className="recessed-well flex-1 px-3 py-2 text-sm text-text-primary"
                            />
                            <div className="flex gap-2">
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={handleSaveHuggingFaceToken}
                                disabled={isSavingHuggingFaceToken}
                              >
                                {isSavingHuggingFaceToken ? 'Saving...' : 'Save Token'}
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={handleClearHuggingFaceToken}
                                disabled={!hasHuggingFaceToken}
                              >
                                Clear
                              </Button>
                            </div>
                          </div>

                          <p className="data-mono text-text-muted">
                            {hasHuggingFaceToken ? 'Token stored' : 'No token stored'}
                          </p>

                          <div className="space-y-1">
                            <label
                              htmlFor="huggingface-image-model-select"
                              className="text-xs text-text-muted"
                            >
                              Still image model
                            </label>
                            <select
                              id="huggingface-image-model-select"
                              value={activeAccount.preferences.huggingFaceImageModel ?? ''}
                              onChange={(event) =>
                                void handleUpdateActiveAccount({
                                  huggingFaceImageModel: event.target.value,
                                })
                              }
                              disabled={!hasHuggingFaceToken}
                              className="recessed-well w-full px-3 py-2 text-sm text-text-primary"
                            >
                              <option value="">Select a HuggingFace image model</option>
                              <option value="black-forest-labs/FLUX.1-schnell">
                                FLUX.1 schnell
                              </option>
                              <option value="stabilityai/stable-diffusion-xl-base-1.0">
                                SDXL 1.0
                              </option>
                            </select>
                            <p className="text-xs text-text-muted">
                              The selected model is used when this account routes still-image
                              generation through HuggingFace.
                            </p>
                          </div>

                          <div className="space-y-1">
                            <label
                              htmlFor="huggingface-video-model-select"
                              className="text-xs text-text-muted"
                            >
                              Video model
                            </label>
                            <select
                              id="huggingface-video-model-select"
                              value={activeAccount.preferences.huggingFaceVideoModel ?? ''}
                              onChange={(event) =>
                                void handleUpdateActiveAccount({
                                  huggingFaceVideoModel: event.target.value,
                                })
                              }
                              disabled={!hasHuggingFaceToken}
                              className="recessed-well w-full px-3 py-2 text-sm text-text-primary"
                            >
                              <option value="">Select a HuggingFace video model</option>
                              <option value="Lightricks/LTX-Video">LTX-Video</option>
                            </select>
                            <p className="text-xs text-text-muted">
                              The selected model is used when this account routes video generation
                              through HuggingFace.
                            </p>
                          </div>

                          <div className="space-y-1">
                            <label
                              htmlFor="huggingface-model-select"
                              className="text-xs text-text-muted"
                            >
                              Prompt model
                            </label>
                            <select
                              id="huggingface-model-select"
                              value={activeAccount.preferences.huggingFaceModel ?? ''}
                              onChange={(event) =>
                                void handleUpdateActiveAccount({
                                  huggingFaceModel: event.target.value,
                                })
                              }
                              disabled={!hasHuggingFaceToken}
                              className="recessed-well w-full px-3 py-2 text-sm text-text-primary"
                            >
                              <option value="">Select a HuggingFace prompt model</option>
                              <option value="meta-llama/Llama-3.1-8B-Instruct">
                                Llama 3.1 8B Instruct
                              </option>
                            </select>
                            <p className="text-xs text-text-muted">
                              The selected model is used when this account routes prompt enhancement
                              through HuggingFace.
                            </p>
                          </div>
                        </div>

                        <div className="space-y-4 raised-panel p-4">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2 text-sm font-medium text-text-primary">
                              <Cloud className="w-4 h-4" />
                              Over-Budget Policy
                            </div>
                            <p className="text-xs text-text-body">
                              Decide what happens when a local job is projected to exceed its budget:
                              choose a hosted fallback provider and whether over-budget jobs route to
                              it automatically.
                            </p>
                          </div>

                          <div className="space-y-1">
                            <label
                              htmlFor="fallback-provider-select"
                              className="text-xs text-text-muted"
                            >
                              Fallback provider
                            </label>
                            <select
                              id="fallback-provider-select"
                              value={activeAccount.preferences.fallbackProvider ?? ''}
                              onChange={(event) =>
                                void handleUpdateActiveAccount({
                                  fallbackProvider:
                                    event.target.value === ''
                                      ? null
                                      : (event.target.value as 'openrouter' | 'huggingface'),
                                })
                              }
                              className="recessed-well w-full px-3 py-2 text-sm text-text-primary"
                            >
                              <option value="">None (always prompt)</option>
                              <option value="openrouter">OpenRouter</option>
                              <option value="huggingface">HuggingFace</option>
                            </select>
                          </div>

                          <label className="flex items-start gap-3 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={autoRouteOnOverBudget}
                              onChange={(event) =>
                                void handleUpdateAutoRoute(event.target.checked)
                              }
                              className="mt-1 accent-accent-primary"
                            />
                            <span className="text-sm text-text-body">
                              Auto-route over-budget local jobs to the fallback provider (skip the
                              prompt)
                            </span>
                          </label>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-label text-text-body flex items-center gap-2">
                    <Tag className="w-4 h-4" />
                    AI Tagging Mode
                  </h3>
                  <p className="text-xs text-text-body mb-3">
                    Control when AI analyzes generated assets to create smart collection tags.
                  </p>
                  {([
                    {
                      value: 'on-generation' as const,
                      label: 'On Generation',
                      desc: 'Analyze each asset immediately after generation',
                    },
                    {
                      value: 'background-batch' as const,
                      label: 'Background Batch',
                      desc: 'Analyze assets in batches during idle time',
                    },
                    {
                      value: 'on-demand' as const,
                      label: 'On Demand',
                      desc: 'Only analyze when you manually trigger it',
                    },
                    {
                      value: 'off' as const,
                      label: 'Off',
                      desc: 'Disable automatic AI tagging entirely',
                    },
                  ]).map((mode) => (
                    <label key={mode.value} className="flex items-start gap-3 py-2 cursor-pointer">
                      <input
                        type="radio"
                        name="tagging-mode"
                        checked={taggingMode === mode.value}
                        onChange={() => setTaggingMode(mode.value)}
                        className="mt-1 accent-accent-primary"
                      />
                      <div>
                        <span className="text-sm font-medium text-text-primary">
                          {mode.label}
                        </span>
                        <p className="text-xs text-text-muted">{mode.desc}</p>
                      </div>
                    </label>
                  ))}
                </div>

                <div className="space-y-4">
                  <h3 className="text-label text-text-body flex items-center gap-2">
                    <Sparkles className="w-4 h-4" />
                    AI Director (RAG)
                  </h3>
                  <p className="text-xs text-text-body mb-3">
                    Augment prompt-assist with your prior prompts, your assets, and a curated
                    model-prompting knowledge base. Everything is indexed locally; nothing leaves your machine.
                  </p>
                  <label className="flex items-center justify-between py-2 cursor-pointer">
                    <span className="text-sm font-medium text-text-primary">Enable retrieval-augmented assist</span>
                    <input
                      type="checkbox"
                      checked={aiDirector.enabled}
                      onChange={(e) => void updateAiDirector({ ...aiDirector, enabled: e.target.checked })}
                      className="accent-accent-primary"
                    />
                  </label>
                  {([
                    { key: 'promptHistory' as const, label: 'Your prior prompts' },
                    { key: 'assets' as const, label: 'Your asset library' },
                    { key: 'knowledgeBase' as const, label: 'Model-prompting knowledge base' },
                  ]).map((src) => (
                    <label key={src.key} className="flex items-center justify-between py-1 pl-4 cursor-pointer">
                      <span className="text-sm text-text-body">{src.label}</span>
                      <input
                        type="checkbox"
                        disabled={!aiDirector.enabled}
                        checked={aiDirector.sources[src.key]}
                        onChange={(e) =>
                          void updateAiDirector({
                            ...aiDirector,
                            sources: { ...aiDirector.sources, [src.key]: e.target.checked },
                          })
                        }
                        className="accent-accent-primary"
                      />
                    </label>
                  ))}
                  <div className="flex items-center gap-3 pt-2">
                    <button type="button" className="btn-chrome px-3 py-1.5 text-sm" onClick={() => void rebuildDirectorIndex()}>
                      Rebuild index
                    </button>
                    <button type="button" className="raised-control px-3 py-1.5 text-sm" onClick={() => void clearDirectorIndex()}>
                      Clear index
                    </button>
                    <span className="mono-label text-text-muted">
                      {indexStats.count} indexed ({indexStats.mode})
                    </span>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-label text-text-body">Installed Models</h3>

                  <div className="raised-panel flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm text-text-primary">
                        {availableModels.length} model{availableModels.length === 1 ? '' : 's'} installed
                      </p>
                      <p className="text-xs text-text-body">
                        Discover, download, convert, and manage models in the Foundry.
                      </p>
                    </div>
                    <Button
                      variant="secondary"
                      size="sm"
                      icon={Boxes}
                      onClick={() => setNavTab('foundry')}
                      className="self-start sm:self-auto"
                    >
                      Manage in Foundry
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'performance' && (
              <div className="space-y-8">
                <div>
                  <h2 className="type-title text-text-primary mb-1">
                    Performance
                  </h2>
                  <p className="text-sm text-text-body">
                    Tune local inference acceleration. Auto lets the engine pick the fastest safe
                    path for your hardware; On and Off override a single optimization.
                  </p>
                </div>

                <div className="raised-panel p-4">
                  <PerformancePanel />
                </div>
              </div>
            )}

            {activeTab === 'appearance' && (
              <div className="space-y-8">
                <div>
                  <h2 className="type-title text-text-primary mb-1">
                    Appearance
                  </h2>
                  <p className="text-sm text-text-body">
                    Customize the look and feel of the app
                  </p>
                </div>

                <div className="space-y-3">
                  <label className="text-label text-text-body">Theme</label>
                  <div className="grid grid-cols-3 gap-3">
                    {(['dark', 'light', 'system'] as const).map((themeOption) => (
                      <button
                        key={themeOption}
                        onClick={() => persistSettings({ theme: themeOption })}
                        className={cn(
                          'p-4 rounded-md border transition-all text-center capitalize',
                          settings.theme === themeOption
                            ? 'border-accent-primary-border bg-accent-primary-muted'
                            : 'border-border bg-elevated hover:border-border-hover',
                        )}
                      >
                        <div
                          className={cn(
                            'w-8 h-8 mx-auto rounded-full mb-2',
                            themeOption === 'dark' && 'bg-void border border-border',
                            themeOption === 'light' && 'bg-white border border-gray-200',
                            themeOption === 'system' &&
                              'bg-gradient-to-br from-void to-white border border-gray-300',
                          )}
                        />
                        <span
                          className={cn(
                            'text-sm',
                            settings.theme === themeOption
                              ? 'text-accent-primary'
                              : 'text-text-body',
                          )}
                        >
                          {themeOption}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'notifications' && (
              <div className="space-y-8">
                <div>
                  <h2 className="type-title text-text-primary mb-1">
                    Notifications
                  </h2>
                  <p className="text-sm text-text-body">
                    Control desktop alerts for generation and model events.
                  </p>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between py-3 border-b border-border">
                    <div>
                      <h3 className="text-sm font-medium text-text-primary">
                        Generation Complete
                      </h3>
                      <p className="text-xs text-text-body mt-0.5">
                        Show a desktop notification when a render finishes.
                      </p>
                    </div>
                    <button
                      role="switch"
                      aria-checked={settings.notifyOnGenerationComplete}
                      aria-label="Toggle generation complete notifications"
                      onClick={() =>
                        persistSettings({
                          notifyOnGenerationComplete: !settings.notifyOnGenerationComplete,
                        })
                      }
                      className={cn(
                        'w-9 h-5 rounded-full transition-colors relative flex-shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary focus-visible:ring-offset-2 focus-visible:ring-offset-void',
                        settings.notifyOnGenerationComplete
                          ? 'bg-accent-primary'
                          : 'bg-surface border border-border',
                      )}
                    >
                      <span
                        className={cn(
                          'absolute top-0.5 w-4 h-4 rounded-full bg-text-primary transition-transform',
                          settings.notifyOnGenerationComplete
                            ? 'translate-x-4'
                            : 'translate-x-0.5',
                        )}
                      />
                    </button>
                  </div>

                  <div className="flex items-center justify-between py-3 border-b border-border">
                    <div>
                      <h3 className="text-sm font-medium text-text-primary">
                        Generation Failed
                      </h3>
                      <p className="text-xs text-text-body mt-0.5">
                        Show a desktop notification when a render fails.
                      </p>
                    </div>
                    <button
                      role="switch"
                      aria-checked={settings.notifyOnGenerationFailed}
                      aria-label="Toggle generation failed notifications"
                      onClick={() =>
                        persistSettings({
                          notifyOnGenerationFailed: !settings.notifyOnGenerationFailed,
                        })
                      }
                      className={cn(
                        'w-9 h-5 rounded-full transition-colors relative flex-shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary focus-visible:ring-offset-2 focus-visible:ring-offset-void',
                        settings.notifyOnGenerationFailed
                          ? 'bg-accent-primary'
                          : 'bg-surface border border-border',
                      )}
                    >
                      <span
                        className={cn(
                          'absolute top-0.5 w-4 h-4 rounded-full bg-text-primary transition-transform',
                          settings.notifyOnGenerationFailed
                            ? 'translate-x-4'
                            : 'translate-x-0.5',
                        )}
                      />
                    </button>
                  </div>

                  <div className="flex items-center justify-between py-3 border-b border-border">
                    <div>
                      <h3 className="text-sm font-medium text-text-primary">
                        Model Downloads
                      </h3>
                      <p className="text-xs text-text-body mt-0.5">
                        Show a desktop notification when model downloads complete.
                      </p>
                    </div>
                    <button
                      role="switch"
                      aria-checked={settings.notifyOnModelDownloads}
                      aria-label="Toggle model download notifications"
                      onClick={() =>
                        persistSettings({
                          notifyOnModelDownloads: !settings.notifyOnModelDownloads,
                        })
                      }
                      className={cn(
                        'w-9 h-5 rounded-full transition-colors relative flex-shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary focus-visible:ring-offset-2 focus-visible:ring-offset-void',
                        settings.notifyOnModelDownloads
                          ? 'bg-accent-primary'
                          : 'bg-surface border border-border',
                      )}
                    >
                      <span
                        className={cn(
                          'absolute top-0.5 w-4 h-4 rounded-full bg-text-primary transition-transform',
                          settings.notifyOnModelDownloads
                            ? 'translate-x-4'
                            : 'translate-x-0.5',
                        )}
                      />
                    </button>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'guide' && <UserGuidePage />}

            {activeTab === 'about' && <AboutSection />}
          </motion.div>
        </AnimatePresence>
      </div>

      <ConfirmDialog
        open={showClearCacheConfirm}
        title="Clear Cache"
        message="This will delete all cached generated assets and clear batch results. Custom output folders are preserved. Continue?"
        confirmLabel="Clear Cache"
        variant="danger"
        onConfirm={confirmClearCache}
        onCancel={() => setShowClearCacheConfirm(false)}
      />
      <ConfirmDialog
        open={deleteAccountTarget !== null}
        title="Remove Account"
        message="This removes the local account profile and its stored OpenRouter key. Continue?"
        confirmLabel="Remove"
        variant="danger"
        onConfirm={() => void confirmDeleteAccount()}
        onCancel={() => setDeleteAccountTarget(null)}
      />
    </div>
  );
}
