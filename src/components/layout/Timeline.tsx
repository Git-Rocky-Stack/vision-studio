import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useShallow } from 'zustand/react/shallow';
import {
  AudioLines,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Copy,
  Eye,
  EyeOff,
  Film,
  ImageIcon,
  Layers,
  Lock,
  Download,
  Pause,
  Play,
  Plus,
  Scissors,
  SkipBack,
  SkipForward,
  Square,
  Trash2,
  Unlock,
  Volume2,
  VolumeX,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';

import { useAppStore } from '@/store/appStore';
import { cn } from '@/utils/cn';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { StoryboardPlayback } from '@/components/timeline/StoryboardPlayback';
import { AnimationTrackEditor } from '@/components/timeline/AnimationTrackEditor';
import { TimelineClipInspector } from '@/components/timeline/TimelineClipInspector';
import { TimelineExportDialog } from '@/components/timeline/TimelineExportDialog';
import type { MediaAsset } from '@/types/media';
import type {
  TimelineClip,
  TimelineClipRetakeRange,
  TimelinePlayRange,
  TimelineTrack,
} from '@/types/timeline';

const RULER_HEIGHT = 32;
const TRACK_HEIGHT = 68;
const COLLAPSED_HEIGHT = 40;
const EXPANDED_HEIGHT = 384;
const DETAILS_DECK_HEIGHT = 160;
const MIN_ZOOM = 1;
const MAX_ZOOM = 4;
const ZOOM_STEP = 0.5;
const DEFAULT_IMAGE_CLIP_DURATION_MS = 2000;
const DEFAULT_VIDEO_CLIP_DURATION_MS = 5000;
const DEFAULT_AUDIO_CLIP_DURATION_MS = 5000;
const TIMELINE_ACTION_BUTTON_CLASS =
  'inline-flex h-7 flex-none items-center gap-1 whitespace-nowrap rounded-md border border-border-hover bg-panel-raised px-2 text-[11px] font-display text-text-primary shadow-sm transition hover:border-accent-primary-border hover:bg-elevated disabled:cursor-not-allowed disabled:border-border disabled:bg-surface disabled:text-text-muted disabled:opacity-60';
const TIMELINE_ACTION_SELECT_CLASS =
  'h-7 max-w-[128px] flex-none rounded-md border border-border-hover bg-panel-raised px-2 text-[11px] font-display text-text-primary shadow-sm';

interface TimelineRetakeDraftRange {
  clipId: string;
  startMs: number | null;
  endMs: number | null;
}

function formatTimecode(timeMs: number, fps = 24) {
  const totalSeconds = Math.max(0, timeMs / 1000);
  const hrs = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = Math.floor(totalSeconds % 60);
  const frames = Math.floor((totalSeconds % 1) * fps);

  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, '0')}:${secs
      .toString()
      .padStart(2, '0')}:${frames.toString().padStart(2, '0')}`;
  }

  return `${mins.toString().padStart(2, '0')}:${secs
    .toString()
    .padStart(2, '0')}:${frames.toString().padStart(2, '0')}`;
}

function formatSecondsLabel(timeMs: number) {
  return `${(timeMs / 1000).toFixed(timeMs % 1000 === 0 ? 0 : 1)}s`;
}

function formatRetakeRangeLabel(startMs: number, endMs: number) {
  return `${formatSecondsLabel(startMs)} to ${formatSecondsLabel(endMs)}`;
}

function clampClipRelativeTime(timeMs: number, clip: TimelineClip) {
  return Math.max(0, Math.min(clip.durationMs, Math.round(timeMs - clip.startMs)));
}

function getRetakeRangeTone(status: TimelineClipRetakeRange['status']) {
  switch (status) {
    case 'accepted':
      return {
        badge: 'border-status-success-border bg-status-success-muted text-status-success',
        overlay: 'border-status-success/70 bg-status-success/20',
      };
    case 'candidate':
      return {
        badge: 'border-accent-primary/40 bg-accent-primary-muted text-accent-primary',
        overlay: 'border-accent-primary/70 bg-accent-primary/18',
      };
    case 'queued':
    case 'rendering':
      return {
        badge: 'border-status-warning-border bg-status-warning-muted text-status-warning',
        overlay: 'border-status-warning/70 bg-status-warning/18',
      };
    default:
      return {
        badge: 'border-border bg-canvas/80 text-text-muted',
        overlay: 'border-border bg-canvas/70',
      };
  }
}

function getTrackKindForMediaAsset(asset: MediaAsset) {
  if (asset.type === 'video') {
    return 'video';
  }

  if (asset.type === 'audio') {
    return 'audio';
  }

  return 'image';
}

function getClipDurationForAsset(asset: MediaAsset) {
  return asset.durationMs ?? (
    asset.type === 'video'
      ? DEFAULT_VIDEO_CLIP_DURATION_MS
      : asset.type === 'audio'
        ? DEFAULT_AUDIO_CLIP_DURATION_MS
        : DEFAULT_IMAGE_CLIP_DURATION_MS
  );
}

function isStoryboardPlaceholderAsset(asset: MediaAsset | null | undefined) {
  return asset?.metadata?.storyboardPlaceholder === true;
}

function buildTimelineTicks(totalDurationMs: number, zoom: number) {
  const stepMs =
    zoom >= 3 ? 250 : zoom >= 2 ? 500 : zoom >= 1.5 ? 1000 : 2000;
  const ticks: Array<{ timeMs: number; major: boolean; label: string | null }> = [];

  for (let timeMs = 0; timeMs <= totalDurationMs; timeMs += stepMs) {
    const major = timeMs % (stepMs * 2) === 0;
    ticks.push({
      timeMs,
      major,
      label: major ? formatSecondsLabel(timeMs) : null,
    });
  }

  return ticks;
}

const TransportControls = memo(function TransportControls({
  isPlaying,
  currentTime,
  totalDurationMs,
  fps,
  onTogglePlay,
  onStop,
  onStepBackward,
  onStepForward,
  onSkipToStart,
  onSkipToEnd,
}: {
  isPlaying: boolean;
  currentTime: number;
  totalDurationMs: number;
  fps: number;
  onTogglePlay: () => void;
  onStop: () => void;
  onStepBackward: () => void;
  onStepForward: () => void;
  onSkipToStart: () => void;
  onSkipToEnd: () => void;
}) {
  return (
    <div className="flex h-8 items-center gap-1.5 rounded-lg border border-border bg-canvas px-1.5 shadow-sm">
      <button
        type="button"
        onClick={onSkipToStart}
        className="rounded-md p-1.5 text-text-body transition hover:bg-surface hover:text-text-primary"
        aria-label="Skip to beginning"
        title="Skip to beginning"
      >
        <SkipBack className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={onStepBackward}
        className="rounded-md p-1.5 text-text-body transition hover:bg-surface hover:text-text-primary"
        aria-label="Step backward one frame"
        title="Step backward one frame"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={onTogglePlay}
        className={cn(
          'rounded-lg p-2 transition',
          isPlaying
            ? 'bg-accent-primary text-void shadow-accent-subtle'
            : 'border border-accent-primary-border bg-accent-primary-muted text-accent-primary',
        )}
        aria-label={isPlaying ? 'Pause' : 'Play'}
      >
        {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
      </button>
      <button
        type="button"
        onClick={onStop}
        className="rounded-md p-1.5 text-text-body transition hover:bg-surface hover:text-text-primary"
        aria-label="Stop playback"
        title="Stop playback"
      >
        <Square className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={onStepForward}
        className="rounded-md p-1.5 text-text-body transition hover:bg-surface hover:text-text-primary"
        aria-label="Step forward one frame"
        title="Step forward one frame"
      >
        <ChevronRight className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={onSkipToEnd}
        className="rounded-md p-1.5 text-text-body transition hover:bg-surface hover:text-text-primary"
        aria-label="Skip to end"
        title="Skip to end"
      >
        <SkipForward className="h-3.5 w-3.5" />
      </button>
      <div className="mx-1 h-5 w-px bg-border" />
      <div className="flex min-w-[112px] items-center justify-end gap-1">
        <span className="font-mono text-xs text-text-primary">{formatTimecode(currentTime, fps)}</span>
        <span className="font-mono text-xs text-text-muted">/</span>
        <span className="font-mono text-xs text-text-muted">{formatTimecode(totalDurationMs, fps)}</span>
      </div>
    </div>
  );
});

const ZoomControls = memo(function ZoomControls({
  zoom,
  onZoomChange,
}: {
  zoom: number;
  onZoomChange: (zoom: number) => void;
}) {
  return (
    <div className="flex h-8 items-center gap-1.5 rounded-lg border border-border bg-canvas px-2 shadow-sm">
      <button
        type="button"
        onClick={() => onZoomChange(Math.max(MIN_ZOOM, zoom - ZOOM_STEP))}
        disabled={zoom <= MIN_ZOOM}
        className="rounded p-1 text-text-body transition disabled:cursor-not-allowed disabled:text-text-muted/40 hover:bg-surface hover:text-text-primary"
        aria-label="Zoom out"
      >
        <ZoomOut className="h-3.5 w-3.5" />
      </button>
      <input
        aria-label="Timeline zoom level"
        type="range"
        min={MIN_ZOOM}
        max={MAX_ZOOM}
        step={ZOOM_STEP}
        value={zoom}
        onChange={(event) => onZoomChange(Number(event.target.value))}
        className="timeline-zoom-slider h-2 w-28 cursor-pointer appearance-none rounded-full"
      />
      <button
        type="button"
        onClick={() => onZoomChange(Math.min(MAX_ZOOM, zoom + ZOOM_STEP))}
        disabled={zoom >= MAX_ZOOM}
        className="rounded p-1 text-text-body transition disabled:cursor-not-allowed disabled:text-text-muted/40 hover:bg-surface hover:text-text-primary"
        aria-label="Zoom in"
      >
        <ZoomIn className="h-3.5 w-3.5" />
      </button>
      <span className="w-10 text-right font-mono text-xs text-text-muted">{Math.round(zoom * 100)}%</span>
    </div>
  );
});

const TimeRuler = memo(function TimeRuler({
  totalDurationMs,
  currentTime,
  playRange,
  zoom,
  onSeek,
}: {
  totalDurationMs: number;
  currentTime: number;
  playRange: TimelinePlayRange | null;
  zoom: number;
  onSeek: (timeMs: number) => void;
}) {
  const ticks = useMemo(() => buildTimelineTicks(totalDurationMs, zoom), [totalDurationMs, zoom]);

  return (
    <div
      className="relative border-b border-border bg-canvas"
      style={{ height: RULER_HEIGHT }}
      onClick={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
        onSeek(Math.round(ratio * totalDurationMs));
      }}
      role="slider"
      aria-label="Time ruler"
      aria-valuemin={0}
      aria-valuemax={totalDurationMs}
      aria-valuenow={currentTime}
    >
      {playRange ? (
        <div
          className="absolute inset-y-0 rounded-sm bg-accent-primary/10"
          style={{
            left: `${(playRange.startMs / totalDurationMs) * 100}%`,
            width: `${((playRange.endMs - playRange.startMs) / totalDurationMs) * 100}%`,
          }}
        />
      ) : null}

      {ticks.map((tick) => (
        <div
          key={tick.timeMs}
          className="absolute inset-y-0"
          style={{ left: `${(tick.timeMs / totalDurationMs) * 100}%` }}
        >
          <div
            className={cn(
              'absolute bottom-0 left-0 w-px',
              tick.major ? 'h-4 bg-text-muted/40' : 'h-2.5 bg-text-muted/20',
            )}
          />
          {tick.label ? (
            <span className="absolute left-1 top-1 whitespace-nowrap font-mono text-[11px] text-text-muted">
              {tick.label}
            </span>
          ) : null}
        </div>
      ))}

      <div
        className="absolute inset-y-0 z-20 w-px bg-accent-primary"
        style={{ left: `${(currentTime / totalDurationMs) * 100}%` }}
      >
        <div className="absolute -left-1 -top-0.5 h-2 w-2 rounded-full bg-accent-primary shadow-accent-subtle" />
      </div>
    </div>
  );
});

const TrackHeader = memo(function TrackHeader({
  track,
  clipCount,
  isSelected,
  onSelect,
  onToggleMute,
  onToggleSolo,
  onToggleHidden,
  onToggleLocked,
}: {
  track: TimelineTrack;
  clipCount: number;
  isSelected: boolean;
  onSelect: () => void;
  onToggleMute: () => void;
  onToggleSolo: () => void;
  onToggleHidden: () => void;
  onToggleLocked: () => void;
}) {
  const TrackIcon = track.kind === 'video' ? Film : track.kind === 'audio' ? AudioLines : ImageIcon;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect();
        }
      }}
      className={cn(
        'flex h-[68px] w-full items-center gap-2 border-b border-border px-3 text-left transition',
        isSelected ? 'bg-accent-primary-muted' : 'bg-surface hover:bg-elevated/70',
      )}
      aria-pressed={isSelected}
    >
      <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-canvas">
        <TrackIcon className="h-4 w-4 text-text-muted" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-display text-sm text-text-primary">{track.name}</p>
        <p className="mt-1 text-[11px] uppercase tracking-[0.12em] text-text-muted">
          {track.kind} track - {clipCount} clip{clipCount === 1 ? '' : 's'}
        </p>
      </div>
      <div className="flex items-center gap-1">
        {track.kind === 'video' || track.kind === 'audio' ? (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onToggleMute();
            }}
            className="rounded p-1 text-text-muted transition hover:bg-canvas hover:text-text-primary"
            aria-label={track.muted ? 'Unmute track' : 'Mute track'}
          >
            {track.muted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
          </button>
        ) : null}
        {track.kind === 'audio' ? (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onToggleSolo();
            }}
            className={cn(
              'rounded px-1.5 py-1 text-[10px] font-display uppercase tracking-[0.12em] transition',
              track.solo
                ? 'bg-accent-primary-muted text-accent-primary'
                : 'text-text-muted hover:bg-canvas hover:text-text-primary',
            )}
            aria-label={track.solo ? 'Disable solo track' : 'Solo track'}
          >
            S
          </button>
        ) : null}
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onToggleHidden();
          }}
          className="rounded p-1 text-text-muted transition hover:bg-canvas hover:text-text-primary"
          aria-label={track.hidden ? 'Show track' : 'Hide track'}
        >
          {track.hidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
        </button>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onToggleLocked();
          }}
          className="rounded p-1 text-text-muted transition hover:bg-canvas hover:text-text-primary"
          aria-label={track.locked ? 'Unlock track' : 'Lock track'}
        >
          {track.locked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
        </button>
      </div>
    </div>
  );
});

const TimelineClipBlock = memo(function TimelineClipBlock({
  clip,
  mediaAsset,
  sceneName,
  isPlaceholder,
  totalDurationMs,
  selected,
  activeRetakeRangeId,
  draftRetakeRange,
  onSelect,
}: {
  clip: TimelineClip;
  mediaAsset: MediaAsset | null;
  sceneName?: string | null;
  isPlaceholder?: boolean;
  totalDurationMs: number;
  selected: boolean;
  activeRetakeRangeId?: string | null;
  draftRetakeRange?: Pick<TimelineRetakeDraftRange, 'startMs' | 'endMs'> | null;
  onSelect: () => void;
}) {
  const leftPct = (clip.startMs / totalDurationMs) * 100;
  const widthPct = Math.max(2, (clip.durationMs / totalDurationMs) * 100);
  const baseColor = mediaAsset?.type === 'video' ? 'var(--color-category-youtube)' : 'var(--color-category-art)';
  const backgroundImage =
    mediaAsset?.type === 'audio'
      ? null
      : mediaAsset?.posterUrl || mediaAsset?.thumbnailUrl || mediaAsset?.previewUrl || null;
  const beatMarkers = clip.storyboardBeatMarkers
    .filter((marker) => marker.relativeStartMs >= 0 && marker.relativeStartMs <= clip.durationMs)
    .sort((left, right) => left.relativeStartMs - right.relativeStartMs);
  const waveformBars = mediaAsset?.waveformSummary?.length
    ? mediaAsset.waveformSummary
    : [0.28, 0.52, 0.74, 0.43, 0.66, 0.34, 0.8, 0.58, 0.41, 0.7, 0.49, 0.61];
  const audioGainLabel = `${Math.round(clip.gain * 100)}%`;
  const retakeRanges = [...clip.retakeRanges].sort((left, right) => left.startMs - right.startMs);
  const hasDraftRetakeRange =
    draftRetakeRange?.startMs !== null &&
    draftRetakeRange?.startMs !== undefined &&
    draftRetakeRange?.endMs !== null &&
    draftRetakeRange?.endMs !== undefined &&
    draftRetakeRange.endMs > draftRetakeRange.startMs;

  return (
    <button
      type="button"
      className={cn(
        'absolute top-2 h-[52px] overflow-hidden rounded-xl border text-left transition',
        selected
          ? 'z-10 border-accent-primary shadow-accent-subtle'
          : 'border-border hover:border-accent-primary/40 hover:shadow-lg',
      )}
      style={{
        left: `${leftPct}%`,
        width: `${widthPct}%`,
        minWidth: '84px',
        background: selected
          ? `linear-gradient(135deg, color-mix(in srgb, ${baseColor} 24%, transparent), rgba(20,20,24,0.92))`
          : `linear-gradient(135deg, color-mix(in srgb, ${baseColor} 12%, transparent), rgba(20,20,24,0.88))`,
      }}
      onClick={(event) => {
        event.stopPropagation();
        onSelect();
      }}
      aria-label={`Timeline clip ${clip.label}`}
      data-testid={`timeline-clip-${clip.id}`}
    >
      {backgroundImage ? (
        <div
          className="absolute inset-0 opacity-30"
          style={{
            backgroundImage: `url("${backgroundImage}")`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        />
      ) : null}

      {clip.transitionIn ? (
        <div
          className="absolute inset-y-0 left-0"
          style={{
            width: `${Math.min(24, (clip.transitionIn.durationMs / Math.max(clip.durationMs, 1)) * 100)}%`,
            background: 'linear-gradient(90deg, rgba(255,255,255,0.18), transparent)',
          }}
        />
      ) : null}
      {clip.transitionOut ? (
        <div
          className="absolute inset-y-0 right-0"
          style={{
            width: `${Math.min(24, (clip.transitionOut.durationMs / Math.max(clip.durationMs, 1)) * 100)}%`,
            background: 'linear-gradient(270deg, rgba(255,255,255,0.18), transparent)',
          }}
        />
      ) : null}

      {clip.storyboardDerived && beatMarkers.length > 0 ? (
        <div className="pointer-events-none absolute inset-x-2 bottom-1 h-2">
          {beatMarkers.map((marker) => {
            const left = Math.max(
              0,
              Math.min(98, (marker.relativeStartMs / Math.max(clip.durationMs, 1)) * 100),
            );

            return (
              <span
                key={marker.id}
                className="absolute bottom-0 h-2 w-px rounded-full bg-accent-primary/90 shadow-[0_0_0_1px_rgba(0,0,0,0.2)]"
                style={{ left: `${left}%` }}
                title={marker.label}
                data-testid={`timeline-clip-beat-marker-${clip.id}-${marker.id}`}
              />
            );
          })}
        </div>
      ) : null}
      {mediaAsset?.type === 'audio' ? (
        <div className="pointer-events-none absolute inset-x-3 top-3 bottom-5 flex items-end gap-1 opacity-80">
          {waveformBars.map((value, index) => (
            <span
              key={`${clip.id}-wave-${index}`}
              className="flex-1 rounded-full bg-text-primary/70"
              style={{ height: `${Math.max(18, Math.min(100, value * 100))}%` }}
            />
          ))}
        </div>
      ) : null}
      {retakeRanges.length > 0 ? (
        <div className="pointer-events-none absolute inset-x-2 top-8 h-3">
          {retakeRanges.map((range) => {
            const left = Math.max(0, Math.min(100, (range.startMs / Math.max(clip.durationMs, 1)) * 100));
            const width = Math.max(
              4,
              Math.min(
                100 - left,
                ((range.endMs - range.startMs) / Math.max(clip.durationMs, 1)) * 100,
              ),
            );
            const tone = getRetakeRangeTone(range.status);

            return (
              <span
                key={range.id}
                className={cn(
                  'absolute inset-y-0 rounded-full border',
                  tone.overlay,
                  activeRetakeRangeId === range.id ? 'shadow-[0_0_0_1px_rgba(255,255,255,0.22)]' : '',
                )}
                style={{ left: `${left}%`, width: `${width}%` }}
                title={`Retake ${formatRetakeRangeLabel(range.startMs, range.endMs)}`}
                data-testid={`timeline-clip-retake-range-${clip.id}-${range.id}`}
              />
            );
          })}
        </div>
      ) : null}
      {hasDraftRetakeRange ? (
        <span
          className="pointer-events-none absolute top-8 h-3 rounded-full border border-dashed border-status-warning/80 bg-status-warning/20"
          style={{
            left: `${((draftRetakeRange!.startMs ?? 0) / Math.max(clip.durationMs, 1)) * 100}%`,
            width: `${Math.max(
              4,
              (((draftRetakeRange!.endMs ?? 0) - (draftRetakeRange!.startMs ?? 0)) /
                Math.max(clip.durationMs, 1)) *
                100,
            )}%`,
          }}
          data-testid={`timeline-clip-retake-draft-${clip.id}`}
        />
      ) : null}

      <div className="relative flex h-full flex-col justify-between p-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate font-display text-sm text-text-primary">{clip.label}</span>
          <span className="rounded-full bg-canvas/80 px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-text-muted">
            {mediaAsset?.type ?? 'clip'}
          </span>
        </div>
        {clip.storyboardDerived ? (
          <div className="flex min-w-0 items-center gap-1.5 text-[10px]">
            <span className="rounded-full border border-border bg-canvas/80 px-1.5 py-0.5 uppercase tracking-[0.12em] text-text-muted">
              Derived
            </span>
            {isPlaceholder ? (
              <span className="rounded-full border border-status-warning-border bg-status-warning-muted px-1.5 py-0.5 uppercase tracking-[0.12em] text-status-warning">
                Placeholder
              </span>
            ) : null}
          </div>
        ) : null}
        <div className="flex items-center justify-between gap-2 text-[11px] text-text-muted">
          <span className="truncate">
            {clip.storyboardDerived
              ? (sceneName ?? 'Storyboard scene')
              : mediaAsset?.type === 'audio'
                ? `Gain ${audioGainLabel} / Fade ${formatSecondsLabel(clip.fadeInMs)}`
                : `${clip.transitionIn ? clip.transitionIn.type : 'cut'} / ${clip.transitionOut ? clip.transitionOut.type : 'cut'}`}
          </span>
          <span className="font-mono">{formatSecondsLabel(clip.durationMs)}</span>
        </div>
        {retakeRanges.length > 0 || hasDraftRetakeRange ? (
          <div className="mt-1 flex items-center gap-1.5 text-[10px]">
            {retakeRanges.length > 0 ? (
              <span
                className="rounded-full border border-accent-primary/30 bg-accent-primary-muted px-1.5 py-0.5 uppercase tracking-[0.12em] text-accent-primary"
                data-testid={`timeline-clip-retake-badge-${clip.id}`}
              >
                {retakeRanges.length} retake{retakeRanges.length === 1 ? '' : 's'}
              </span>
            ) : null}
            {hasDraftRetakeRange ? (
              <span className="rounded-full border border-status-warning-border bg-status-warning-muted px-1.5 py-0.5 uppercase tracking-[0.12em] text-status-warning">
                Draft
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
    </button>
  );
});

export const Timeline = memo(function Timeline() {
  const {
    projects,
    activeProjectId,
    activeSceneId,
    setActiveScene,
    mediaAssets,
    timelineSequences,
    timelineTracks,
    timelineClips,
    activeTimelineSequenceId,
    activeTimelineClipId,
    activeTimelineRetakeRangeId,
    setActiveTimelineSequence,
    setActiveTimelineClip,
    setActiveTimelineRetakeRange,
    ensureTimelineSequenceForProject,
    createTimelineTrack,
    createTimelineClip,
    createTimelineClipRetakeRange,
    updateTimelineTrack,
    moveTimelineClip,
    splitTimelineClip,
    duplicateTimelineClip,
    deleteTimelineClip,
    setTimelineSequencePlayRange,
    timelineMode,
    setTimelineMode,
    playState,
    currentTime,
    onionSkinEnabled,
    setOnionSkinEnabled,
    timelineStop,
    timelinePause,
    toggleTimelinePlayback,
    seekTo,
    seekBy,
  } = useAppStore(
    useShallow((state) => ({
      projects: state.projects,
      activeProjectId: state.activeProjectId,
      activeSceneId: state.activeSceneId,
      setActiveScene: state.setActiveScene,
      mediaAssets: state.mediaAssets,
      timelineSequences: state.timelineSequences,
      timelineTracks: state.timelineTracks,
      timelineClips: state.timelineClips,
      activeTimelineSequenceId: state.activeTimelineSequenceId,
      activeTimelineClipId: state.activeTimelineClipId,
      activeTimelineRetakeRangeId: state.activeTimelineRetakeRangeId,
      setActiveTimelineSequence: state.setActiveTimelineSequence,
      setActiveTimelineClip: state.setActiveTimelineClip,
      setActiveTimelineRetakeRange: state.setActiveTimelineRetakeRange,
      ensureTimelineSequenceForProject: state.ensureTimelineSequenceForProject,
      createTimelineTrack: state.createTimelineTrack,
      createTimelineClip: state.createTimelineClip,
      createTimelineClipRetakeRange: state.createTimelineClipRetakeRange,
      updateTimelineTrack: state.updateTimelineTrack,
      moveTimelineClip: state.moveTimelineClip,
      splitTimelineClip: state.splitTimelineClip,
      duplicateTimelineClip: state.duplicateTimelineClip,
      deleteTimelineClip: state.deleteTimelineClip,
      setTimelineSequencePlayRange: state.setTimelineSequencePlayRange,
      timelineMode: state.timelineMode,
      setTimelineMode: state.setTimelineMode,
      playState: state.playState,
      currentTime: state.currentTime,
      onionSkinEnabled: state.onionSkinEnabled,
      setOnionSkinEnabled: state.setOnionSkinEnabled,
      timelineStop: state.timelineStop,
      timelinePause: state.timelinePause,
      toggleTimelinePlayback: state.toggleTimelinePlayback,
      seekTo: state.seekTo,
      seekBy: state.seekBy,
    })),
  );

  const [isCollapsed, setIsCollapsed] = useState(false);
  const [zoom, setZoom] = useState(1.5);
  const [selectedTrackId, setSelectedTrackId] = useState<string | null>(null);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [insertMediaId, setInsertMediaId] = useState('');
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
  const [retakeDraftRange, setRetakeDraftRange] = useState<TimelineRetakeDraftRange | null>(null);
  const [isTrackSidebarCollapsed, setIsTrackSidebarCollapsed] = useState(false);
  const [isInspectorCollapsed, setIsInspectorCollapsed] = useState(false);

  const activeProject = projects.find((project) => project.id === activeProjectId) ?? null;
  const storyboardScenes = activeProject?.scenes ?? [];

  useEffect(() => {
    if (!activeProjectId) {
      return;
    }

    const project = projects.find((item) => item.id === activeProjectId) ?? null;
    const preferredSequenceId = activeTimelineSequenceId ?? project?.timelineSequenceId ?? null;
    if (preferredSequenceId) {
      setActiveTimelineSequence(preferredSequenceId);
      return;
    }

    const sequence = ensureTimelineSequenceForProject(activeProjectId);
    if (sequence) {
      setActiveTimelineSequence(sequence.id);
    }
  }, [
    activeProjectId,
    activeTimelineSequenceId,
    ensureTimelineSequenceForProject,
    projects,
    setActiveTimelineSequence,
  ]);

  const activeSequence =
    (activeTimelineSequenceId
      ? timelineSequences.find((sequence) => sequence.id === activeTimelineSequenceId)
      : null) ??
    (activeProject?.timelineSequenceId
      ? timelineSequences.find((sequence) => sequence.id === activeProject.timelineSequenceId)
      : null) ??
    null;

  const sequenceTracks = useMemo(
    () =>
      activeSequence
        ? timelineTracks
            .filter((track) => track.sequenceId === activeSequence.id)
            .sort((left, right) => left.orderIndex - right.orderIndex)
        : [],
    [activeSequence, timelineTracks],
  );
  const clipsByTrackId = useMemo(() => {
    const map = new Map<string, TimelineClip[]>();

    for (const clip of timelineClips) {
      if (!sequenceTracks.some((track) => track.id === clip.trackId)) {
        continue;
      }

      const current = map.get(clip.trackId) ?? [];
      current.push(clip);
      map.set(clip.trackId, current);
    }

    for (const [trackId, clips] of map.entries()) {
      map.set(
        trackId,
        [...clips].sort((left, right) => left.startMs - right.startMs),
      );
    }

    return map;
  }, [sequenceTracks, timelineClips]);
  const clipLookup = useMemo(() => new Map(timelineClips.map((clip) => [clip.id, clip])), [timelineClips]);
  const mediaLookup = useMemo(() => new Map(mediaAssets.map((asset) => [asset.id, asset])), [mediaAssets]);
  const sceneLookup = useMemo(
    () => new Map(storyboardScenes.map((scene) => [scene.id, scene])),
    [storyboardScenes],
  );
  const activeClip = activeTimelineClipId ? clipLookup.get(activeTimelineClipId) ?? null : null;
  const activeClipMediaAsset = activeClip ? mediaLookup.get(activeClip.mediaAssetId) ?? null : null;
  const activeClipDraftRange =
    activeClip && retakeDraftRange?.clipId === activeClip.id ? retakeDraftRange : null;
  const canAuthorRetake = activeClipMediaAsset?.type === 'video';
  const clipLocalPlayheadMs = activeClip ? clampClipRelativeTime(currentTime, activeClip) : null;
  const canCreateRetake =
    canAuthorRetake &&
    activeClipDraftRange?.startMs !== null &&
    activeClipDraftRange?.startMs !== undefined &&
    activeClipDraftRange?.endMs !== null &&
    activeClipDraftRange?.endMs !== undefined &&
    activeClipDraftRange.endMs > activeClipDraftRange.startMs;
  const retakeToolbarMessage = !activeClip
    ? 'Select a video clip to mark a retake range.'
    : !canAuthorRetake
      ? 'Retakes are only available on video clips.'
      : canCreateRetake
        ? formatRetakeRangeLabel(activeClipDraftRange!.startMs!, activeClipDraftRange!.endMs!)
        : activeClipDraftRange?.startMs !== null || activeClipDraftRange?.endMs !== null
          ? 'Mark the second retake boundary, then create the range.'
          : 'Mark retake in and out on the selected clip.';

  useEffect(() => {
    if (!mediaAssets.length) {
      setInsertMediaId('');
      return;
    }

    if (!insertMediaId || !mediaAssets.some((asset) => asset.id === insertMediaId)) {
      setInsertMediaId(mediaAssets[0].id);
    }
  }, [insertMediaId, mediaAssets]);

  useEffect(() => {
    if (activeClip?.trackId) {
      setSelectedTrackId(activeClip.trackId);
    }
  }, [activeClip?.trackId]);

  useEffect(() => {
    if (!retakeDraftRange) {
      return;
    }

    if (!activeClip || retakeDraftRange.clipId !== activeClip.id || activeClipMediaAsset?.type !== 'video') {
      setRetakeDraftRange((current) => {
        if (!current) {
          return current;
        }

        if (
          !activeClip ||
          current.clipId !== activeClip.id ||
          activeClipMediaAsset?.type !== 'video'
        ) {
          return null;
        }

        return current;
      });
    }
  }, [activeClip, activeClipMediaAsset?.type, retakeDraftRange]);

  const selectedMediaAsset = mediaAssets.find((asset) => asset.id === insertMediaId) ?? mediaAssets[0] ?? null;
  const totalDurationMs = Math.max(activeSequence?.durationMs ?? 0, activeSequence?.playRange?.endMs ?? 0, 10000);
  const progress = totalDurationMs > 0 ? (currentTime / totalDurationMs) * 100 : 0;
  const frameStepMs = Math.max(1, Math.round(1000 / Math.max(activeSequence?.fps ?? 24, 1)));
  const selectedTrack = sequenceTracks.find((track) => track.id === (activeClip?.trackId ?? selectedTrackId)) ?? null;

  const ensureCompatibleTrack = useCallback(
    (asset: MediaAsset) => {
      if (!activeSequence) {
        return null;
      }

      const targetKind = getTrackKindForMediaAsset(asset);
      const existing =
        sequenceTracks.find((track) => !track.locked && track.kind === targetKind) ??
        (targetKind === 'image'
          ? sequenceTracks.find((track) => !track.locked && track.kind === 'overlay')
          : null);

      if (existing) {
        return existing;
      }

      return createTimelineTrack(activeSequence.id, {
        kind: targetKind,
        name:
          targetKind === 'video'
            ? `Video ${sequenceTracks.length + 1}`
            : targetKind === 'audio'
              ? `Audio ${sequenceTracks.length + 1}`
              : `Image ${sequenceTracks.length + 1}`,
      });
    },
    [activeSequence, createTimelineTrack, sequenceTracks],
  );

  const insertClip = useCallback(
    (asset: MediaAsset, startMs: number, trackId?: string) => {
      if (!activeSequence) {
        return;
      }

      const compatibleTrack =
        (trackId
          ? sequenceTracks.find(
              (track) =>
                track.id === trackId &&
                !track.locked &&
                (track.kind === getTrackKindForMediaAsset(asset) ||
                  (asset.type === 'image' && track.kind === 'overlay')),
            ) ?? null
          : null) ??
        ensureCompatibleTrack(asset);

      if (!compatibleTrack) {
        return;
      }

      const clip = createTimelineClip({
        trackId: compatibleTrack.id,
        mediaAssetId: asset.id,
        sceneId: activeSceneId ?? null,
        startMs,
        durationMs: getClipDurationForAsset(asset),
        label: asset.name,
        posterUrl: asset.posterUrl ?? asset.thumbnailUrl ?? asset.previewUrl,
      });

      if (clip) {
        setActiveTimelineClip(clip.id);
      }
    },
    [activeSceneId, activeSequence, createTimelineClip, ensureCompatibleTrack, sequenceTracks, setActiveTimelineClip],
  );

  const handleAddTrack = useCallback(() => {
    if (!activeSequence) {
      return;
    }

    const targetKind = selectedMediaAsset ? getTrackKindForMediaAsset(selectedMediaAsset) : 'video';
    createTimelineTrack(activeSequence.id, {
      kind: targetKind,
      name:
        targetKind === 'video'
          ? `Video ${sequenceTracks.length + 1}`
          : targetKind === 'audio'
            ? `Audio ${sequenceTracks.length + 1}`
            : `Image ${sequenceTracks.length + 1}`,
    });
  }, [activeSequence, createTimelineTrack, selectedMediaAsset, sequenceTracks.length]);

  const handleAddClip = useCallback(() => {
    if (!selectedMediaAsset) {
      return;
    }

    insertClip(selectedMediaAsset, activeSequence?.durationMs ?? 0, selectedTrack?.id);
  }, [activeSequence?.durationMs, insertClip, selectedMediaAsset, selectedTrack?.id]);

  const handleMarkRetakeBoundary = useCallback(
    (edge: 'startMs' | 'endMs') => {
      if (!activeClip || !canAuthorRetake || clipLocalPlayheadMs === null) {
        return;
      }

      setRetakeDraftRange((current) => {
        const next =
          current?.clipId === activeClip.id
            ? { ...current }
            : {
                clipId: activeClip.id,
                startMs: null,
                endMs: null,
              };

        next[edge] = clipLocalPlayheadMs;
        return next;
      });
    },
    [activeClip, canAuthorRetake, clipLocalPlayheadMs],
  );

  const handleCreateRetake = useCallback(() => {
    if (!activeClip || !canCreateRetake || !activeClipDraftRange) {
      return;
    }

    const nextRange = createTimelineClipRetakeRange(activeClip.id, {
      startMs: activeClipDraftRange.startMs!,
      endMs: activeClipDraftRange.endMs!,
    });

    if (nextRange) {
      setRetakeDraftRange(null);
      setActiveTimelineRetakeRange(nextRange.id);
    }
  }, [
    activeClip,
    activeClipDraftRange,
    canCreateRetake,
    createTimelineClipRetakeRange,
    setActiveTimelineRetakeRange,
  ]);

  const handleClearRetakeDraft = useCallback(() => {
    setRetakeDraftRange((current) => {
      if (!activeClip || !current || current.clipId !== activeClip.id) {
        return null;
      }

      return null;
    });
  }, [activeClip]);

  const handleTrackInsert = useCallback(
    (event: React.MouseEvent<HTMLDivElement>, track: TimelineTrack) => {
      if (!selectedMediaAsset || track.locked) {
        return;
      }

      const rect = event.currentTarget.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
      insertClip(selectedMediaAsset, Math.round(ratio * totalDurationMs), track.id);
    },
    [insertClip, selectedMediaAsset, totalDurationMs],
  );

  const handleSkipToStart = useCallback(() => {
    seekTo(activeSequence?.playRange?.startMs ?? 0);
    timelinePause();
  }, [activeSequence?.playRange?.startMs, seekTo, timelinePause]);

  const handleSkipToEnd = useCallback(() => {
    seekTo(activeSequence?.playRange?.endMs ?? totalDurationMs);
    timelinePause();
  }, [activeSequence?.playRange?.endMs, seekTo, timelinePause, totalDurationMs]);
  const handleStepBackward = useCallback(() => {
    seekBy(-frameStepMs);
    timelinePause();
  }, [frameStepMs, seekBy, timelinePause]);
  const handleStepForward = useCallback(() => {
    seekBy(frameStepMs);
    timelinePause();
  }, [frameStepMs, seekBy, timelinePause]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement ||
        event.target instanceof HTMLSelectElement
      ) {
        return;
      }

      if (event.key === ' ') {
        event.preventDefault();
        toggleTimelinePlayback();
        return;
      }

      if (event.key === 'Home') {
        event.preventDefault();
        seekTo(activeSequence?.playRange?.startMs ?? 0);
        return;
      }

      if (event.key === 'End') {
        event.preventDefault();
        seekTo(activeSequence?.playRange?.endMs ?? totalDurationMs);
        return;
      }

      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        if (event.altKey && activeClip && activeSequence) {
          moveTimelineClip(activeClip.id, {
            startMs: activeClip.startMs - Math.round(1000 / Math.max(activeSequence.fps, 1)),
          });
          return;
        }

        seekBy(event.shiftKey ? -1000 : -250);
        return;
      }

      if (event.key === 'ArrowRight') {
        event.preventDefault();
        if (event.altKey && activeClip && activeSequence) {
          moveTimelineClip(activeClip.id, {
            startMs: activeClip.startMs + Math.round(1000 / Math.max(activeSequence.fps, 1)),
          });
          return;
        }

        seekBy(event.shiftKey ? 1000 : 250);
        return;
      }

      if (event.key.toLowerCase() === 's' && activeClip) {
        event.preventDefault();
        splitTimelineClip(activeClip.id, currentTime);
        return;
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'd' && activeClip) {
        event.preventDefault();
        duplicateTimelineClip(activeClip.id);
        return;
      }

      if ((event.key === 'Delete' || event.key === 'Backspace') && activeClip) {
        event.preventDefault();
        setDeleteTargetId(activeClip.id);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    activeClip,
    activeSequence,
    currentTime,
    duplicateTimelineClip,
    moveTimelineClip,
    seekBy,
    seekTo,
    splitTimelineClip,
    toggleTimelinePlayback,
    totalDurationMs,
  ]);

  const showTimelineDetailsDeck =
    timelineMode === 'canvas' && (!isTrackSidebarCollapsed || !isInspectorCollapsed);

  if (isCollapsed) {
    return (
      <motion.div
        initial={{ height: EXPANDED_HEIGHT }}
        animate={{ height: COLLAPSED_HEIGHT }}
        transition={{ duration: 0.2 }}
        className="flex items-center gap-3 overflow-hidden border-t border-border bg-elevated px-4"
      >
        <button
          type="button"
          onClick={() => setIsCollapsed(false)}
          className="rounded p-1 text-text-muted transition hover:text-text-primary"
          aria-label="Expand timeline"
        >
          <ChevronUp className="h-3.5 w-3.5" />
        </button>
        <div className="h-4 w-px bg-border" />
        <button
          type="button"
          onClick={toggleTimelinePlayback}
          className={cn(
            'rounded-lg p-1.5 transition',
            playState === 'playing'
              ? 'bg-accent-primary text-void shadow-accent-subtle'
              : 'border border-accent-primary-border bg-accent-primary-muted text-accent-primary',
          )}
          aria-label={playState === 'playing' ? 'Pause' : 'Play'}
        >
          {playState === 'playing' ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
        </button>
        <span className="font-mono text-xs text-text-primary">
          {formatTimecode(currentTime, activeSequence?.fps ?? 24)}
        </span>
        <span className="font-mono text-xs text-text-muted">/</span>
        <span className="font-mono text-xs text-text-muted">
          {formatTimecode(totalDurationMs, activeSequence?.fps ?? 24)}
        </span>
        <div
          className="mx-2 h-1.5 flex-1 overflow-hidden rounded-full bg-void"
          role="progressbar"
          aria-label="Timeline progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress)}
        >
          <div
            className="h-full rounded-full"
            style={{
              width: `${progress}%`,
              background:
                'linear-gradient(90deg, var(--color-gradient-progress-start), var(--color-gradient-progress-end))',
            }}
          />
        </div>
        <div className="flex items-center gap-1 text-text-muted">
          <Layers className="h-3 w-3" />
          <span className="font-mono text-[11px]">{sequenceTracks.length}</span>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ height: COLLAPSED_HEIGHT }}
      animate={{ height: EXPANDED_HEIGHT }}
      transition={{ duration: 0.2 }}
      className="flex flex-col overflow-hidden border-t border-border bg-surface shadow-cinematic"
    >
      <div className="flex min-h-12 items-center justify-between gap-3 border-b border-border bg-elevated/90 px-3 py-1.5 backdrop-blur-sm">
        <div className="timeline-toolbar-scroll flex min-w-0 flex-1 items-center gap-2 overflow-x-auto overflow-y-hidden pb-1">
          <TransportControls
            isPlaying={playState === 'playing'}
            currentTime={currentTime}
            totalDurationMs={totalDurationMs}
            fps={activeSequence?.fps ?? 24}
            onTogglePlay={toggleTimelinePlayback}
            onStop={timelineStop}
            onStepBackward={handleStepBackward}
            onStepForward={handleStepForward}
            onSkipToStart={handleSkipToStart}
            onSkipToEnd={handleSkipToEnd}
          />

          <div className="mx-1 h-5 w-px bg-border" />

          <div className="flex h-8 items-center gap-0.5 rounded-lg border border-border bg-canvas p-0.5 shadow-sm">
            {(['storyboard', 'animation', 'canvas'] as const).map((mode) => {
              const active = timelineMode === mode;
              return (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setTimelineMode(mode)}
                  className={cn(
                    'h-7 rounded-md px-2.5 text-xs font-display capitalize transition',
                    active
                      ? 'bg-panel-raised text-accent-primary shadow-sm'
                      : 'text-text-muted hover:bg-surface hover:text-text-body',
                  )}
                  aria-label={`${mode} mode`}
                >
                  {mode}
                </button>
              );
            })}
          </div>

          {timelineMode === 'canvas' ? (
            <>
              <div className="mx-1 h-5 w-px bg-border" />

              <button
                type="button"
                onClick={() => activeClip && splitTimelineClip(activeClip.id, currentTime)}
                disabled={!activeClip}
                className="rounded-md p-1.5 text-text-body transition disabled:cursor-not-allowed disabled:text-text-muted/40 hover:bg-surface hover:text-text-primary"
                aria-label="Split clip"
                title="Split clip"
              >
                <Scissors className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => activeClip && duplicateTimelineClip(activeClip.id)}
                disabled={!activeClip}
                className="rounded-md p-1.5 text-text-body transition disabled:cursor-not-allowed disabled:text-text-muted/40 hover:bg-surface hover:text-text-primary"
                aria-label="Duplicate clip"
                title="Duplicate clip"
              >
                <Copy className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => activeClip && setDeleteTargetId(activeClip.id)}
                disabled={!activeClip}
                className="rounded-md p-1.5 text-text-body transition disabled:cursor-not-allowed disabled:text-text-muted/40 hover:bg-status-error-muted hover:text-status-error"
                aria-label="Delete clip"
                title="Delete clip"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>

            </>
          ) : null}
        </div>

        <div className="flex flex-none items-center gap-2">
          <ZoomControls zoom={zoom} onZoomChange={setZoom} />
          {timelineMode === 'canvas' ? (
            <>
              <div className="mx-1 h-5 w-px bg-border" />
              <button
                type="button"
                onClick={() => setIsTrackSidebarCollapsed((collapsed) => !collapsed)}
                className="rounded-md border border-border bg-canvas p-1.5 text-text-body transition hover:bg-surface hover:text-text-primary"
                aria-label={isTrackSidebarCollapsed ? 'Expand track list' : 'Collapse track list'}
                title={isTrackSidebarCollapsed ? 'Expand track list' : 'Collapse track list'}
              >
                {isTrackSidebarCollapsed ? (
                  <ChevronUp className="h-3.5 w-3.5" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5" />
                )}
              </button>
              <button
                type="button"
                onClick={() => setIsInspectorCollapsed((collapsed) => !collapsed)}
                className="rounded-md border border-border bg-canvas p-1.5 text-text-body transition hover:bg-surface hover:text-text-primary"
                aria-label={isInspectorCollapsed ? 'Expand clip inspector' : 'Collapse clip inspector'}
                title={isInspectorCollapsed ? 'Expand clip inspector' : 'Collapse clip inspector'}
              >
                {isInspectorCollapsed ? (
                  <ChevronUp className="h-3.5 w-3.5" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5" />
                )}
              </button>
            </>
          ) : null}
          <div className="mx-1 h-5 w-px bg-border" />
          <button
            type="button"
            onClick={() => setOnionSkinEnabled(!onionSkinEnabled)}
            className={cn(
              'rounded-md p-1.5 transition',
              onionSkinEnabled ? 'bg-accent-primary-muted text-accent-primary' : 'text-text-body hover:bg-surface hover:text-text-primary',
            )}
            aria-label="Toggle onion skin"
            aria-pressed={onionSkinEnabled}
          >
            <Layers className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setIsCollapsed(true)}
            className="rounded-md p-1.5 text-text-body transition hover:bg-surface hover:text-text-primary"
            aria-label="Collapse timeline"
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {timelineMode === 'storyboard' ? (
        <StoryboardPlayback className="flex-1" />
      ) : timelineMode === 'animation' ? (
        <AnimationTrackEditor className="flex-1" />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-hidden">
            <div className="timeline-scroll-area h-full overflow-auto">
              <div
                className="min-h-full"
                style={{
                  width: `${Math.max(100, zoom * 100)}%`,
                  minWidth: '900px',
                }}
              >
                <TimeRuler
                  totalDurationMs={totalDurationMs}
                  currentTime={currentTime}
                  playRange={activeSequence?.playRange ?? null}
                  zoom={zoom}
                  onSeek={seekTo}
                />

                {storyboardScenes.length > 0 ? (
                  <div className="relative flex h-10 items-center gap-2 border-b border-border bg-elevated/30 px-2">
                    {storyboardScenes
                      .slice()
                      .sort((left, right) => left.orderIndex - right.orderIndex)
                      .map((scene, index) => {
                        const width = 100 / storyboardScenes.length;
                        return (
                          <button
                            key={scene.id}
                            type="button"
                            onClick={() => setActiveScene(scene.id)}
                            className={cn(
                              'absolute top-1 h-8 overflow-hidden rounded-lg border px-2 text-left transition',
                              activeSceneId === scene.id
                                ? 'border-accent-primary bg-accent-primary-muted text-accent-primary'
                                : 'border-border bg-surface/80 text-text-muted hover:text-text-primary',
                            )}
                            style={{
                              left: `${index * width}%`,
                              width: `${Math.max(width - 0.6, 6)}%`,
                            }}
                            aria-label={`Scene: ${scene.name}`}
                          >
                            <span className="truncate text-[11px]">{scene.name}</span>
                          </button>
                        );
                      })}
                  </div>
                ) : null}

                <div role="listbox" aria-label="Timeline tracks" className="relative">
                  <div
                    className="pointer-events-none absolute inset-y-0 z-20 w-px bg-accent-primary"
                    style={{ left: `${(currentTime / totalDurationMs) * 100}%` }}
                  />

                  {sequenceTracks.length === 0 ? (
                    <div className="flex h-28 items-center justify-center border-b border-border">
                      <div className="text-center">
                        <Layers className="mx-auto h-8 w-8 text-text-muted/40" />
                        <p className="mt-2 font-display text-sm text-text-primary">No tracks yet</p>
                        <p className="mt-1 text-xs text-text-muted">
                          Add a track, then drop imported or generated media into the timeline.
                        </p>
                      </div>
                    </div>
                  ) : (
                    sequenceTracks.map((track) => {
                      const clips = clipsByTrackId.get(track.id) ?? [];

                      return (
                        <div
                          key={track.id}
                          className={cn(
                            'relative border-b border-border',
                            track.hidden ? 'bg-canvas/40' : 'bg-canvas/70',
                          )}
                          style={{ height: TRACK_HEIGHT }}
                          onDoubleClick={(event) => handleTrackInsert(event, track)}
                        >
                          <div
                            className={cn(
                              'pointer-events-none absolute left-3 top-2 z-20 inline-flex max-w-[180px] items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] shadow-sm backdrop-blur-sm',
                              (activeClip?.trackId ?? selectedTrackId) === track.id
                                ? 'border-accent-primary-border bg-accent-primary-muted text-accent-primary'
                                : 'border-border bg-surface/85 text-text-muted',
                            )}
                          >
                            {track.kind === 'video' ? (
                              <Film className="h-3 w-3 flex-none" />
                            ) : track.kind === 'audio' ? (
                              <AudioLines className="h-3 w-3 flex-none" />
                            ) : (
                              <ImageIcon className="h-3 w-3 flex-none" />
                            )}
                            <span className="font-mono text-[10px] text-text-primary">
                              {track.kind === 'audio' ? 'A' : track.kind === 'video' ? 'V' : 'I'}
                              {track.orderIndex + 1}
                            </span>
                            <span className="truncate">{track.name}</span>
                          </div>

                          {track.hidden ? (
                            <div className="flex h-full items-center justify-center text-[11px] uppercase tracking-[0.14em] text-text-muted">
                              Hidden track
                            </div>
                          ) : (
                            <div className="relative h-full px-2">
                              {clips.map((clip) => {
                                const mediaAsset = mediaLookup.get(clip.mediaAssetId) ?? null;
                                const sourceScene = clip.sceneId ? sceneLookup.get(clip.sceneId) ?? null : null;

                                return (
                                  <TimelineClipBlock
                                    key={clip.id}
                                    clip={clip}
                                    mediaAsset={mediaAsset}
                                    sceneName={sourceScene?.name ?? null}
                                    isPlaceholder={isStoryboardPlaceholderAsset(mediaAsset)}
                                    totalDurationMs={totalDurationMs}
                                    selected={activeTimelineClipId === clip.id}
                                    activeRetakeRangeId={activeTimelineRetakeRangeId}
                                    draftRetakeRange={
                                      retakeDraftRange?.clipId === clip.id ? retakeDraftRange : null
                                    }
                                    onSelect={() => {
                                      setSelectedTrackId(track.id);
                                      setActiveTimelineClip(clip.id);
                                    }}
                                  />
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          </div>

          {showTimelineDetailsDeck ? (
            <div
              className={cn(
                'grid flex-none grid-rows-[40px_minmax(0,1fr)] border-t border-border bg-panel/95 shadow-inner',
                !isTrackSidebarCollapsed && !isInspectorCollapsed
                  ? 'grid-cols-[minmax(240px,0.36fr)_minmax(0,0.64fr)]'
                  : 'grid-cols-1',
              )}
              style={{ height: DETAILS_DECK_HEIGHT }}
              data-testid="timeline-details-deck"
            >
              <div className="timeline-toolbar-scroll col-span-full flex min-w-0 items-center gap-2 overflow-x-auto overflow-y-hidden border-b border-border bg-elevated/60 px-3 py-1">
                <span className="mr-1 flex-none text-[11px] text-text-muted">Clip & Range Tools</span>
                <select
                  aria-label="Media asset for timeline"
                  className={TIMELINE_ACTION_SELECT_CLASS}
                  value={selectedMediaAsset?.id ?? ''}
                  onChange={(event) => setInsertMediaId(event.target.value)}
                >
                  {mediaAssets.length === 0 ? <option value="">No media</option> : null}
                  {mediaAssets.map((asset) => (
                    <option key={asset.id} value={asset.id}>
                      {asset.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={handleAddClip}
                  disabled={!selectedMediaAsset}
                  className={TIMELINE_ACTION_BUTTON_CLASS}
                  aria-label="Add clip to timeline"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add Clip
                </button>

                <div className="mx-1 h-5 w-px flex-none bg-border" />

                <button
                  type="button"
                  onClick={() => handleMarkRetakeBoundary('startMs')}
                  disabled={!canAuthorRetake}
                  className={TIMELINE_ACTION_BUTTON_CLASS}
                  aria-label="Mark Retake In"
                >
                  Retake In
                </button>
                <button
                  type="button"
                  onClick={() => handleMarkRetakeBoundary('endMs')}
                  disabled={!canAuthorRetake}
                  className={TIMELINE_ACTION_BUTTON_CLASS}
                  aria-label="Mark Retake Out"
                >
                  Retake Out
                </button>
                <button
                  type="button"
                  onClick={handleCreateRetake}
                  disabled={!canCreateRetake}
                  className={TIMELINE_ACTION_BUTTON_CLASS}
                  aria-label="Create Retake"
                >
                  Create Retake
                </button>
                <button
                  type="button"
                  onClick={handleClearRetakeDraft}
                  disabled={!activeClipDraftRange}
                  className={TIMELINE_ACTION_BUTTON_CLASS}
                  aria-label="Clear Retake Range"
                >
                  Clear Range
                </button>
                <span
                  className={cn(
                    'max-w-[180px] flex-none truncate whitespace-nowrap rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.12em]',
                    canAuthorRetake
                      ? 'border-accent-primary/25 bg-accent-primary-muted text-accent-primary'
                      : 'border-border bg-canvas/70 text-text-muted',
                  )}
                  data-testid="timeline-retake-toolbar-status"
                >
                  {retakeToolbarMessage}
                </span>

                <div className="mx-1 h-5 w-px flex-none bg-border" />

                <button
                  type="button"
                  onClick={() =>
                    activeSequence &&
                    setTimelineSequencePlayRange(activeSequence.id, {
                      startMs: useAppStore.getState().currentTime,
                      endMs: activeSequence.playRange?.endMs ?? totalDurationMs,
                    })
                  }
                  disabled={!activeSequence}
                  className={TIMELINE_ACTION_BUTTON_CLASS}
                  aria-label="Mark range in"
                >
                  Mark In
                </button>
                <button
                  type="button"
                  onClick={() =>
                    activeSequence &&
                    setTimelineSequencePlayRange(activeSequence.id, {
                      startMs: activeSequence.playRange?.startMs ?? 0,
                      endMs: useAppStore.getState().currentTime,
                    })
                  }
                  disabled={!activeSequence}
                  className={TIMELINE_ACTION_BUTTON_CLASS}
                  aria-label="Mark range out"
                >
                  Mark Out
                </button>
                <button
                  type="button"
                  onClick={() => activeSequence && setTimelineSequencePlayRange(activeSequence.id, null)}
                  disabled={!activeSequence?.playRange}
                  className={TIMELINE_ACTION_BUTTON_CLASS}
                  aria-label="Clear play range"
                >
                  Clear Range
                </button>

                <div className="mx-1 h-5 w-px flex-none bg-border" />

                <button
                  type="button"
                  onClick={() => setIsExportDialogOpen(true)}
                  disabled={!activeSequence}
                  className={TIMELINE_ACTION_BUTTON_CLASS}
                  aria-label="Export timeline as MP4"
                  data-testid="timeline-open-export"
                >
                  <Download className="h-3.5 w-3.5" />
                  Export MP4
                </button>
              </div>

              {isTrackSidebarCollapsed ? null : (
                <div
                  className={cn(
                    'min-w-0 overflow-hidden bg-canvas/80',
                    !isInspectorCollapsed ? 'border-r border-border' : null,
                  )}
                  data-testid="timeline-track-sidebar"
                >
                  <div className="flex h-9 items-center justify-between border-b border-border px-3">
                    <div className="min-w-0">
                      <p className="type-ui text-text-primary">Tracks</p>
                      <p className="truncate text-[11px] text-text-muted">
                        {sequenceTracks.length === 0
                          ? 'Add tracks to start editing'
                          : `${sequenceTracks.length} track${sequenceTracks.length === 1 ? '' : 's'} in this sequence`}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleAddTrack}
                      className="inline-flex h-6 items-center gap-1 rounded-md border border-border bg-surface px-2 text-[11px] text-text-primary transition hover:bg-elevated"
                      aria-label="Add track"
                    >
                      <Plus className="h-3 w-3" />
                      Track
                    </button>
                  </div>
                  <div className="timeline-detail-scroll h-[calc(100%-36px)] overflow-y-auto">
                    {sequenceTracks.map((track) => (
                      <TrackHeader
                        key={track.id}
                        track={track}
                        clipCount={clipsByTrackId.get(track.id)?.length ?? 0}
                        isSelected={(activeClip?.trackId ?? selectedTrackId) === track.id}
                        onSelect={() => {
                          setSelectedTrackId(track.id);
                          setActiveTimelineClip(clipsByTrackId.get(track.id)?.[0]?.id ?? null);
                        }}
                        onToggleMute={() => updateTimelineTrack(track.id, { muted: !track.muted })}
                        onToggleSolo={() => updateTimelineTrack(track.id, { solo: !track.solo })}
                        onToggleHidden={() => updateTimelineTrack(track.id, { hidden: !track.hidden })}
                        onToggleLocked={() => updateTimelineTrack(track.id, { locked: !track.locked })}
                      />
                    ))}
                    {sequenceTracks.length === 0 ? (
                      <div className="flex h-full min-h-[68px] items-center justify-center px-3 text-center text-xs text-text-muted">
                        No tracks yet. Add a track or drop media into the timeline.
                      </div>
                    ) : null}
                  </div>
                </div>
              )}

              {isInspectorCollapsed ? null : (
                <TimelineClipInspector
                  className="h-full w-full min-w-0 flex-shrink-0 border-l-0 bg-transparent p-3"
                  onOpenExportDialog={() => setIsExportDialogOpen(true)}
                  exportDisabled={!activeSequence}
                  exportScopeLabel={activeSequence?.playRange ? 'Active Range' : 'Full Sequence'}
                />
              )}
            </div>
          ) : null}
        </div>
      )}

      <TimelineExportDialog
        open={isExportDialogOpen}
        sequenceId={activeSequence?.id ?? null}
        onClose={() => setIsExportDialogOpen(false)}
      />

      <ConfirmDialog
        open={deleteTargetId !== null}
        title="Delete Clip"
        message="Delete the selected clip from the timeline? This keeps the media asset but removes the clip edit."
        confirmLabel="Delete Clip"
        variant="danger"
        onConfirm={() => {
          if (deleteTargetId) {
            deleteTimelineClip(deleteTargetId);
          }
          setDeleteTargetId(null);
        }}
        onCancel={() => setDeleteTargetId(null)}
      />
    </motion.div>
  );
});
