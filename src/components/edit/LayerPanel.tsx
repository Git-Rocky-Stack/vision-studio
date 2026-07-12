import { useState } from 'react';
import { cn } from '@/utils/cn';
import { useAppStore } from '@/store/appStore';
import { useShallow } from 'zustand/react/shallow';
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
  Type,
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
  onOpacityChange: _onOpacityChange,
  onBlendModeChange,
  onRename,
  onMoveUp,
  onMoveDown,
  canMoveUp,
  canMoveDown,
}: {
  layer: Layer;
  isSelected: boolean;
  onSelect: () => void;
  onToggleVisibility: () => void;
  onToggleLock: () => void;
  onOpacityChange: (opacity: number) => void;
  onBlendModeChange: (mode: string) => void;
  onRename: (name: string) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
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

  const handleReorderKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowUp' && canMoveUp) {
      event.preventDefault();
      event.stopPropagation();
      onMoveUp();
    }

    if (event.key === 'ArrowDown' && canMoveDown) {
      event.preventDefault();
      event.stopPropagation();
      onMoveDown();
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={onSelect}
      className={cn(
        'flex items-center gap-2 px-2 py-1.5 rounded-md transition-all',
        isDragging && 'opacity-50 z-50',
        isSelected
          ? 'bg-accent-primary-muted border-l-2 border-accent-primary'
          : 'hover:bg-elevated/50 border-l-2 border-transparent'
      )}
    >
      {/* Drag handle */}
      <button
        {...attributes}
        {...listeners}
        onKeyDown={handleReorderKeyDown}
        aria-label={`Reorder ${layer.name}. Use Arrow Up or Arrow Down to move the layer.`}
        aria-keyshortcuts="ArrowUp ArrowDown"
        className="p-0.5 min-w-[44px] min-h-[44px] text-text-muted hover:text-text-primary cursor-grab active:cursor-grabbing"
      >
        <GripVertical className="w-3 h-3" />
      </button>

      {/* Visibility */}
      <button
        onClick={(e) => { e.stopPropagation(); onToggleVisibility(); }}
        aria-label={layer.visible ? 'Hide layer' : 'Show layer'}
        className="p-0.5 min-w-[44px] min-h-[44px] text-text-muted hover:text-text-primary transition-all"
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
        ) : layer.type === 'text' ? (
          <div className="w-full h-full flex items-center justify-center bg-elevated">
            <Type className="w-3 h-3 text-text-muted" />
          </div>
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
            className="w-full bg-surface border border-accent-primary rounded px-1 py-0.5 text-xs text-text-primary focus:outline-none"
            autoFocus
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <p
            className="text-xs text-text-primary truncate cursor-text"
            onDoubleClick={handleDoubleClick}
          >
            {layer.name}
          </p>
        )}
        <div className="flex items-center gap-2 mt-0.5">
          <span className="data-mono text-text-muted">
            {Math.round(layer.opacity * 100)}%
          </span>
          <select
            value={layer.blendMode || 'Normal'}
            onChange={(e) => { e.stopPropagation(); onBlendModeChange(e.target.value); }}
            onClick={(e) => e.stopPropagation()}
            className="appearance-none bg-elevated/50 border border-border rounded px-1.5 py-0.5 text-xs text-text-body cursor-pointer focus:outline-none focus:border-accent-primary transition-all"
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
        className="p-0.5 min-w-[44px] min-h-[44px] text-text-muted hover:text-text-primary transition-all"
      >
        {layer.locked ? (
          <Lock className="w-3 h-3 text-status-warning" />
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
    selectedLayerId,
    setSelectedLayerId,
    addEditLayer,
    updateEditLayer,
    removeEditLayer,
    reorderEditLayers,
  } = useAppStore(
    useShallow((s) => ({
      editLayers: s.editLayers,
      // #32: selection is shared with EditCanvas and TextControls.
      selectedLayerId: s.selectedEditLayerId,
      setSelectedLayerId: s.setSelectedEditLayerId,
      addEditLayer: s.addEditLayer,
      updateEditLayer: s.updateEditLayer,
      removeEditLayer: s.removeEditLayer,
      reorderEditLayers: s.reorderEditLayers,
    }))
  );

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

  const handleMoveLayer = (layerId: string, offset: -1 | 1) => {
    const oldIndex = editLayers.findIndex((layer) => layer.id === layerId);
    const newIndex = oldIndex + offset;
    if (oldIndex < 0 || newIndex < 0 || newIndex >= editLayers.length) return;

    const reordered = arrayMove(editLayers, oldIndex, newIndex);
    reorderEditLayers(reordered.map((layer) => layer.id));
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
    // removeEditLayer clears the shared selection for the removed layer (#32).
    removeEditLayer(selectedLayerId);
    setShowDeleteConfirm(false);
  };

  const selectedLayer = editLayers.find((l) => l.id === selectedLayerId);

  return (
    <div className="border-t border-border">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2">
        <div className="flex items-center gap-2">
          <Layers className="w-3.5 h-3.5 text-accent-primary" />
          <span className="text-label text-text-primary">Layers</span>
          <span className="data-mono text-text-muted">
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
                ? 'text-text-muted hover:text-status-error hover:bg-status-error-muted'
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
            <p className="text-xs text-text-muted">No layers</p>
            <p className="type-caption mt-0.5">
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
              {editLayers.map((layer, index) => (
                <SortableLayerRow
                  key={layer.id}
                  layer={layer}
                  isSelected={selectedLayerId === layer.id}
                  onSelect={() => setSelectedLayerId(layer.id)}
                  onMoveUp={() => handleMoveLayer(layer.id, -1)}
                  onMoveDown={() => handleMoveLayer(layer.id, 1)}
                  canMoveUp={index > 0}
                  canMoveDown={index < editLayers.length - 1}
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
