import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties, ElementType, ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Check,
  ChevronDown,
  Cloud,
  Cpu,
  Gauge,
  HardDrive,
  Image as ImageIcon,
  MonitorCog,
  Sparkles,
  Video,
  Zap,
} from 'lucide-react';

import { cn } from '@/utils/cn';

interface ModelOption {
  id: string;
  name: string;
  capability: 'image' | 'video' | 'edit' | 'inpaint';
  runtime: 'local' | 'comfyui' | 'cloud' | 'byom';
  availability: 'ready' | 'install-required' | 'login-required' | 'import-required';
  hardware: 'laptop' | 'creator' | 'workstation' | 'unknown';
  quality: 'draft' | 'balanced' | 'pro' | 'experimental' | 'local';
  vram: string;
  description: string;
  type: 'image' | 'video';
}

const IMAGE_MODELS: ModelOption[] = [
  {
    id: 'flux-dev',
    name: 'FLUX.1 [dev]',
    capability: 'image',
    runtime: 'byom',
    availability: 'import-required',
    hardware: 'workstation',
    quality: 'pro',
    vram: '23.8 GB',
    description: 'High-fidelity image generation with strong prompt adherence.',
    type: 'image',
  },
  {
    id: 'sd3.5-large',
    name: 'Stable Diffusion 3.5 Large',
    capability: 'image',
    runtime: 'local',
    availability: 'install-required',
    hardware: 'workstation',
    quality: 'pro',
    vram: '~12 GB',
    description: 'Modern composition and typography when local hardware can support it.',
    type: 'image',
  },
  {
    id: 'flux-fill',
    name: 'FLUX.1 Fill [dev]',
    capability: 'inpaint',
    runtime: 'byom',
    availability: 'import-required',
    hardware: 'workstation',
    quality: 'pro',
    vram: '23.8 GB',
    description: 'Inpainting and outpainting for precise region work.',
    type: 'image',
  },
  {
    id: 'sd3.5-medium',
    name: 'Stable Diffusion 3.5 Medium',
    capability: 'image',
    runtime: 'local',
    availability: 'install-required',
    hardware: 'creator',
    quality: 'balanced',
    vram: '~6 GB',
    description: 'Balanced quality and footprint for creator laptops.',
    type: 'image',
  },
  {
    id: 'flux-schnell',
    name: 'FLUX.1 [schnell]',
    capability: 'image',
    runtime: 'byom',
    availability: 'import-required',
    hardware: 'workstation',
    quality: 'draft',
    vram: '23.8 GB',
    description: 'Fast iteration model for prompt exploration.',
    type: 'image',
  },
  {
    id: 'sd-1-5',
    name: 'Stable Diffusion 1.5',
    capability: 'image',
    runtime: 'local',
    availability: 'install-required',
    hardware: 'laptop',
    quality: 'local',
    vram: '4.0 GB',
    description: 'Lightweight local baseline with broad LoRA and ControlNet support.',
    type: 'image',
  },
];

const VIDEO_MODELS: ModelOption[] = [
  {
    id: 'ltx-video',
    name: 'LTX Video',
    capability: 'video',
    runtime: 'local',
    availability: 'install-required',
    hardware: 'creator',
    quality: 'pro',
    vram: '9.4 GB',
    description: 'High quality video generation with temporal coherence.',
    type: 'video',
  },
  {
    id: 'animatediff',
    name: 'AnimateDiff',
    capability: 'video',
    runtime: 'local',
    availability: 'install-required',
    hardware: 'creator',
    quality: 'balanced',
    vram: '8.0 GB',
    description: 'Animate images into short clips with motion control.',
    type: 'video',
  },
  {
    id: 'svd',
    name: 'Stable Video Diffusion',
    capability: 'video',
    runtime: 'local',
    availability: 'install-required',
    hardware: 'creator',
    quality: 'balanced',
    vram: '8.0 GB',
    description: 'Image-to-video with camera motion. Requires a reference image.',
    type: 'video',
  },
];

const capabilityMeta: Record<
  ModelOption['capability'],
  { label: string; icon: ElementType; className: string }
> = {
  image: { label: 'Image', icon: ImageIcon, className: 'text-capability-image bg-capability-image/10 border-capability-image/20' },
  video: { label: 'Video', icon: Video, className: 'text-capability-video bg-capability-video/10 border-capability-video/20' },
  edit: { label: 'Edit', icon: Sparkles, className: 'text-capability-edit bg-capability-edit/10 border-capability-edit/20' },
  inpaint: { label: 'Inpaint', icon: Sparkles, className: 'text-capability-edit bg-capability-edit/10 border-capability-edit/20' },
};

const runtimeMeta: Record<
  ModelOption['runtime'],
  { label: string; icon: ElementType; className: string }
> = {
  local: { label: 'Local', icon: HardDrive, className: 'text-capability-local bg-capability-local/10 border-capability-local/20' },
  comfyui: { label: 'ComfyUI', icon: MonitorCog, className: 'text-capability-cloud bg-capability-cloud/10 border-capability-cloud/20' },
  cloud: { label: 'Cloud', icon: Cloud, className: 'text-capability-cloud bg-capability-cloud/10 border-capability-cloud/20' },
  byom: { label: 'BYOM', icon: Cpu, className: 'text-accent-primary bg-accent-primary-muted border-accent-primary-border' },
};

const availabilityLabel: Record<ModelOption['availability'], string> = {
  ready: 'Ready',
  'install-required': 'Install required',
  'login-required': 'Login required',
  'import-required': 'Import required',
};

const hardwareLabel: Record<ModelOption['hardware'], string> = {
  laptop: 'Laptop fit',
  creator: 'Creator laptop',
  workstation: 'Workstation',
  unknown: 'Hardware unknown',
};

const qualityLabel: Record<ModelOption['quality'], string> = {
  draft: 'Draft',
  balanced: 'Balanced',
  pro: 'Pro',
  experimental: 'Experimental',
  local: 'Local',
};

function Badge({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 font-display text-micro font-medium', className)}>
      {children}
    </span>
  );
}

interface ModelSelectorProps {
  value: string;
  onChange: (modelId: string) => void;
  generationType: 'image' | 'video';
}

export function ModelSelector({ value, onChange, generationType }: ModelSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [dropdownStyle, setDropdownStyle] = useState<CSSProperties>({});
  const containerRef = useRef<HTMLDivElement>(null);

  const models = generationType === 'image' ? IMAGE_MODELS : VIDEO_MODELS;
  const selected = models.find((m) => m.id === value) || models[0];
  const selectedCapability = capabilityMeta[selected.capability];
  const selectedRuntime = runtimeMeta[selected.runtime];
  const SelectedCapabilityIcon = selectedCapability.icon;
  const SelectedRuntimeIcon = selectedRuntime.icon;

  const positionDropdown = useCallback(() => {
    const trigger = containerRef.current;
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    const viewportPadding = 16;
    const gap = 6;
    const availableBelow = window.innerHeight - rect.bottom - viewportPadding;
    const availableAbove = rect.top - viewportPadding;
    const openUp = availableBelow < 280 && availableAbove > availableBelow;
    const availableSpace = openUp ? availableAbove : availableBelow;

    setDropdownStyle({
      left: rect.left,
      top: openUp ? undefined : rect.bottom + gap,
      bottom: openUp ? window.innerHeight - rect.top + gap : undefined,
      width: rect.width,
      maxHeight: Math.max(220, Math.min(384, availableSpace - gap)),
    });
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    positionDropdown();
    document.addEventListener('mousedown', handleClick);
    window.addEventListener('resize', positionDropdown);
    window.addEventListener('scroll', positionDropdown, true);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      window.removeEventListener('resize', positionDropdown);
      window.removeEventListener('scroll', positionDropdown, true);
    };
  }, [isOpen, positionDropdown]);

  const handleSelect = (modelId: string) => {
    onChange(modelId);
    setIsOpen(false);
  };

  const toggleOpen = () => {
    if (!isOpen) {
      positionDropdown();
    }
    setIsOpen((open) => !open);
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        data-testid="model-selector-trigger"
        onClick={toggleOpen}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        className={cn(
          'w-full flex items-start gap-3 px-3 py-3 rounded-md border transition-all text-left bg-panel-raised',
          isOpen
            ? 'border-accent-primary-border shadow-accent-subtle'
            : 'border-border hover:border-border-hover'
        )}
      >
        <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md border border-border bg-canvas">
          <Gauge className="h-4 w-4 text-accent-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-display text-sm font-semibold text-text-primary truncate">
              {selected.name}
            </span>
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <Badge className={selectedCapability.className}>
              <SelectedCapabilityIcon className="h-2.5 w-2.5" />
              {selectedCapability.label}
            </Badge>
            <Badge className={selectedRuntime.className}>
              <SelectedRuntimeIcon className="h-2.5 w-2.5" />
              {selectedRuntime.label}
            </Badge>
          </div>
          <p className="mt-1.5 font-mono text-micro text-text-muted">
            {availabilityLabel[selected.availability]} / {hardwareLabel[selected.hardware]} / {selected.vram}
          </p>
        </div>
        <ChevronDown
          className={cn(
            'mt-1 h-4 w-4 flex-shrink-0 text-text-muted transition-transform',
            isOpen && 'rotate-180'
          )}
        />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className="fixed z-[9999] overflow-hidden rounded-md border border-border bg-elevated shadow-cinematic"
            style={dropdownStyle}
          >
            <div className="overflow-y-auto p-2" style={{ maxHeight: dropdownStyle.maxHeight }} role="listbox" aria-label="Select model">
              <div className="flex items-center justify-between px-2.5 py-1.5" role="presentation">
                <p className="font-mono text-micro uppercase text-text-muted">
                  {generationType === 'image' ? 'Image routing' : 'Video routing'}
                </p>
                <p className="font-mono text-micro text-text-muted">
                  {models.length} profiles
                </p>
              </div>

              {models.map((model) => {
                const modelCapability = capabilityMeta[model.capability];
                const modelRuntime = runtimeMeta[model.runtime];
                const CapabilityIcon = modelCapability.icon;
                const RuntimeIcon = modelRuntime.icon;
                const isSelected = model.id === value;

                return (
                  <button
                    key={model.id}
                    onClick={() => handleSelect(model.id)}
                    role="option"
                    aria-selected={isSelected}
                    className={cn(
                      'w-full flex items-start gap-3 rounded-md border px-2.5 py-3 text-left transition-all',
                      isSelected
                        ? 'border-accent-primary-border bg-accent-primary-muted'
                        : 'border-transparent hover:border-border hover:bg-surface'
                    )}
                  >
                    <div className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md border border-border bg-canvas">
                      {model.type === 'video' ? (
                        <Video className="h-3.5 w-3.5 text-capability-video" />
                      ) : (
                        <ImageIcon className="h-3.5 w-3.5 text-capability-image" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-display text-sm font-medium text-text-primary">
                          {model.name}
                        </span>
                        {isSelected && <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-accent-primary" />}
                      </div>
                      <p className="mt-1 line-clamp-2 text-xs text-text-body">
                        {model.description}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <Badge className={modelCapability.className}>
                          <CapabilityIcon className="h-2.5 w-2.5" />
                          {modelCapability.label}
                        </Badge>
                        <Badge className={modelRuntime.className}>
                          <RuntimeIcon className="h-2.5 w-2.5" />
                          {modelRuntime.label}
                        </Badge>
                        <Badge className="border-border bg-canvas text-text-muted">
                          <Zap className="h-2.5 w-2.5" />
                          {qualityLabel[model.quality]}
                        </Badge>
                        <Badge className="border-border bg-canvas text-text-muted">
                          {hardwareLabel[model.hardware]}
                        </Badge>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
