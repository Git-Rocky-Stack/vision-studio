import { useEffect, useMemo, useRef, useState } from 'react';
import packageJson from '../../package.json';
import { cn } from '@/utils/cn';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useAppStore } from '@/store/appStore';
import {
  Settings,
  Folder,
  Cpu,
  Palette,
  Bell,
  ChevronRight,
  Check,
  RefreshCw,
  HardDrive,
  Monitor,
  AlertTriangle,
  Play,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

type SettingsTab = 'general' | 'ai' | 'appearance' | 'notifications';

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

const sections: SettingsSection[] = [
  { id: 'general', label: 'General', icon: Settings },
  { id: 'ai', label: 'AI & Models', icon: Cpu },
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'notifications', label: 'Notifications', icon: Bell },
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

export function SettingsPanel() {
  const {
    assetLibrary,
    systemInfo,
    availableModels,
    removeAssetsByRoot,
    clearBatchResults,
    setAvailableModels,
    setSystemInfo,
  } = useAppStore();
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const [settings, setSettings] = useState<SettingsState>(defaultSettingsState);
  const [activeModelId, setActiveModelId] = useState<string | null>(null);
  const [showClearCacheConfirm, setShowClearCacheConfirm] = useState(false);
  const [deleteModelTarget, setDeleteModelTarget] = useState<string | null>(null);
  const modelStatusIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const loadSettings = async () => {
      const loadedSettings = await window.electron.settings.get();
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
    };

    loadSettings();

    return () => {
      if (modelStatusIntervalRef.current) {
        clearInterval(modelStatusIntervalRef.current);
      }
    };
  }, []);

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
      })
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

  const refreshModels = async () => {
    const models = await window.electron.models.list();
    setAvailableModels(models);
  };

  const waitForModelStatus = async (modelId: string) => {
    if (modelStatusIntervalRef.current) {
      clearInterval(modelStatusIntervalRef.current);
    }

    modelStatusIntervalRef.current = setInterval(async () => {
      const status = await window.electron.models.getStatus(modelId);
      const models = await window.electron.models.list();
      setAvailableModels(models);

      if (!status || status.status === 'ready' || status.status === 'error') {
        if (modelStatusIntervalRef.current) {
          clearInterval(modelStatusIntervalRef.current);
          modelStatusIntervalRef.current = null;
        }
        setActiveModelId(null);

        if (status?.status === 'ready') {
          await window.electron.notifications.notify('model_download', {
            title: 'Model Ready',
            body: `${status.name} is installed and ready to use.`,
          });
        }
      }
    }, 2500);
  };

  const handleDownloadModel = async (modelId: string) => {
    setActiveModelId(modelId);
    const result = await window.electron.models.download(modelId);
    if (!result.success) {
      setActiveModelId(null);
      return;
    }

    await refreshModels();
    await waitForModelStatus(modelId);
  };

  const handleDeleteModel = (modelId: string) => {
    setDeleteModelTarget(modelId);
  };

  const confirmDeleteModel = async (modelId: string) => {
    setActiveModelId(modelId);
    await window.electron.models.delete(modelId);
    await refreshModels();
    setActiveModelId(null);
    setDeleteModelTarget(null);
  };

  return (
    <div className="h-full flex bg-surface">
      <div className="w-56 border-r border-border bg-elevated p-3">
        <nav className="space-y-1">
          {sections.map((section) => {
            const Icon = section.icon;
            return (
              <button
                key={section.id}
                onClick={() => setActiveTab(section.id)}
                aria-current={activeTab === section.id ? 'page' : undefined}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-all text-left',
                  activeTab === section.id
                    ? 'bg-accent-primary-muted text-accent-primary border border-accent-primary-border'
                    : 'text-text-body hover:text-text-primary hover:bg-surface'
                )}
              >
                <Icon className="w-4 h-4" />
                <span className="text-sm font-display font-medium">{section.label}</span>
                {activeTab === section.id && (
                  <ChevronRight className="w-4 h-4 ml-auto" />
                )}
              </button>
            );
          })}
        </nav>

        <div className="absolute bottom-4 left-4">
          <p className="text-xs font-mono text-text-muted">{`Vision Studio v${packageJson.version}`}</p>
          <p className="text-xs font-mono text-text-muted/60">Beta Release</p>
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
                  <h2 className="font-display text-xl font-semibold text-text-primary mb-1">
                    General Settings
                  </h2>
                  <p className="text-sm text-text-body">
                    Manage your project and output preferences
                  </p>
                </div>

                <div className="space-y-3">
                  <label htmlFor="output-path-input" className="text-label text-text-body flex items-center gap-2">
                    <Folder className="w-4 h-4" />
                    Default Output Location
                  </label>
                  <div className="flex gap-2">
                    <input
                      id="output-path-input"
                      type="text"
                      value={settings.defaultOutputPath || 'Using app data /outputs'}
                      readOnly
                      className="flex-1 bg-elevated border border-border rounded-lg px-3 py-2 text-sm font-mono text-text-primary"
                    />
                    <Button variant="secondary" size="sm" onClick={handleBrowseOutputPath}>
                      Browse
                    </Button>
                  </div>
                  <p className="text-xs text-text-muted">
                    Changing the output folder automatically restarts the backend so new generations write to the new location.
                  </p>
                </div>

                <div className="flex items-center justify-between py-3 border-b border-border">
                  <div>
                    <h3 className="text-sm font-display font-medium text-text-primary">
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
                      settings.autoSave ? 'bg-accent-primary' : 'bg-surface border border-border'
                    )}
                  >
                    <span className={cn(
                      'absolute top-0.5 w-4 h-4 rounded-full bg-text-primary transition-transform',
                      settings.autoSave ? 'translate-x-4' : 'translate-x-0.5'
                    )} />
                  </button>
                </div>

                <div className="flex items-center justify-between py-3 border-b border-border">
                  <div>
                    <h3 className="text-sm font-display font-medium text-text-primary">
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
                      settings.backendAutostart ? 'bg-accent-primary' : 'bg-surface border border-border'
                    )}
                  >
                    <span className={cn(
                      'absolute top-0.5 w-4 h-4 rounded-full bg-text-primary transition-transform',
                      settings.backendAutostart ? 'translate-x-4' : 'translate-x-0.5'
                    )} />
                  </button>
                </div>

                <div className="space-y-3">
                  <h3 className="text-label text-text-body flex items-center gap-2">
                    <HardDrive className="w-4 h-4" />
                    Storage Usage
                  </h3>
                  <div className="bg-elevated rounded-lg p-4 border border-border">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-display text-text-primary">
                        Generated Assets
                      </span>
                      <span className="text-sm font-mono text-text-body">{assetSummary}</span>
                    </div>
                    <div className="h-2 bg-void rounded-full overflow-hidden border border-border">
                      <div
                        className="h-full rounded-full bg-[linear-gradient(90deg,var(--color-gradient-progress-start),var(--color-gradient-progress-end))]"
                        style={{
                          width: `${Math.min(100, Math.max(8, assetLibrary.length * 8))}%`,
                        }}
                      />
                    </div>
                    <p className="text-xs font-mono text-text-muted mt-2">
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
                  <h2 className="font-display text-xl font-semibold text-text-primary mb-1">
                    AI & Models
                  </h2>
                  <p className="text-sm text-text-body">
                    Configure AI generation settings and hardware
                  </p>
                </div>

                <div className="bg-elevated rounded-lg p-4 border border-border">
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        'w-10 h-10 rounded-lg flex items-center justify-center',
                        systemInfo.gpuAvailable ? 'bg-[var(--color-status-success-muted)]' : 'bg-[var(--color-status-warning-muted)]'
                      )}
                    >
                      <Check
                        className={cn(
                          'w-5 h-5',
                          systemInfo.gpuAvailable ? 'text-[var(--color-status-success)]' : 'text-[var(--color-status-warning)]'
                        )}
                      />
                    </div>
                    <div>
                      <h4 className="text-sm font-display font-medium text-text-primary">
                        {systemInfo.gpuName || 'GPU not detected'}
                      </h4>
                      <p className="text-xs font-mono text-text-body">
                        {systemInfo.gpuVram || 'CPU mode'} &middot;{' '}
                        {systemInfo.cudaVersion || 'No CUDA'}
                      </p>
                    </div>
                  </div>
                </div>

                {!systemInfo.backendConnected && (
                  <div className="bg-status-error-muted border border-status-error-border rounded-md p-4">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="w-5 h-5 text-status-error mt-0.5 flex-shrink-0" />
                      <div>
                        <h4 className="text-sm font-display font-medium text-status-error">
                          AI Backend Offline
                        </h4>
                        <p className="text-xs text-text-body mt-1">
                          The Python backend is not running. Image generation and AI features are disabled.
                        </p>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="mt-3 text-status-error hover:bg-status-error-muted"
                          icon={Play}
                          onClick={async () => {
                            const result = await window.electron.backend.start();
                            if (result.success) {
                              // Re-fetch system info after a short delay for backend to initialize
                              setTimeout(async () => {
                                const info = await window.electron.system.getInfo();
                                setSystemInfo({
                                  gpuAvailable: info.gpu_available,
                                  gpuName: info.gpu_name,
                                  gpuVram: info.gpu_vram,
                                  cudaVersion: info.cuda_version,
                                  comfyuiConnected: info.comfyui_connected,
                                  modelsCount: info.models_count,
                                  backendConnected: info.backendConnected,
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
                  <h3 className="text-label text-text-body">Installed Models</h3>

                  {availableModels.length === 0 ? (
                    <div className="rounded-lg border border-border bg-elevated p-4 text-sm text-text-body">
                      No models reported by the backend yet.
                    </div>
                  ) : (
                    availableModels.map((model: any) => (
                      <div
                        key={model.id}
                        className="flex items-center justify-between py-3 border-b border-border/50"
                      >
                        <div>
                          <h4 className="text-sm font-display text-text-primary">{model.name}</h4>
                          <p className="text-xs font-mono text-text-body">
                            {model.size}
                            {typeof model.progress === 'number' && model.status === 'downloading'
                              ? ` · ${Math.round(model.progress)}%`
                              : ''}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span
                            className={cn(
                              'text-xs font-display flex items-center gap-1',
                              model.status === 'ready' ? 'text-[var(--color-status-success)]' : 'text-text-body'
                            )}
                          >
                            <Check className="w-3 h-3" />
                            {model.status}
                          </span>
                          {model.status !== 'ready' ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDownloadModel(model.id)}
                              disabled={activeModelId === model.id}
                            >
                              Download
                            </Button>
                          ) : (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteModel(model.id)}
                              disabled={activeModelId === model.id}
                            >
                              Remove
                            </Button>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {activeTab === 'appearance' && (
              <div className="space-y-8">
                <div>
                  <h2 className="font-display text-xl font-semibold text-text-primary mb-1">
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
                          'p-4 rounded-lg border transition-all text-center capitalize',
                          settings.theme === themeOption
                            ? 'border-accent-primary-border bg-accent-primary-muted'
                            : 'border-border bg-elevated hover:border-border-hover'
                        )}
                      >
                        <div
                          className={cn(
                            'w-8 h-8 mx-auto rounded-full mb-2',
                            themeOption === 'dark' && 'bg-void border border-border',
                            themeOption === 'light' && 'bg-white border border-gray-200',
                            themeOption === 'system' &&
                              'bg-gradient-to-br from-void to-white border border-gray-300'
                          )}
                        />
                        <span
                          className={cn(
                            'text-sm font-display',
                            settings.theme === themeOption
                              ? 'text-accent-primary'
                              : 'text-text-body'
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
                  <h2 className="font-display text-xl font-semibold text-text-primary mb-1">
                    Notifications
                  </h2>
                  <p className="text-sm text-text-body">
                    Control desktop alerts for generation and model events.
                  </p>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between py-3 border-b border-border">
                    <div>
                      <h3 className="text-sm font-display font-medium text-text-primary">
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
                        settings.notifyOnGenerationComplete ? 'bg-accent-primary' : 'bg-surface border border-border'
                      )}
                    >
                      <span className={cn(
                        'absolute top-0.5 w-4 h-4 rounded-full bg-text-primary transition-transform',
                        settings.notifyOnGenerationComplete ? 'translate-x-4' : 'translate-x-0.5'
                      )} />
                    </button>
                  </div>

                  <div className="flex items-center justify-between py-3 border-b border-border">
                    <div>
                      <h3 className="text-sm font-display font-medium text-text-primary">
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
                        settings.notifyOnGenerationFailed ? 'bg-accent-primary' : 'bg-surface border border-border'
                      )}
                    >
                      <span className={cn(
                        'absolute top-0.5 w-4 h-4 rounded-full bg-text-primary transition-transform',
                        settings.notifyOnGenerationFailed ? 'translate-x-4' : 'translate-x-0.5'
                      )} />
                    </button>
                  </div>

                  <div className="flex items-center justify-between py-3 border-b border-border">
                    <div>
                      <h3 className="text-sm font-display font-medium text-text-primary">
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
                        settings.notifyOnModelDownloads ? 'bg-accent-primary' : 'bg-surface border border-border'
                      )}
                    >
                      <span className={cn(
                        'absolute top-0.5 w-4 h-4 rounded-full bg-text-primary transition-transform',
                        settings.notifyOnModelDownloads ? 'translate-x-4' : 'translate-x-0.5'
                      )} />
                    </button>
                  </div>
                </div>
              </div>
            )}
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
        open={deleteModelTarget !== null}
        title="Remove Model"
        message={`Are you sure you want to remove this model? You can re-download it later.`}
        confirmLabel="Remove"
        variant="danger"
        onConfirm={() => { if (deleteModelTarget) confirmDeleteModel(deleteModelTarget); }}
        onCancel={() => setDeleteModelTarget(null)}
      />
    </div>
  );
}
