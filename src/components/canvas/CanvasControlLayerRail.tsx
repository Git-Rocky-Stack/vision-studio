import { memo, useCallback, useEffect, useRef, useState, type DragEvent, type KeyboardEvent } from 'react';
import { useShallow } from 'zustand/react/shallow';
import {
  ChevronDown,
  ChevronUp,
  Copy,
  Eye,
  EyeOff,
  GitBranch,
  GripVertical,
  Image as ImageIcon,
  Layers,
  PaintBucket,
  Plus,
  Trash2,
} from 'lucide-react';

import { useAppStore } from '@/store/appStore';
import { selectActiveScene } from '@/store/slices/projectSlice';
import type { CanvasControlLayer, CanvasControlLayerType } from '@/types/project';
import { cn } from '@/utils/cn';
import { EmptyState } from '@/components/ui/EmptyState';

interface CanvasControlLayerRailProps {
  className?: string;
}

const CREATE_OPTIONS: Array<{
  type: CanvasControlLayerType;
  label: string;
  shortLabel: string;
  icon: typeof GitBranch;
}> = [
  { type: 'controlnet', label: 'Add Control Layer', shortLabel: 'Control', icon: GitBranch },
  { type: 'reference-image', label: 'Add Reference Layer', shortLabel: 'Reference', icon: ImageIcon },
  { type: 'inpaint-mask', label: 'Add Inpaint Mask', shortLabel: 'Mask', icon: PaintBucket },
];

/** dataTransfer type carrying a dragged control layer id. */
const LAYER_DRAG_TYPE = 'application/x-vision-control-layer';

/** Layer ids with `layerId` moved to `targetIndex` (clamped). */
export function moveLayerId(layerIds: string[], layerId: string, targetIndex: number): string[] {
  const from = layerIds.indexOf(layerId);
  if (from === -1) return layerIds;
  const next = layerIds.filter((id) => id !== layerId);
  const to = Math.max(0, Math.min(next.length, targetIndex));
  next.splice(to, 0, layerId);
  return next;
}

const ICON_BUTTON =
  'inline-flex h-8 w-8 items-center justify-center rounded-md text-text-body transition-colors hover:bg-elevated hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-text-body';

const LAYER_META: Record<
  CanvasControlLayerType,
  { label: string; icon: typeof GitBranch; accentClassName: string }
> = {
  controlnet: {
    label: 'ControlNet',
    icon: GitBranch,
    accentClassName: 'text-text-primary',
  },
  'reference-image': {
    label: 'Reference',
    icon: ImageIcon,
    accentClassName: 'text-accent-primary',
  },
  'inpaint-mask': {
    label: 'Inpaint Mask',
    icon: PaintBucket,
    accentClassName: 'text-accent-primary',
  },
};

function LayerRow({
  sceneId,
  layer,
  orderIndex,
  layerCount,
  isActive,
  isDropTarget,
  onMove,
  onDragStartLayer,
  onDragOverLayer,
  onDropLayer,
  onDragEndLayer,
}: {
  sceneId: string;
  layer: CanvasControlLayer;
  orderIndex: number;
  layerCount: number;
  isActive: boolean;
  isDropTarget: boolean;
  onMove: (layerId: string, targetIndex: number) => void;
  onDragStartLayer: (layerId: string) => void;
  onDragOverLayer: (layerId: string) => void;
  onDropLayer: (targetIndex: number) => void;
  onDragEndLayer: () => void;
}) {
  const {
    setActiveCanvasControlLayerId,
    setActiveRegionId,
    updateCanvasControlLayer,
    duplicateCanvasControlLayer,
    deleteCanvasControlLayer,
  } = useAppStore(
    useShallow((state) => ({
      setActiveCanvasControlLayerId: state.setActiveCanvasControlLayerId,
      setActiveRegionId: state.setActiveRegionId,
      updateCanvasControlLayer: state.updateCanvasControlLayer,
      duplicateCanvasControlLayer: state.duplicateCanvasControlLayer,
      deleteCanvasControlLayer: state.deleteCanvasControlLayer,
    })),
  );

  const meta = LAYER_META[layer.type];
  const LayerIcon = meta.icon;
  const isFirst = orderIndex === 0;
  const isLast = orderIndex === layerCount - 1;

  // Alt+Arrow moves the layer in the stack (plain arrows stay with the list).
  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === 'ArrowUp' && !isFirst) {
      event.preventDefault();
      onMove(layer.id, orderIndex - 1);
    } else if (event.key === 'ArrowDown' && !isLast) {
      event.preventDefault();
      onMove(layer.id, orderIndex + 1);
    }
  };

  return (
    <div
      data-layer-id={layer.id}
      draggable
      onDragStart={(event: DragEvent<HTMLDivElement>) => {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData(LAYER_DRAG_TYPE, layer.id);
        onDragStartLayer(layer.id);
      }}
      onDragOver={(event: DragEvent<HTMLDivElement>) => {
        if (!event.dataTransfer.types.includes(LAYER_DRAG_TYPE)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        onDragOverLayer(layer.id);
      }}
      onDrop={(event: DragEvent<HTMLDivElement>) => {
        if (!event.dataTransfer.types.includes(LAYER_DRAG_TYPE)) return;
        event.preventDefault();
        onDropLayer(orderIndex);
      }}
      onDragEnd={onDragEndLayer}
      className={cn(
        'rounded-sm border transition',
        isActive ? 'border-accent-primary-border bg-accent-primary-muted shadow-accent-subtle' : 'border-border bg-surface/75',
        isDropTarget && 'border-t-2 border-t-accent-primary',
      )}
    >
      <button
        type="button"
        data-layer-select={layer.id}
        onClick={() => {
          setActiveRegionId(null);
          setActiveCanvasControlLayerId(sceneId, layer.id);
        }}
        onKeyDown={handleKeyDown}
        aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown"
        className={cn(
          'flex w-full items-start gap-3 rounded-md px-3 py-2.5 text-left transition-colors',
          isActive ? 'text-text-primary' : 'text-text-body hover:bg-elevated/70 hover:text-text-primary',
        )}
        aria-pressed={isActive}
        aria-label={`Select ${layer.name}`}
      >
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <GripVertical
            className="mt-2 h-4 w-4 flex-shrink-0 cursor-grab text-text-muted"
            aria-hidden="true"
          />
          <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md border border-border bg-canvas">
            <LayerIcon className={cn('h-4 w-4', meta.accentClassName)} aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="mono-label text-text-muted">
                {String(orderIndex + 1).padStart(2, '0')}
              </span>
              <p className="truncate type-ui text-text-primary">{layer.name}</p>
            </div>
            <p className="mt-1 mono-label text-text-muted">
              {layer.visible ? meta.label : `${meta.label} Hidden`}
            </p>
          </div>
        </div>
      </button>

      <div className="flex items-center justify-end gap-1 border-t border-border/70 px-2 py-1">
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onMove(layer.id, orderIndex - 1);
          }}
          disabled={isFirst}
          className={ICON_BUTTON}
          aria-label={`Move ${layer.name} up`}
          title="Move up (Alt+Up)"
        >
          <ChevronUp className="h-4 w-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onMove(layer.id, orderIndex + 1);
          }}
          disabled={isLast}
          className={ICON_BUTTON}
          aria-label={`Move ${layer.name} down`}
          title="Move down (Alt+Down)"
        >
          <ChevronDown className="h-4 w-4" aria-hidden="true" />
        </button>
        <span className="mr-auto" aria-hidden="true" />
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            updateCanvasControlLayer(sceneId, layer.id, { visible: !layer.visible });
          }}
          className={ICON_BUTTON}
          aria-label={`${layer.visible ? 'Hide' : 'Show'} ${layer.name}`}
          title={layer.visible ? 'Hide layer' : 'Show layer'}
        >
          {layer.visible ? <Eye className="h-4 w-4" aria-hidden="true" /> : <EyeOff className="h-4 w-4" aria-hidden="true" />}
        </button>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            setActiveRegionId(null);
            duplicateCanvasControlLayer(sceneId, layer.id);
          }}
          className={ICON_BUTTON}
          aria-label={`Duplicate ${layer.name}`}
          title="Duplicate layer"
        >
          <Copy className="h-4 w-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            deleteCanvasControlLayer(sceneId, layer.id);
          }}
          className={cn(ICON_BUTTON, 'hover:bg-status-error-muted hover:text-status-error')}
          aria-label={`Delete ${layer.name}`}
          title="Delete layer"
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

export const CanvasControlLayerRail = memo(function CanvasControlLayerRail({
  className,
}: CanvasControlLayerRailProps) {
  const {
    scene,
    createCanvasControlLayer,
    reorderCanvasControlLayers,
    setActiveRegionId,
  } = useAppStore(
    useShallow((state) => ({
      // Resolved in the selector rather than subscribed as `state.projects`.
      // This rail renders inside the Konva canvas subtree, and every project
      // writer rebuilds the `projects` array wholesale, so an array
      // subscription re-rendered the rail on writes to other scenes and other
      // projects. The resolved scene keeps its identity through those writes
      // (see selectActiveScene in projectSlice.ts).
      scene: selectActiveScene(state),
      createCanvasControlLayer: state.createCanvasControlLayer,
      reorderCanvasControlLayers: state.reorderCanvasControlLayers,
      setActiveRegionId: state.setActiveRegionId,
    })),
  );

  const listRef = useRef<HTMLDivElement>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');
  // A keyboard move re-orders the DOM; focus follows the moved layer.
  const [refocusId, setRefocusId] = useState<string | null>(null);

  const sceneId = scene?.id ?? null;
  const layers = scene?.canvasControlLayers;

  const moveLayer = useCallback(
    (layerId: string, targetIndex: number, refocus: boolean) => {
      if (!sceneId || !layers) return;
      const ids = layers.map((layer) => layer.id);
      const next = moveLayerId(ids, layerId, targetIndex);
      if (next.every((id, index) => id === ids[index])) return;
      reorderCanvasControlLayers(sceneId, next);
      const name = layers.find((layer) => layer.id === layerId)?.name ?? 'Layer';
      setAnnouncement(`${name} moved to position ${next.indexOf(layerId) + 1} of ${next.length}`);
      if (refocus) setRefocusId(layerId);
    },
    [layers, reorderCanvasControlLayers, sceneId],
  );

  useEffect(() => {
    if (!refocusId) return;
    const buttons = listRef.current?.querySelectorAll<HTMLButtonElement>('[data-layer-select]') ?? [];
    Array.from(buttons)
      .find((button) => button.dataset.layerSelect === refocusId)
      ?.focus();
    setRefocusId(null);
  }, [refocusId, layers]);

  const endDrag = useCallback(() => {
    setDraggingId(null);
    setDropTargetId(null);
  }, []);

  if (!scene) {
    return null;
  }

  return (
    <aside
      className={cn(
        'pointer-events-auto flex w-72 max-w-[calc(100vw-2rem)] flex-col raised-panel',
        className,
      )}
      aria-label="Canvas control layers"
      data-testid="canvas-control-layer-rail"
    >
      <div className="border-b border-border px-3 py-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="type-section">Canvas Control Layers</p>
            <p className="mt-1 text-xs text-text-muted">
              Select, add, and stage control inputs directly on the canvas.
            </p>
          </div>
          <span className="rounded-full border border-border px-2 py-0.5 mono-label text-text-muted">
            {scene.canvasControlLayers.length}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-1.5 border-b border-border px-3 py-3">
        {CREATE_OPTIONS.map(({ type, label, shortLabel, icon: Icon }) => (
          <button
            key={type}
            type="button"
            onClick={() => {
              setActiveRegionId(null);
              createCanvasControlLayer(scene.id, { type });
            }}
            className="inline-flex flex-col items-center justify-center gap-1 rounded-md border border-border bg-canvas px-2 py-2 text-center text-text-body transition hover:border-border-hover hover:bg-elevated hover:text-text-primary"
            aria-label={label}
            title={label}
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-md border border-border bg-surface">
              <Plus className="h-3 w-3" />
              <Icon className="ml-[-2px] h-3.5 w-3.5" />
            </span>
            <span className="text-xs font-medium leading-tight">{shortLabel}</span>
          </button>
        ))}
      </div>

      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>
      <div
        ref={listRef}
        className="max-h-[min(28rem,calc(100vh-12rem))] space-y-2 overflow-y-auto px-3 py-3"
      >
        {scene.canvasControlLayers.length === 0 ? (
          <EmptyState
            icon={Layers}
            title="No control layers yet"
            description="Start with a ControlNet guide, a reusable reference image, or an inpaint mask."
            className="h-auto"
          />
        ) : (
          scene.canvasControlLayers.map((layer, index) => (
            <LayerRow
              key={layer.id}
              sceneId={scene.id}
              layer={layer}
              orderIndex={index}
              layerCount={scene.canvasControlLayers.length}
              isActive={scene.activeCanvasControlLayerId === layer.id}
              isDropTarget={draggingId !== null && dropTargetId === layer.id && draggingId !== layer.id}
              onMove={(layerId, targetIndex) => moveLayer(layerId, targetIndex, true)}
              onDragStartLayer={setDraggingId}
              onDragOverLayer={setDropTargetId}
              onDropLayer={(targetIndex) => {
                if (draggingId) moveLayer(draggingId, targetIndex, false);
                endDrag();
              }}
              onDragEndLayer={endDrag}
            />
          ))
        )}
      </div>
    </aside>
  );
});
