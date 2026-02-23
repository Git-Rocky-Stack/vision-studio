import { useEffect } from 'react';
import { useAppStore } from '@/store/appStore';
import { Sidebar } from '@/components/layout/Sidebar';
import { Header } from '@/components/layout/Header';
import { Canvas } from '@/components/layout/Canvas';
import { Timeline } from '@/components/layout/Timeline';
import { GeneratePanel } from '@/pages/GeneratePanel';
import { EditPanel } from '@/pages/EditPanel';
import { AssetsPanel } from '@/pages/AssetsPanel';
import { SettingsPanel } from '@/pages/SettingsPanel';
import { TemplatesPanel } from '@/pages/TemplatesPanel';
import { BatchPanel } from '@/pages/BatchPanel';
import { cn } from '@/utils/cn';
import { motion, AnimatePresence } from 'framer-motion';

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

  const renderPanel = () => {
    switch (activePanel) {
      case 'generate':
        return <GeneratePanel />;
      case 'batch':
        return <BatchPanel />;
      case 'templates':
        return <TemplatesPanel />;
      case 'edit':
        return <EditPanel />;
      case 'assets':
        return <AssetsPanel />;
      case 'settings':
        return <SettingsPanel />;
      default:
        return <GeneratePanel />;
    }
  };

  return (
    <div className="h-screen w-screen bg-black flex overflow-hidden">
      {/* Sidebar */}
      <Sidebar />

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <Header />

        {/* Workspace */}
        <div className="flex-1 flex min-h-0">
          {/* Canvas Area */}
          <Canvas />

          {/* Right Panel */}
          <AnimatePresence mode="wait">
            <motion.div
              key={activePanel}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
              className={cn(
                'border-l border-border bg-charcoal flex-shrink-0 overflow-hidden',
                activePanel === 'settings' ? 'w-[600px]' : 'w-80'
              )}
            >
              {renderPanel()}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Timeline */}
        <Timeline />
      </div>
    </div>
  );
}

export default App;
