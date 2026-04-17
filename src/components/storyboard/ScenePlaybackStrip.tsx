import { memo, useState, useCallback, useRef, useEffect } from 'react';
import { cn } from '@/utils/cn';
import { useAppStore } from '@/store/appStore';
import { TransitionIndicator } from '@/components/storyboard/TransitionIndicator';
import { ImageOff, Play, Pause, SkipBack, SkipForward } from 'lucide-react';
import type { Scene } from '@/types/project';

interface ScenePlaybackStripProps {
  scenes: Scene[];
  activeSceneId: string | null;
  onSceneSelect: (sceneId: string) => void;
  onTransitionClick?: (fromSceneId: string) => void;
}

export const ScenePlaybackStrip = memo(function ScenePlaybackStrip({
  scenes,
  activeSceneId,
  onSceneSelect,
  onTransitionClick,
}: ScenePlaybackStripProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentPlaySceneIndex, setCurrentPlaySceneIndex] = useState(0);
  const playIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const sortedScenes = [...scenes].sort((a, b) => a.orderIndex - b.orderIndex);

  // Playback logic - advances through scenes at their duration intervals
  const startPlayback = useCallback(() => {
    setIsPlaying(true);

    const currentScene = sortedScenes[currentPlaySceneIndex];
    const duration = currentScene?.metadata.duration || 2000;

    playIntervalRef.current = setInterval(() => {
      setCurrentPlaySceneIndex((prev) => {
        const next = prev + 1;
        if (next >= sortedScenes.length) {
          // Loop back to start
          return 0;
        }
        return next;
      });
    }, Math.min(duration, 5000)); // Cap at 5s per scene for playback
  }, [sortedScenes, currentPlaySceneIndex]);

  const stopPlayback = useCallback(() => {
    setIsPlaying(false);
    if (playIntervalRef.current) {
      clearInterval(playIntervalRef.current);
      playIntervalRef.current = null;
    }
  }, []);

  // Clean up interval on unmount
  useEffect(() => {
    return () => {
      if (playIntervalRef.current) {
        clearInterval(playIntervalRef.current);
      }
    };
  }, []);

  // Update active scene during playback
  useEffect(() => {
    if (isPlaying && sortedScenes[currentPlaySceneIndex]) {
      onSceneSelect(sortedScenes[currentPlaySceneIndex].id);
    }
  }, [currentPlaySceneIndex, isPlaying, sortedScenes, onSceneSelect]);

  const handlePlayPause = () => {
    if (isPlaying) {
      stopPlayback();
    } else {
      startPlayback();
    }
  };

  const handleSkipToStart = () => {
    stopPlayback();
    setCurrentPlaySceneIndex(0);
    if (sortedScenes.length > 0) {
      onSceneSelect(sortedScenes[0].id);
    }
  };

  const handleSkipToEnd = () => {
    stopPlayback();
    const lastIndex = sortedScenes.length - 1;
    setCurrentPlaySceneIndex(lastIndex);
    if (sortedScenes[lastIndex]) {
      onSceneSelect(sortedScenes[lastIndex].id);
    }
  };

  if (sortedScenes.length === 0) {
    return (
      <div className="h-12 bg-elevated border-t border-border flex items-center justify-center px-4">
        <p className="text-xs text-text-muted font-display">
          No scenes to play - add scenes to your storyboard
        </p>
      </div>
    );
  }

  return (
    <div
      className="bg-elevated border-t border-border"
      data-testid="scene-playback-strip"
    >
      {/* Playback controls */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border">
        <button
          onClick={handleSkipToStart}
          className="p-1.5 rounded-md text-text-body hover:text-text-primary hover:bg-surface transition-colors"
          aria-label="Skip to beginning"
        >
          <SkipBack className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={handlePlayPause}
          className={cn(
            'p-1.5 rounded-lg transition-all',
            isPlaying
              ? 'bg-red-primary text-white glow-red-subtle'
              : 'bg-red-primary/10 text-red-primary border border-red-primary/30 hover:bg-red-primary/20'
          )}
          aria-label={isPlaying ? 'Pause playback' : 'Play playback'}
          aria-pressed={isPlaying}
        >
          {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
        </button>
        <button
          onClick={handleSkipToEnd}
          className="p-1.5 rounded-md text-text-body hover:text-text-primary hover:bg-surface transition-colors"
          aria-label="Skip to end"
        >
          <SkipForward className="w-3.5 h-3.5" />
        </button>

        <span className="font-mono text-micro text-text-muted ml-2">
          {currentPlaySceneIndex + 1}/{sortedScenes.length}
        </span>
      </div>

      {/* Scene thumbnail strip */}
      <div className="flex items-stretch overflow-x-auto px-2 py-2 gap-0 scrollbar-hide">
        {sortedScenes.map((scene, index) => {
          const isActive = scene.id === activeSceneId;

          return (
            <div key={scene.id} className="flex items-center">
              {/* Scene thumbnail */}
              <button
                onClick={() => onSceneSelect(scene.id)}
                className={cn(
                  'flex-shrink-0 w-20 h-12 rounded-md overflow-hidden border-2 transition-all duration-150',
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-red-primary',
                  isActive
                    ? 'border-red-primary shadow-red-glow-subtle'
                    : 'border-border hover:border-border-hover'
                )}
                aria-label={`Scene ${index + 1}: ${scene.name}`}
                aria-pressed={isActive}
              >
                {scene.thumbnail ? (
                  <img
                    src={scene.thumbnail}
                    alt={`Scene ${index + 1}`}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full bg-void flex items-center justify-center">
                    <ImageOff className="w-3 h-3 text-text-muted" aria-hidden="true" />
                  </div>
                )}
              </button>

              {/* Transition indicator between scenes */}
              {index < sortedScenes.length - 1 && (
                <div className="flex-shrink-0 w-6">
                  <TransitionIndicator
                    type={scene.transitions.type}
                    duration={scene.transitions.duration}
                    onClick={onTransitionClick ? () => onTransitionClick(scene.id) : undefined}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
});