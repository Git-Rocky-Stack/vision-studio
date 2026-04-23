import { memo, useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import {
  Copy,
  Eye,
  EyeOff,
  GitBranch,
  Image as ImageIcon,
  PaintBucket,
  Plus,
  Trash2,
} from 'lucide-react';

import { useAppStore } from '@/store/appStore';
import type { CanvasControlLayer, CanvasControlLayerType } from '@/types/project';
import { cn } from '@/utils/cn';

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
    accentClassName: 'text-red-primary',
  },
};

function findActiveScene(
  projects: ReturnType<typeof useAppStore.getState>['projects'],
  activeProjectId: string | null,
  activeSceneId: string | null,
) {
  if (!activeProjectId || !activeSceneId) {
    return null;
  }

  return (
    projects.find((project) => project.id === activeProjectId)?.scenes.find((scene) => scene.id === activeSceneId) ??
    null
  );
}

function LayerRow({
  sceneId,
  layer,
  orderIndex,
  isActive,
}: {
  sceneId: string;
  layer: CanvasControlLayer;
  orderIndex: number;
  isActive: boolean;
}) {
  const {
    setActiveCanvasControlLayerId,
    updateCanvasControlLayer,
    duplicateCanvasControlLayer,
    deleteCanvasControlLayer,
  } = useAppStore(
    useShallow((state) => ({
      setActiveCanvasControlLayerId: state.setActiveCanvasControlLayerId,
      updateCanvasControlLayer: state.updateCanvasControlLayer,
      duplicateCanvasControlLayer: state.duplicateCanvasControlLayer,
      deleteCanvasControlLayer: state.deleteCanvasControlLayer,
    })),
  );

  const meta = LAYER_META[layer.type];
  const LayerIcon = meta.icon;

  return (
    <div
      className={cn(
        'rounded-xl border transition-all',
        isActive ? 'border-accent-primary-border bg-accent-primary-muted shadow-accent-subtle' : 'border-border bg-surface/75',
      )}
    >
      <button
        type="button"
        onClick={() => setActiveCanvasControlLayerId(sceneId, layer.id)}
        className={cn(
          'flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-colors',
          isActive ? 'text-text-primary' : 'text-text-body hover:bg-elevated/70 hover:text-text-primary',
        )}
        aria-pressed={isActive}
        aria-label={`Select ${layer.name}`}
      >
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border border-border bg-canvas">
            <LayerIcon className={cn('h-4 w-4', meta.accentClassName)} aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-text-muted">
                {String(orderIndex + 1).padStart(2, '0')}
              </span>
              <p className="truncate type-ui text-text-primary">{layer.name}</p>
            </div>
            <p className="mt-1 text-[11px] uppercase tracking-[0.14em] text-text-muted">
              {layer.visible ? meta.label : `${meta.label} Hidden`}
            </p>
          </div>
        </div>
      </button>

      <div className="flex items-center justify-end gap-1 border-t border-border/70 px-2 py-1.5">
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            updateCanvasControlLayer(sceneId, layer.id, { visible: !layer.visible });
          }}
          className="rounded-md p-1.5 text-text-body transition-colors hover:bg-elevated hover:text-text-primary"
          aria-label={`${layer.visible ? 'Hide' : 'Show'} ${layer.name}`}
          title={layer.visible ? 'Hide layer' : 'Show layer'}
        >
          {layer.visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
        </button>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            duplicateCanvasControlLayer(sceneId, layer.id);
          }}
          className="rounded-md p-1.5 text-text-body transition-colors hover:bg-elevated hover:text-text-primary"
          aria-label={`Duplicate ${layer.name}`}
          title="Duplicate layer"
        >
          <Copy className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            deleteCanvasControlLayer(sceneId, layer.id);
          }}
          className="rounded-md p-1.5 text-text-body transition-colors hover:bg-elevated hover:text-red-primary"
          aria-label={`Delete ${layer.name}`}
          title="Delete layer"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

export const CanvasControlLayerRail = memo(function CanvasControlLayerRail({
  className,
}: CanvasControlLayerRailProps) {
  const { projects, activeProjectId, activeSceneId, createCanvasControlLayer } = useAppStore(
    useShallow((state) => ({
      projects: state.projects,
      activeProjectId: state.activeProjectId,
      activeSceneId: state.activeSceneId,
      createCanvasControlLayer: state.createCanvasControlLayer,
    })),
  );

  const scene = useMemo(
    () => findActiveScene(projects, activeProjectId, activeSceneId),
    [projects, activeProjectId, activeSceneId],
  );

  if (!scene) {
    return null;
  }

  return (
    <aside
      className={cn(
        'pointer-events-auto flex w-72 max-w-[calc(100vw-2rem)] flex-col rounded-2xl border border-border bg-surface/92 shadow-cinematic backdrop-blur-sm',
        className,
      )}
      aria-label="Canvas control layers"
      data-testid="canvas-control-layer-rail"
    >
      <div className="border-b border-border px-3 py-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="font-display text-sm font-semibold text-text-primary">Canvas Control Layers</p>
            <p className="mt-1 text-xs text-text-muted">
              Select, add, and stage control inputs directly on the canvas.
            </p>
          </div>
          <span className="rounded-full border border-border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.18em] text-text-muted">
            {scene.canvasControlLayers.length}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-1.5 border-b border-border px-3 py-3">
        {CREATE_OPTIONS.map(({ type, label, shortLabel, icon: Icon }) => (
          <button
            key={type}
            type="button"
            onClick={() => createCanvasControlLayer(scene.id, { type })}
            className="inline-flex flex-col items-center justify-center gap-1 rounded-xl border border-border bg-canvas px-2 py-2 text-center text-text-body transition-all hover:border-border-hover hover:bg-elevated hover:text-text-primary"
            aria-label={label}
            title={label}
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-border bg-surface">
              <Plus className="h-3 w-3" />
              <Icon className="ml-[-2px] h-3.5 w-3.5" />
            </span>
            <span className="text-[11px] font-medium leading-tight">{shortLabel}</span>
          </button>
        ))}
      </div>

      <div className="max-h-[min(28rem,calc(100vh-12rem))] space-y-2 overflow-y-auto px-3 py-3">
        {scene.canvasControlLayers.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border px-4 py-6 text-center">
            <p className="type-ui text-text-primary">No control layers yet</p>
            <p className="mt-1 text-xs text-text-muted">
              Start with a ControlNet guide, a reusable reference image, or an inpaint mask.
            </p>
          </div>
        ) : (
          scene.canvasControlLayers.map((layer, index) => (
            <LayerRow
              key={layer.id}
              sceneId={scene.id}
              layer={layer}
              orderIndex={index}
              isActive={scene.activeCanvasControlLayerId === layer.id}
            />
          ))
        )}
      </div>
    </aside>
  );
});
