import { useEffect, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '@/store/appStore';
import { Header } from '@/components/layout/Header';
import { DockviewLayout } from '@/components/layout/DockviewLayout';
import { FilmGrainOverlay } from '@/components/effects/FilmGrainOverlay';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { KeyboardShortcuts } from '@/components/ui/KeyboardShortcuts';
import { FirstRunProvisioning } from '@/components/provisioning/FirstRunProvisioning';
import { useProvisioningStatus } from '@/hooks/useProvisioningStatus';
import { applyThemeToDocument, type ThemePreference } from '@/features/theme/theme';
import { startBackgroundTagging } from '@/features/assets/backgroundTagging';
import { startJobProgressBridge } from '@/features/jobs/progressBridge';
import { useModelReadyNotifications } from '@/features/jobs/modelReadyNotifications';
import { AI_DIRECTOR_DEFAULTS } from '../shared/retrieval';
import { buildIngestRecords } from '@/features/director/buildIngestRecords';
import { isEditableTarget } from '@/utils/isEditableTarget';
import { isWorkspaceShortcutBlocked } from '@/utils/modalGuard';

const THEME_PREFERENCES: readonly ThemePreference[] = ['light', 'dark', 'system'];

function readThemePreference(value: unknown): ThemePreference {
  return THEME_PREFERENCES.includes(value as ThemePreference) ? (value as ThemePreference) : 'system';
}

function App() {
  const { setSystemInfo, loadModels, activeTab, activeSubMode } = useAppStore(
    useShallow((s) => ({
      setSystemInfo: s.setSystemInfo,
      loadModels: s.loadModels,
      activeTab: s.activeTab,
      activeSubMode: s.activeSubMode,
    }))
  );

  const [showShortcuts, setShowShortcuts] = useState(false);

  // #34 installer PR3: keep the auto-set provisioning snapshot current so the
  // first-run overlay, Header pill, and Foundry card render live state.
  useProvisioningStatus();

  // #J11: "Model Ready" fires wherever a download finishes, not only while
  // Settings happens to be open.
  useModelReadyNotifications();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Text fields, selects and contentEditable keep their own undo and keys.
      if (isEditableTarget(e.target)) return;
      // While a modal owns the keyboard, workspace undo/redo must not act on
      // the surface behind it. '?' still closes the shortcuts sheet itself.
      const blocked = isWorkspaceShortcutBlocked(e);
      if (e.key === '?') {
        setShowShortcuts((prev) => (prev ? false : !blocked));
      }
      if (blocked) return;
      // Shift turns the key into 'Z', so compare case-insensitively.
      const key = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && key === 'z' && !e.shiftKey) {
        e.preventDefault();
        useAppStore.getState().undo();
      }
      if ((e.ctrlKey || e.metaKey) && (key === 'y' || (key === 'z' && e.shiftKey))) {
        e.preventDefault();
        useAppStore.getState().redo();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Background Batch tagging: tag the queued assets in one pass once the app is idle.
  useEffect(() => startBackgroundTagging(useAppStore), []);

  // M7: sync the local corpus into the retrieval index on startup (when AI Director
  // is enabled) so prompt-assist augmentation has the user's prompts/assets. The
  // backend re-embeds only new items (content-hash), so repeat launches are cheap,
  // and a failure (backend not up yet) is logged, never an unhandled rejection.
  useEffect(() => {
    const electron = window.electron;
    if (!electron?.settings || !electron?.director) return;
    void electron.settings
      .get()
      .then((s) => {
        if (!(s.aiDirector ?? AI_DIRECTOR_DEFAULTS).enabled) return undefined;
        const { promptHistory, favoritePrompts, assetLibrary, batchResults } = useAppStore.getState();
        return electron.director.syncCorpus(
          buildIngestRecords({ promptHistory, favoritePrompts, assetLibrary, batchResults }),
        );
      })
      .catch((error: unknown) => {
        console.warn('[director] startup corpus sync skipped:', error);
      });
  }, []);

  // Fetch system info on mount
  useEffect(() => {
    const electron = getElectronApi();

    const fetchSystemInfo = async () => {
      if (!electron?.system?.getInfo) return;

      try {
        const [info, backendStatus] = await Promise.all([
          electron.system.getInfo(),
          electron?.backend?.getStatus ? electron.backend.getStatus() : Promise.resolve(undefined),
        ]);
        setSystemInfo({
          gpuAvailable: info.gpu_available,
          gpuName: info.gpu_name,
          gpuVram: info.gpu_vram,
          cudaVersion: info.cuda_version,
          comfyuiConnected: info.comfyui_connected,
          modelsCount: info.models_count,
          backendConnected: info.backendConnected ?? false,
          backendRunning: backendStatus?.running,
          bundledBackend: backendStatus?.bundled,
          ...(info.availability ? { availability: info.availability } : {}),
        });
      } catch (e) {
        console.error('Failed to fetch system info:', e);
      }
    };

    const fetchModels = async () => {
      if (!electron?.models?.list) return;
      await loadModels();
    };

    void fetchSystemInfo();
    void fetchModels();

    // Poll system info every 30 seconds
    const interval = setInterval(() => void fetchSystemInfo(), 30000);
    const unsubscribeBackendStatus = electron?.backend?.onStatusChange?.(() => {
      void fetchSystemInfo();
    });

    return () => {
      clearInterval(interval);
      unsubscribeBackendStatus?.();
    };
  }, [setSystemInfo, loadModels]);

  // Theme. Every sync takes a ticket; only the newest ticket may apply, so a
  // slow settings.get() started before a theme change can no longer land
  // after it and revert the user's choice (#J6).
  useEffect(() => {
    const electron = getElectronApi();
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    let latestRequest = 0;
    let disposed = false;

    const syncTheme = async (themePreference?: ThemePreference) => {
      const request = ++latestRequest;
      let theme: ThemePreference = 'system';
      if (themePreference) {
        theme = themePreference;
      } else if (electron?.settings?.get) {
        try {
          theme = readThemePreference((await electron.settings.get()).theme);
        } catch (error) {
          console.warn('[theme] could not read the saved theme; following the system theme', error);
        }
      }
      if (disposed || request !== latestRequest) return;
      applyThemeToDocument(theme, mediaQuery.matches);
    };

    const handleThemeChanged = (event: Event) => {
      const customEvent = event as CustomEvent<{ theme: ThemePreference }>;
      void syncTheme(customEvent.detail?.theme);
    };

    const handleSystemThemeChanged = () => {
      void syncTheme();
    };

    void syncTheme();
    window.addEventListener('vision-studio:theme-changed', handleThemeChanged as EventListener);
    mediaQuery.addEventListener('change', handleSystemThemeChanged);

    return () => {
      disposed = true;
      window.removeEventListener('vision-studio:theme-changed', handleThemeChanged as EventListener);
      mediaQuery.removeEventListener('change', handleSystemThemeChanged);
    };
  }, []);

  // Generation progress pushes, validated, into the job store (#J15). The
  // job watcher owns terminal transitions; this only applies live progress.
  useEffect(() => startJobProgressBridge({ store: useAppStore }), []);

  return (
    <>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:z-[var(--z-overlay)] focus:p-4 focus:bg-accent-primary focus:text-void focus:rounded-md focus:m-2"
      >
        Skip to main content
      </a>
      <div className="flex h-full min-h-0 flex-col">
        <Header />
        <div id="main-content" data-testid="main-content" className="min-h-0 flex-1">
          <ErrorBoundary fallbackLabel="Workspace error" resetKeys={[activeTab, activeSubMode]}>
            <DockviewLayout />
          </ErrorBoundary>
        </div>
      </div>
      <KeyboardShortcuts open={showShortcuts} onClose={() => setShowShortcuts(false)} />
      <FirstRunProvisioning />
      <FilmGrainOverlay opacity={0.025} />
    </>
  );
}

export default App;

function getElectronApi() {
  return (window as Partial<Window>).electron;
}
