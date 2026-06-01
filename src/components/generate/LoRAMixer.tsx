import { useState, useCallback } from 'react';
import { cn } from '@/utils/cn';
import { Slider } from '@/components/ui/Slider';
import type { LoRAConfig } from '@/types/generation';
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

// Placeholder LoRA library (backend API not built yet)
const AVAILABLE_LORAS = [
  { name: 'Detail Enhancer', triggerWord: 'detail_enhancer', size: '144 MB' },
  { name: 'Realistic Vision', triggerWord: 'realistic_vision', size: '183 MB' },
  { name: 'Anime Style', triggerWord: 'anime_style', size: '156 MB' },
  { name: 'Film Grain FX', triggerWord: 'film_grain', size: '92 MB' },
  { name: 'Soft Lighting', triggerWord: 'soft_light', size: '128 MB' },
  { name: 'Ink Wash', triggerWord: 'ink_wash', size: '167 MB' },
  { name: 'Pixel Perfect', triggerWord: 'pixel_perfect', size: '110 MB' },
  { name: 'Neon Glow', triggerWord: 'neon_glow', size: '134 MB' },
];

interface LoRAMixerProps {
  configs: LoRAConfig[];
  onChange: (configs: LoRAConfig[]) => void;
}

function SortableLoRACard({
  config,
  onWeightChange,
  onRemove,
}: {
  config: LoRAConfig;
  onWeightChange: (weight: number) => void;
  onRemove: () => void;
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
        <p className="type-badge text-text-muted mb-2">
          {config.triggerWord}
        </p>
        <Slider
          label="Weight"
          value={config.weight}
          min={0}
          max={2}
          step={0.05}
          onChange={onWeightChange}
        />
      </div>
    </div>
  );
}

export function LoRAMixer({ configs, onChange }: LoRAMixerProps) {
  const [showBrowser, setShowBrowser] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isExpanded, setIsExpanded] = useState(configs.length > 0);

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
    (lora: (typeof AVAILABLE_LORAS)[0]) => {
      const newConfig: LoRAConfig = {
        id: crypto.randomUUID(),
        name: lora.name,
        triggerWord: lora.triggerWord,
        weight: 1.0,
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

  const filteredLoRAs = AVAILABLE_LORAS.filter(
    (l) =>
      !searchQuery ||
      l.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      l.triggerWord.toLowerCase().includes(searchQuery.toLowerCase())
  ).filter(
    (l) => !configs.some((c) => c.triggerWord === l.triggerWord)
  );

  if (!isExpanded && configs.length === 0) {
    return (
      <button
        onClick={() => setIsExpanded(true)}
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
                  {filteredLoRAs.map((lora) => (
                    <button
                      key={lora.triggerWord}
                      onClick={() => addLoRA(lora)}
                      className="w-full flex items-center justify-between px-2.5 py-2 rounded-md hover:bg-elevated transition-all text-left"
                    >
                      <div>
                        <p className="text-xs font-medium text-text-primary">
                          {lora.name}
                        </p>
                        <p className="type-badge text-text-muted">
                          {lora.size}
                        </p>
                      </div>
                      <Plus className="w-3.5 h-3.5 text-text-muted" />
                    </button>
                  ))}
                  {filteredLoRAs.length === 0 && (
                    <p className="text-xs text-text-muted text-center py-3">
                      No LoRAs found
                    </p>
                  )}
                </div>

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
