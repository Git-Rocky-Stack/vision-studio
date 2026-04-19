import { memo, useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { cn } from '@/utils/cn';
import { hexToRgba } from '@/utils/colorUtils';
import { useAppStore } from '@/store/appStore';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { ScenePlaybackStrip } from '@/components/storyboard/ScenePlaybackStrip';
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
  ZoomIn,
  ZoomOut,
  Lock,
  Unlock,
  Eye,
  EyeOff,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// ─── Types ──────────────────────────────────────────────────────────────────

interface TimelineTrack {
  id: string;
  type: 'video' | 'image';
  name: string;
  duration: number;
  startTime: number;
  color: string;
  thumbnail?: string;
  muted?: boolean;
  locked?: boolean;
  visible?: boolean;
}

type TickType = 'major' | 'minor' | 'sub';

// ─── Constants ───────────────────────────────────────────────────────────────

const HEADER_WIDTH = 160;
const RULER_HEIGHT = 28;
const TRACK_HEIGHT = 44;
const COLLAPSED_HEIGHT = 40;
const EXPANDED_HEIGHT = 220;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 4;
const ZOOM_STEP = 0.25;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 100);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
}

function formatTimecode(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const frames = Math.floor((seconds % 1) * 24);
  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}:${frames.toString().padStart(2, '0')}`;
  }
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}:${frames.toString().padStart(2, '0')}`;
}

// ─── Sub-components ──────────────────────────────────────────────────────────

/** Professional time ruler with major (10s), minor (1s), and sub-ticks (0.5s) */
const TimeRuler = memo(function TimeRuler({
  totalDuration,
  zoom,
  onSeek,
  playheadPercent,
}: {
  totalDuration: number;
  zoom: number;
  onSeek: (time: number) => void;
  playheadPercent: number;
}) {
  const rulerRef = useRef<HTMLDivElement>(null);

  const handleRulerClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!rulerRef.current) return;
      const rect = rulerRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const percent = Math.max(0, Math.min(1, x / rect.width));
      onSeek(percent * totalDuration);
    },
    [onSeek, totalDuration]
  );

  // Calculate ticks based on zoom level
  const ticks = useMemo(() => {
    const result: { time: number; type: TickType; label?: string }[] = [];
    const effectiveDuration = totalDuration;

    // Determine tick intervals based on zoom
    let majorInterval = 10;
    let minorInterval = 1;
    let subInterval = 0.5;

    if (zoom >= 3) {
      majorInterval = 1;
      minorInterval = 0.5;
      subInterval = 0.1;
    } else if (zoom >= 2) {
      majorInterval = 5;
      minorInterval = 1;
      subInterval = 0.5;
    } else if (zoom >= 1) {
      majorInterval = 10;
      minorInterval = 1;
      subInterval = 0.5;
    } else {
      majorInterval = 20;
      minorInterval = 5;
      subInterval = 1;
    }

    // Generate sub-ticks
    for (let t = 0; t <= effectiveDuration; t += subInterval) {
      const isMajor = Math.abs(t % majorInterval) < 0.001;
      const isMinor = !isMajor && Math.abs(t % minorInterval) < 0.001;

      if (isMajor) {
        result.push({
          time: t,
          type: 'major',
          label: t >= majorInterval || t === 0 ? formatTime(t) : undefined,
        });
      } else if (isMinor) {
        result.push({ time: t, type: 'minor' });
      } else {
        result.push({ time: t, type: 'sub' });
      }
    }

    return result;
  }, [totalDuration, zoom]);

  return (
    <div
      ref={rulerRef}
      className="relative h-[28px] bg-canvas border-b border-border cursor-crosshair select-none overflow-hidden"
      onClick={handleRulerClick}
      role="slider"
      aria-label="Time ruler"
      aria-valuemin={0}
      aria-valuemax={totalDuration}
      aria-valuenow={0}
      tabIndex={0}
    >
      {/* Tick marks */}
      {ticks.map((tick, i) => {
        const left = `${(tick.time / totalDuration) * 100}%`;
        return (
          <div
            key={`${tick.time}-${i}`}
            className="absolute top-0 h-full"
            style={{ left }}
          >
            {/* Tick line */}
            <div
              className={cn('absolute bottom-0 left-0', {
                'w-px h-[14px] bg-text-muted/40': tick.type === 'major',
                'w-px h-[9px] bg-text-muted/20': tick.type === 'minor',
                'w-px h-[5px] bg-text-muted/10': tick.type === 'sub',
              })}
            />
            {/* Label for major ticks */}
            {tick.type === 'major' && tick.label && (
              <span className="absolute top-1 left-1 font-mono text-micro text-text-muted whitespace-nowrap pointer-events-none">
                {tick.label}
              </span>
            )}
          </div>
        );
      })}

      {/* Playhead marker on ruler */}
      <div
        className="absolute top-0 z-30 pointer-events-none"
        style={{ left: `${playheadPercent}%` }}
      >
        {/* Triangle marker at top of ruler */}
        <div
          className="absolute -top-0.5 -translate-x-1/2 w-0 h-0"
          style={{
            borderLeft: '5px solid transparent',
            borderRight: '5px solid transparent',
            borderTop: `6px solid var(--color-accent-primary)`,
          }}
        />
        {/* Thin line extending down through ruler */}
        <div className="absolute top-0 -translate-x-1/2 w-px h-full bg-accent-primary" />
      </div>
    </div>
  );
});

/** Track header with icon, name, duration, and toggle controls */
const TrackHeader = memo(function TrackHeader({
  track,
  isSelected,
  onSelect,
}: {
  track: TimelineTrack;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const [isMuted, setIsMuted] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [isVisible, setIsVisible] = useState(true);
  const TypeIcon = track.type === 'video' ? Film : ImageIcon;

  return (
    <div
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
      role="option"
      aria-selected={isSelected}
      tabIndex={0}
      className={cn(
        'h-[44px] flex items-center gap-1.5 px-2 border-b border-border cursor-pointer transition-all group',
        isSelected
          ? 'bg-accent-primary-muted'
          : 'bg-surface hover:bg-elevated/50'
      )}
    >
      {/* Type icon */}
      <div
        className={cn(
          'flex-shrink-0 w-5 h-5 rounded flex items-center justify-center',
          isSelected ? 'bg-accent-primary-muted border border-accent-primary-border' : 'bg-elevated'
        )}
      >
        <TypeIcon
          className={cn(
            'w-3 h-3',
            isSelected ? 'text-accent-primary' : 'text-text-muted'
          )}
        />
      </div>

      {/* Track name */}
      <div className="flex-1 min-w-0">
        <span
          className={cn(
            'font-display text-xs truncate block leading-tight',
            isSelected ? 'text-text-primary font-medium' : 'text-text-body'
          )}
        >
          {track.name}
        </span>
        <span className="font-mono text-micro text-text-muted">
          {track.duration.toFixed(1)}s
        </span>
      </div>

      {/* Mute toggle (video only) */}
      {track.type === 'video' && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            setIsMuted(!isMuted);
          }}
          className={cn(
            'p-0.5 min-w-[44px] min-h-[44px] rounded transition-all opacity-0 group-hover:opacity-100 focus:opacity-100 focus-visible:opacity-100',
            isMuted ? 'text-status-error opacity-100' : 'text-text-muted hover:text-text-body'
          )}
          aria-label={isMuted ? 'Unmute track' : 'Mute track'}
          title={isMuted ? 'Unmute' : 'Mute'}
        >
          {isMuted ? <VolumeX className="w-3 h-3" /> : <Volume2 className="w-3 h-3" />}
        </button>
      )}

      {/* Visibility toggle */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          setIsVisible(!isVisible);
        }}
        className={cn(
          'p-0.5 min-w-[44px] min-h-[44px] rounded transition-all opacity-0 group-hover:opacity-100 focus:opacity-100 focus-visible:opacity-100',
          !isVisible ? 'text-status-error opacity-100' : 'text-text-muted hover:text-text-body'
        )}
        aria-label={isVisible ? 'Hide track' : 'Show track'}
        title={isVisible ? 'Hide' : 'Show'}
      >
        {isVisible ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
      </button>

      {/* Lock toggle */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          setIsLocked(!isLocked);
        }}
        className={cn(
          'p-0.5 min-w-[44px] min-h-[44px] rounded transition-all opacity-0 group-hover:opacity-100 focus:opacity-100 focus-visible:opacity-100',
          isLocked ? 'text-status-warning opacity-100' : 'text-text-muted hover:text-text-body'
        )}
        aria-label={isLocked ? 'Unlock track' : 'Lock track'}
        title={isLocked ? 'Unlock' : 'Lock'}
      >
        {isLocked ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
      </button>
    </div>
  );
});

/** Single clip block on the timeline */
const ClipBlock = memo(function ClipBlock({
  track,
  totalDuration,
  isSelected,
  index,
}: {
  track: TimelineTrack;
  totalDuration: number;
  isSelected: boolean;
  index: number;
}) {
  const [isHovered, setIsHovered] = useState(false);
  const leftPct = (track.startTime / totalDuration) * 100;
  const widthPct = (track.duration / totalDuration) * 100;

  // Color mapping based on track type
  const baseColor =
    track.type === 'video'
      ? 'var(--color-category-youtube)'
      : 'var(--color-category-art)';

  return (
    <motion.div
      initial={{ scaleX: 0, opacity: 0 }}
      animate={{ scaleX: 1, opacity: 1 }}
      transition={{ duration: 0.3, delay: index * 0.06, ease: [0.25, 0.46, 0.45, 0.94] }}
      style={{ left: `${leftPct}%`, width: `${widthPct}%`, transformOrigin: 'left center' }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={cn(
        'absolute h-[34px] top-[5px] rounded-md flex items-center overflow-hidden transition-shadow-all cursor-pointer',
        isSelected
          ? 'ring-1 z-10'
          : 'hover:brightness-110'
      )}
    >
      {/* Background gradient fill */}
      <div
        className="absolute inset-0 rounded-md"
        style={{
          background: isSelected
            ? `linear-gradient(135deg, ${hexToRgba(baseColor, 0.28)}, ${hexToRgba(baseColor, 0.12)})`
            : `linear-gradient(135deg, ${hexToRgba(baseColor, 0.15)}, ${hexToRgba(baseColor, 0.06)})`,
          border: `1px solid ${isSelected ? hexToRgba(baseColor, 0.6) : hexToRgba(baseColor, 0.2)}`,
        }}
      />

      {/* Hover shimmer */}
      {isHovered && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 rounded-md pointer-events-none"
          style={{
            background: `linear-gradient(90deg, transparent 0%, ${hexToRgba(baseColor, 0.08)} 50%, transparent 100%)`,
          }}
        />
      )}

      {/* Selection ring color */}
      {isSelected && (
        <div
          className="absolute inset-0 rounded-md pointer-events-none"
          style={{
            boxShadow: `0 0 8px ${hexToRgba(baseColor, 0.35)}, 0 0 2px ${hexToRgba(baseColor, 0.5)}`,
          }}
        />
      )}

      {/* Clip label */}
      <span
        className={cn(
          'font-display text-xs truncate relative z-10 px-2',
          isSelected ? 'text-text-primary font-medium' : 'text-text-body'
        )}
      >
        {track.name}
      </span>

      {/* Thumbnail preview on hover */}
      {isHovered && track.thumbnail && (
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 4 }}
          transition={{ duration: 0.15 }}
          className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 pointer-events-none"
        >
          <div className="rounded-md overflow-hidden shadow-lg" style={{ boxShadow: 'var(--shadow-lg)' }}>
            <img
              src={track.thumbnail}
              alt={`${track.name} preview`}
              className="w-32 h-20 object-cover"
              loading="lazy"
            />
          </div>
          <div
            className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 rotate-45"
            style={{ backgroundColor: 'var(--color-surface)' }}
          />
        </motion.div>
      )}

      {/* Audio waveform decoration (video tracks only) */}
      {track.type === 'video' && (
        <div className="absolute inset-0 overflow-hidden rounded-md pointer-events-none opacity-20">
          <svg
            className="absolute bottom-0 left-0 w-full h-3"
            viewBox="0 0 100 12"
            preserveAspectRatio="none"
          >
            {Array.from({ length: 20 }).map((_, i) => {
              const h = Math.max(2, Math.random() * 10);
              return (
                <rect
                  key={i}
                  x={i * 5}
                  y={12 - h}
                  width="3"
                  height={h}
                  rx="1"
                  fill="currentColor"
                  className="text-text-body"
                />
              );
            })}
          </svg>
        </div>
      )}
    </motion.div>
  );
});

/** Transport controls - play/pause, skip, time display */
const TransportControls = memo(function TransportControls({
  isPlaying,
  onTogglePlay,
  onSkipToStart,
  onSkipToEnd,
  currentTime,
  totalDuration,
}: {
  isPlaying: boolean;
  onTogglePlay: () => void;
  onSkipToStart: () => void;
  onSkipToEnd: () => void;
  currentTime: number;
  totalDuration: number;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <button
        onClick={onSkipToStart}
        className="p-1.5 rounded-md text-text-body hover:text-text-primary hover:bg-surface transition-all active:scale-95"
        aria-label="Skip to beginning"
        title="Skip to start (Home)"
      >
        <SkipBack className="w-3.5 h-3.5" />
      </button>
      <button
        onClick={onTogglePlay}
        className={cn(
          'p-2 rounded-lg transition-all active:scale-95',
          isPlaying
            ? 'bg-accent-primary text-void shadow-accent-subtle'
            : 'bg-accent-primary-muted text-accent-primary border border-accent-primary-border hover:bg-accent-primary-muted'
        )}
        aria-label={isPlaying ? 'Pause' : 'Play'}
        aria-pressed={isPlaying}
        title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
      >
        {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
      </button>
      <button
        onClick={onSkipToEnd}
        className="p-1.5 rounded-md text-text-body hover:text-text-primary hover:bg-surface transition-all active:scale-95"
        aria-label="Skip to end"
        title="Skip to end (End)"
      >
        <SkipForward className="w-3.5 h-3.5" />
      </button>

      <div className="w-px h-5 bg-border mx-1" />

      {/* Timecode display */}
      <div className="flex items-center gap-1" aria-live="polite">
        <span className="font-mono text-xs text-text-primary tabular-nums">
          {formatTimecode(currentTime)}
        </span>
        <span className="font-mono text-xs text-text-muted">/</span>
        <span className="font-mono text-xs text-text-muted tabular-nums">
          {formatTimecode(totalDuration)}
        </span>
      </div>
    </div>
  );
});

/** Zoom slider control */
const ZoomControls = memo(function ZoomControls({
  zoom,
  onZoomChange,
}: {
  zoom: number;
  onZoomChange: (zoom: number) => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <button
        onClick={() => onZoomChange(Math.max(MIN_ZOOM, zoom - ZOOM_STEP))}
        disabled={zoom <= MIN_ZOOM}
        className={cn(
          'p-1 rounded transition-all',
          zoom <= MIN_ZOOM
            ? 'text-text-muted/40 cursor-not-allowed'
            : 'text-text-body hover:text-text-primary hover:bg-surface active:scale-95'
        )}
        aria-label="Zoom out"
        title="Zoom out"
      >
        <ZoomOut className="w-3.5 h-3.5" />
      </button>

      {/* Custom range slider */}
      <div className="relative w-20 h-4 flex items-center">
        <input
          type="range"
          min={MIN_ZOOM}
          max={MAX_ZOOM}
          step={ZOOM_STEP}
          value={zoom}
          onChange={(e) => onZoomChange(Number(e.target.value))}
          className="w-full h-1 appearance-none rounded-full cursor-pointer"
          style={{
            background: `linear-gradient(to right, var(--color-accent-primary) 0%, var(--color-accent-primary) ${((zoom - MIN_ZOOM) / (MAX_ZOOM - MIN_ZOOM)) * 100}%, var(--color-void) ${((zoom - MIN_ZOOM) / (MAX_ZOOM - MIN_ZOOM)) * 100}%, var(--color-void) 100%)`,
          }}
          aria-label="Timeline zoom level"
          title={`Zoom: ${Math.round(zoom * 100)}%`}
        />
      </div>

      <button
        onClick={() => onZoomChange(Math.min(MAX_ZOOM, zoom + ZOOM_STEP))}
        disabled={zoom >= MAX_ZOOM}
        className={cn(
          'p-1 rounded transition-all',
          zoom >= MAX_ZOOM
            ? 'text-text-muted/40 cursor-not-allowed'
            : 'text-text-body hover:text-text-primary hover:bg-surface active:scale-95'
        )}
        aria-label="Zoom in"
        title="Zoom in"
      >
        <ZoomIn className="w-3.5 h-3.5" />
      </button>

      <span className="font-mono text-micro text-text-muted w-8 text-right tabular-nums">
        {Math.round(zoom * 100)}%
      </span>
    </div>
  );
});

// ─── Main Component ──────────────────────────────────────────────────────────

export const Timeline = memo(function Timeline() {
  const completedJobs = useAppStore((s) => s.completedJobs);
  const projects = useAppStore((s) => s.projects);
  const activeProjectId = useAppStore((s) => s.activeProjectId);
  const activeSceneId = useAppStore((s) => s.activeSceneId);
  const setActiveScene = useAppStore((s) => s.setActiveScene);
  const deleteCompletedJob = useAppStore((s) => s.deleteCompletedJob);
  const timelineMode = useAppStore((s) => s.timelineMode);
  const setTimelineMode = useAppStore((s) => s.setTimelineMode);
  const onionSkinEnabled = useAppStore((s) => s.onionSkinEnabled);
  const setOnionSkinEnabled = useAppStore((s) => s.setOnionSkinEnabled);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [selectedTrackId, setSelectedTrackId] = useState<string | null>(null);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);

  // Derive storyboard scenes from active project
  const activeProject = projects.find((p) => p.id === activeProjectId);
  const storyboardScenes = activeProject?.scenes ?? [];

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
          name: isVideo ? `Video ${index + 1}` : `Image ${index + 1}`,
          duration,
          startTime: offset,
          color: isVideo ? 'var(--color-category-youtube)' : 'var(--color-category-art)',
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

  // Playback animation loop
  useEffect(() => {
    if (!isPlaying) return;
    let rafId: number;
    let lastTime = performance.now();

    const animate = (now: number) => {
      const delta = (now - lastTime) / 1000;
      lastTime = now;
      setCurrentTime((t) => {
        const next = t + delta;
        if (next >= totalDuration) {
          setIsPlaying(false);
          return totalDuration;
        }
        return next;
      });
      rafId = requestAnimationFrame(animate);
    };

    rafId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafId);
  }, [isPlaying, totalDuration]);

  // Global keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      switch (e.key) {
        case ' ':
          if (!e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            setIsPlaying((p) => !p);
          }
          break;
        case 'Home':
          if (!e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            setCurrentTime(0);
          }
          break;
        case 'End':
          if (!e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            setCurrentTime(totalDuration);
          }
          break;
        case 'ArrowLeft':
          if (!e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            const step = e.shiftKey ? 1 : 5;
            setCurrentTime((t) => Math.max(0, t - step));
          }
          break;
        case 'ArrowRight':
          if (!e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            const step = e.shiftKey ? 1 : 5;
            setCurrentTime((t) => Math.min(totalDuration, t + step));
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [totalDuration]);

  const handleDeleteTrack = () => {
    if (!deleteTargetId) return;
    deleteCompletedJob(deleteTargetId);
    if (selectedTrackId === deleteTargetId) {
      setSelectedTrackId(null);
    }
    setDeleteTargetId(null);
  };

  const handleSeek = useCallback((time: number) => {
    setCurrentTime(Math.max(0, time));
  }, []);

  const handleSkipToStart = useCallback(() => {
    setCurrentTime(0);
    setIsPlaying(false);
  }, []);

  const handleSkipToEnd = useCallback(() => {
    setCurrentTime(totalDuration);
    setIsPlaying(false);
  }, [totalDuration]);

  // ─── Collapsed View ──────────────────────────────────────────────────────

  if (isCollapsed) {
    return (
      <motion.div
        initial={{ height: EXPANDED_HEIGHT }}
        animate={{ height: COLLAPSED_HEIGHT }}
        transition={{ duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] }}
        className="bg-elevated border-t border-border flex items-center px-4 gap-3 overflow-hidden"
      >
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
          className={cn(
            'p-1.5 rounded-lg transition-all',
            isPlaying
              ? 'bg-accent-primary text-void shadow-accent-subtle'
              : 'bg-accent-primary-muted text-accent-primary border border-accent-primary-border'
          )}
          aria-label={isPlaying ? 'Pause' : 'Play'}
          aria-pressed={isPlaying}
        >
          {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
        </button>

        <span className="font-mono text-xs text-text-primary tabular-nums">
          {formatTimecode(currentTime)}
        </span>
        <span className="font-mono text-micro text-text-muted">/</span>
        <span className="font-mono text-xs text-text-muted tabular-nums">
          {formatTimecode(totalDuration)}
        </span>

        {/* Mini progress bar */}
        <div
          className="flex-1 h-1.5 bg-void rounded-full overflow-hidden mx-2 cursor-pointer"
          role="progressbar"
          aria-valuenow={Math.round(progress)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Timeline progress"
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const pct = (e.clientX - rect.left) / rect.width;
            setCurrentTime(pct * totalDuration);
          }}
        >
          <motion.div
            className="h-full rounded-full"
            style={{
              width: `${progress}%`,
              background: 'linear-gradient(90deg, var(--color-gradient-progress-start), var(--color-gradient-progress-end))',
            }}
            transition={{ duration: 0.1 }}
          />
        </div>

        <div className="flex items-center gap-1">
          <Layers className="w-3 h-3 text-text-muted" />
          <span className="font-mono text-micro text-text-muted">{tracks.length}</span>
        </div>
      </motion.div>
    );
  }

  // ─── Expanded View ─────────────────────────────────────────────────────────

  return (
    <motion.div
      initial={{ height: COLLAPSED_HEIGHT }}
      animate={{ height: EXPANDED_HEIGHT }}
      transition={{ duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] }}
      className="bg-surface border-t border-border flex flex-col overflow-hidden"
    >
      {/* ─── Toolbar ──────────────────────────────────────────────────────── */}
      <div className="h-9 border-b border-border flex items-center justify-between px-3 bg-elevated/80 backdrop-blur-sm flex-shrink-0">
        <div className="flex items-center gap-2">
          <TransportControls
            isPlaying={isPlaying}
            onTogglePlay={() => setIsPlaying((p) => !p)}
            onSkipToStart={handleSkipToStart}
            onSkipToEnd={handleSkipToEnd}
            currentTime={currentTime}
            totalDuration={totalDuration}
          />

          <div className="w-px h-5 bg-border mx-1" />

          {/* Timeline mode switcher */}
          <div className="flex items-center gap-0.5 bg-void rounded-md p-0.5">
            {(['storyboard', 'animation', 'canvas'] as const).map((mode) => {
              const isActive = timelineMode === mode;
              return (
                <button
                  key={mode}
                  onClick={() => setTimelineMode(mode)}
                  className={cn(
                    'px-2 py-0.5 rounded text-xs font-display capitalize transition-all',
                    isActive
                      ? 'bg-surface text-accent-primary shadow-sm'
                      : 'text-text-muted hover:text-text-body'
                  )}
                  aria-label={`${mode} mode`}
                  data-active={isActive}
                >
                  {mode}
                </button>
              );
            })}
          </div>

          <div className="w-px h-5 bg-border mx-1" />

          {/* Track actions */}
          <button
            className={cn(
              'p-1.5 rounded-md transition-all',
              selectedTrackId
                ? 'text-text-body hover:text-text-primary hover:bg-surface active:scale-95'
                : 'text-text-muted/40 cursor-not-allowed'
            )}
            disabled={!selectedTrackId}
            aria-label="Split track"
            title="Split at playhead (S)"
          >
            <Scissors className="w-3.5 h-3.5" />
          </button>
          <button
            className={cn(
              'p-1.5 rounded-md transition-all',
              selectedTrackId
                ? 'text-text-body hover:text-text-primary hover:bg-surface active:scale-95'
                : 'text-text-muted/40 cursor-not-allowed'
            )}
            disabled={!selectedTrackId}
            aria-label="Duplicate track"
            title="Duplicate (Ctrl+D)"
          >
            <Copy className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setDeleteTargetId(selectedTrackId)}
            className={cn(
              'p-1.5 rounded-md transition-all',
              selectedTrackId
                ? 'text-text-body hover:text-status-error hover:bg-status-error-muted active:scale-95'
                : 'text-text-muted/40 cursor-not-allowed'
            )}
            disabled={!selectedTrackId}
            aria-label="Delete track"
            title="Delete (Del)"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>

          <div className="w-px h-5 bg-border mx-1" />

          <div className="flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-text-muted" />
            <span className="font-mono text-xs text-text-muted">
              {tracks.length} {tracks.length === 1 ? 'track' : 'tracks'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <ZoomControls zoom={zoom} onZoomChange={setZoom} />

          <div className="w-px h-5 bg-border mx-1" />

          {/* Onion skin toggle */}
          <button
            onClick={() => setOnionSkinEnabled(!onionSkinEnabled)}
            className={cn(
              'p-1.5 rounded-md transition-all',
              onionSkinEnabled
                ? 'text-accent-primary bg-accent-primary-muted'
                : 'text-text-body hover:text-text-primary hover:bg-surface'
            )}
            aria-label="Toggle onion skin"
            aria-pressed={onionSkinEnabled}
            title="Onion skin (O)"
          >
            <Layers className="w-3.5 h-3.5" />
          </button>

          <div className="w-px h-5 bg-border mx-1" />

          <button
            onClick={() => setIsCollapsed(true)}
            className="p-1.5 rounded-md text-text-body hover:text-text-primary hover:bg-surface transition-all"
            title="Collapse Timeline (Ctrl+T)"
            aria-label="Collapse timeline"
          >
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* ─── Timeline Body ────────────────────────────────────────────────── */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* ─── Track Headers (fixed left column) ────────────────────────── */}
        <div
          className="flex-shrink-0 border-r border-border bg-canvas overflow-y-auto scrollbar-hide"
          style={{ width: HEADER_WIDTH }}
        >
          {/* Ruler header spacer */}
          <div className="h-[28px] border-b border-border flex items-center justify-center px-2">
            <span className="font-mono text-micro text-text-muted">TIME</span>
          </div>

          {/* Storyboard scene header */}
          {storyboardScenes.length > 0 && (
            <div className="h-[36px] border-b border-border flex items-center px-2">
              <Film className="w-3 h-3 text-text-muted mr-1.5" />
              <span className="font-display text-xs text-text-body">Scenes</span>
            </div>
          )}

          {/* Track headers */}
          {tracks.map((track) => (
            <TrackHeader
              key={track.id}
              track={track}
              isSelected={selectedTrackId === track.id}
              onSelect={() =>
                setSelectedTrackId(selectedTrackId === track.id ? null : track.id)
              }
            />
          ))}

          {/* Empty state header row */}
          {tracks.length === 0 && !storyboardScenes.length && (
            <div className="h-[44px] flex items-center justify-center border-b border-border">
              <span className="font-mono text-micro text-text-muted">No tracks</span>
            </div>
          )}
        </div>

        {/* ─── Scrollable Timeline Area ──────────────────────────────────── */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <div className="flex-1 overflow-auto scrollbar-hide relative">
            {/* ─── Ruler ────────────────────────────────────────────────── */}
            <TimeRuler
              totalDuration={totalDuration}
              zoom={zoom}
              onSeek={handleSeek}
              playheadPercent={progress}
            />

            {/* ─── Storyboard Scene Playback Strip ──────────────────────── */}
            {storyboardScenes.length > 0 && (
              <div className="h-[36px] border-b border-border relative bg-elevated/30">
                {/* Scene strip - uses existing ScenePlaybackStrip but in a horizontal layout */}
                <div className="flex items-center h-full px-1 gap-0.5 overflow-x-auto scrollbar-hide">
                  {storyboardScenes
                    .sort((a, b) => a.orderIndex - b.orderIndex)
                    .map((scene) => {
                      const sceneStart = (scene.orderIndex / storyboardScenes.length) * totalDuration;
                      const sceneDuration = (scene.metadata?.duration || 2000) / 1000;
                      const isActive = scene.id === activeSceneId;
                      const sceneWidth = (sceneDuration / totalDuration) * 100;
                      const sceneLeft = (sceneStart / totalDuration) * 100;

                      return (
                        <button
                          key={scene.id}
                          onClick={() => setActiveScene(scene.id)}
                          className={cn(
                            'absolute h-[28px] top-[4px] rounded flex items-center justify-center px-2 transition-all cursor-pointer overflow-hidden',
                            isActive
                              ? 'ring-1 z-10'
                              : 'hover:brightness-125'
                          )}
                          style={{
                            left: `${sceneLeft}%`,
                            width: `${Math.max(sceneWidth, 2)}%`,
                            background: isActive
                              ? 'linear-gradient(135deg, rgba(230, 57, 70, 0.2), rgba(230, 57, 70, 0.08))'
                              : 'linear-gradient(135deg, rgba(255, 255, 255, 0.06), rgba(255, 255, 255, 0.02))',
                            border: `1px solid ${isActive ? 'var(--color-accent-primary)' : 'var(--color-border)'}`,
                            boxShadow: isActive ? '0 0 6px var(--color-accent-primary-glow)' : 'none',
                          }}
                          aria-label={`Scene: ${scene.name}`}
                          aria-pressed={isActive}
                        >
                          {scene.thumbnail && (
                            <img
                              src={scene.thumbnail}
                              alt=""
                              className="absolute inset-0 w-full h-full object-cover opacity-30 pointer-events-none"
                              loading="lazy"
                            />
                          )}
                          <span className={cn(
                            'font-display text-micro truncate relative z-10',
                            isActive ? 'text-accent-primary font-medium' : 'text-text-muted'
                          )}>
                            {scene.name}
                          </span>
                        </button>
                      );
                    })}
                </div>
              </div>
            )}

            {/* ─── Tracks Area ─────────────────────────────────────────── */}
            <div className="relative" role="listbox" aria-label="Timeline tracks">
              {/* Playhead line spanning all tracks */}
              <motion.div
                className="absolute top-0 bottom-0 w-px bg-accent-primary z-30 pointer-events-none"
                style={{ left: `${progress}%` }}
                role="presentation"
              >
                {/* Playhead dot at each track intersection */}
                <div className="absolute -top-0.5 -left-1 w-2 h-2 rounded-full bg-accent-primary shadow-accent-subtle" />
              </motion.div>

              {tracks.length === 0 && !storyboardScenes.length ? (
                /* Empty State */
                <div className="h-24 flex items-center justify-center">
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

                  return (
                    <div
                      key={track.id}
                      onClick={() =>
                        setSelectedTrackId(isSelected ? null : track.id)
                      }
                      role="option"
                      aria-selected={isSelected}
                      className={cn(
                        'border-b border-border flex items-center transition-all cursor-pointer group',
                        isSelected ? 'bg-accent-primary-muted' : 'hover:bg-elevated/20'
                      )}
                      style={{ height: TRACK_HEIGHT }}
                    >
                      {/* Clip block */}
                      <div className="flex-1 relative h-full px-1">
                        <ClipBlock
                          track={track}
                          totalDuration={totalDuration}
                          isSelected={isSelected}
                          index={index}
                        />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={deleteTargetId !== null}
        title="Delete Track"
        message="Are you sure you want to delete this track? This cannot be undone."
        confirmLabel="Delete"
        variant="danger"
        onConfirm={handleDeleteTrack}
        onCancel={() => setDeleteTargetId(null)}
      />
    </motion.div>
  );
});
