import { memo, useState, useCallback } from 'react';
import { useAppStore } from '@/store/appStore';
import { cn } from '@/utils/cn';
import { FrameFilmstrip, type FrameItem } from './FrameFilmstrip';
import { KeyframeDiamond } from './KeyframeDiamond';
import { Film } from 'lucide-react';
import type { Keyframe } from '@/types/timeline';

// ---------------------------------------------------------------------------
// AnimationTrackEditor - Layer-based keyframe animation editor
// Renders when timelineMode === 'animation'
// ---------------------------------------------------------------------------

interface TrackLayer {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  color: string;
}

const TRACK_HEIGHT = 36;

export const AnimationTrackEditor = memo(function AnimationTrackEditor({
  className,
}: {
  className?: string;
}) {
  // ── Store selectors ────────────────────────────────────────────────────
  const keyframes = useAppStore((s) => s.keyframes);
  const activeKeyframeId = useAppStore((s) => s.activeKeyframeId);
  const setActiveKeyframeId = useAppStore((s) => s.setActiveKeyframeId);
  const deleteKeyframe = useAppStore((s) => s.deleteKeyframe);
  const currentTime = useAppStore((s) => s.currentTime);
  const seekTo = useAppStore((s) => s.seekTo);

  // ── Derived data ───────────────────────────────────────────────────────

  // Derive layers from unique entity IDs in keyframes
  const layers: TrackLayer[] = (() => {
    const entityIds = [...new Set(keyframes.map((kf) => kf.entityId))];
    const colors = [
      'var(--color-category-youtube)',
      'var(--color-category-art)',
      'var(--color-category-social)',
      'var(--color-category-marketing)',
    ];
    return entityIds.map((id, i) => ({
      id,
      name: id.replace(/[-_]/g, ' '),
      visible: true,
      locked: false,
      color: colors[i % colors.length],
    }));
  })();

  // Derive frame items from keyframes grouped by time
  const frameItems: FrameItem[] = (() => {
    const times = [...new Set(keyframes.map((kf) => kf.time))].sort((a, b) => a - b);
    return times.map((time, i) => ({
      id: `frame-${time}`,
      thumbnail: null,
      label: `Frame ${i + 1}`,
      duration: 100,
    }));
  })();

  const totalDuration = Math.max(
    keyframes.reduce((max, kf) => Math.max(max, kf.time), 0) + 1000,
    5000
  );

  const [activeFrameId, setActiveFrameId] = useState<string | null>(
    frameItems[0]?.id ?? null
  );

  // ── Handlers ───────────────────────────────────────────────────────────

  const handleFrameAdd = useCallback(() => {
    // Placeholder: in full implementation, this would create a new frame
  }, []);

  const handleFrameSelect = useCallback(
    (frameId: string) => {
      setActiveFrameId(frameId);
      const frame = frameItems.find((f) => f.id === frameId);
      if (frame) {
        const timeStr = frame.id.replace('frame-', '');
        const time = parseInt(timeStr, 10);
        if (!isNaN(time)) {
          seekTo(time);
        }
      }
    },
    [frameItems, seekTo]
  );

  // ── Empty state ────────────────────────────────────────────────────────

  if (keyframes.length === 0) {
    return (
      <div className={cn('flex items-center justify-center h-full', className)}>
        <div className="text-center">
          <Film className="w-8 h-8 text-text-muted mx-auto mb-2 opacity-30" />
          <p className="font-display text-sm text-text-muted">No keyframes yet</p>
          <p className="font-display text-xs text-text-muted mt-0.5">
            Add keyframes to layers to animate
          </p>
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
        className="border-b border-border"
      />

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
              <span className="absolute top-0.5 left-0.5 font-mono text-micro text-text-muted">
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
        {layers.map((layer) => {
          const layerKeyframes = keyframes.filter((kf) => kf.entityId === layer.id);
          return (
            <div
              key={layer.id}
              className="flex border-b border-border"
              style={{ height: TRACK_HEIGHT }}
            >
              {/* Layer header */}
              <div className="w-32 flex-shrink-0 flex items-center gap-1 px-2 border-r border-border bg-canvas">
                <div
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: layer.color }}
                />
                <span className="font-display text-xs text-text-body truncate flex-1">
                  {layer.name}
                </span>
              </div>

              {/* Track area with keyframes */}
              <div className="flex-1 relative bg-surface/50">
                {/* Keyframe diamonds */}
                {layerKeyframes.map((kf) => (
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
