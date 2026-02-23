import { useState } from 'react';
import { cn } from '@/utils/cn';
import { Button } from '@/components/ui/Button';
import { 
  Settings, 
  Folder, 
  Cpu, 
  Palette, 
  Bell, 
  Shield,
  ChevronRight,
  Check,
  AlertCircle,
  RefreshCw,
  HardDrive,
  Monitor
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

type SettingsTab = 'general' | 'ai' | 'appearance' | 'notifications';

interface SettingsSection {
  id: SettingsTab;
  label: string;
  icon: React.ElementType;
}

const sections: SettingsSection[] = [
  { id: 'general', label: 'General', icon: Settings },
  { id: 'ai', label: 'AI & Models', icon: Cpu },
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'notifications', label: 'Notifications', icon: Bell },
];

export function SettingsPanel() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const [outputPath, setOutputPath] = useState('C:/Users/VisionStudio/Outputs');
  const [autoSave, setAutoSave] = useState(true);
  const [gpuAcceleration, setGpuAcceleration] = useState(true);
  const [theme, setTheme] = useState<'dark' | 'light' | 'system'>('dark');

  return (
    <div className="h-full flex">
      {/* Sidebar */}
      <div className="w-56 border-r border-border bg-charcoal-light p-3">
        <nav className="space-y-1">
          {sections.map((section) => {
            const Icon = section.icon;
            return (
              <button
                key={section.id}
                onClick={() => setActiveTab(section.id)}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-left',
                  activeTab === section.id
                    ? 'bg-red/10 text-red border border-red/30'
                    : 'text-silver hover:text-white hover:bg-charcoal-lighter'
                )}
              >
                <Icon className="w-4 h-4" />
                <span className="text-sm font-medium">{section.label}</span>
                {activeTab === section.id && (
                  <ChevronRight className="w-4 h-4 ml-auto" />
                )}
              </button>
            );
          })}
        </nav>

        {/* Version Info */}
        <div className="absolute bottom-4 left-4">
          <p className="text-xs text-silver/60">Vision Studio v0.1.0</p>
          <p className="text-xs text-silver/40">Beta Release</p>
        </div>
      </div>

      {/* Content */}
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
                  <h2 className="text-xl font-semibold text-white mb-1">General Settings</h2>
                  <p className="text-sm text-silver">Manage your project and output preferences</p>
                </div>

                {/* Output Path */}
                <div className="space-y-3">
                  <label className="text-sm font-medium text-light-grey flex items-center gap-2">
                    <Folder className="w-4 h-4" />
                    Default Output Location
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={outputPath}
                      readOnly
                      className="flex-1 bg-charcoal border border-border rounded-lg px-3 py-2 text-sm text-white"
                    />
                    <Button variant="secondary" size="sm">
                      Browse
                    </Button>
                  </div>
                </div>

                {/* Auto Save */}
                <div className="flex items-center justify-between py-3 border-b border-border">
                  <div>
                    <h3 className="text-sm font-medium text-white">Auto Save</h3>
                    <p className="text-xs text-silver mt-0.5">Automatically save projects every 5 minutes</p>
                  </div>
                  <button
                    onClick={() => setAutoSave(!autoSave)}
                    className={cn(
                      'w-11 h-6 rounded-full transition-all relative',
                      autoSave ? 'bg-red' : 'bg-charcoal-lighter border border-border'
                    )}
                  >
                    <span className={cn(
                      'absolute top-1 w-4 h-4 rounded-full bg-white transition-all',
                      autoSave ? 'left-6' : 'left-1'
                    )} />
                  </button>
                </div>

                {/* Storage */}
                <div className="space-y-3">
                  <h3 className="text-sm font-medium text-light-grey flex items-center gap-2">
                    <HardDrive className="w-4 h-4" />
                    Storage Usage
                  </h3>
                  <div className="bg-charcoal-lighter rounded-lg p-4 border border-border">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-white">Generated Assets</span>
                      <span className="text-sm text-silver">4.2 GB used</span>
                    </div>
                    <div className="h-2 bg-charcoal rounded-full overflow-hidden">
                      <div className="h-full w-[35%] bg-gradient-to-r from-red to-red-hover rounded-full" />
                    </div>
                    <p className="text-xs text-silver mt-2">
                      35% of 12 GB cache limit used
                    </p>
                    <Button variant="ghost" size="sm" className="mt-3" icon={RefreshCw}>
                      Clear Cache
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'ai' && (
              <div className="space-y-8">
                <div>
                  <h2 className="text-xl font-semibold text-white mb-1">AI & Models</h2>
                  <p className="text-sm text-silver">Configure AI generation settings and hardware</p>
                </div>

                {/* GPU Acceleration */}
                <div className="flex items-center justify-between py-3 border-b border-border">
                  <div>
                    <h3 className="text-sm font-medium text-white flex items-center gap-2">
                      <Monitor className="w-4 h-4" />
                      GPU Acceleration
                    </h3>
                    <p className="text-xs text-silver mt-0.5">Use GPU for faster generation (recommended)</p>
                  </div>
                  <button
                    onClick={() => setGpuAcceleration(!gpuAcceleration)}
                    className={cn(
                      'w-11 h-6 rounded-full transition-all relative',
                      gpuAcceleration ? 'bg-red' : 'bg-charcoal-lighter border border-border'
                    )}
                  >
                    <span className={cn(
                      'absolute top-1 w-4 h-4 rounded-full bg-white transition-all',
                      gpuAcceleration ? 'left-6' : 'left-1'
                    )} />
                  </button>
                </div>

                {/* GPU Info */}
                <div className="bg-charcoal-lighter rounded-lg p-4 border border-border">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center">
                      <Check className="w-5 h-5 text-green-500" />
                    </div>
                    <div>
                      <h4 className="text-sm font-medium text-white">NVIDIA RTX 4090 Detected</h4>
                      <p className="text-xs text-silver">24GB VRAM • CUDA 12.1</p>
                    </div>
                  </div>
                </div>

                {/* Models */}
                <div className="space-y-4">
                  <h3 className="text-sm font-medium text-light-grey">Installed Models</h3>
                  
                  {[
                    { name: 'FLUX.1 [dev]', size: '23.8 GB', status: 'ready' },
                    { name: 'FLUX.1 [schnell]', size: '23.8 GB', status: 'ready' },
                    { name: 'Stable Diffusion XL', size: '6.9 GB', status: 'ready' },
                    { name: 'LTX Video', size: '9.4 GB', status: 'ready' },
                  ].map((model) => (
                    <div key={model.name} className="flex items-center justify-between py-3 border-b border-border/50">
                      <div>
                        <h4 className="text-sm text-white">{model.name}</h4>
                        <p className="text-xs text-silver">{model.size}</p>
                      </div>
                      <span className="text-xs text-green-500 flex items-center gap-1">
                        <Check className="w-3 h-3" />
                        Ready
                      </span>
                    </div>
                  ))}
                </div>

                <Button variant="secondary" fullWidth>
                  Download More Models
                </Button>
              </div>
            )}

            {activeTab === 'appearance' && (
              <div className="space-y-8">
                <div>
                  <h2 className="text-xl font-semibold text-white mb-1">Appearance</h2>
                  <p className="text-sm text-silver">Customize the look and feel of the app</p>
                </div>

                {/* Theme */}
                <div className="space-y-3">
                  <label className="text-sm font-medium text-light-grey">Theme</label>
                  <div className="grid grid-cols-3 gap-3">
                    {(['dark', 'light', 'system'] as const).map((t) => (
                      <button
                        key={t}
                        onClick={() => setTheme(t)}
                        className={cn(
                          'p-4 rounded-lg border transition-all text-center capitalize',
                          theme === t
                            ? 'border-red bg-red/10'
                            : 'border-border bg-charcoal-lighter hover:border-border-hover'
                        )}
                      >
                        <div className={cn(
                          'w-8 h-8 mx-auto rounded-full mb-2',
                          t === 'dark' && 'bg-black border border-border',
                          t === 'light' && 'bg-white border border-gray-200',
                          t === 'system' && 'bg-gradient-to-br from-black to-white border border-gray-300'
                        )} />
                        <span className={cn(
                          'text-sm',
                          theme === t ? 'text-red' : 'text-silver'
                        )}>
                          {t}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Accent Color */}
                <div className="space-y-3">
                  <label className="text-sm font-medium text-light-grey">Accent Color</label>
                  <div className="flex gap-3">
                    {['#dc2626', '#7c3aed', '#2563eb', '#059669', '#ea580c'].map((color) => (
                      <button
                        key={color}
                        className={cn(
                          'w-10 h-10 rounded-lg transition-all',
                          color === '#dc2626' && 'ring-2 ring-white ring-offset-2 ring-offset-black'
                        )}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'notifications' && (
              <div className="space-y-8">
                <div>
                  <h2 className="text-xl font-semibold text-white mb-1">Notifications</h2>
                  <p className="text-sm text-silver">Manage notification preferences</p>
                </div>

                {[
                  { label: 'Generation Complete', description: 'Get notified when generation finishes', default: true },
                  { label: 'Generation Failed', description: 'Get notified when generation fails', default: true },
                  { label: 'Project Updates', description: 'Updates about your projects', default: false },
                  { label: 'New Features', description: 'Learn about new features and updates', default: true },
                ].map((item) => (
                  <div key={item.label} className="flex items-center justify-between py-3 border-b border-border">
                    <div>
                      <h3 className="text-sm font-medium text-white">{item.label}</h3>
                      <p className="text-xs text-silver mt-0.5">{item.description}</p>
                    </div>
                    <button
                      className={cn(
                        'w-11 h-6 rounded-full transition-all relative',
                        item.default ? 'bg-red' : 'bg-charcoal-lighter border border-border'
                      )}
                    >
                      <span className={cn(
                        'absolute top-1 w-4 h-4 rounded-full bg-white transition-all',
                        item.default ? 'left-6' : 'left-1'
                      )} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
