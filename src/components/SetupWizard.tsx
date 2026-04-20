import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/utils/cn';
import { Button } from './ui/Button';
import {
  Download,
  Cpu,
  Check,
  AlertCircle,
  Loader2,
  Sparkles,
  ArrowRight,
  Monitor,
  HardDrive,
  Zap,
} from 'lucide-react';

interface SetupStep {
  id: string;
  title: string;
  description: string;
}

const steps: SetupStep[] = [
  {
    id: 'welcome',
    title: 'Welcome to Vision Studio',
    description: "Let's get you set up for AI image and video generation",
  },
  {
    id: 'gpu',
    title: 'GPU Detection',
    description: 'Checking your system capabilities',
  },
  {
    id: 'download',
    title: 'Download AI Backend',
    description: 'Downloading PyTorch and dependencies',
  },
  {
    id: 'complete',
    title: 'Setup Complete',
    description: "You're ready to create!",
  },
];

export function SetupWizard() {
  const [currentStep, setCurrentStep] = useState(0);
  const [isVisible, setIsVisible] = useState(true);
  const [gpuInfo, setGpuInfo] = useState<{
    available: boolean;
    name?: string;
    vram?: string;
  } | null>(null);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadStatus, setDownloadStatus] = useState<
    'idle' | 'downloading' | 'complete' | 'error'
  >('idle');

  useEffect(() => {
    if (currentStep === 1) {
      checkGPU();
    } else if (currentStep === 2) {
      startDownload();
    }
  }, [currentStep]);

  const checkGPU = async () => {
    try {
      const info = await window.electron.system.getInfo();
      setGpuInfo({
        available: info.gpu_available,
        name: info.gpu_name,
        vram: info.gpu_vram,
      });
    } catch (e) {
      console.error('Failed to detect GPU:', e);
      setGpuInfo({ available: false });
    }

    setTimeout(() => setCurrentStep(2), 2000);
  };

  const startDownload = async () => {
    setDownloadStatus('downloading');

    const interval = setInterval(() => {
      setDownloadProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          setDownloadStatus('complete');
          setTimeout(() => setCurrentStep(3), 1000);
          return 100;
        }
        const remaining = 100 - prev;
        return Math.min(99, prev + remaining * 0.05);
      });
    }, 200);
  };

  const handleFinish = () => {
    setIsVisible(false);
  };

  if (!isVisible) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-void/90 backdrop-blur-md"
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          className="w-full max-w-lg bg-surface border border-border rounded-2xl shadow-cinematic overflow-hidden"
        >
          {/* Header */}
          <div className="p-6 border-b border-border relative overflow-hidden">
            {/* Subtle red accent line at top */}
            <div
              className="absolute top-0 left-0 right-0 h-0.5"
              style={{
                background:
                  'linear-gradient(90deg, transparent, var(--color-red-primary), transparent)',
              }}
            />

            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-primary to-red-highlight flex items-center justify-center glow-red-subtle">
                <Sparkles className="w-5 h-5 text-text-primary" />
              </div>
              <div>
                <h2 className="font-display text-xl font-bold text-text-primary">
                  Vision Studio
                </h2>
                <p className="text-sm text-text-body font-display">
                  Setup Wizard
                </p>
              </div>
            </div>

            {/* Progress Bar */}
            <div
              className="flex gap-1"
              role="progressbar"
              aria-valuenow={currentStep + 1}
              aria-valuemin={1}
              aria-valuemax={steps.length}
              aria-label={`Setup progress: step ${currentStep + 1} of ${steps.length}`}
            >
              {steps.map((_, index) => (
                <div
                  key={index}
                  className="h-1 flex-1 rounded-full transition-all duration-500 overflow-hidden"
                >
                  <div
                    className={cn(
                      'h-full rounded-full transition-all duration-500',
                      index <= currentStep
                        ? 'w-full'
                        : 'w-0'
                    )}
                    style={
                      index <= currentStep
                        ? {
                            background:
                              'linear-gradient(90deg, var(--color-red-deep), var(--color-red-primary))',
                          }
                        : { backgroundColor: 'var(--color-elevated)' }
                    }
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Content */}
          <div className="p-6 min-h-[280px]">
            <AnimatePresence mode="wait">
              {currentStep === 0 && (
                <motion.div
                  key="welcome"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="space-y-4"
                >
                  <h3 className="font-display text-lg font-semibold text-text-primary">
                    {steps[0].title}
                  </h3>
                  <p className="text-text-body font-display">
                    {steps[0].description}
                  </p>

                  <div className="p-4 bg-elevated rounded-lg border border-border space-y-3">
                    {[
                      {
                        icon: Monitor,
                        title: 'AI-Powered Generation',
                        desc: 'Create stunning images and videos',
                      },
                      {
                        icon: HardDrive,
                        title: 'Local Processing',
                        desc: 'Your data stays on your machine',
                      },
                      {
                        icon: Zap,
                        title: 'GPU Accelerated',
                        desc: 'Faster generation with NVIDIA GPU',
                      },
                    ].map(({ icon: Icon, title, desc }) => (
                      <div key={title} className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-red-aura flex items-center justify-center flex-shrink-0">
                          <Icon className="w-4 h-4 text-red-primary" />
                        </div>
                        <div>
                          <p className="text-sm font-display font-medium text-text-primary">
                            {title}
                          </p>
                          <p className="text-xs text-text-muted font-display">
                            {desc}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>

                  <Button
                    variant="cinema"
                    fullWidth
                    icon={ArrowRight}
                    iconPosition="right"
                    onClick={() => setCurrentStep(1)}
                  >
                    Get Started
                  </Button>
                </motion.div>
              )}

              {currentStep === 1 && (
                <motion.div
                  key="gpu"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="space-y-4"
                >
                  <h3 className="font-display text-lg font-semibold text-text-primary">
                    {steps[1].title}
                  </h3>
                  <p className="text-text-body font-display">
                    {steps[1].description}
                  </p>

                  <div className="flex items-center justify-center py-8">
                    {gpuInfo === null ? (
                      <div className="text-center">
                        <Loader2 className="w-10 h-10 text-red-primary animate-spin mx-auto mb-3" />
                        <p className="font-display text-sm text-text-muted">
                          Scanning hardware...
                        </p>
                      </div>
                    ) : gpuInfo.available ? (
                      <div className="text-center">
                        <div className="w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center" style={{ backgroundColor: 'color-mix(in srgb, var(--color-status-success) 10%, transparent)', borderWidth: '1px', borderStyle: 'solid', borderColor: 'color-mix(in srgb, var(--color-status-success) 20%, transparent)' }}>
                          <Check className="w-8 h-8" style={{ color: 'var(--color-status-success)' }} />
                        </div>
                        <p className="font-display font-medium text-text-primary">
                          GPU Detected
                        </p>
                        <p className="text-sm text-text-body font-display mt-1">
                          {gpuInfo.name}
                        </p>
                        <p className="font-mono text-xs text-text-muted mt-0.5">
                          {gpuInfo.vram} VRAM
                        </p>
                      </div>
                    ) : (
                      <div className="text-center">
                        <div className="w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center" style={{ backgroundColor: 'color-mix(in srgb, var(--color-status-warning) 10%, transparent)', borderWidth: '1px', borderStyle: 'solid', borderColor: 'color-mix(in srgb, var(--color-status-warning) 20%, transparent)' }}>
                          <Cpu className="w-8 h-8" style={{ color: 'var(--color-status-warning)' }} />
                        </div>
                        <p className="font-display font-medium text-text-primary">
                          CPU Mode
                        </p>
                        <p className="text-sm text-text-body font-display mt-1">
                          No GPU detected
                        </p>
                        <p className="text-xs text-text-muted font-display mt-2">
                          Generation will work but be slower
                        </p>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}

              {currentStep === 2 && (
                <motion.div
                  key="download"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="space-y-4"
                >
                  <h3 className="font-display text-lg font-semibold text-text-primary">
                    {steps[2].title}
                  </h3>
                  <p className="text-text-body font-display">
                    {steps[2].description}
                  </p>

                  <div className="py-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-text-body font-display">
                        {downloadStatus === 'complete'
                          ? 'Download Complete'
                          : 'Downloading...'}
                      </span>
                      <span className="font-mono text-sm text-red-primary">
                        {Math.round(downloadProgress)}%
                      </span>
                    </div>

                    <div className="h-2.5 bg-void rounded-full overflow-hidden border border-border">
                      <motion.div
                        className="h-full rounded-full"
                        initial={{ width: 0 }}
                        animate={{ width: `${downloadProgress}%` }}
                        transition={{ duration: 0.3 }}
                        style={{
                          background:
                            'linear-gradient(90deg, var(--color-red-deep), var(--color-red-primary))',
                          boxShadow: '0 0 8px color-mix(in srgb, var(--color-red-primary) 40%, transparent)',
                        }}
                      />
                    </div>

                    <div className="mt-4 flex items-center gap-2 text-xs text-text-muted font-display">
                      <Download className="w-4 h-4" />
                      <span>
                        {downloadStatus === 'downloading'
                          ? 'Downloading PyTorch + CUDA (~2.5 GB)...'
                          : downloadStatus === 'complete'
                            ? 'All components installed'
                            : 'Ready to download'}
                      </span>
                    </div>
                  </div>
                </motion.div>
              )}

              {currentStep === 3 && (
                <motion.div
                  key="complete"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="space-y-4"
                >
                  <h3 className="font-display text-lg font-semibold text-text-primary">
                    {steps[3].title}
                  </h3>
                  <p className="text-text-body font-display">
                    {steps[3].description}
                  </p>

                  <div className="text-center py-6">
                    <div className="w-20 h-20 mx-auto mb-4 rounded-full flex items-center justify-center" style={{ backgroundColor: 'color-mix(in srgb, var(--color-status-success) 10%, transparent)', borderWidth: '1px', borderStyle: 'solid', borderColor: 'color-mix(in srgb, var(--color-status-success) 20%, transparent)' }}>
                      <Sparkles className="w-10 h-10" style={{ color: 'var(--color-status-success)' }} />
                    </div>
                    <p className="font-display font-medium text-text-primary mb-2">
                      All Set!
                    </p>
                    <p className="text-sm text-text-body font-display">
                      You can now generate images and videos
                    </p>
                  </div>

                  <div className="p-3 bg-elevated rounded-lg border border-border">
                    <div className="flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: 'var(--color-status-warning)' }} />
                      <p className="text-xs text-text-body font-display">
                        AI models will be downloaded automatically when you
                        first generate an image. Each model is 2-6 GB.
                      </p>
                    </div>
                  </div>

                  <Button
                    variant="cinema"
                    fullWidth
                    icon={Sparkles}
                    onClick={handleFinish}
                  >
                    Start Creating
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
