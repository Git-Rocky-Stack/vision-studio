import { memo, useEffect, useMemo, useRef } from 'react';
import { AlertTriangle, AudioLines, Film, ImageIcon, Repeat, TimerReset } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';

import { resolveSequenceComposition, resolveTimelinePlayRange } from '@/features/timeline/sequenceComposition';
import { resolveMediaSourceUrl } from '@/components/ui/MediaPreview';
import { TimelineRetakeCompare } from '@/components/timeline/TimelineRetakeCompare';
import { useAppStore } from '@/store/appStore';
import { cn } from '@/utils/cn';

interface TimelinePlaybackPreviewProps {
  className?: string;
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

function findById<T extends { id: string }>(items: T[], id: string | null | undefined) {
  return id ? items.find((item) => item.id === id) ?? null : null;
}

export const TimelinePlaybackPreview = memo(function TimelinePlaybackPreview({
  className,
}: TimelinePlaybackPreviewProps) {
  const {
    activeProjectId,
    activeTimelineSequenceId,
    currentTime,
    mediaAssets,
    clipRetakeTakes,
    playState,
    projects,
    setActiveTimelineClip,
    timelineClips,
    timelineLoop,
    timelineSequences,
    timelineTracks,
  } = useAppStore(
    useShallow((state) => ({
      activeProjectId: state.activeProjectId,
      activeTimelineSequenceId: state.activeTimelineSequenceId,
      currentTime: state.currentTime,
      mediaAssets: state.mediaAssets,
      clipRetakeTakes: state.clipRetakeTakes,
      playState: state.playState,
      projects: state.projects,
      setActiveTimelineClip: state.setActiveTimelineClip,
      timelineClips: state.timelineClips,
      timelineLoop: state.timelineLoop,
      timelineSequences: state.timelineSequences,
      timelineTracks: state.timelineTracks,
    })),
  );

  const activeProject = useMemo(
    () => findById(projects, activeProjectId),
    [activeProjectId, projects],
  );
  const activeSequence = useMemo(
    () =>
      findById(timelineSequences, activeTimelineSequenceId) ??
      findById(timelineSequences, activeProject?.timelineSequenceId ?? null),
    [activeProject?.timelineSequenceId, activeTimelineSequenceId, timelineSequences],
  );
  const sequenceTracks = useMemo(
    () =>
      activeSequence
        ? timelineTracks
            .filter((track) => track.sequenceId === activeSequence.id)
            .sort((left, right) => left.orderIndex - right.orderIndex)
        : [],
    [activeSequence, timelineTracks],
  );
  const sequenceTrackIds = useMemo(
    () => new Set(sequenceTracks.map((track) => track.id)),
    [sequenceTracks],
  );
  const sequenceClips = useMemo(
    () => timelineClips.filter((clip) => sequenceTrackIds.has(clip.trackId)),
    [sequenceTrackIds, timelineClips],
  );
  const frame = useMemo(
    () =>
      activeSequence
        ? resolveSequenceComposition({
            sequence: activeSequence,
            tracks: sequenceTracks,
            clips: sequenceClips,
            clipRetakeTakes,
            mediaAssets,
            timeMs: currentTime,
          })
        : null,
    [activeSequence, clipRetakeTakes, currentTime, mediaAssets, sequenceClips, sequenceTracks],
  );
  const playRange = useMemo(
    () => (activeSequence ? resolveTimelinePlayRange(activeSequence) : null),
    [activeSequence],
  );
  const effectiveFps = activeSequence?.fps ?? 24;
  const videoRefs = useRef<Record<string, HTMLVideoElement | null>>({});
  const audioRefs = useRef<Record<string, HTMLAudioElement | null>>({});
  const sequenceAudioClips = useMemo(() => {
    const mediaAssetById = new Map(mediaAssets.map((asset) => [asset.id, asset]));
    return sequenceClips
      .map((clip) => {
        const mediaAsset = mediaAssetById.get(clip.mediaAssetId);
        return mediaAsset?.type === 'audio' ? { clip, mediaAsset } : null;
      })
      .filter((entry): entry is { clip: typeof sequenceClips[number]; mediaAsset: typeof mediaAssets[number] } => Boolean(entry));
  }, [mediaAssets, sequenceClips]);
  const soloAudioTrackCount = useMemo(
    () => sequenceTracks.filter((track) => track.kind === 'audio' && track.solo && !track.muted).length,
    [sequenceTracks],
  );

  useEffect(() => {
    if (!frame) {
      return;
    }

    for (const layer of frame.layers) {
      if (layer.mediaType !== 'video') {
        continue;
      }

      const element = videoRefs.current[layer.clipId];
      if (!element) {
        continue;
      }

      const nextTimeSeconds = layer.sourceTimeMs / 1000;
      if (Math.abs(element.currentTime - nextTimeSeconds) > 0.03) {
        try {
          element.currentTime = nextTimeSeconds;
        } catch {
          // Ignore seek errors while metadata is still loading.
        }
      }
    }
  }, [frame]);

  useEffect(() => {
    const activeAudioLayers = new Map((frame?.audioLayers ?? []).map((layer) => [layer.clipId, layer]));

    for (const [clipId, element] of Object.entries(audioRefs.current)) {
      if (!element) {
        continue;
      }

      const layer = activeAudioLayers.get(clipId);
      if (!layer) {
        element.pause();
        continue;
      }

      const nextTimeSeconds = layer.sourceTimeMs / 1000;
      if (Math.abs(element.currentTime - nextTimeSeconds) > 0.05) {
        try {
          element.currentTime = nextTimeSeconds;
        } catch {
          // Ignore seek errors while metadata is still loading.
        }
      }

      element.volume = Math.max(0, Math.min(1, layer.gain));
      element.muted = layer.gain <= 0;

      if (playState === 'playing') {
        void element.play().catch(() => {
          // Ignore autoplay rejections in the preview surface.
        });
      } else {
        element.pause();
      }
    }
  }, [frame, playState]);

  useEffect(() => {
    return () => {
      for (const element of Object.values(audioRefs.current)) {
        element?.pause();
      }
    };
  }, []);

  useEffect(() => {
    if (playState !== 'playing' || !activeSequence) {
      return;
    }

    let animationFrameId = 0;
    let previousTimestamp = 0;
    let accumulatorMs = 0;

    const tick = (timestamp: number) => {
      const state = useAppStore.getState();
      const liveProject = findById(state.projects, state.activeProjectId);
      const liveSequence =
        findById(state.timelineSequences, state.activeTimelineSequenceId) ??
        findById(state.timelineSequences, liveProject?.timelineSequenceId ?? null);

      if (!liveSequence || state.playState !== 'playing') {
        return;
      }

      if (!previousTimestamp) {
        previousTimestamp = timestamp;
        animationFrameId = window.requestAnimationFrame(tick);
        return;
      }

      const elapsedMs = (timestamp - previousTimestamp) * Math.max(0.1, state.timelineSpeed);
      previousTimestamp = timestamp;
      accumulatorMs += elapsedMs;

      const frameDurationMs = 1000 / Math.max(1, liveSequence.fps || effectiveFps);
      if (accumulatorMs >= frameDurationMs) {
        const framesToAdvance = Math.floor(accumulatorMs / frameDurationMs);
        accumulatorMs -= framesToAdvance * frameDurationMs;

        const range = resolveTimelinePlayRange(liveSequence);
        const loopSpanMs = Math.max(range.durationMs, frameDurationMs);
        let nextTime = state.currentTime + framesToAdvance * frameDurationMs;

        if (nextTime >= range.endMs) {
          if (state.timelineLoop && range.durationMs > 0) {
            nextTime = range.startMs + ((nextTime - range.startMs) % loopSpanMs);
          } else {
            state.seekTo(range.endMs);
            state.timelinePause();
            return;
          }
        }

        state.seekTo(nextTime);
      }

      animationFrameId = window.requestAnimationFrame(tick);
    };

    animationFrameId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(animationFrameId);
  }, [activeSequence, effectiveFps, playState]);

  if (!activeSequence || !playRange) {
    return (
      <div
        data-testid="timeline-playback-preview"
        className={cn(
          'flex h-full min-h-0 items-center justify-center rounded-t-2xl border-b border-border bg-surface/70 p-6',
          className,
        )}
      >
        <div className="max-w-md space-y-2 text-center">
          <p className="text-lg text-text-primary">Sequence preview unavailable</p>
          <p className="text-sm text-text-muted">
            Create or select a project timeline to drive the center playback surface.
          </p>
        </div>
      </div>
    );
  }

  const primaryIssue = frame?.issues[0] ?? null;

  return (
    <div
      data-testid="timeline-playback-preview"
      className={cn('flex h-full min-h-0 flex-col overflow-hidden bg-void', className)}
    >
      <div className="flex items-center justify-between gap-3 border-b border-border bg-elevated/75 px-4 py-2 backdrop-blur-sm">
        <div className="min-w-0">
          <p className="truncate text-sm text-text-primary">{activeSequence.name}</p>
          <p className="mt-0.5 data-mono text-text-muted">
            {formatTimecode(frame?.resolvedTimeMs ?? currentTime, effectiveFps)} / {formatTimecode(playRange.endMs, effectiveFps)}
          </p>
        </div>

        <div className="flex items-center gap-2 mono-label text-text-muted">
          <span className="inline-flex items-center gap-1 rounded-full border border-border bg-surface px-2 py-1">
            <TimerReset className="h-3 w-3" />
            {effectiveFps} fps
          </span>
          <span className="inline-flex items-center gap-1 rounded-full border border-border bg-surface px-2 py-1">
            <Repeat className={cn('h-3 w-3', timelineLoop ? 'text-accent-primary' : 'text-text-muted')} />
            {timelineLoop ? 'Loop on' : 'Loop off'}
          </span>
          {sequenceAudioClips.length > 0 ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-border bg-surface px-2 py-1">
              <AudioLines className="h-3 w-3" />
              {frame?.audioLayers.length ?? 0} audio
            </span>
          ) : null}
          {soloAudioTrackCount > 0 ? (
            <span className="rounded-full border border-border bg-surface px-2 py-1">
              Solo {soloAudioTrackCount}
            </span>
          ) : null}
          {frame?.transition.kind !== 'cut' ? (
            <span className="rounded-full border border-border bg-surface px-2 py-1">
              {frame?.transition.kind} {Math.round((frame?.transition.progress ?? 0) * 100)}%
            </span>
          ) : null}
        </div>
      </div>

      <div className="relative min-h-0 flex-1 overflow-hidden bg-void">
        {frame && frame.layers.length > 0 ? (
          <>
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.08),transparent_55%)]" />
            <div className="flex h-full items-center justify-center px-6 py-5">
              <div className="relative aspect-video h-full max-h-full w-full max-w-6xl overflow-hidden rounded-xl border border-border bg-black shadow-cinematic">
                {frame.layers.map((layer, index) => {
                  const resolvedSource = resolveMediaSourceUrl(layer.sourcePath);
                  const resolvedPoster = resolveMediaSourceUrl(layer.posterUrl);

                  return (
                    <button
                      key={`${layer.clipId}-${index}`}
                      type="button"
                      className="absolute inset-0 block h-full w-full overflow-hidden bg-black text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary"
                      style={{ opacity: layer.opacity }}
                      onClick={() => setActiveTimelineClip(layer.clipId)}
                      aria-label={`Timeline playback layer ${index + 1}`}
                      data-testid={`timeline-playback-layer-${index + 1}`}
                    >
                      {layer.mediaType === 'video' ? (
                        <video
                          ref={(element) => {
                            videoRefs.current[layer.clipId] = element;
                          }}
                          src={resolvedSource ?? undefined}
                          poster={resolvedPoster ?? undefined}
                          muted
                          playsInline
                          preload="metadata"
                          className="h-full w-full object-contain"
                        />
                      ) : (
                        <img
                          src={resolvedSource ?? undefined}
                          alt={`Timeline playback layer ${index + 1}`}
                          className="h-full w-full object-contain"
                          draggable={false}
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="pointer-events-none absolute bottom-4 left-4 flex flex-wrap items-center gap-2">
              {frame.layers.map((layer) => (
                <span
                  key={layer.clipId}
                  className="inline-flex items-center gap-1 rounded-full border border-border bg-void/80 px-2 py-1 mono-label text-text-body backdrop-blur-sm"
                >
                  {layer.mediaType === 'video' ? <Film className="h-3 w-3" /> : <ImageIcon className="h-3 w-3" />}
                  {layer.clipId}
                </span>
              ))}
            </div>
          </>
        ) : frame && frame.audioLayers.length > 0 ? (
          <div className="flex h-full items-center justify-center px-6 py-10">
            <div className="max-w-md space-y-3 text-center">
              <div className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-xl border border-border bg-surface text-text-primary">
                <AudioLines className="h-5 w-5" />
              </div>
              <div>
                <p className="text-lg text-text-primary">Audio-only playback</p>
                <p className="mt-2 text-sm text-text-muted">
                  The active playhead is resolving {frame.audioLayers.length} audible audio layer
                  {frame.audioLayers.length === 1 ? '' : 's'} with no visible program frame.
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex h-full items-center justify-center px-6 py-10">
            <div className="max-w-md space-y-2 text-center">
              <p className="text-lg text-text-primary">No active program output</p>
              <p className="text-sm text-text-muted">
                Add clips to the active timeline and use the playhead to resolve the program frame.
              </p>
            </div>
          </div>
        )}

        {primaryIssue ? (
          <div className="absolute right-4 top-4 max-w-sm rounded-xl border border-status-warning/40 bg-void/90 px-3 py-2 text-sm text-text-body shadow-cinematic backdrop-blur-sm">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-status-warning" />
              <div>
                <p className="font-medium text-text-primary">Playback warning</p>
                <p className="mt-1 text-xs leading-5 text-text-muted">{primaryIssue.message}</p>
              </div>
            </div>
          </div>
        ) : null}

        <TimelineRetakeCompare />

        <div className="hidden" aria-hidden="true">
          {sequenceAudioClips.map(({ clip, mediaAsset }) => {
            const resolvedSource = resolveMediaSourceUrl(mediaAsset.path);

            return (
              <audio
                key={clip.id}
                ref={(element) => {
                  audioRefs.current[clip.id] = element;
                }}
                src={resolvedSource ?? undefined}
                preload="auto"
                data-testid={`timeline-playback-audio-${clip.id}`}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
});
