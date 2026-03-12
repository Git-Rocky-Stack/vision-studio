import { memo, useState, useMemo } from 'react';
import { cn } from '@/utils/cn';
import { hexToRgba } from '@/utils/colorUtils';
import { useAppStore } from '@/store/appStore';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Scissors,
  Trash2,
  Copy,
  Layers,
  ChevronUp,
  ChevronDown,
  ImageIcon,
  Film,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface TimelineTrack {
  id: string;
  type: 'video' | 'image';
  name: string;
  duration: number;
  startTime: number;
  color: string;
  thumbnail?: string;
}

export const Timeline = memo(function Timeline() {
  const { completedJobs } = useAppStore();
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [selectedTrackId, setSelectedTrackId] = useState<string | null>(null);

  // Build tracks from completed jobs
  const tracks: TimelineTrack[] = useMemo(() => {
    let offset = 0;
    return completedJobs
      .filter((job) => job.status === 'completed')
      .map((job, index) => {
        const isVideo = job.type === 'video';
        const duration = isVideo ? (job.params?.duration || 5) : 1;
        const track: TimelineTrack = {
          id: job.id,
          type: isVideo ? 'video' : 'image',
          name: isVideo
            ? `Video ${index + 1}`
            : `Image ${index + 1}`,
          duration,
          startTime: offset,
          color: isVideo ? '#e63946' : '#6c5ce7',
          thumbnail: job.result?.images?.[0] || job.result?.video,
        };
        offset += duration;
        return track;
      });
  }, [completedJobs]);

  const totalDuration = Math.max(
    tracks.reduce((sum, t) => Math.max(sum, t.startTime + t.duration), 0),
    10
  );
  const progress = (currentTime / totalDuration) * 100;

  // Collapsed view — just play controls in a thin bar
  if (isCollapsed) {
    return (
      <div className="h-8 bg-elevated border-t border-border flex items-center px-4 gap-3">
        <button
          onClick={() => setIsCollapsed(false)}
          className="p-1 rounded text-text-muted hover:text-text-primary transition-all"
          title="Expand Timeline"
          aria-label="Expand timeline"
        >
          <ChevronUp className="w-3.5 h-3.5" />
        </button>
        <div className="w-px h-4 bg-border" />
        <button
          onClick={() => setIsPlaying(!isPlaying)}
          className="p-1 rounded-lg bg-red-primary text-text-primary hover:bg-red-highlight transition-all"
          aria-label={isPlaying ? 'Pause' : 'Play'}
          aria-pressed={isPlaying}
        >
          {isPlaying ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
        </button>
        <span className="font-mono text-micro text-text-body">
          {formatTime(currentTime)} / {formatTime(totalDuration)}
        </span>
        <div
          className="flex-1 h-1 bg-void rounded-full overflow-hidden mx-2"
          role="progressbar"
          aria-valuenow={Math.round(progress)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Timeline progress"
        >
          <div
            className="h-full rounded-full"
            style={{
              width: `${progress}%`,
              background: 'linear-gradient(90deg, var(--color-gradient-progress-start), var(--color-gradient-progress-end))',
            }}
          />
        </div>
        <div className="flex items-center gap-1">
          <Layers className="w-3 h-3 text-text-muted" />
          <span className="font-mono text-micro text-text-muted">
            {tracks.length}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="h-64 bg-surface border-t border-border flex flex-col">
      {/* Timeline Header */}
      <div className="h-10 border-b border-border flex items-center justify-between px-4 bg-elevated">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsPlaying(!isPlaying)}
            className="p-1.5 rounded-lg bg-red-primary text-text-primary hover:bg-red-highlight transition-all glow-red-subtle"
            aria-label={isPlaying ? 'Pause' : 'Play'}
            aria-pressed={isPlaying}
          >
            {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          </button>
          <button
            className="p-1.5 rounded-lg text-text-body hover:text-text-primary hover:bg-surface transition-all"
            aria-label="Skip to beginning"
          >
            <SkipBack className="w-4 h-4" />
          </button>
          <button
            className="p-1.5 rounded-lg text-text-body hover:text-text-primary hover:bg-surface transition-all"
            aria-label="Skip to end"
          >
            <SkipForward className="w-4 h-4" />
          </button>

          <div className="w-px h-6 bg-border mx-2" />

          <span className="font-mono text-sm text-text-primary">
            {formatTime(currentTime)} / {formatTime(totalDuration)}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            className={cn(
              'p-1.5 rounded-lg transition-all',
              selectedTrackId
                ? 'text-text-body hover:text-text-primary hover:bg-surface'
                : 'text-text-muted cursor-not-allowed opacity-40'
            )}
            disabled={!selectedTrackId}
            aria-label="Split track"
          >
            <Scissors className="w-4 h-4" />
          </button>
          <button
            className={cn(
              'p-1.5 rounded-lg transition-all',
              selectedTrackId
                ? 'text-text-body hover:text-text-primary hover:bg-surface'
                : 'text-text-muted cursor-not-allowed opacity-40'
            )}
            disabled={!selectedTrackId}
            aria-label="Duplicate track"
          >
            <Copy className="w-4 h-4" />
          </button>
          <button
            className={cn(
              'p-1.5 rounded-lg transition-all',
              selectedTrackId
                ? 'text-text-body hover:text-red-primary hover:bg-red-aura'
                : 'text-text-muted cursor-not-allowed opacity-40'
            )}
            disabled={!selectedTrackId}
            aria-label="Delete track"
          >
            <Trash2 className="w-4 h-4" />
          </button>

          <div className="w-px h-6 bg-border mx-2" />

          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-text-muted" />
            <span className="font-mono text-xs text-text-muted">
              {tracks.length} {tracks.length === 1 ? 'track' : 'tracks'}
            </span>
          </div>

          <div className="w-px h-6 bg-border mx-2" />

          <button
            onClick={() => setIsCollapsed(true)}
            className="p-1.5 rounded-lg text-text-body hover:text-text-primary hover:bg-surface transition-all"
            title="Collapse Timeline"
            aria-label="Collapse timeline"
          >
            <ChevronDown className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Timeline Tracks */}
      <div className="flex-1 overflow-y-auto scrollbar-hide">
        {/* Time Ruler */}
        <div className="h-6 border-b border-border bg-surface relative">
          {Array.from({ length: Math.ceil(totalDuration) + 1 }).map((_, i) => (
            <div
              key={i}
              className="absolute top-0 h-full flex items-end pb-1"
              style={{ left: `calc(192px + ${((i / totalDuration) * (100 - 20))}%)` }}
            >
              <div className="flex flex-col items-center">
                <div className="w-px h-2 bg-border" />
                <span className="font-mono text-micro text-text-muted">{i}s</span>
              </div>
            </div>
          ))}
        </div>

        {/* Tracks */}
        <div className="relative" role="listbox" aria-label="Timeline tracks">
          {/* Playhead */}
          <motion.div
            className="absolute top-0 bottom-0 w-px bg-red-primary z-20 pointer-events-none"
            style={{ left: `calc(192px + ${progress * 0.8}%)` }}
          >
            <div className="absolute -top-1 -left-1.5 w-3 h-3 bg-red-primary rounded-full shadow-red-dot" />
          </motion.div>

          {tracks.length === 0 ? (
            /* Empty State */
            <div className="h-32 flex items-center justify-center">
              <div className="text-center">
                <Layers className="w-8 h-8 text-text-muted mx-auto mb-2 opacity-30" />
                <p className="font-display text-sm text-text-muted">
                  No content yet
                </p>
                <p className="font-display text-xs text-text-muted mt-0.5">
                  Generate images or videos to populate the timeline
                </p>
              </div>
            </div>
          ) : (
            tracks.map((track, index) => {
              const isSelected = selectedTrackId === track.id;
              const TypeIcon = track.type === 'video' ? Film : ImageIcon;

              return (
                <div
                  key={track.id}
                  onClick={() => setSelectedTrackId(isSelected ? null : track.id)}
                  role="option"
                  aria-selected={isSelected}
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setSelectedTrackId(isSelected ? null : track.id);
                    }
                  }}
                  className={cn(
                    'h-12 border-b border-border flex items-center px-4 transition-all cursor-pointer group',
                    isSelected
                      ? 'bg-red-aura'
                      : 'hover:bg-elevated/50'
                  )}
                >
                  {/* Track Label */}
                  <div className="w-48 flex items-center gap-2 flex-shrink-0">
                    <TypeIcon
                      className={cn(
                        'w-3.5 h-3.5',
                        isSelected ? 'text-red-primary' : 'text-text-muted'
                      )}
                    />
                    <span className={cn(
                      'font-display text-sm truncate',
                      isSelected ? 'text-red-primary font-medium' : 'text-text-primary'
                    )}>
                      {track.name}
                    </span>
                    <span className="font-mono text-micro text-text-muted ml-auto">
                      {track.duration.toFixed(1)}s
                    </span>
                  </div>

                  {/* Track Clip */}
                  <div className="flex-1 relative h-8">
                    <motion.div
                      initial={{ scaleX: 0 }}
                      animate={{ scaleX: 1 }}
                      transition={{ duration: 0.3, delay: index * 0.1 }}
                      className={cn(
                        'absolute h-full rounded-lg flex items-center px-2 cursor-pointer overflow-hidden',
                        isSelected && 'ring-1 ring-red-primary shadow-red-ring'
                      )}
                      style={{
                        left: `${(track.startTime / totalDuration) * 100}%`,
                        width: `${(track.duration / totalDuration) * 100}%`,
                        background: isSelected
                          ? `linear-gradient(90deg, ${hexToRgba(track.color, 0.19)}, ${hexToRgba(track.color, 0.08)})`
                          : hexToRgba(track.color, 0.07),
                        border: `1px solid ${isSelected ? track.color : hexToRgba(track.color, 0.19)}`,
                      }}
                    >
                      {/* Gradient fill for selected */}
                      {isSelected && (
                        <div
                          className="absolute inset-0 opacity-20"
                          style={{
                            background: `linear-gradient(90deg, ${track.color}, transparent)`,
                          }}
                        />
                      )}
                      <span className={cn(
                        'font-display text-xs font-medium truncate relative z-10',
                        isSelected ? 'text-text-primary' : 'text-text-primary'
                      )}>
                        {track.name}
                      </span>
                    </motion.div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
});

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 100);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
}
