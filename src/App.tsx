import { useEffect, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '@/store/appStore';
import { Header } from '@/components/layout/Header';
import { DockviewLayout } from '@/components/layout/DockviewLayout';
import { FilmGrainOverlay } from '@/components/effects/FilmGrainOverlay';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { KeyboardShortcuts } from '@/components/ui/KeyboardShortcuts';
import { applyThemeToDocument, type ThemePreference } from '@/features/theme/theme';

function App() {
  const { setSystemInfo, loadModels, updateJob } = useAppStore(
    useShallow((s) => ({
      setSystemInfo: s.setSystemInfo,
      loadModels: s.loadModels,
      updateJob: s.updateJob,
    }))
  );

  const [showShortcuts, setShowShortcuts] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === '?') {
        setShowShortcuts(prev => !prev);
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        useAppStore.getState().undo();
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        useAppStore.getState().redo();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
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
        });
      } catch (e) {
        console.error('Failed to fetch system info:', e);
      }
    };

    const fetchModels = async () => {
      if (!electron?.models?.list) return;
      await loadModels();
    };

    fetchSystemInfo();
    fetchModels();

    // Poll system info every 30 seconds
    const interval = setInterval(fetchSystemInfo, 30000);
    const unsubscribeBackendStatus = electron?.backend?.onStatusChange?.(() => {
      void fetchSystemInfo();
    });

    return () => {
      clearInterval(interval);
      unsubscribeBackendStatus?.();
    };
  }, [setSystemInfo, loadModels]);

  useEffect(() => {
    const electron = getElectronApi();
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    const syncTheme = async (themePreference?: ThemePreference) => {
      const settings = themePreference
        ? { theme: themePreference }
        : electron?.settings?.get
          ? await electron.settings.get()
          : { theme: 'system' as ThemePreference };
      applyThemeToDocument(settings.theme, mediaQuery.matches);
    };

    const handleThemeChanged = (event: Event) => {
      const customEvent = event as CustomEvent<{ theme: ThemePreference }>;
      syncTheme(customEvent.detail?.theme);
    };

    const handleSystemThemeChanged = () => {
      syncTheme();
    };

    syncTheme();
    window.addEventListener('vision-studio:theme-changed', handleThemeChanged as EventListener);
    mediaQuery.addEventListener('change', handleSystemThemeChanged);

    return () => {
      window.removeEventListener('vision-studio:theme-changed', handleThemeChanged as EventListener);
      mediaQuery.removeEventListener('change', handleSystemThemeChanged);
    };
  }, []);

  // Subscribe to generation progress
  useEffect(() => {
    const electron = getElectronApi();
    if (!electron?.generation?.onProgress) return;

    const unsubscribe = electron.generation.onProgress((data) => {
      if (data.job_id && data.progress !== undefined) {
        updateJob(data.job_id, {
          progress: data.progress,
          status: data.status
        });
      }
    });

    return unsubscribe;
  }, [updateJob]);

  return (
    <>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:z-[9999] focus:p-4 focus:bg-accent-primary focus:text-white focus:rounded-md focus:m-2"
      >
        Skip to main content
      </a>
      <div className="flex h-full min-h-0 flex-col">
        <Header />
        <div id="main-content" data-testid="main-content" className="min-h-0 flex-1">
          <ErrorBoundary fallbackLabel="Workspace error">
            <DockviewLayout />
          </ErrorBoundary>
        </div>
      </div>
      <KeyboardShortcuts open={showShortcuts} onClose={() => setShowShortcuts(false)} />
      <FilmGrainOverlay opacity={0.025} />
    </>
  );
}

export default App;

function getElectronApi() {
  return (window as Partial<Window>).electron;
}
