import { useState, useCallback } from 'react';
import { cn } from '@/utils/cn';
import { Slider } from '@/components/ui/Slider';
import type { LoRAConfig } from '@/types/generation';
import { useAppStore } from '@/store/appStore';
import { useShallow } from 'zustand/react/shallow';
import { selectInstalledLoras, isLoraCompatible } from '@/store/slices/modelsSlice';
import type { ModelRecord } from '@/types/model';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Plus,
  X,
  GripVertical,
  Search,
  Layers,
  ChevronDown,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const LORA_COLORS = [
  'var(--color-feature-01)',
  'var(--color-feature-02)',
  'var(--color-feature-03)',
  'var(--color-feature-04)',
  'var(--color-feature-05)',
  'var(--color-feature-06)',
  'var(--color-feature-07)',
  'var(--color-feature-08)',
];

interface LoRAMixerProps {
  configs: LoRAConfig[];
  onChange: (configs: LoRAConfig[]) => void;
  /** base_architecture of the currently selected checkpoint/video model. */
  baseArchitecture: string | null;
  onInsertTrigger: (triggerWord: string) => void;
  /** When set, the mixer renders a disabled note instead of the picker. */
  disabledReason?: string | null;
}

function SortableLoRACard({
  config,
  onWeightChange,
  onRemove,
  onInsertTrigger,
}: {
  config: LoRAConfig;
  onWeightChange: (weight: number) => void;
  onRemove: () => void;
  onInsertTrigger: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: config.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'relative flex items-start gap-2 p-2.5 rounded-md bg-elevated border transition-all',
        isDragging
          ? 'border-accent-primary/40 shadow-cinematic z-10'
          : 'border-border hover:border-border-hover'
      )}
    >
      {/* Color bar + drag handle */}
      <div className="flex flex-col items-center gap-1">
        <div
          className="w-1 h-8 rounded-full"
          style={{ backgroundColor: config.color }}
        />
        <button
          {...attributes}
          {...listeners}
          aria-label="Drag to reorder"
          className="p-0.5 rounded text-text-muted hover:text-text-primary cursor-grab active:cursor-grabbing"
        >
          <GripVertical className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm font-medium text-text-primary truncate">
            {config.name}
          </span>
          <button
            onClick={onRemove}
            aria-label={`Remove ${config.name}`}
            className="p-0.5 rounded text-text-muted hover:text-status-error hover:bg-status-error-muted transition-all"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
        <Slider
          label="Weight"
          value={config.weight}
          min={0}
          max={2}
          step={0.05}
          onChange={onWeightChange}
        />
        {config.triggerWord && (
          <button
            type="button"
            onClick={onInsertTrigger}
            aria-label={`Insert trigger ${config.triggerWord}`}
            className="mt-2 inline-flex items-center gap-1 rounded px-1.5 py-0.5 type-badge text-text-muted hover:text-text-primary hover:bg-elevated transition-all"
          >
            <Plus className="w-3 h-3" />
            {config.triggerWord}
          </button>
        )}
      </div>
    </div>
  );
}

export function LoRAMixer({
  configs,
  onChange,
  baseArchitecture,
  onInsertTrigger,
  disabledReason = null,
}: LoRAMixerProps) {
  const [showBrowser, setShowBrowser] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showIncompatible, setShowIncompatible] = useState(false);
  const [isExpanded, setIsExpanded] = useState(configs.length > 0);

  const installed = useAppStore(useShallow((s) => selectInstalledLoras(s.availableModels)));

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const oldIndex = configs.findIndex((c) => c.id === active.id);
      const newIndex = configs.findIndex((c) => c.id === over.id);
      onChange(arrayMove(configs, oldIndex, newIndex));
    },
    [configs, onChange]
  );

  const addLoRA = useCallback(
    (record: ModelRecord) => {
      const newConfig: LoRAConfig = {
        id: record.id,
        name: record.name,
        triggerWord: record.trigger_words?.[0] ?? '',
        weight: record.default_weight ?? 1.0,
        color: LORA_COLORS[configs.length % LORA_COLORS.length],
      };
      onChange([...configs, newConfig]);
      setShowBrowser(false);
      setSearchQuery('');
      setIsExpanded(true);
    },
    [configs, onChange]
  );

  const updateWeight = useCallback(
    (id: string, weight: number) => {
      onChange(configs.map((c) => (c.id === id ? { ...c, weight } : c)));
    },
    [configs, onChange]
  );

  const removeLoRA = useCallback(
    (id: string) => {
      onChange(configs.filter((c) => c.id !== id));
    },
    [configs, onChange]
  );

  const selectedIds = new Set(configs.map((c) => c.id));
  const matchesQuery = (r: ModelRecord) =>
    !searchQuery || r.name.toLowerCase().includes(searchQuery.toLowerCase());
  const compatibleLoras = installed.filter(
    (r) => !selectedIds.has(r.id) && matchesQuery(r) && isLoraCompatible(baseArchitecture, r.base_architecture),
  );
  const incompatibleLoras = installed.filter(
    (r) => !selectedIds.has(r.id) && matchesQuery(r) && !isLoraCompatible(baseArchitecture, r.base_architecture),
  );
  const browserLoras = showIncompatible ? [...compatibleLoras, ...incompatibleLoras] : compatibleLoras;

  if (disabledReason) {
    return (
      <div className="rounded-md border border-dashed border-border bg-elevated/40 px-3 py-3">
        <p className="text-xs text-text-muted">{disabledReason}</p>
      </div>
    );
  }

  if (!isExpanded && configs.length === 0) {
    return (
      <button
        onClick={() => {
          setIsExpanded(true);
          setShowBrowser(true);
        }}
        aria-expanded={isExpanded}
        aria-controls="lora-mixer-panel"
        className="flex items-center gap-2 w-full py-3 px-3 rounded-md border border-dashed border-border text-text-body hover:text-text-primary hover:border-border-hover transition-all text-sm"
      >
        <Layers className="w-4 h-4" />
        Add LoRA Models
        <ChevronDown className="w-3.5 h-3.5 ml-auto" />
      </button>
    );
  }

  return (
    <div className="rounded-md border border-border bg-elevated/50 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2">
        <Layers className="w-3.5 h-3.5 text-accent-primary" />
        <span className="text-label text-text-primary">LoRA Models</span>
        <span className="data-mono text-text-muted ml-auto">
          {configs.length}
        </span>
      </div>

      <div className="px-3 pb-3 space-y-2">
        {/* Active LoRAs */}
        {configs.length > 0 && (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={configs.map((c) => c.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-2">
                {configs.map((config) => (
                  <SortableLoRACard
                    key={config.id}
                    config={config}
                    onWeightChange={(w) => updateWeight(config.id, w)}
                    onRemove={() => removeLoRA(config.id)}
                    onInsertTrigger={() => onInsertTrigger(config.triggerWord)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}

        {/* Add Button / Browser */}
        <AnimatePresence>
          {showBrowser ? (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="rounded-md border border-border bg-surface p-2 space-y-2">
                {/* Search */}
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted" />
                  <input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search LoRAs..."
                    autoFocus
                    className="w-full bg-elevated border border-border rounded-md pl-8 pr-3 py-1.5 text-xs text-text-primary placeholder:text-text-muted focus:border-accent-primary focus:ring-1 focus:ring-accent-primary/40 transition-all"
                  />
                </div>

                {/* LoRA List */}
                <div className="max-h-40 overflow-y-auto space-y-1">
                  {browserLoras.map((record) => {
                    const compatible = isLoraCompatible(baseArchitecture, record.base_architecture);
                    return (
                      <button
                        key={record.id}
                        onClick={() => addLoRA(record)}
                        className="w-full flex items-center justify-between px-2.5 py-2 rounded-md hover:bg-elevated transition-all text-left"
                      >
                        <div>
                          <p className="text-xs font-medium text-text-primary">
                            {record.name}
                          </p>
                          <p className="type-badge text-text-muted">
                            {record.size}{!compatible ? ' - incompatible' : ''}
                          </p>
                        </div>
                        <Plus className="w-3.5 h-3.5 text-text-muted" />
                      </button>
                    );
                  })}
                  {browserLoras.length === 0 && (
                    <p className="text-xs text-text-muted text-center py-3">
                      {installed.length === 0
                        ? 'No LoRAs installed - add some in the Foundry'
                        : 'No compatible LoRAs found'}
                    </p>
                  )}
                </div>

                {incompatibleLoras.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowIncompatible((v) => !v)}
                    className="w-full text-xs text-text-muted hover:text-text-primary text-center py-1"
                  >
                    {showIncompatible
                      ? 'Hide incompatible'
                      : `Show incompatible (may fail) (${incompatibleLoras.length})`}
                  </button>
                )}

                <button
                  onClick={() => {
                    setShowBrowser(false);
                    setSearchQuery('');
                  }}
                  className="w-full text-xs text-text-muted hover:text-text-primary text-center py-1"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          ) : (
            <button
              onClick={() => setShowBrowser(true)}
              className="flex items-center gap-2 w-full py-2 px-2.5 rounded-md border border-dashed border-border text-text-body hover:text-text-primary hover:border-border-hover transition-all text-xs"
            >
              <Plus className="w-3 h-3" />
              Add LoRA
            </button>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
