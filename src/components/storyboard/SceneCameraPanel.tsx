import { memo, useMemo, useState } from 'react';
import { Camera, Plus, Trash2 } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '@/store/appStore';
import { CameraKeyframeEditor } from '@/components/timeline/CameraKeyframeEditor';
import { cn } from '@/utils/cn';
import type { CameraKeyframe } from '@/types/project';

/**
 * Camera moves for one storyboard scene.
 *
 * `Scene.camera` has always been part of the model - StoryboardPlayback badges a
 * scene "CAM" once it holds keyframes - but nothing could author them, so the
 * badge could never appear. This panel is the authoring surface: it owns
 * add/select/delete and delegates the per-keyframe values to
 * {@link CameraKeyframeEditor}.
 */

/** Spacing applied when appending a keyframe after the last one. */
const KEYFRAME_STEP_MS = 1000;

/** A new keyframe rests at the neutral camera: no pan, no zoom, no rotation. */
function neutralKeyframe(timeMs: number): CameraKeyframe {
  return {
    id: crypto.randomUUID(),
    time: timeMs,
    pan: { x: 0, y: 0 },
    zoom: 1,
    rotation: 0,
    interpolation: 'linear',
    easingStrength: 0.5,
  };
}

interface SceneCameraPanelProps {
  projectId: string;
  sceneId: string;
  className?: string;
}

export const SceneCameraPanel = memo(function SceneCameraPanel({
  projectId,
  sceneId,
  className,
}: SceneCameraPanelProps) {
  const { projects, updateScene } = useAppStore(
    useShallow((s) => ({ projects: s.projects, updateScene: s.updateScene })),
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const scene = projects
    .find((p) => p.id === projectId)
    ?.scenes.find((s) => s.id === sceneId);

  // Always presented in playback order, whatever order the array happens to hold.
  const keyframes = useMemo(
    () => [...(scene?.camera ?? [])].sort((a, b) => a.time - b.time),
    [scene?.camera],
  );

  if (!scene) return null;

  const selected = keyframes.find((kf) => kf.id === selectedId) ?? keyframes[0] ?? null;

  const commit = (next: CameraKeyframe[]) => {
    updateScene(projectId, sceneId, { camera: next });
  };

  const handleAdd = () => {
    const last = keyframes[keyframes.length - 1];
    const keyframe = neutralKeyframe(last ? last.time + KEYFRAME_STEP_MS : 0);
    commit([...keyframes, keyframe]);
    setSelectedId(keyframe.id);
  };

  const handleChange = (updates: Partial<CameraKeyframe>) => {
    if (!selected) return;
    commit(keyframes.map((kf) => (kf.id === selected.id ? { ...kf, ...updates } : kf)));
  };

  const handleDelete = (id: string) => {
    commit(keyframes.filter((kf) => kf.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  return (
    <div className={cn('rounded-md border border-border bg-surface p-3', className)}>
      <div className="flex items-center gap-2">
        <Camera className="h-4 w-4 text-text-muted" aria-hidden="true" />
        <h3 className="type-ui flex-1 font-semibold text-text-primary">Camera moves</h3>
        <button
          type="button"
          onClick={handleAdd}
          aria-label="Add camera keyframe"
          className={cn(
            'inline-flex items-center gap-1 rounded-md border border-border px-2 py-1',
            'type-micro text-text-body transition hover:border-border-hover hover:bg-elevated hover:text-text-primary',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/40',
          )}
        >
          <Plus className="h-3 w-3" aria-hidden="true" />
          Add
        </button>
      </div>

      {keyframes.length === 0 ? (
        <p className="mt-2 type-caption text-text-muted">
          No camera moves on this scene. Add a keyframe to pan, zoom or rotate across the shot.
        </p>
      ) : (
        <>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {keyframes.map((kf, i) => {
              const isSelected = selected?.id === kf.id;
              const timeLabel = `${(kf.time / 1000).toFixed(1)}s`;
              return (
                <li key={kf.id} className="flex items-center">
                  <button
                    type="button"
                    onClick={() => setSelectedId(kf.id)}
                    aria-label={`Camera keyframe ${i + 1} at ${timeLabel}`}
                    aria-pressed={isSelected}
                    className={cn(
                      'rounded-l-md border px-2 py-0.5 data-mono transition',
                      isSelected
                        ? 'border-accent-primary-border bg-accent-primary-muted text-accent-primary'
                        : 'border-border bg-canvas text-text-muted hover:text-text-body',
                    )}
                  >
                    {timeLabel}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(kf.id)}
                    aria-label={`Delete camera keyframe ${i + 1}`}
                    className="rounded-r-md border border-l-0 border-border bg-canvas px-1.5 py-0.5 text-text-muted transition hover:text-status-error"
                  >
                    <Trash2 className="h-3 w-3" aria-hidden="true" />
                  </button>
                </li>
              );
            })}
          </ul>

          {selected && (
            <div className="mt-3 border-t border-border pt-3">
              <CameraKeyframeEditor keyframe={selected} onChange={handleChange} />
            </div>
          )}
        </>
      )}
    </div>
  );
});
