import { useState, useRef, useEffect } from 'react';
import { cn } from '@/utils/cn';
import { hexToRgba } from '@/utils/colorUtils';
import { ChevronDown, Check, Cpu, Zap, Scale, Sparkles, Paintbrush } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface ModelOption {
  id: string;
  name: string;
  quality: 'best' | 'high' | 'fast' | 'balanced' | 'inpainting';
  vram: string;
  description: string;
  type: 'image' | 'video';
}

const IMAGE_MODELS: ModelOption[] = [
  {
    id: 'flux-dev',
    name: 'FLUX.1 [dev]',
    quality: 'best',
    vram: '23.8 GB',
    description: 'Highest quality, detailed outputs with excellent prompt adherence',
    type: 'image',
  },
  {
    id: 'sd3.5-large',
    name: 'Stable Diffusion 3.5 Large',
    quality: 'high',
    vram: '~12 GB',
    description: 'Modern MM-DiT architecture with superior composition and typography',
    type: 'image',
  },
  {
    id: 'flux-fill',
    name: 'FLUX.1 Fill [dev]',
    quality: 'inpainting',
    vram: '23.8 GB',
    description: 'Inpainting and outpainting with seamless region blending',
    type: 'image',
  },
  {
    id: 'sd3.5-medium',
    name: 'Stable Diffusion 3.5 Medium',
    quality: 'balanced',
    vram: '~6 GB',
    description: 'Strong prompt understanding and versatile output with low VRAM',
    type: 'image',
  },
  {
    id: 'flux-schnell',
    name: 'FLUX.1 [schnell]',
    quality: 'fast',
    vram: '23.8 GB',
    description: 'Fast generation with good quality, 4-step inference',
    type: 'image',
  },
  {
    id: 'sd-1-5',
    name: 'Stable Diffusion 1.5',
    quality: 'fast',
    vram: '4.0 GB',
    description: 'Lightweight model with extensive LoRA/ControlNet ecosystem',
    type: 'image',
  },
];

const VIDEO_MODELS: ModelOption[] = [
  {
    id: 'ltx-video',
    name: 'LTX Video',
    quality: 'best',
    vram: '9.4 GB',
    description: 'High quality video generation with temporal coherence',
    type: 'video',
  },
  {
    id: 'animatediff',
    name: 'AnimateDiff',
    quality: 'balanced',
    vram: '8.0 GB',
    description: 'Animate images into short video clips with motion control',
    type: 'video',
  },
  {
    id: 'svd',
    name: 'Stable Video Diffusion',
    quality: 'balanced',
    vram: '8.0 GB',
    description: 'Image-to-video with camera motion and scene animation; requires a reference image',
    type: 'video',
  },
];

const qualityBadge: Record<
  ModelOption['quality'],
  { label: string; color: string; icon: React.ElementType }
> = {
  best: { label: 'Best Quality', color: 'var(--color-feature-03)', icon: Cpu },
  high: { label: 'High Quality', color: 'var(--color-feature-02)', icon: Sparkles },
  inpainting: { label: 'Inpainting', color: 'var(--color-feature-05)', icon: Paintbrush },
  balanced: { label: 'Balanced', color: 'var(--color-feature-06)', icon: Scale },
  fast: { label: 'Fast', color: 'var(--color-feature-04)', icon: Zap },
};

interface ModelSelectorProps {
  value: string;
  onChange: (modelId: string) => void;
  generationType: 'image' | 'video';
}

export function ModelSelector({ value, onChange, generationType }: ModelSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const models = generationType === 'image' ? IMAGE_MODELS : VIDEO_MODELS;
  const selected = models.find((m) => m.id === value) || models[0];
  const badge = qualityBadge[selected.quality];

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isOpen]);

  const handleSelect = (modelId: string) => {
    onChange(modelId);
    setIsOpen(false);
  };

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger */}
      <button
        data-testid="model-selector-trigger"
        onClick={() => setIsOpen(!isOpen)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        className={cn(
          'w-full flex items-center gap-3 px-3 py-3 rounded-lg border transition-all text-left',
          isOpen
            ? 'border-red-primary bg-elevated shadow-cinematic'
            : 'border-border bg-elevated hover:border-border-hover'
        )}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-display text-sm font-medium text-text-primary">
              {selected.name}
            </span>
            <span
              className="px-1.5 py-0.5 rounded-full text-micro font-display font-medium"
              style={{
                backgroundColor: hexToRgba(badge.color, 0.08),
                color: badge.color,
              }}
            >
              {badge.label}
            </span>
          </div>
          <p className="font-mono text-micro text-text-muted mt-0.5">
            {selected.vram} VRAM
          </p>
        </div>
        <ChevronDown
          className={cn(
            'w-4 h-4 text-text-muted transition-transform flex-shrink-0',
            isOpen && 'rotate-180'
          )}
        />
      </button>

      {/* Dropdown */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className="absolute z-50 left-0 right-0 mt-1.5 bg-elevated border border-border rounded-xl shadow-cinematic overflow-hidden"
          >
            <div className="p-2 max-h-80 overflow-y-auto" role="listbox" aria-label="Select model">
              {/* Section label */}
              <p className="px-2.5 py-1.5 text-label text-text-muted" role="presentation">
                {generationType === 'image' ? 'Image Models' : 'Video Models'}
              </p>

              {models.map((model) => {
                const modelBadge = qualityBadge[model.quality];
                const isSelected = model.id === value;
                const BadgeIcon = modelBadge.icon;

                return (
                  <button
                    key={model.id}
                    onClick={() => handleSelect(model.id)}
                    role="option"
                    aria-selected={isSelected}
                    className={cn(
                      'w-full flex items-start gap-3 px-2.5 py-3 rounded-lg transition-all text-left',
                      isSelected
                        ? 'bg-red-aura border border-red-primary/30'
                        : 'hover:bg-surface border border-transparent'
                    )}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="font-display text-sm font-medium text-text-primary">
                          {model.name}
                        </span>
                        <span
                          className="flex items-center gap-1 px-1.5 py-0.5 rounded-full text-micro font-display font-medium"
                          style={{
                            backgroundColor: hexToRgba(modelBadge.color, 0.08),
                            color: modelBadge.color,
                          }}
                        >
                          <BadgeIcon className="w-2.5 h-2.5" />
                          {modelBadge.label}
                        </span>
                      </div>
                      <p className="text-xs text-text-body line-clamp-1 mb-0.5">
                        {model.description}
                      </p>
                      <p className="font-mono text-micro text-text-muted">
                        {model.vram} VRAM
                      </p>
                    </div>
                    {isSelected && (
                      <Check className="w-4 h-4 text-red-primary flex-shrink-0 mt-0.5" />
                    )}
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
