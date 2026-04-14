import { useEffect, useState } from 'react';
import { useAppStore } from '@/store/appStore';
import { Sidebar } from '@/components/layout/Sidebar';
import { Header } from '@/components/layout/Header';
import { Canvas } from '@/components/layout/Canvas';
import { Timeline } from '@/components/layout/Timeline';
import { WorkspaceLayout } from '@/components/layout/WorkspaceLayout';
import { FilmGrainOverlay } from '@/components/effects/FilmGrainOverlay';
import { GeneratePanel } from '@/pages/GeneratePanel';
import { EditPanel } from '@/pages/EditPanel';
import { AssetsPanel } from '@/pages/AssetsPanel';
import { SettingsPanel } from '@/pages/SettingsPanel';
import { TemplatesPanel } from '@/pages/TemplatesPanel';
import { BatchPromptQueue, BatchResultsPanel } from '@/pages/BatchPanel';
import { QuickGeneratePanel } from '@/pages/QuickGeneratePanel';
import { ToolStrip } from '@/components/edit/ToolStrip';
import { EditPropertiesPanel } from '@/components/edit/EditPropertiesPanel';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { KeyboardShortcuts } from '@/components/ui/KeyboardShortcuts';
import { applyThemeToDocument, type ThemePreference } from '@/features/theme/theme';

function App() {
  const {
    activePanel,
    setSystemInfo,
    setAvailableModels,
    addJob,
    updateJob
  } = useAppStore();

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
    const fetchSystemInfo = async () => {
      try {
        const info = await window.electron.system.getInfo();
        setSystemInfo({
          gpuAvailable: info.gpu_available,
          gpuName: info.gpu_name,
          gpuVram: info.gpu_vram,
          cudaVersion: info.cuda_version,
          comfyuiConnected: info.comfyui_connected,
          modelsCount: info.models_count,
          backendConnected: info.backend_connected,
        });
      } catch (e) {
        console.error('Failed to fetch system info:', e);
      }
    };

    const fetchModels = async () => {
      try {
        const models = await window.electron.models.list();
        setAvailableModels(models);
      } catch (e) {
        console.error('Failed to fetch models:', e);
      }
    };

    fetchSystemInfo();
    fetchModels();

    // Poll system info every 30 seconds
    const interval = setInterval(fetchSystemInfo, 30000);
    return () => clearInterval(interval);
  }, [setSystemInfo, setAvailableModels]);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    const syncTheme = async (themePreference?: ThemePreference) => {
      const settings = themePreference
        ? { theme: themePreference }
        : await window.electron.settings.get();
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
    const unsubscribe = window.electron.generation.onProgress((data) => {
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
      <ErrorBoundary fallbackLabel="Workspace error">
        <WorkspaceLayout
          activePanel={activePanel}
          sidebar={<Sidebar />}
          header={<Header />}
          timeline={
            <ErrorBoundary fallbackLabel="Timeline error">
              <Timeline />
            </ErrorBoundary>
          }
          canvas={
            <ErrorBoundary fallbackLabel="Canvas error">
              <Canvas />
            </ErrorBoundary>
          }
          panels={{
            generate: (
              <ErrorBoundary fallbackLabel="Generate panel error">
                <GeneratePanel />
              </ErrorBoundary>
            ),
            quick: (
              <ErrorBoundary fallbackLabel="Quick generate panel error">
                <QuickGeneratePanel />
              </ErrorBoundary>
            ),
            edit: (
              <ErrorBoundary fallbackLabel="Edit panel error">
                <EditPanel />
              </ErrorBoundary>
            ),
            assets: (
              <ErrorBoundary fallbackLabel="Assets panel error">
                <AssetsPanel />
              </ErrorBoundary>
            ),
            settings: (
              <ErrorBoundary fallbackLabel="Settings panel error">
                <SettingsPanel />
              </ErrorBoundary>
            ),
            templates: (
              <ErrorBoundary fallbackLabel="Templates panel error">
                <TemplatesPanel />
              </ErrorBoundary>
            ),
          }}
          toolStrip={
            <ErrorBoundary fallbackLabel="Tool strip error">
              <ToolStrip />
            </ErrorBoundary>
          }
          editProperties={
            <ErrorBoundary fallbackLabel="Properties panel error">
              <EditPropertiesPanel />
            </ErrorBoundary>
          }
          batchQueue={
            <ErrorBoundary fallbackLabel="Batch queue error">
              <BatchPromptQueue />
            </ErrorBoundary>
          }
          batchResults={
            <ErrorBoundary fallbackLabel="Batch results error">
              <BatchResultsPanel />
            </ErrorBoundary>
          }
        />
      </ErrorBoundary>
      <FilmGrainOverlay opacity={0.025} />
      <KeyboardShortcuts open={showShortcuts} onClose={() => setShowShortcuts(false)} />
    </>
  );
}

export default App;
