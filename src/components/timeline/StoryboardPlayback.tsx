import { memo, useMemo, useCallback } from 'react';
import { useAppStore } from '@/store/appStore';
import { cn } from '@/utils/cn';
import { Play, Pause, SkipBack, SkipForward, Repeat, ChevronRight } from 'lucide-react';

// ---------------------------------------------------------------------------
// StoryboardPlayback - Scene-based timeline view with playback controls
// Renders when timelineMode === 'storyboard'
// ---------------------------------------------------------------------------

interface StoryboardPlaybackProps {
  className?: string;
}

export const StoryboardPlayback = memo(function StoryboardPlayback({
  className,
}: StoryboardPlaybackProps) {
  // ── Store selectors ────────────────────────────────────────────────────
  const projects = useAppStore((s) => s.projects);
  const activeProjectId = useAppStore((s) => s.activeProjectId);
  const setActiveScene = useAppStore((s) => s.setActiveScene);
  const playState = useAppStore((s) => s.playState);
  const currentTime = useAppStore((s) => s.currentTime);
  const timelineLoop = useAppStore((s) => s.timelineLoop);
  const timelineSpeed = useAppStore((s) => s.timelineSpeed);
  const timelinePlay = useAppStore((s) => s.timelinePlay);
  const timelinePause = useAppStore((s) => s.timelinePause);
  const timelineStop = useAppStore((s) => s.timelineStop);
  const seekTo = useAppStore((s) => s.seekTo);
  const toggleTimelineLoop = useAppStore((s) => s.toggleTimelineLoop);
  const setTimelineSpeed = useAppStore((s) => s.setTimelineSpeed);

  // ── Derived data ───────────────────────────────────────────────────────
  const activeProject = projects.find((p) => p.id === activeProjectId);
  const scenes = useMemo(
    () => (activeProject?.scenes ?? []).sort((a, b) => a.orderIndex - b.orderIndex),
    [activeProject?.scenes]
  );

  // Index of the scene the playhead is currently over
  const currentSceneIndex = useMemo(() => {
    let accumulated = 0;
    for (let i = 0; i < scenes.length; i++) {
      const sceneDuration = scenes[i].metadata?.duration || 2000;
      if (currentTime < accumulated + sceneDuration) return i;
      accumulated += sceneDuration;
    }
    return scenes.length - 1;
  }, [currentTime, scenes]);

  // ── Handlers ───────────────────────────────────────────────────────────

  const handleSceneClick = useCallback(
    (sceneId: string, index: number) => {
      setActiveScene(sceneId);
      let seekTime = 0;
      for (let i = 0; i < index; i++) {
        seekTime += scenes[i].metadata?.duration || 2000;
      }
      seekTo(seekTime);
    },
    [scenes, setActiveScene, seekTo]
  );

  const handleStepForward = useCallback(() => {
    const nextIdx = Math.min(currentSceneIndex + 1, scenes.length - 1);
    if (nextIdx !== currentSceneIndex) {
      handleSceneClick(scenes[nextIdx].id, nextIdx);
    }
  }, [currentSceneIndex, scenes, handleSceneClick]);

  const handleStepBack = useCallback(() => {
    const prevIdx = Math.max(currentSceneIndex - 1, 0);
    if (prevIdx !== currentSceneIndex) {
      handleSceneClick(scenes[prevIdx].id, prevIdx);
    }
  }, [currentSceneIndex, scenes, handleSceneClick]);

  // ── Empty state ────────────────────────────────────────────────────────

  if (scenes.length === 0) {
    return (
      <div className={cn('flex items-center justify-center h-full', className)}>
        <div className="text-center">
          <p className="text-sm text-text-muted">No scenes yet</p>
          <p className="text-xs text-text-muted mt-0.5">
            Add scenes to your project to use storyboard playback
          </p>
        </div>
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* ── Transport bar ────────────────────────────────────────────────── */}
      <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-border bg-elevated/50 flex-shrink-0">
        {/* Step back */}
        <button
          onClick={handleStepBack}
          className="p-1 rounded-md text-text-body hover:text-text-primary hover:bg-surface transition-all"
          aria-label="Previous scene"
          title="Previous scene"
        >
          <SkipBack className="w-3.5 h-3.5" />
        </button>

        {/* Play / Pause */}
        <button
          onClick={() => {
            if (playState === 'playing') timelinePause();
            else timelinePlay();
          }}
          className={cn(
            'p-1.5 rounded-md transition-all',
            playState === 'playing'
              ? 'bg-accent-primary text-void shadow-accent-subtle'
              : 'bg-accent-primary-muted text-accent-primary border border-accent-primary-border'
          )}
          aria-label={playState === 'playing' ? 'Pause' : 'Play'}
          aria-pressed={playState === 'playing'}
        >
          {playState === 'playing' ? (
            <Pause className="w-3.5 h-3.5" />
          ) : (
            <Play className="w-3.5 h-3.5" />
          )}
        </button>

        {/* Step forward */}
        <button
          onClick={handleStepForward}
          className="p-1 rounded-md text-text-body hover:text-text-primary hover:bg-surface transition-all"
          aria-label="Next scene"
          title="Next scene"
        >
          <SkipForward className="w-3.5 h-3.5" />
        </button>

        {/* Stop */}
        <button
          onClick={() => timelineStop()}
          className="p-1 rounded-md text-text-body hover:text-text-primary hover:bg-surface transition-all"
          aria-label="Stop"
          title="Stop"
        >
          <SkipBack className="w-3.5 h-3.5" />
        </button>

        <div className="w-px h-4 bg-border mx-0.5" />

        {/* Loop toggle */}
        <button
          onClick={toggleTimelineLoop}
          className={cn(
            'p-1 rounded-md transition-all',
            timelineLoop
              ? 'text-accent-primary'
              : 'text-text-muted hover:text-text-body'
          )}
          aria-label="Toggle loop"
          aria-pressed={timelineLoop}
          title="Loop"
        >
          <Repeat className="w-3.5 h-3.5" />
        </button>

        <div className="w-px h-4 bg-border mx-0.5" />

        {/* Speed control */}
        <div className="flex items-center gap-1">
          {[0.5, 1, 2].map((speed) => (
            <button
              key={speed}
              onClick={() => setTimelineSpeed(speed)}
              className={cn(
                'px-1.5 py-0.5 rounded data-mono transition-all',
                timelineSpeed === speed
                  ? 'bg-accent-primary-muted text-accent-primary'
                  : 'text-text-muted hover:text-text-body'
              )}
              aria-label={`Speed ${speed}x`}
            >
              {speed}x
            </button>
          ))}
        </div>

        <div className="flex-1" />

        {/* Scene counter */}
        <span className="data-mono text-text-muted">
          {currentSceneIndex + 1}/{scenes.length}
        </span>
      </div>

      {/* ── Scene strip ─────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-x-auto scrollbar-hide p-2">
        <div className="flex gap-2 h-full items-stretch">
          {scenes.map((scene, index) => {
            const isActive = index === currentSceneIndex;
            const sceneDuration = scene.metadata?.duration || 2000;

            return (
              <div key={scene.id} className="flex items-center gap-1 flex-shrink-0">
                {/* Scene card */}
                <button
                  onClick={() => handleSceneClick(scene.id, index)}
                  className={cn(
                    'relative rounded-md border overflow-hidden transition-all flex-shrink-0',
                    'w-32 h-20',
                    isActive
                      ? 'border-accent-primary ring-1 ring-accent-primary/50'
                      : 'border-border hover:border-border-hover'
                  )}
                  aria-label={`Scene ${index + 1}: ${scene.name}`}
                  aria-pressed={isActive}
                >
                  {/* Thumbnail or placeholder */}
                  {scene.thumbnail ? (
                    <img
                      src={scene.thumbnail}
                      alt=""
                      className="absolute inset-0 w-full h-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="absolute inset-0 bg-elevated flex items-center justify-center">
                      <span className="type-badge text-text-muted">
                        {index + 1}
                      </span>
                    </div>
                  )}

                  {/* Active / default overlay */}
                  <div
                    className={cn(
                      'absolute inset-0 transition-all',
                      isActive ? 'bg-accent-primary/10' : 'bg-void/20'
                    )}
                  />

                  {/* Scene name label */}
                  <div className="absolute bottom-0 inset-x-0 px-1.5 py-0.5 bg-gradient-to-t from-void/80 to-transparent">
                    <span className="text-xs text-text-primary truncate block">
                      {scene.name}
                    </span>
                  </div>

                  {/* Duration badge */}
                  <div className="absolute top-1 right-1 px-1 rounded bg-void/70">
                    <span className="type-badge text-text-muted">
                      {(sceneDuration / 1000).toFixed(1)}s
                    </span>
                  </div>

                  {/* Camera keyframe indicator */}
                  {scene.camera && scene.camera.length > 0 && (
                    <div className="absolute top-1 left-1 px-1 rounded bg-accent-primary/70">
                      <span className="type-badge text-void">CAM</span>
                    </div>
                  )}
                </button>

                {/* Transition indicator between scenes */}
                {index < scenes.length - 1 && (
                  <div
                    className="flex items-center"
                    title={`Transition: ${scene.transitions?.type || 'cut'}`}
                  >
                    <ChevronRight className="w-3 h-3 text-text-muted flex-shrink-0" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
});
