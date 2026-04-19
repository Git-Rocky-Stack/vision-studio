import { useEffect, useId, useRef, useState } from 'react';
import { cn } from '@/utils/cn';
import { hexToRgba } from '@/utils/colorUtils';
import { Button } from '@/components/ui/Button';
import { Slider } from '@/components/ui/Slider';
import { useAppStore } from '@/store/appStore';
import { useShallow } from 'zustand/react/shallow';
import type { ProjectTemplate } from '@/types/template';
import type { ModelInfo } from '@/types/model';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  ChevronRight,
  ChevronLeft,
  Check,
  Youtube,
  Instagram,
  ShoppingBag,
  Palette,
  Monitor,
  Type,
  Cpu,
  Sliders,
  MessageSquare,
} from 'lucide-react';

const CATEGORIES: {
  id: ProjectTemplate['category'];
  label: string;
  icon: React.ElementType;
  color: string;
}[] = [
  { id: 'social', label: 'Social Media', icon: Instagram, color: 'var(--color-category-social)' },
  { id: 'youtube', label: 'YouTube', icon: Youtube, color: 'var(--color-category-youtube)' },
  { id: 'marketing', label: 'Marketing', icon: ShoppingBag, color: 'var(--color-category-marketing)' },
  { id: 'art', label: 'Art & Creative', icon: Palette, color: 'var(--color-category-art)' },
];

const DIMENSION_PRESETS = [
  { label: '1:1 Square', width: 1024, height: 1024 },
  { label: '16:9 Wide', width: 1920, height: 1080 },
  { label: '9:16 Tall', width: 1080, height: 1920 },
  { label: '4:3', width: 1024, height: 768 },
  { label: '3:2', width: 1024, height: 683 },
  { label: 'YouTube', width: 1280, height: 720 },
];

const CATEGORY_THUMBNAILS: Record<ProjectTemplate['category'], string> = {
  youtube: 'YT',
  social: 'SOC',
  marketing: 'MKT',
  art: 'ART',
};

interface TemplateCreatorProps {
  onClose: () => void;
  editingTemplate?: ProjectTemplate | null;
}

const FALLBACK_MODELS = [
  { id: 'flux-dev', name: 'FLUX.1 [dev]' },
  { id: 'sd3.5-large', name: 'Stable Diffusion 3.5 Large' },
  { id: 'flux-fill', name: 'FLUX.1 Fill [dev]' },
  { id: 'sd3.5-medium', name: 'Stable Diffusion 3.5 Medium' },
  { id: 'flux-schnell', name: 'FLUX.1 [schnell]' },
  { id: 'sd-1-5', name: 'Stable Diffusion 1.5' },
];

export function TemplateCreator({ onClose, editingTemplate }: TemplateCreatorProps) {
  const { addUserTemplate, updateUserTemplate, availableModels } = useAppStore(
    useShallow((s) => ({ addUserTemplate: s.addUserTemplate, updateUserTemplate: s.updateUserTemplate, availableModels: s.availableModels }))
  );

  const models = availableModels.length > 0
    ? availableModels.map((m: ModelInfo) => ({ id: m.id ?? m.name, name: m.name ?? m.id }))
    : FALLBACK_MODELS;
  const [step, setStep] = useState(0);

  // Form state
  const [name, setName] = useState(editingTemplate?.name || '');
  const [description, setDescription] = useState(editingTemplate?.description || '');
  const [category, setCategory] = useState<ProjectTemplate['category']>(
    editingTemplate?.category || 'art'
  );
  const [width, setWidth] = useState(editingTemplate?.settings.width || 1024);
  const [height, setHeight] = useState(editingTemplate?.settings.height || 1024);
  const [useCustomDimensions, setUseCustomDimensions] = useState(false);
  const [model, setModel] = useState(editingTemplate?.settings.model || 'flux-dev');
  const [steps, setSteps] = useState(editingTemplate?.settings.steps || 25);
  const [cfgScale, setCfgScale] = useState(editingTemplate?.settings.cfgScale || 7.5);
  const [prompt, setPrompt] = useState(editingTemplate?.settings.prompt || '');
  const [negativePrompt, setNegativePrompt] = useState(
    editingTemplate?.settings.negativePrompt || ''
  );
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const nameId = useId();
  const descriptionId = useId();
  const categoryId = useId();
  const widthId = useId();
  const heightId = useId();
  const modelId = useId();
  const promptId = useId();
  const negativePromptId = useId();

  useEffect(() => {
    previousFocusRef.current = document.activeElement as HTMLElement | null;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== 'Tab') {
        return;
      }

      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (!focusable || focusable.length === 0) {
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      previousFocusRef.current?.focus?.();
    };
  }, [onClose]);

  const STEPS = [
    { label: 'Details', icon: Type },
    { label: 'Dimensions', icon: Monitor },
    { label: 'Settings', icon: Sliders },
    { label: 'Prompts', icon: MessageSquare },
  ];

  const canProceed = () => {
    switch (step) {
      case 0: return name.trim().length > 0;
      case 1: return width > 0 && height > 0;
      case 2: return true;
      case 3: return prompt.trim().length > 0;
      default: return false;
    }
  };

  const handleSave = () => {
    const thumbnail = CATEGORY_THUMBNAILS[category];

    const templateData: ProjectTemplate = {
      id: editingTemplate?.id || crypto.randomUUID(),
      name,
      description,
      category,
      thumbnail,
      settings: {
        width,
        height,
        model,
        steps,
        cfgScale,
        prompt,
        negativePrompt,
      },
      isCustom: true,
    };

    if (editingTemplate) {
      updateUserTemplate(editingTemplate.id, templateData);
    } else {
      addUserTemplate(templateData);
    }

    onClose();
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-void/90 backdrop-blur-sm" />

      <motion.div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-[600px] max-h-[80vh] bg-surface rounded-md border border-border shadow-cinematic overflow-hidden flex flex-col"
      >
        {/* Close */}
        <button
          onClick={onClose}
          aria-label="Close template creator"
          className="absolute top-4 right-4 z-10 p-2 rounded-lg bg-elevated/80 text-text-muted hover:text-text-primary hover:bg-elevated transition-all"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Header */}
        <div className="p-6 pb-4 border-b border-border">
          <h2 id={titleId} className="font-display text-lg font-bold text-text-primary">
            {editingTemplate ? 'Edit Template' : 'Create Template'}
          </h2>
          <p className="text-sm text-text-body mt-1">
            {editingTemplate ? 'Update your custom template' : 'Build a reusable generation preset'}
          </p>
        </div>

        {/* Step Indicator */}
        <div className="flex items-center gap-1 px-6 py-3 border-b border-border">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            const isActive = step === i;
            const isComplete = step > i;
            return (
              <div key={i} className="flex items-center gap-1 flex-1">
                <button
                  onClick={() => i < step && setStep(i)}
                  className={cn(
                    'flex items-center gap-2 px-2 py-1 rounded-lg text-xs font-display font-medium transition-all',
                    isActive && 'bg-accent-primary-muted text-accent-primary border border-accent-primary-border',
                    isComplete && 'text-text-primary cursor-pointer hover:bg-elevated',
                    !isActive && !isComplete && 'text-text-muted'
                  )}
                >
                  {isComplete ? (
                    <Check className="w-3 h-3 text-status-success" />
                  ) : (
                    <Icon className="w-3 h-3" />
                  )}
                  {s.label}
                </button>
                {i < STEPS.length - 1 && (
                  <div
                    className={cn(
                      'flex-1 h-px',
                      isComplete ? 'bg-accent-primary-border' : 'bg-border'
                    )}
                  />
                )}
              </div>
            );
          })}
        </div>

        {/* Step Content */}
        <div className="flex-1 overflow-y-auto p-6 scrollbar-hide">
          <AnimatePresence mode="wait">
            {/* Step 0: Name & Category */}
            {step === 0 && (
              <motion.div
                key="step-0"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-4"
              >
                <div>
                  <label htmlFor={nameId} className="text-label text-text-body mb-1.5 block">
                    Template Name
                  </label>
                  <input
                    id={nameId}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g., My YouTube Thumbnail"
                    className="w-full bg-elevated border border-border rounded-md px-4 py-3 text-sm text-text-primary placeholder:text-text-muted focus:border-accent-primary focus:ring-1 focus:ring-accent-primary/40 transition-all font-display"
                    autoFocus
                  />
                </div>

                <div>
                  <label htmlFor={descriptionId} className="text-label text-text-body mb-1.5 block">
                    Description
                  </label>
                  <textarea
                    id={descriptionId}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="What is this template for?"
                    rows={3}
                    className="w-full bg-elevated border border-border rounded-md px-4 py-3 text-sm text-text-primary placeholder:text-text-muted focus:border-accent-primary focus:ring-1 focus:ring-accent-primary/40 resize-none transition-all font-display"
                  />
                </div>

                <div>
                  <span id={categoryId} className="text-label text-text-body mb-2 block">
                    Category
                  </span>
                  <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-labelledby={categoryId}>
                    {CATEGORIES.map((cat) => {
                      const isSelected = category === cat.id;
                      const Icon = cat.icon;
                      return (
                        <button
                          key={cat.id}
                          onClick={() => setCategory(cat.id)}
                          role="radio"
                          aria-checked={isSelected}
                          className={cn(
                            'flex items-center gap-3 p-3 rounded-lg border transition-all text-left',
                            isSelected
                              ? 'border-transparent'
                              : 'border-border bg-elevated hover:border-border-hover'
                          )}
                          style={
                            isSelected
                              ? {
                                  backgroundColor: hexToRgba(cat.color, 0.06),
                                  borderColor: hexToRgba(cat.color, 0.25),
                                  color: cat.color,
                                }
                              : undefined
                          }
                        >
                          <Icon className="w-4 h-4 flex-shrink-0" />
                          <span className="text-sm font-display font-medium">
                            {cat.label}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </motion.div>
            )}

            {/* Step 1: Dimensions */}
            {step === 1 && (
              <motion.div
                key="step-1"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-4"
              >
                <div>
                  <label className="text-label text-text-body mb-2 block">
                    Dimension Presets
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {DIMENSION_PRESETS.map((preset) => {
                      const isSelected =
                        !useCustomDimensions &&
                        width === preset.width &&
                        height === preset.height;
                      return (
                        <button
                          key={preset.label}
                          onClick={() => {
                            setWidth(preset.width);
                            setHeight(preset.height);
                            setUseCustomDimensions(false);
                          }}
                          className={cn(
                            'p-3 rounded-lg border text-center transition-all',
                            isSelected
                              ? 'border-accent-primary-border bg-accent-primary-muted text-accent-primary'
                              : 'border-border bg-elevated text-text-body hover:border-border-hover'
                          )}
                        >
                          <span className="text-xs font-display font-medium block">
                            {preset.label}
                          </span>
                          <span className="font-mono text-micro text-text-muted mt-0.5 block">
                            {preset.width}x{preset.height}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <button
                    onClick={() => setUseCustomDimensions(!useCustomDimensions)}
                    className="text-xs font-display text-text-body hover:text-accent-primary transition-all"
                  >
                    {useCustomDimensions ? 'Use presets' : 'Custom dimensions'}
                  </button>

                  {useCustomDimensions && (
                    <div className="grid grid-cols-2 gap-3 mt-3">
                      <div>
                        <label htmlFor={widthId} className="text-label text-text-body mb-1 block">
                          Width
                        </label>
                        <input
                          id={widthId}
                          type="number"
                          value={width}
                          onChange={(e) => setWidth(Number(e.target.value))}
                          min={256}
                          max={4096}
                          step={64}
                          className="w-full bg-elevated border border-border rounded-md px-3 py-2 text-sm font-mono text-text-primary focus:border-accent-primary transition-all"
                        />
                      </div>
                      <div>
                        <label htmlFor={heightId} className="text-label text-text-body mb-1 block">
                          Height
                        </label>
                        <input
                          id={heightId}
                          type="number"
                          value={height}
                          onChange={(e) => setHeight(Number(e.target.value))}
                          min={256}
                          max={4096}
                          step={64}
                          className="w-full bg-elevated border border-border rounded-md px-3 py-2 text-sm font-mono text-text-primary focus:border-accent-primary transition-all"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Preview */}
                <div className="flex items-center justify-center py-4">
                  <div
                    className="border-2 border-border rounded-lg flex items-center justify-center"
                    style={{
                      width: width >= height ? '120px' : `${(width / height) * 120}px`,
                      height: height >= width ? '120px' : `${(height / width) * 120}px`,
                    }}
                  >
                    <span className="font-mono text-xs text-text-muted">
                      {width}x{height}
                    </span>
                  </div>
                </div>
              </motion.div>
            )}

            {/* Step 2: Model & Settings */}
            {step === 2 && (
              <motion.div
                key="step-2"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-4"
              >
                <div>
                  <span id={modelId} className="text-label text-text-body mb-1.5 block">
                    Model
                  </span>
                  <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-labelledby={modelId}>
                    {models.map((m) => (
                      <button
                        key={m.id}
                        onClick={() => setModel(m.id)}
                        role="radio"
                        aria-checked={model === m.id}
                        className={cn(
                          'p-3 rounded-lg border text-left transition-all',
                          model === m.id
                            ? 'border-accent-primary-border bg-accent-primary-muted'
                            : 'border-border bg-elevated hover:border-border-hover'
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <Cpu className={cn(
                            'w-4 h-4',
                            model === m.id ? 'text-accent-primary' : 'text-text-muted'
                          )} />
                          <span className={cn(
                            'text-sm font-display font-medium',
                            model === m.id ? 'text-accent-primary' : 'text-text-primary'
                          )}>
                            {m.name}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                <Slider
                  label="Steps"
                  value={steps}
                  min={10}
                  max={50}
                  onChange={setSteps}
                />

                <Slider
                  label="CFG Scale"
                  value={cfgScale}
                  min={1}
                  max={20}
                  step={0.5}
                  onChange={setCfgScale}
                />
              </motion.div>
            )}

            {/* Step 3: Prompts */}
            {step === 3 && (
              <motion.div
                key="step-3"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-4"
              >
                <div>
                  <label htmlFor={promptId} className="text-label text-text-body mb-1.5 block">
                    Default Prompt
                  </label>
                  <textarea
                    id={promptId}
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="Describe the default generation style and content..."
                    rows={4}
                    className="w-full bg-elevated border border-border rounded-md px-4 py-3 text-sm text-text-primary placeholder:text-text-muted focus:border-accent-primary focus:ring-1 focus:ring-accent-primary/40 resize-none transition-all font-display"
                    autoFocus
                  />
                  <p className="text-micro text-text-muted mt-1 font-display">
                    This prompt will be pre-filled when using the template
                  </p>
                </div>

                <div>
                  <label htmlFor={negativePromptId} className="text-label text-text-body mb-1.5 block">
                    Negative Prompt
                  </label>
                  <textarea
                    id={negativePromptId}
                    value={negativePrompt}
                    onChange={(e) => setNegativePrompt(e.target.value)}
                    placeholder="What to avoid in generation..."
                    rows={3}
                    className="w-full bg-elevated border border-border rounded-md px-4 py-3 text-sm text-text-primary placeholder:text-text-muted focus:border-accent-primary focus:ring-1 focus:ring-accent-primary/40 resize-none transition-all font-display"
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Footer Navigation */}
        <div className="p-6 pt-4 border-t border-border flex items-center gap-3">
          {step > 0 ? (
            <Button
              variant="ghost"
              icon={ChevronLeft}
              onClick={() => setStep(step - 1)}
            >
              Back
            </Button>
          ) : (
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
          )}

          <div className="flex-1" />

          <span className="text-xs text-text-muted font-mono">
            {step + 1} / {STEPS.length}
          </span>

          {step < STEPS.length - 1 ? (
            <Button
              variant="primary"
              icon={ChevronRight}
              iconPosition="right"
              onClick={() => setStep(step + 1)}
              disabled={!canProceed()}
            >
              Next
            </Button>
          ) : (
            <Button
              variant="cinema"
              icon={Check}
              onClick={handleSave}
              disabled={!canProceed()}
            >
              {editingTemplate ? 'Save Changes' : 'Create Template'}
            </Button>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
