import { useState } from 'react';
import { cn } from '@/utils/cn';
import { useAppStore } from '@/store/appStore';
import { ImageWithFallback } from '@/components/ui/ImageWithFallback';
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
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  GripVertical,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  Plus,
  Copy,
  Trash2,
  Layers,
} from 'lucide-react';
import type { Layer } from '@/types/editor';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

const BLEND_MODES = [
  'Normal',
  'Multiply',
  'Screen',
  'Overlay',
  'Soft Light',
  'Hard Light',
  'Difference',
];

/* ─── Sortable Layer Row ──────────────────────────────── */

function SortableLayerRow({
  layer,
  isSelected,
  onSelect,
  onToggleVisibility,
  onToggleLock,
  onOpacityChange,
  onBlendModeChange,
  onRename,
}: {
  layer: Layer;
  isSelected: boolean;
  onSelect: () => void;
  onToggleVisibility: () => void;
  onToggleLock: () => void;
  onOpacityChange: (opacity: number) => void;
  onBlendModeChange: (mode: string) => void;
  onRename: (name: string) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(layer.name);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: layer.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const handleDoubleClick = () => {
    setIsEditing(true);
    setEditName(layer.name);
  };

  const handleNameSubmit = () => {
    setIsEditing(false);
    if (editName.trim()) {
      onRename(editName.trim());
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={onSelect}
      className={cn(
        'flex items-center gap-2 px-2 py-1.5 rounded-lg transition-all',
        isDragging && 'opacity-50 z-50',
        isSelected
          ? 'bg-red-aura border-l-2 border-red-primary'
          : 'hover:bg-elevated/50 border-l-2 border-transparent'
      )}
    >
      {/* Drag handle */}
      <button
        {...attributes}
        {...listeners}
        className="p-0.5 text-text-muted hover:text-text-primary cursor-grab active:cursor-grabbing"
      >
        <GripVertical className="w-3 h-3" />
      </button>

      {/* Visibility */}
      <button
        onClick={(e) => { e.stopPropagation(); onToggleVisibility(); }}
        aria-label={layer.visible ? 'Hide layer' : 'Show layer'}
        className="p-0.5 text-text-muted hover:text-text-primary transition-all"
      >
        {layer.visible ? (
          <Eye className="w-3 h-3" />
        ) : (
          <EyeOff className="w-3 h-3 opacity-40" />
        )}
      </button>

      {/* Thumbnail */}
      <div className="w-7 h-7 rounded bg-surface border border-border flex-shrink-0 overflow-hidden">
        {typeof layer.data?.thumbnail === 'string' && layer.data.thumbnail ? (
          <ImageWithFallback
            src={layer.data.thumbnail}
            alt={layer.name}
            className="w-full h-full object-cover"
            fallbackClassName="w-full h-full"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-elevated to-surface" />
        )}
      </div>

      {/* Name + details */}
      <div className="flex-1 min-w-0">
        {isEditing ? (
          <input
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onBlur={handleNameSubmit}
            onKeyDown={(e) => e.key === 'Enter' && handleNameSubmit()}
            className="w-full bg-surface border border-red-primary rounded px-1 py-0.5 text-xs text-text-primary font-display focus:outline-none"
            autoFocus
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <p
            className="text-xs text-text-primary font-display truncate cursor-text"
            onDoubleClick={handleDoubleClick}
          >
            {layer.name}
          </p>
        )}
        <div className="flex items-center gap-2 mt-0.5">
          <span className="font-mono text-micro text-text-muted">
            {Math.round(layer.opacity * 100)}%
          </span>
          <select
            value={layer.blendMode || 'Normal'}
            onChange={(e) => { e.stopPropagation(); onBlendModeChange(e.target.value); }}
            onClick={(e) => e.stopPropagation()}
            className="appearance-none bg-elevated/50 border border-border rounded px-1.5 py-0.5 text-micro text-text-body font-display cursor-pointer focus:outline-none focus:border-red-primary transition-all"
          >
            {BLEND_MODES.map((mode) => (
              <option key={mode} value={mode}>
                {mode}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Lock */}
      <button
        onClick={(e) => { e.stopPropagation(); onToggleLock(); }}
        aria-label={layer.locked ? 'Unlock layer' : 'Lock layer'}
        className="p-0.5 text-text-muted hover:text-text-primary transition-all"
      >
        {layer.locked ? (
          <Lock className="w-3 h-3 text-[var(--color-status-warning)]" />
        ) : (
          <Unlock className="w-3 h-3" />
        )}
      </button>
    </div>
  );
}

/* ─── Layer Panel ─────────────────────────────────────── */

export function LayerPanel() {
  const {
    editLayers,
    addEditLayer,
    updateEditLayer,
    removeEditLayer,
    reorderEditLayers,
  } = useAppStore();

  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = editLayers.findIndex((l) => l.id === active.id);
    const newIndex = editLayers.findIndex((l) => l.id === over.id);
    const reordered = arrayMove(editLayers, oldIndex, newIndex);
    reorderEditLayers(reordered.map((l) => l.id));
  };

  const handleAddLayer = () => {
    addEditLayer({
      id: crypto.randomUUID(),
      name: `Layer ${editLayers.length + 1}`,
      type: 'image',
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: 'Normal',
      data: {},
    });
  };

  const handleDuplicateLayer = () => {
    if (!selectedLayerId) return;
    const source = editLayers.find((l) => l.id === selectedLayerId);
    if (!source) return;
    addEditLayer({
      ...source,
      id: crypto.randomUUID(),
      name: `${source.name} copy`,
      data: { ...source.data },
    });
  };

  const handleDeleteLayer = () => {
    if (!selectedLayerId) return;
    setShowDeleteConfirm(true);
  };

  const confirmDeleteLayer = () => {
    if (!selectedLayerId) return;
    removeEditLayer(selectedLayerId);
    setSelectedLayerId(null);
    setShowDeleteConfirm(false);
  };

  const selectedLayer = editLayers.find((l) => l.id === selectedLayerId);

  return (
    <div className="border-t border-border">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2">
        <div className="flex items-center gap-2">
          <Layers className="w-3.5 h-3.5 text-red-primary" />
          <span className="text-label text-text-primary">Layers</span>
          <span className="font-mono text-micro text-text-muted">
            {editLayers.length}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleAddLayer}
            aria-label="New layer"
            className="p-1 rounded text-text-muted hover:text-text-primary hover:bg-elevated transition-all"
            title="New Layer"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleDuplicateLayer}
            disabled={!selectedLayerId}
            className={cn(
              'p-1 rounded transition-all',
              selectedLayerId
                ? 'text-text-muted hover:text-text-primary hover:bg-elevated'
                : 'text-text-muted/30 cursor-not-allowed'
            )}
            aria-label="Duplicate layer"
            title="Duplicate Layer"
          >
            <Copy className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleDeleteLayer}
            disabled={!selectedLayerId}
            className={cn(
              'p-1 rounded transition-all',
              selectedLayerId
                ? 'text-text-muted hover:text-red-primary hover:bg-red-aura'
                : 'text-text-muted/30 cursor-not-allowed'
            )}
            aria-label={`Remove layer ${editLayers.find((l) => l.id === selectedLayerId)?.name ?? ''}`}
            title="Delete Layer"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Layer List */}
      <div className="max-h-[200px] overflow-y-auto px-1 pb-2 scrollbar-hide">
        {editLayers.length === 0 ? (
          <div className="py-8 text-center">
            <Layers className="w-8 h-8 text-text-muted mx-auto mb-2 opacity-20" />
            <p className="text-xs text-text-muted font-display">No layers</p>
            <p className="text-micro text-text-muted mt-0.5">
              Load an image to start
            </p>
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={editLayers.map((l) => l.id)}
              strategy={verticalListSortingStrategy}
            >
              {editLayers.map((layer) => (
                <SortableLayerRow
                  key={layer.id}
                  layer={layer}
                  isSelected={selectedLayerId === layer.id}
                  onSelect={() => setSelectedLayerId(layer.id)}
                  onToggleVisibility={() =>
                    updateEditLayer(layer.id, { visible: !layer.visible })
                  }
                  onToggleLock={() =>
                    updateEditLayer(layer.id, { locked: !layer.locked })
                  }
                  onOpacityChange={(opacity) =>
                    updateEditLayer(layer.id, { opacity })
                  }
                  onBlendModeChange={(blendMode) =>
                    updateEditLayer(layer.id, { blendMode })
                  }
                  onRename={(name) =>
                    updateEditLayer(layer.id, { name })
                  }
                />
              ))}
            </SortableContext>
          </DndContext>
        )}
      </div>

      <ConfirmDialog
        open={showDeleteConfirm}
        title="Delete Layer"
        message={`Are you sure you want to delete "${selectedLayer?.name ?? 'this layer'}"?`}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={confirmDeleteLayer}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </div>
  );
}
