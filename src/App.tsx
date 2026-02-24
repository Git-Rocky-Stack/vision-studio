import { useEffect } from 'react';
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
import { BatchPanel } from '@/pages/BatchPanel';

function App() {
  const {
    activePanel,
    setSystemInfo,
    setAvailableModels,
    addJob,
    updateJob
  } = useAppStore();

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
          modelsCount: info.models_count
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
      <WorkspaceLayout
        activePanel={activePanel}
        sidebar={<Sidebar />}
        header={<Header />}
        timeline={<Timeline />}
        canvas={<Canvas />}
        panels={{
          generate: <GeneratePanel />,
          edit: <EditPanel />,
          assets: <AssetsPanel />,
          settings: <SettingsPanel />,
          templates: <TemplatesPanel />,
          batch: <BatchPanel />,
        }}
      />
      <FilmGrainOverlay opacity={0.025} />
    </>
  );
}

export default App;
