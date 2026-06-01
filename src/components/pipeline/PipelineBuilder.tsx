import { memo, useState } from 'react';
import { cn } from '@/utils/cn';
import { useAppStore } from '@/store/appStore';
import { useShallow } from 'zustand/react/shallow';
import type { PipelineDefinition, PipelineStepType } from '@/types/pipeline';
import { PipelineNode } from './PipelineNode';
import { PipelineNodePalette } from './PipelineNodePalette';
import { PipelineNodeConfig } from './PipelineNodeConfig';
import { PipelinePreview } from './PipelinePreview';
import { Plus, Save, Copy, Trash2, Workflow } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface PipelineBuilderProps {
  pipeline: PipelineDefinition;
  className?: string;
}

export const PipelineBuilder = memo(function PipelineBuilder({
  pipeline,
  className,
}: PipelineBuilderProps) {
  const [selectedStepIndex, setSelectedStepIndex] = useState<number | null>(null);
  const [showPalette, setShowPalette] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(pipeline.name);

  const { updatePipeline, deletePipeline, duplicatePipeline, pipelineExecutions } = useAppStore(
    useShallow((s) => ({
      updatePipeline: s.updatePipeline,
      deletePipeline: s.deletePipeline,
      duplicatePipeline: s.duplicatePipeline,
      pipelineExecutions: s.pipelineExecutions,
    }))
  );

  const selectedStep = selectedStepIndex !== null ? pipeline.steps[selectedStepIndex] : null;

  const execution = pipelineExecutions.find((e) => e.pipelineId === pipeline.id) ?? null;

  function handleAddStep(type: PipelineStepType) {
    const id = crypto.randomUUID();
    const labels: Record<string, string> = {
      upscale: 'Upscale',
      denoise: 'Denoise',
      sharpen: 'Sharpen',
      'face-restore': 'Face Restore',
      'color-correct': 'Color Correct',
      'background-remove': 'Background Remove',
      'style-transfer': 'Style Transfer',
      blur: 'Blur',
      'crop-resize': 'Crop / Resize',
      custom: 'Custom',
    };
    const step = { id, type, label: labels[type] ?? type, params: {}, enabled: true };
    updatePipeline(pipeline.id, { steps: [...pipeline.steps, step] });
    setShowPalette(false);
  }

  function handleRemoveStep(index: number) {
    const next = pipeline.steps.filter((_, i) => i !== index);
    updatePipeline(pipeline.id, { steps: next });
    if (selectedStepIndex === index) {
      setSelectedStepIndex(null);
    } else if (selectedStepIndex !== null && selectedStepIndex > index) {
      setSelectedStepIndex(selectedStepIndex - 1);
    }
  }

  function handleToggleStep(index: number) {
    const next = pipeline.steps.map((s, i) =>
      i === index ? { ...s, enabled: !s.enabled } : s
    );
    updatePipeline(pipeline.id, { steps: next });
  }

  function handleUpdateStepParams(index: number, params: Record<string, unknown>) {
    const next = pipeline.steps.map((s, i) => {
      if (i !== index) return s;
      const enabled = params._enabled as boolean | undefined;
      const clean = { ...params };
      delete clean._enabled;
      return { ...s, params: clean, ...(enabled !== undefined ? { enabled } : {}) };
    });
    updatePipeline(pipeline.id, { steps: next });
  }

  function handleSaveName() {
    if (nameValue.trim()) {
      updatePipeline(pipeline.id, { name: nameValue.trim() });
    } else {
      setNameValue(pipeline.name);
    }
    setEditingName(false);
  }

  function handleDelete() {
    if (!pipeline.isBuiltIn) {
      deletePipeline(pipeline.id);
    }
  }

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-surface/50">
        <Workflow className="w-4 h-4 text-accent-primary shrink-0" />

        {editingName ? (
          <input
            type="text"
            value={nameValue}
            onChange={(e) => setNameValue(e.target.value)}
            onBlur={handleSaveName}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSaveName();
              if (e.key === 'Escape') {
                setNameValue(pipeline.name);
                setEditingName(false);
              }
            }}
            autoFocus
            className="flex-1 text-sm text-text-primary bg-canvas rounded px-2 py-0.5 border border-border focus:outline-none focus:border-accent-primary-border"
          />
        ) : (
          <button
            type="button"
            onClick={() => {
              if (!pipeline.isBuiltIn) {
                setEditingName(true);
                setNameValue(pipeline.name);
              }
            }}
            className="flex-1 text-sm text-text-primary text-left truncate hover:text-accent-primary transition-colors"
          >
            {pipeline.name}
          </button>
        )}

        <button
          type="button"
          onClick={() => setShowPalette(!showPalette)}
          aria-label="Add step"
          className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-text-body hover:bg-elevated transition-colors"
        >
          <Plus className="w-3 h-3" />
          Add Step
        </button>

        <button
          type="button"
          onClick={() => duplicatePipeline(pipeline.id, `${pipeline.name} Copy`)}
          aria-label="Duplicate pipeline"
          className="p-1.5 rounded hover:bg-elevated transition-colors"
        >
          <Copy className="w-3.5 h-3.5 text-text-muted hover:text-text-body" />
        </button>

        <button
          type="button"
          onClick={() => updatePipeline(pipeline.id, { steps: pipeline.steps })}
          aria-label="Save pipeline"
          className="p-1.5 rounded hover:bg-elevated transition-colors"
        >
          <Save className="w-3.5 h-3.5 text-text-muted hover:text-text-body" />
        </button>

        {!pipeline.isBuiltIn && (
          <button
            type="button"
            onClick={handleDelete}
            aria-label="Delete pipeline"
            className="p-1.5 rounded hover:bg-status-error-muted transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5 text-text-muted hover:text-status-error" />
          </button>
        )}
      </div>

      {/* Pipeline description */}
      {pipeline.description && (
        <div className="px-3 py-1.5 text-xs text-text-muted bg-surface/30 border-b border-border">
          {pipeline.description}
        </div>
      )}

      {/* Node palette dropdown */}
      <AnimatePresence>
        {showPalette && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-b border-border bg-canvas"
          >
            <div className="p-2 max-h-48 overflow-y-auto">
              <PipelineNodePalette onAddStep={handleAddStep} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Canvas area */}
      <div className="flex-1 overflow-auto">
        {pipeline.steps.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-text-muted">
            <Workflow className="w-10 h-10 opacity-30" />
            <p className="text-sm">Add a step to get started</p>
            <button
              type="button"
              onClick={() => setShowPalette(true)}
              className="rounded-md border border-border px-3 py-1.5 text-xs text-text-body hover:bg-elevated transition-colors"
            >
              Browse Steps
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-0 p-6 overflow-x-auto min-h-[120px]">
            {pipeline.steps.map((step, i) => (
              <PipelineNode
                key={step.id}
                step={step}
                index={i}
                isSelected={selectedStepIndex === i}
                isFirst={i === 0}
                isLast={i === pipeline.steps.length - 1}
                onSelect={() => setSelectedStepIndex(selectedStepIndex === i ? null : i)}
                onToggle={() => handleToggleStep(i)}
                onRemove={() => handleRemoveStep(i)}
              />
            ))}

            {/* Add button at end */}
            <button
              type="button"
              onClick={() => setShowPalette(true)}
              aria-label="Add step"
              className="flex items-center justify-center w-10 h-10 rounded-md border border-dashed border-border hover:border-border-hover hover:bg-elevated transition-colors shrink-0 ml-2"
            >
              <Plus className="w-4 h-4 text-text-muted" />
            </button>
          </div>
        )}
      </div>

      {/* Bottom panels: config + preview */}
      {selectedStep && (
        <div className="border-t border-border bg-surface/30">
          <div className="grid grid-cols-[1fr_280px] gap-0 divide-x divide-border">
            <PipelineNodeConfig
              step={selectedStep}
              onUpdate={(params) => {
                if (selectedStepIndex !== null) {
                  handleUpdateStepParams(selectedStepIndex, params);
                }
              }}
            />
            <div className="p-3">
              <PipelinePreview
                execution={execution}
                stepIndex={selectedStepIndex}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
});
