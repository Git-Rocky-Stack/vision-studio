import { useState } from 'react';
import { readFileAsDataUrl } from '@/utils/readFileAsDataUrl';
import { cn } from '@/utils/cn';
import { Slider } from '@/components/ui/Slider';
import type { ControlNetConfig } from '@/types/generation';
import {
  Network,
  ChevronDown,
  Upload,
  X,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const PREPROCESSORS = [
  { id: 'canny', label: 'Canny Edge' },
  { id: 'depth', label: 'Depth Map' },
  { id: 'openpose', label: 'OpenPose' },
  { id: 'scribble', label: 'Scribble' },
  { id: 'segmentation', label: 'Segmentation' },
  { id: 'normal', label: 'Normal Map' },
];

interface ControlNetPanelProps {
  config: ControlNetConfig;
  onChange: (config: ControlNetConfig) => void;
}

export function ControlNetPanel({ config, onChange }: ControlNetPanelProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const update = (partial: Partial<ControlNetConfig>) => {
    onChange({ ...config, ...partial });
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    readFileAsDataUrl(file).then((dataUrl) => {
      update({ referenceImage: dataUrl });
    }).catch((err) => { console.error('Failed to read reference image:', err); });
  };

  return (
    <div className="rounded-md border border-border bg-elevated/50 overflow-hidden">
      {/* Toggle Header */}
      <div
        onPointerDown={() => setIsExpanded(!isExpanded)}
        role="button"
        tabIndex={0}
        aria-expanded={isExpanded}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setIsExpanded(!isExpanded);
          }
        }}
        className="flex items-center gap-2 w-full px-3 py-3 cursor-pointer group"
      >
        <Network className="w-3.5 h-3.5 text-text-muted transition-colors group-hover:text-text-body" />
        <span className="text-label text-text-primary">ControlNet</span>
        <div className="flex-1" />

        {/* Enable/Disable Toggle */}
        <button
          role="switch"
          aria-checked={config.enabled}
          aria-label="Enable ControlNet"
          onClick={(e) => {
            e.stopPropagation();
            update({ enabled: !config.enabled });
            if (!config.enabled) setIsExpanded(true);
          }}
          className={cn(
            'w-9 h-5 rounded-full transition-all relative flex-shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary focus-visible:ring-offset-2 focus-visible:ring-offset-void',
            config.enabled ? 'bg-accent-primary' : 'bg-surface border border-border'
          )}
        >
          <span
            className={cn(
              'absolute top-0.5 w-4 h-4 rounded-full bg-text-primary transition-all',
              config.enabled ? 'translate-x-4' : 'translate-x-0.5'
            )}
          />
        </button>

        <ChevronDown
          className={cn(
            'w-3.5 h-3.5 text-text-muted transition-transform',
            isExpanded && 'rotate-180'
          )}
        />
      </div>

      {/* Expanded Content */}
      <AnimatePresence>
        {isExpanded && config.enabled && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 space-y-3">
              {/* Preprocessor Dropdown */}
              <div>
                <label htmlFor="controlnet-preprocessor" className="text-label text-text-body mb-1.5 block">
                  Preprocessor
                </label>
                <select
                  id="controlnet-preprocessor"
                  value={config.preprocessor}
                  onChange={(e) => update({ preprocessor: e.target.value as ControlNetConfig['preprocessor'] })}
                  className="w-full bg-surface border border-border rounded-md px-3 py-2 text-sm text-text-primary focus:border-accent-primary focus:ring-1 focus:ring-accent-primary/40 transition-all"
                >
                  {PREPROCESSORS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Reference Image */}
              <div>
                <label className="text-label text-text-body mb-1.5 block">
                  Control Image
                </label>
                {config.referenceImage ? (
                  <div className="relative w-16 h-16 rounded-md overflow-hidden border border-border">
                    <img
                      src={config.referenceImage}
                      alt="ControlNet reference image"
                      className="w-full h-full object-cover"
                    />
                    <button
                      onClick={() => update({ referenceImage: undefined })}
                      aria-label="Remove control image"
                      className="absolute top-1 right-1 p-0.5 rounded bg-void/70 text-text-primary hover:bg-status-error transition-all"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ) : (
                  <label className="flex items-center gap-2 py-3 px-3 rounded-md border border-dashed border-border hover:border-border-hover cursor-pointer transition-all">
                    <Upload className="w-4 h-4 text-text-muted" />
                    <span className="text-sm text-text-body">
                      Upload control image
                    </span>
                    <input
                      type="file"
                      accept=".png,.jpg,.jpeg,.webp"
                      onChange={handleImageUpload}
                      className="hidden"
                    />
                  </label>
                )}
              </div>

              {/* Sliders */}
              <Slider
                label="Control Strength"
                value={config.strength}
                min={0}
                max={1.5}
                step={0.05}
                onChange={(v) => update({ strength: v })}
              />

              <Slider
                label="Start Step"
                value={config.startStep ?? 0}
                min={0}
                max={1}
                step={0.05}
                onChange={(v) => update({ startStep: v })}
              />

              <Slider
                label="End Step"
                value={config.endStep ?? 1}
                min={0}
                max={1}
                step={0.05}
                onChange={(v) => update({ endStep: v })}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
