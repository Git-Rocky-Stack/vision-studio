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
  Zap
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
    description: 'Let\'s get you set up for AI image and video generation'
  },
  {
    id: 'gpu',
    title: 'GPU Detection',
    description: 'Checking your system capabilities'
  },
  {
    id: 'download',
    title: 'Download AI Backend',
    description: 'Downloading PyTorch and dependencies'
  },
  {
    id: 'complete',
    title: 'Setup Complete',
    description: 'You\'re ready to create!'
  }
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
  const [downloadStatus, setDownloadStatus] = useState<'idle' | 'downloading' | 'complete' | 'error'>('idle');
  const [error, setError] = useState('');

  useEffect(() => {
    if (currentStep === 1) {
      // Check GPU
      checkGPU();
    } else if (currentStep === 2) {
      // Start download
      startDownload();
    }
  }, [currentStep]);

  const checkGPU = async () => {
    try {
      const info = await window.electron.system.getInfo();
      setGpuInfo({
        available: info.gpu_available,
        name: info.gpu_name,
        vram: info.gpu_vram
      });
    } catch (e) {
      setGpuInfo({ available: false });
    }
    
    // Auto-advance after showing info
    setTimeout(() => setCurrentStep(2), 2000);
  };

  const startDownload = async () => {
    setDownloadStatus('downloading');
    
    // Simulate download progress (in real app, this would track actual download)
    const interval = setInterval(() => {
      setDownloadProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval);
          setDownloadStatus('complete');
          setTimeout(() => setCurrentStep(3), 1000);
          return 100;
        }
        return prev + Math.random() * 3;
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
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          className="w-full max-w-lg bg-charcoal border border-border rounded-2xl shadow-2xl overflow-hidden"
        >
          {/* Header */}
          <div className="p-6 border-b border-border">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red to-red-hover flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">Vision Studio</h2>
                <p className="text-sm text-silver">Setup Wizard</p>
              </div>
            </div>
            
            {/* Progress Bar */}
            <div className="flex gap-1">
              {steps.map((_, index) => (
                <div
                  key={index}
                  className={cn(
                    'h-1 flex-1 rounded-full transition-all duration-500',
                    index <= currentStep ? 'bg-red' : 'bg-charcoal-lighter'
                  )}
                />
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
                  <h3 className="text-lg font-semibold text-white">{steps[0].title}</h3>
                  <p className="text-silver">{steps[0].description}</p>
                  
                  <div className="p-4 bg-charcoal-lighter rounded-lg border border-border space-y-3">
                    <div className="flex items-center gap-3">
                      <Monitor className="w-5 h-5 text-red" />
                      <div>
                        <p className="text-sm font-medium text-white">AI-Powered Generation</p>
                        <p className="text-xs text-silver">Create stunning images and videos</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <HardDrive className="w-5 h-5 text-red" />
                      <div>
                        <p className="text-sm font-medium text-white">Local Processing</p>
                        <p className="text-xs text-silver">Your data stays on your machine</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Zap className="w-5 h-5 text-red" />
                      <div>
                        <p className="text-sm font-medium text-white">GPU Accelerated</p>
                        <p className="text-xs text-silver">Faster generation with NVIDIA GPU</p>
                      </div>
                    </div>
                  </div>

                  <Button 
                    fullWidth 
                    icon={ArrowRight}
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
                  <h3 className="text-lg font-semibold text-white">{steps[1].title}</h3>
                  <p className="text-silver">{steps[1].description}</p>
                  
                  <div className="flex items-center justify-center py-8">
                    {gpuInfo === null ? (
                      <Loader2 className="w-8 h-8 text-red animate-spin" />
                    ) : gpuInfo.available ? (
                      <div className="text-center">
                        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-500/10 flex items-center justify-center">
                          <Check className="w-8 h-8 text-green-500" />
                        </div>
                        <p className="text-white font-medium">GPU Detected</p>
                        <p className="text-sm text-silver">{gpuInfo.name}</p>
                        <p className="text-xs text-silver/60">{gpuInfo.vram} VRAM</p>
                      </div>
                    ) : (
                      <div className="text-center">
                        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-yellow-500/10 flex items-center justify-center">
                          <Cpu className="w-8 h-8 text-yellow-500" />
                        </div>
                        <p className="text-white font-medium">CPU Mode</p>
                        <p className="text-sm text-silver">No GPU detected</p>
                        <p className="text-xs text-silver/60 mt-2">
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
                  <h3 className="text-lg font-semibold text-white">{steps[2].title}</h3>
                  <p className="text-silver">{steps[2].description}</p>
                  
                  <div className="py-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-silver">
                        {downloadStatus === 'complete' ? 'Download Complete' : 'Downloading...'}
                      </span>
                      <span className="text-sm font-mono text-red">
                        {Math.round(downloadProgress)}%
                      </span>
                    </div>
                    
                    <div className="h-3 bg-charcoal-lighter rounded-full overflow-hidden">
                      <motion.div
                        className="h-full bg-red"
                        initial={{ width: 0 }}
                        animate={{ width: `${downloadProgress}%` }}
                        transition={{ duration: 0.3 }}
                      />
                    </div>
                    
                    <div className="mt-4 flex items-center gap-2 text-xs text-silver">
                      <Download className="w-4 h-4" />
                      <span>
                        {downloadStatus === 'downloading' 
                          ? 'Downloading PyTorch + CUDA (~2.5 GB)...'
                          : downloadStatus === 'complete'
                          ? 'All components installed'
                          : 'Ready to download'
                        }
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
                  <h3 className="text-lg font-semibold text-white">{steps[3].title}</h3>
                  <p className="text-silver">{steps[3].description}</p>
                  
                  <div className="text-center py-6">
                    <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-green-500/10 flex items-center justify-center">
                      <Sparkles className="w-10 h-10 text-green-500" />
                    </div>
                    <p className="text-white font-medium mb-2">All Set!</p>
                    <p className="text-sm text-silver">
                      You can now generate images and videos
                    </p>
                  </div>

                  <div className="p-3 bg-charcoal-lighter rounded-lg border border-border">
                    <div className="flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 text-yellow-500 flex-shrink-0 mt-0.5" />
                      <p className="text-xs text-silver">
                        AI models will be downloaded automatically when you first generate an image. 
                        Each model is 2-6 GB.
                      </p>
                    </div>
                  </div>

                  <Button 
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
