import { memo, useState } from 'react';
import { cn } from '@/utils/cn';
import { useAppStore } from '@/store/appStore';
import { useShallow } from 'zustand/react/shallow';
import type { PipelineStepType, PipelineStep } from '@/types/pipeline';
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
  Plus,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface StepTypeOption {
  type: PipelineStepType;
  label: string;
  description: string;
  icon: React.ElementType;
}

const STEP_TYPES: StepTypeOption[] = [
  { type: 'upscale', label: 'Upscale', description: 'Increase resolution', icon: Maximize2 },
  { type: 'denoise', label: 'Denoise', description: 'Remove noise', icon: Eraser },
  { type: 'sharpen', label: 'Sharpen', description: 'Enhance edges', icon: Zap },
  { type: 'face-restore', label: 'Face Restore', description: 'Fix facial details', icon: Sparkles },
  { type: 'color-correct', label: 'Color Correct', description: 'Adjust colors', icon: Palette },
  { type: 'background-remove', label: 'Background Remove', description: 'Remove background', icon: ImageOff },
  { type: 'style-transfer', label: 'Style Transfer', description: 'Apply artistic style', icon: Brush },
  { type: 'blur', label: 'Blur', description: 'Apply blur effect', icon: Droplets },
  { type: 'crop-resize', label: 'Crop / Resize', description: 'Change dimensions', icon: Crop },
  { type: 'custom', label: 'Custom', description: 'Custom processing', icon: Settings2 },
];

function makeStep(type: PipelineStepType): PipelineStep {
  return {
    id: `step-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    type,
    label: STEP_TYPES.find((s) => s.type === type)?.label ?? type,
    params: {},
    enabled: true,
  };
}

interface PipelineNodePaletteProps {
  onAddStep?: (type: PipelineStepType) => void;
  className?: string;
}

export const PipelineNodePalette = memo(function PipelineNodePalette({
  onAddStep,
  className,
}: PipelineNodePaletteProps) {
  const [search, setSearch] = useState('');

  const { activePipelineId, pipelines, createPipeline, updatePipeline } = useAppStore(
    useShallow((s) => ({
      activePipelineId: s.activePipelineId,
      pipelines: s.pipelines,
      createPipeline: s.createPipeline,
      updatePipeline: s.updatePipeline,
    }))
  );

  const filtered = STEP_TYPES.filter(
    (st) =>
      st.label.toLowerCase().includes(search.toLowerCase()) ||
      st.description.toLowerCase().includes(search.toLowerCase())
  );

  function handleAdd(type: PipelineStepType) {
    if (onAddStep) {
      onAddStep(type);
      return;
    }

    const step = makeStep(type);

    if (activePipelineId) {
      const pipeline = pipelines.find((p) => p.id === activePipelineId);
      if (pipeline) {
        updatePipeline(pipeline.id, { steps: [...pipeline.steps, step] });
        return;
      }
    }

    createPipeline({
      name: 'New Pipeline',
      description: '',
      steps: [step],
    });
  }

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div className="px-1 mb-1">
        <h3 className="text-label text-text-primary font-medium mb-2">Step Types</h3>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search steps..."
          className="w-full rounded-md border border-border bg-canvas px-2 py-1.5 text-sm text-text-body placeholder:text-text-muted focus:outline-none focus:border-accent-primary-border"
        />
      </div>

      <div className="flex flex-col gap-0.5 overflow-y-auto">
        <AnimatePresence>
          {filtered.map((st) => {
            const Icon = st.icon;
            return (
              <motion.button
                key={st.type}
                type="button"
                layout
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                onClick={() => handleAdd(st.type)}
                className="flex items-center gap-2 w-full rounded-md px-2 py-2 text-left transition-colors hover:bg-elevated group"
              >
                <div className="flex items-center justify-center w-7 h-7 rounded-md bg-surface group-hover:bg-elevated transition-colors">
                  <Icon className="w-3.5 h-3.5 text-text-muted group-hover:text-red-primary transition-colors" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-text-primary leading-tight">{st.label}</div>
                  <div className="text-xs text-text-muted leading-tight truncate">{st.description}</div>
                </div>
                <Plus className="w-3 h-3 text-text-muted opacity-0 group-hover:opacity-100 transition-opacity" />
              </motion.button>
            );
          })}
        </AnimatePresence>

        {filtered.length === 0 && (
          <div className="text-xs text-text-muted text-center py-4">No steps match your search</div>
        )}
      </div>
    </div>
  );
});
