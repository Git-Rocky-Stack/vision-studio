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
import { useAppStore } from '@/store/appStore';
import { selectModelsByCapability } from '@/store/slices/modelsSlice';
import type { ModelRecord } from '@/types/model';

const capabilityMeta: Record<
  ModelRecord['capability'],
  { label: string; icon: ElementType; className: string }
> = {
  image: { label: 'Image', icon: ImageIcon, className: 'text-capability-image bg-capability-image/10 border-capability-image/20' },
  video: { label: 'Video', icon: Video, className: 'text-capability-video bg-capability-video/10 border-capability-video/20' },
  edit: { label: 'Edit', icon: Sparkles, className: 'text-capability-edit bg-capability-edit/10 border-capability-edit/20' },
  inpaint: { label: 'Inpaint', icon: Sparkles, className: 'text-capability-edit bg-capability-edit/10 border-capability-edit/20' },
};

const runtimeMeta: Record<
  ModelRecord['runtime'],
  { label: string; icon: ElementType; className: string }
> = {
  local: { label: 'Local', icon: HardDrive, className: 'text-capability-local bg-capability-local/10 border-capability-local/20' },
  comfyui: { label: 'ComfyUI', icon: MonitorCog, className: 'text-capability-cloud bg-capability-cloud/10 border-capability-cloud/20' },
  cloud: { label: 'Cloud', icon: Cloud, className: 'text-capability-cloud bg-capability-cloud/10 border-capability-cloud/20' },
  byom: { label: 'BYOM', icon: Cpu, className: 'text-accent-primary bg-accent-primary-muted border-accent-primary-border' },
};

const hardwareLabel: Record<ModelRecord['hardware_class'], string> = {
  laptop: 'Laptop fit',
  creator: 'Creator laptop',
  workstation: 'Workstation',
  unknown: 'Hardware unknown',
};

const qualityLabel: Record<ModelRecord['quality'], string> = {
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
    <span className={cn('inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 type-badge', className)}>
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
  const availableModels = useAppStore((s) => s.availableModels);

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

  const models = selectModelsByCapability(availableModels, generationType);
  const selected = models.find((m) => m.id === value) ?? models[0] ?? null;

  if (!selected) {
    return (
      <div ref={containerRef} className="relative">
        <button
          data-testid="model-selector-trigger"
          type="button"
          disabled
          className="w-full flex items-center gap-3 px-3 py-3 rounded-md border border-border bg-panel-raised text-left opacity-70"
        >
          <span className="type-meta text-text-muted">
            No models installed - open the Foundry to add one
          </span>
        </button>
      </div>
    );
  }

  const selectedCapability = capabilityMeta[selected.capability];
  const selectedRuntime = runtimeMeta[selected.runtime];
  const SelectedCapabilityIcon = selectedCapability.icon;
  const SelectedRuntimeIcon = selectedRuntime.icon;

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
            <span className="text-sm font-semibold text-text-primary truncate">
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
          <p className="mt-1.5 type-meta text-text-muted">
            {selected.tier} / {hardwareLabel[selected.hardware_class]} / {selected.vram}
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
                <p className="mono-label text-text-muted">
                  {generationType === 'image' ? 'Image routing' : 'Video routing'}
                </p>
                <p className="type-meta text-text-muted">
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
                      {model.capability === 'video' ? (
                        <Video className="h-3.5 w-3.5 text-capability-video" />
                      ) : (
                        <ImageIcon className="h-3.5 w-3.5 text-capability-image" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-sm font-medium text-text-primary">
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
                          {hardwareLabel[model.hardware_class]}
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
