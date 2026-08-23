import { memo, useCallback, useMemo } from 'react';
import { Film, Plus, Trash2 } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '@/store/appStore';
import { cn } from '@/utils/cn';
import { FrameFilmstrip, type FrameItem } from './FrameFilmstrip';
import { KeyframeDiamond } from './KeyframeDiamond';
import type { Keyframe, KeyframeInterpolation } from '@/types/timeline';

// ---------------------------------------------------------------------------
// AnimationTrackEditor - Layer-based keyframe animation editor
// Renders when timelineMode === 'animation'
//
// Tracks are derived from the keyframes themselves, one per animated entity.
// A track's label resolves through the edit-layer list so it reads as the
// layer's real name; only an entity with no matching layer falls back to a
// de-slugged id. Frame durations are the measured gap to the next keyframe -
// never a fixed number - so the filmstrip reports the animation as it is.
// ---------------------------------------------------------------------------

const TRACK_HEIGHT = 36;
/** Trailing room after the last keyframe so it is not flush against the edge. */
const TRAIL_MS = 1000;
/** Shortest timeline the ruler will draw, so a single keyframe still has scale. */
const MIN_TIMELINE_MS = 5000;
/** Duration attributed to the final frame, which has no following keyframe. */
const FINAL_FRAME_MS = TRAIL_MS;
/** Default opacity value a newly-added layer keyframe holds. */
const DEFAULT_KEYFRAME_VALUE = 1;

const TRACK_COLORS = [
  'var(--color-category-youtube)',
  'var(--color-category-art)',
  'var(--color-category-social)',
  'var(--color-category-marketing)',
] as const;

const INTERPOLATION_OPTIONS: { value: KeyframeInterpolation; label: string }[] = [
  { value: 'linear', label: 'Linear' },
  { value: 'ease-in', label: 'Ease In' },
  { value: 'ease-out', label: 'Ease Out' },
  { value: 'ease-in-out', label: 'Ease In Out' },
];

const EASED = new Set<KeyframeInterpolation>(['ease-in', 'ease-out', 'ease-in-out']);

interface TrackLayer {
  id: string;
  name: string;
  color: string;
}

export const AnimationTrackEditor = memo(function AnimationTrackEditor({
  className,
}: {
  className?: string;
}) {
  const {
    keyframes,
    activeKeyframeId,
    setActiveKeyframeId,
    addKeyframe,
    updateKeyframe,
    deleteKeyframe,
    currentTime,
    seekTo,
    editLayers,
    selectedEditLayerId,
  } = useAppStore(
    useShallow((s) => ({
      keyframes: s.keyframes,
      activeKeyframeId: s.activeKeyframeId,
      setActiveKeyframeId: s.setActiveKeyframeId,
      addKeyframe: s.addKeyframe,
      updateKeyframe: s.updateKeyframe,
      deleteKeyframe: s.deleteKeyframe,
      currentTime: s.currentTime,
      seekTo: s.seekTo,
      editLayers: s.editLayers,
      selectedEditLayerId: s.selectedEditLayerId,
    })),
  );

  // ── Derived data ───────────────────────────────────────────────────────

  const layerNames = useMemo(
    () => new Map(editLayers.map((layer) => [layer.id, layer.name])),
    [editLayers],
  );

  const tracks: TrackLayer[] = useMemo(() => {
    const entityIds = [...new Set(keyframes.map((kf) => kf.entityId))];
    return entityIds.map((id, i) => ({
      id,
      name: layerNames.get(id) ?? id.replace(/[-_]/g, ' '),
      color: TRACK_COLORS[i % TRACK_COLORS.length],
    }));
  }, [keyframes, layerNames]);

  const times = useMemo(
    () => [...new Set(keyframes.map((kf) => kf.time))].sort((a, b) => a - b),
    [keyframes],
  );

  /**
   * One filmstrip entry per distinct keyframe time. `duration` is the real gap
   * to the next keyframe; the last frame is credited the trailing window.
   */
  const frameItems: FrameItem[] = useMemo(
    () =>
      times.map((time, i) => ({
        id: `frame-${time}`,
        thumbnail: null,
        label: `Frame ${i + 1}`,
        duration: i < times.length - 1 ? times[i + 1] - time : FINAL_FRAME_MS,
      })),
    [times],
  );

  const totalDuration = Math.max((times[times.length - 1] ?? 0) + TRAIL_MS, MIN_TIMELINE_MS);

  // The active frame follows the playhead: the last frame at or before it.
  const activeFrameId = useMemo(() => {
    let current: number | null = null;
    for (const time of times) {
      if (time <= currentTime) current = time;
      else break;
    }
    return current === null ? (times.length > 0 ? `frame-${times[0]}` : null) : `frame-${current}`;
  }, [times, currentTime]);

  const selectedKeyframe: Keyframe | null =
    keyframes.find((kf) => kf.id === activeKeyframeId) ?? null;

  const targetLayerId = selectedEditLayerId ?? tracks[0]?.id ?? null;
  const canAddKeyframe = Boolean(targetLayerId);

  // ── Handlers ───────────────────────────────────────────────────────────

  /**
   * Add a keyframe at the playhead for the selected edit layer. A layer already
   * keyed at this exact time is left alone - re-keying the same instant would
   * silently create an unreachable duplicate.
   */
  const handleFrameAdd = useCallback(() => {
    if (!targetLayerId) return;
    const exists = keyframes.some(
      (kf) => kf.entityId === targetLayerId && kf.time === currentTime,
    );
    if (exists) return;

    const keyframe: Keyframe = {
      id: crypto.randomUUID(),
      entityId: targetLayerId,
      entityType: 'layer',
      property: 'opacity',
      time: currentTime,
      value: DEFAULT_KEYFRAME_VALUE,
      interpolation: 'linear',
      easingStrength: 0.5,
    };
    addKeyframe(keyframe);
    setActiveKeyframeId(keyframe.id);
  }, [targetLayerId, keyframes, currentTime, addKeyframe, setActiveKeyframeId]);

  const handleFrameSelect = useCallback(
    (frameId: string) => {
      const time = Number.parseInt(frameId.replace('frame-', ''), 10);
      if (Number.isNaN(time)) return;
      seekTo(time);
      // Selecting a frame selects the keyframe sitting on it, so the inspector
      // always describes what the filmstrip is pointing at.
      const first = keyframes.find((kf) => kf.time === time);
      setActiveKeyframeId(first?.id ?? null);
    },
    [keyframes, seekTo, setActiveKeyframeId],
  );

  const handleDeleteKeyframe = useCallback(() => {
    if (!selectedKeyframe) return;
    deleteKeyframe(selectedKeyframe.id);
    setActiveKeyframeId(null);
  }, [selectedKeyframe, deleteKeyframe, setActiveKeyframeId]);

  const addButtonTitle = canAddKeyframe
    ? 'Add a keyframe at the playhead for the selected layer'
    : 'Select a layer in the Layers panel to key it';

  // ── Empty state ────────────────────────────────────────────────────────

  if (keyframes.length === 0) {
    return (
      <div className={cn('flex items-center justify-center h-full', className)}>
        <div className="text-center">
          <Film className="w-8 h-8 text-text-muted mx-auto mb-2 opacity-30" aria-hidden="true" />
          <p className="text-sm text-text-muted">No keyframes yet</p>
          <p className="text-xs text-text-muted mt-0.5">
            {canAddKeyframe
              ? 'Add a keyframe at the playhead to start animating'
              : 'Select a layer in the Layers panel to start animating'}
          </p>
          <button
            type="button"
            onClick={handleFrameAdd}
            disabled={!canAddKeyframe}
            title={addButtonTitle}
            className={cn(
              'mt-3 inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5',
              'text-xs text-text-body transition',
              canAddKeyframe
                ? 'hover:border-border-hover hover:bg-elevated hover:text-text-primary'
                : 'cursor-not-allowed opacity-50',
            )}
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            Add keyframe
          </button>
        </div>
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Frame filmstrip */}
      <FrameFilmstrip
        frames={frameItems}
        activeFrameId={activeFrameId}
        onFrameSelect={handleFrameSelect}
        onFrameAdd={handleFrameAdd}
        addLabel="Add keyframe"
        addDisabled={!canAddKeyframe}
        addTitle={addButtonTitle}
        className="border-b border-border"
      />

      {/* Keyframe inspector - only present once a keyframe is selected */}
      {selectedKeyframe && (
        <div className="flex flex-wrap items-center gap-3 border-b border-border bg-canvas px-2 py-1.5">
          <span className="type-micro text-text-muted">
            {layerNames.get(selectedKeyframe.entityId) ?? selectedKeyframe.entityId} /{' '}
            {selectedKeyframe.property}
          </span>

          <label htmlFor="keyframe-interpolation" className="sr-only">
            Interpolation
          </label>
          <select
            id="keyframe-interpolation"
            aria-label="Interpolation"
            value={selectedKeyframe.interpolation}
            onChange={(e) =>
              updateKeyframe(selectedKeyframe.id, {
                interpolation: e.target.value as KeyframeInterpolation,
              })
            }
            className="rounded-md border border-border bg-surface px-1.5 py-0.5 type-micro text-text-primary"
          >
            {INTERPOLATION_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>

          {EASED.has(selectedKeyframe.interpolation) && (
            <>
              <label htmlFor="keyframe-easing" className="type-micro text-text-muted">
                Easing
              </label>
              <input
                id="keyframe-easing"
                type="range"
                min={10}
                max={100}
                step={5}
                value={Math.round(selectedKeyframe.easingStrength * 100)}
                onChange={(e) => {
                  const next = Number.parseInt(e.target.value, 10);
                  if (Number.isFinite(next)) {
                    updateKeyframe(selectedKeyframe.id, { easingStrength: next / 100 });
                  }
                }}
                aria-label="Easing strength"
                className="w-20"
              />
            </>
          )}

          <button
            type="button"
            onClick={handleDeleteKeyframe}
            aria-label="Delete keyframe"
            title="Delete keyframe"
            className="ml-auto rounded-md p-1 text-text-muted transition hover:bg-surface hover:text-status-error"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      )}

      {/* Time ruler */}
      <div className="h-6 border-b border-border bg-canvas relative">
        {Array.from({ length: Math.ceil(totalDuration / 1000) + 1 }).map((_, i) => {
          const time = i * 1000;
          const left = (time / totalDuration) * 100;
          return (
            <div
              key={time}
              className="absolute top-0 h-full flex items-end"
              style={{ left: `${left}%` }}
            >
              <div className="w-px h-3 bg-text-muted/20" />
              <span className="absolute top-0.5 left-0.5 type-badge text-text-muted">
                {time / 1000}s
              </span>
            </div>
          );
        })}
        {/* Playhead */}
        <div
          className="absolute top-0 bottom-0 w-px bg-accent-primary z-20"
          style={{ left: `${(currentTime / totalDuration) * 100}%` }}
        />
      </div>

      {/* Track rows */}
      <div className="flex-1 overflow-y-auto scrollbar-hide">
        {tracks.map((track) => {
          const trackKeyframes = keyframes.filter((kf) => kf.entityId === track.id);
          return (
            <div
              key={track.id}
              className="flex border-b border-border"
              style={{ height: TRACK_HEIGHT }}
            >
              {/* Track header */}
              <div className="w-32 flex-shrink-0 flex items-center gap-1 px-2 border-r border-border bg-canvas">
                <div
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: track.color }}
                  aria-hidden="true"
                />
                <span className="text-xs text-text-body truncate flex-1" title={track.name}>
                  {track.name}
                </span>
              </div>

              {/* Track area with keyframes */}
              <div className="flex-1 relative bg-surface/50">
                {trackKeyframes.map((kf) => (
                  <KeyframeDiamond
                    key={kf.id}
                    time={kf.time}
                    totalDuration={totalDuration}
                    trackHeight={TRACK_HEIGHT}
                    interpolation={kf.interpolation}
                    isSelected={activeKeyframeId === kf.id}
                    onSelect={() => setActiveKeyframeId(kf.id)}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
});
