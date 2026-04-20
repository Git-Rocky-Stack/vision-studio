import { memo, useState } from 'react';
import { cn } from '@/utils/cn';
import { Slider } from '@/components/ui/Slider';
import { Switch } from '@/components/ui/Switch';
import { ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { PipelineStep } from '@/types/pipeline';
import {
  Maximize2,
  Eraser,
  Zap,
  Sparkles,
  Palette,
  ImageOff,
  Brush,
  Droplets,
  Crop,
  Settings2,
} from 'lucide-react';

const TYPE_ICONS: Record<string, React.ElementType> = {
  upscale: Maximize2,
  denoise: Eraser,
  sharpen: Zap,
  'face-restore': Sparkles,
  'color-correct': Palette,
  'background-remove': ImageOff,
  'style-transfer': Brush,
  blur: Droplets,
  'crop-resize': Crop,
  custom: Settings2,
};

interface PipelineNodeConfigProps {
  step: PipelineStep;
  onUpdate: (params: Record<string, unknown>) => void;
  className?: string;
}

function SelectInput({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="text-label text-text-body mb-1 block">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-border bg-canvas px-2 py-1.5 text-sm text-text-body focus:outline-none focus:border-accent-primary-border"
      >
        {options.map((opt) => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
      </select>
    </div>
  );
}

export const PipelineNodeConfig = memo(function PipelineNodeConfig({
  step,
  onUpdate,
  className,
}: PipelineNodeConfigProps) {
  const [isOpen, setIsOpen] = useState(true);
  const Icon = TYPE_ICONS[step.type] ?? Settings2;
  const p = step.params;

  function setParam(key: string, value: unknown) {
    onUpdate({ ...p, [key]: value });
  }

  return (
    <div className={cn('rounded-lg border border-border bg-elevated/50 overflow-hidden', className)}>
      <div
        role="button"
        tabIndex={0}
        aria-expanded={isOpen}
        onClick={() => setIsOpen(!isOpen)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setIsOpen(!isOpen);
          }
        }}
        className="flex items-center gap-2 w-full px-3 py-3 cursor-pointer"
      >
        <Icon className="w-3.5 h-3.5 text-red-primary" />
        <span className="text-label text-text-primary flex-1">{step.label} Settings</span>
        <ChevronDown
          className={cn(
            'w-3.5 h-3.5 text-text-muted transition-transform',
            isOpen && 'rotate-180'
          )}
        />
      </div>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 space-y-3">
              {/* Upscale */}
              {step.type === 'upscale' && (
                <>
                  <SelectInput
                    label="Scale"
                    value={String(p.scale ?? 4)}
                    options={['2', '4']}
                    onChange={(v) => setParam('scale', Number(v))}
                  />
                  <SelectInput
                    label="Model"
                    value={String(p.model ?? 'Real-ESRGAN')}
                    options={['Real-ESRGAN', 'SwinIR', 'Lanczos']}
                    onChange={(v) => setParam('model', v)}
                  />
                </>
              )}

              {/* Denoise */}
              {step.type === 'denoise' && (
                <Slider
                  label="Strength"
                  value={Number(p.strength ?? 0.5)}
                  min={0}
                  max={1}
                  step={0.05}
                  onChange={(v) => setParam('strength', v)}
                />
              )}

              {/* Sharpen */}
              {step.type === 'sharpen' && (
                <>
                  <Slider
                    label="Amount"
                    value={Number(p.amount ?? 0.5)}
                    min={0}
                    max={1}
                    step={0.05}
                    onChange={(v) => setParam('amount', v)}
                  />
                  <Slider
                    label="Radius"
                    value={Number(p.radius ?? 1)}
                    min={0.5}
                    max={5}
                    step={0.5}
                    onChange={(v) => setParam('radius', v)}
                  />
                </>
              )}

              {/* Face Restore */}
              {step.type === 'face-restore' && (
                <>
                  <SelectInput
                    label="Model"
                    value={String(p.model ?? 'GFPGAN')}
                    options={['GFPGAN', 'CodeFormer']}
                    onChange={(v) => setParam('model', v)}
                  />
                  <Slider
                    label="Strength"
                    value={Number(p.strength ?? 0.8)}
                    min={0}
                    max={1}
                    step={0.05}
                    onChange={(v) => setParam('strength', v)}
                  />
                </>
              )}

              {/* Color Correct */}
              {step.type === 'color-correct' && (
                <>
                  <Slider
                    label="Brightness"
                    value={Number(p.brightness ?? 0)}
                    min={-100}
                    max={100}
                    step={1}
                    onChange={(v) => setParam('brightness', v)}
                  />
                  <Slider
                    label="Contrast"
                    value={Number(p.contrast ?? 0)}
                    min={-100}
                    max={100}
                    step={1}
                    onChange={(v) => setParam('contrast', v)}
                  />
                  <Slider
                    label="Saturation"
                    value={Number(p.saturation ?? 0)}
                    min={-100}
                    max={100}
                    step={1}
                    onChange={(v) => setParam('saturation', v)}
                  />
                  <Slider
                    label="Temperature"
                    value={Number(p.temperature ?? 0)}
                    min={-100}
                    max={100}
                    step={1}
                    onChange={(v) => setParam('temperature', v)}
                  />
                </>
              )}

              {/* Background Remove */}
              {step.type === 'background-remove' && (
                <SelectInput
                  label="Model"
                  value={String(p.model ?? 'RMBG')}
                  options={['RMBG', 'SAM']}
                  onChange={(v) => setParam('model', v)}
                />
              )}

              {/* Style Transfer */}
              {step.type === 'style-transfer' && (
                <>
                  <Slider
                    label="Strength"
                    value={Number(p.strength ?? 0.8)}
                    min={0}
                    max={1}
                    step={0.05}
                    onChange={(v) => setParam('strength', v)}
                  />
                  <div>
                    <label className="text-label text-text-body mb-1 block">Reference Image</label>
                    <input
                      type="text"
                      value={String(p.referencePath ?? '')}
                      onChange={(e) => setParam('referencePath', e.target.value)}
                      placeholder="Path or URL..."
                      className="w-full rounded-md border border-border bg-canvas px-2 py-1.5 text-sm text-text-body placeholder:text-text-muted focus:outline-none focus:border-accent-primary-border"
                    />
                  </div>
                </>
              )}

              {/* Blur */}
              {step.type === 'blur' && (
                <>
                  <SelectInput
                    label="Type"
                    value={String(p.blurType ?? 'gaussian')}
                    options={['gaussian', 'box', 'motion']}
                    onChange={(v) => setParam('blurType', v)}
                  />
                  <Slider
                    label="Radius"
                    value={Number(p.radius ?? 5)}
                    min={0}
                    max={20}
                    step={1}
                    onChange={(v) => setParam('radius', v)}
                  />
                </>
              )}

              {/* Crop/Resize */}
              {step.type === 'crop-resize' && (
                <>
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <label className="text-label text-text-body mb-1 block">Width</label>
                      <input
                        type="number"
                        value={Number(p.width ?? 1024)}
                        onChange={(e) => setParam('width', Number(e.target.value))}
                        min={64}
                        max={4096}
                        className="w-full rounded-md border border-border bg-canvas px-2 py-1.5 text-sm text-text-body focus:outline-none focus:border-accent-primary-border"
                      />
                    </div>
                    <div className="flex-1">
                      <label className="text-label text-text-body mb-1 block">Height</label>
                      <input
                        type="number"
                        value={Number(p.height ?? 1024)}
                        onChange={(e) => setParam('height', Number(e.target.value))}
                        min={64}
                        max={4096}
                        className="w-full rounded-md border border-border bg-canvas px-2 py-1.5 text-sm text-text-body focus:outline-none focus:border-accent-primary-border"
                      />
                    </div>
                  </div>
                  <SelectInput
                    label="Anchor"
                    value={String(p.anchor ?? 'center')}
                    options={['center', 'top-left', 'top-right', 'bottom-left', 'bottom-right']}
                    onChange={(v) => setParam('anchor', v)}
                  />
                </>
              )}

              {/* Custom */}
              {step.type === 'custom' && (
                <div>
                  <label className="text-label text-text-body mb-1 block">Endpoint URL</label>
                  <input
                    type="text"
                    value={String(p.endpoint ?? '')}
                    onChange={(e) => setParam('endpoint', e.target.value)}
                    placeholder="https://..."
                    className="w-full rounded-md border border-border bg-canvas px-2 py-1.5 text-sm text-text-body placeholder:text-text-muted focus:outline-none focus:border-accent-primary-border"
                  />
                </div>
              )}

              {/* Enable toggle at bottom */}
              <div className="flex items-center justify-between pt-1 border-t border-border">
                <span className="text-label text-text-body">Enabled</span>
                <Switch
                  checked={step.enabled}
                  onChange={() => {
                    onUpdate({ ...p, _enabled: !step.enabled });
                  }}
                  label={`Toggle ${step.label}`}
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});
