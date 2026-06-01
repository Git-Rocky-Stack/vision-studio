import { useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import {
  Clapperboard,
  Copy,
  MoveHorizontal,
  RefreshCcw,
  Scissors,
  Sparkles,
  Trash2,
  Volume2,
} from 'lucide-react';

import { useAppStore } from '@/store/appStore';
import { cn } from '@/utils/cn';
import type { MediaAsset } from '@/types/media';
import type { TimelineClipRetakeRange, TimelineTransitionType } from '@/types/timeline';
import { runTimelineClipGeneration } from '@/features/timeline/runTimelineClipGeneration';

const TRANSITION_OPTIONS: Array<{ value: TimelineTransitionType; label: string }> = [
  { value: 'cut', label: 'Cut' },
  { value: 'fade', label: 'Fade' },
  { value: 'dissolve', label: 'Dissolve' },
  { value: 'wipe-left', label: 'Wipe Left' },
  { value: 'wipe-right', label: 'Wipe Right' },
  { value: 'zoom', label: 'Zoom' },
];

function formatSeconds(ms: number) {
  return (ms / 1000).toFixed(ms % 1000 === 0 ? 1 : 2);
}

function parseSeconds(value: string, fallbackMs: number) {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) {
    return fallbackMs;
  }

  return Math.max(0, Math.round(parsed * 1000));
}

function isStoryboardPlaceholderAsset(asset: MediaAsset | null | undefined) {
  return asset?.metadata?.storyboardPlaceholder === true;
}

function formatRetakeRangeLabel(startMs: number, endMs: number) {
  return `${formatSeconds(startMs)}s to ${formatSeconds(endMs)}s`;
}

function sortRetakeTakesByCreatedAt<T extends { createdAt: string }>(takes: T[]) {
  return [...takes].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

function getRetakeStatusClasses(status: TimelineClipRetakeRange['status']) {
  switch (status) {
    case 'accepted':
      return 'border-status-success-border bg-status-success-muted text-status-success';
    case 'candidate':
      return 'border-accent-primary/30 bg-accent-primary-muted text-accent-primary';
    case 'queued':
    case 'rendering':
      return 'border-status-warning-border bg-status-warning-muted text-status-warning';
    default:
      return 'border-border bg-surface text-text-muted';
  }
}

interface TimelineClipInspectorProps {
  className?: string;
  onOpenExportDialog?: () => void;
  exportDisabled?: boolean;
  exportScopeLabel?: string;
}

export function TimelineClipInspector({
  className,
  onOpenExportDialog,
  exportDisabled = false,
  exportScopeLabel = 'Full Sequence',
}: TimelineClipInspectorProps) {
  const {
    activeTimelineClipId,
    activeTimelineSequenceId,
    activeTimelineRetakeRangeId,
    activeTimelineRetakeTakeId,
    projects,
    timelineClips,
    timelineTracks,
    timelineSequences,
    mediaAssets,
    clipRetakeTakes,
    clipGenerationBindings,
    currentTime,
    seekTo,
    setActiveTimelineRetakeRange,
    setActiveTimelineRetakeTake,
    acceptClipRetakeTake,
    rejectClipRetakeTake,
    revertClipRetakeRange,
    moveTimelineClip,
    trimTimelineClip,
    splitTimelineClip,
    duplicateTimelineClip,
    deleteTimelineClip,
    updateTimelineClipRetakeRange,
    deleteTimelineClipRetakeRange,
    updateTimelineClip,
    setTimelineClipTransition,
  } = useAppStore(
    useShallow((state) => ({
      activeTimelineClipId: state.activeTimelineClipId,
      activeTimelineSequenceId: state.activeTimelineSequenceId,
      activeTimelineRetakeRangeId: state.activeTimelineRetakeRangeId,
      activeTimelineRetakeTakeId: state.activeTimelineRetakeTakeId,
      projects: state.projects,
      timelineClips: state.timelineClips,
      timelineTracks: state.timelineTracks,
      timelineSequences: state.timelineSequences,
      mediaAssets: state.mediaAssets,
      clipRetakeTakes: state.clipRetakeTakes,
      clipGenerationBindings: state.clipGenerationBindings,
      currentTime: state.currentTime,
      seekTo: state.seekTo,
      setActiveTimelineRetakeRange: state.setActiveTimelineRetakeRange,
      setActiveTimelineRetakeTake: state.setActiveTimelineRetakeTake,
      acceptClipRetakeTake: state.acceptClipRetakeTake,
      rejectClipRetakeTake: state.rejectClipRetakeTake,
      revertClipRetakeRange: state.revertClipRetakeRange,
      moveTimelineClip: state.moveTimelineClip,
      trimTimelineClip: state.trimTimelineClip,
      splitTimelineClip: state.splitTimelineClip,
      duplicateTimelineClip: state.duplicateTimelineClip,
      deleteTimelineClip: state.deleteTimelineClip,
      updateTimelineClipRetakeRange: state.updateTimelineClipRetakeRange,
      deleteTimelineClipRetakeRange: state.deleteTimelineClipRetakeRange,
      updateTimelineClip: state.updateTimelineClip,
      setTimelineClipTransition: state.setTimelineClipTransition,
    })),
  );

  const clip = activeTimelineClipId
    ? timelineClips.find((item) => item.id === activeTimelineClipId) ?? null
    : null;
  const track = clip
    ? timelineTracks.find((item) => item.id === clip.trackId) ?? null
    : null;
  const sequence = track
    ? timelineSequences.find((item) => item.id === track.sequenceId) ?? null
    : activeTimelineSequenceId
      ? timelineSequences.find((item) => item.id === activeTimelineSequenceId) ?? null
      : null;
  const mediaAsset = clip
    ? mediaAssets.find((item) => item.id === clip.mediaAssetId) ?? null
    : null;
  const generationBinding = clip?.generationBindingId
    ? clipGenerationBindings.find((item) => item.id === clip.generationBindingId) ?? null
    : null;
  const project = useMemo(
    () => (sequence ? projects.find((item) => item.id === sequence.projectId) ?? null : null),
    [projects, sequence],
  );
  const sourceScene = useMemo(
    () => (project && clip?.sceneId ? project.scenes.find((item) => item.id === clip.sceneId) ?? null : null),
    [clip?.sceneId, project],
  );
  const storyboardBeatMarkers = useMemo(
    () =>
      [...(clip?.storyboardBeatMarkers ?? [])].sort(
        (left, right) => left.relativeStartMs - right.relativeStartMs,
      ),
    [clip?.storyboardBeatMarkers],
  );
  const sequenceTracks = useMemo(
    () =>
      sequence
        ? timelineTracks
            .filter((item) => item.sequenceId === sequence.id)
            .sort((left, right) => left.orderIndex - right.orderIndex)
        : [],
    [sequence, timelineTracks],
  );
  const retakeRanges = useMemo(
    () => [...(clip?.retakeRanges ?? [])].sort((left, right) => left.startMs - right.startMs),
    [clip?.retakeRanges],
  );
  const selectedRetakeRange = useMemo(
    () =>
      retakeRanges.find((item) => item.id === activeTimelineRetakeRangeId) ??
      retakeRanges[0] ??
      null,
    [activeTimelineRetakeRangeId, retakeRanges],
  );
  const retakeTakesForClip = useMemo(
    () => (clip ? clipRetakeTakes.filter((item) => item.clipId === clip.id) : []),
    [clip, clipRetakeTakes],
  );
  const selectedRetakeTakes = useMemo(
    () =>
      selectedRetakeRange
        ? sortRetakeTakesByCreatedAt(
            retakeTakesForClip.filter((item) => item.retakeRangeId === selectedRetakeRange.id),
          )
        : [],
    [retakeTakesForClip, selectedRetakeRange],
  );
  const selectedRetakeTake = useMemo(
    () =>
      selectedRetakeTakes.find((item) => item.id === activeTimelineRetakeTakeId) ??
      selectedRetakeTakes[0] ??
      null,
    [activeTimelineRetakeTakeId, selectedRetakeTakes],
  );
  const [aiActionError, setAiActionError] = useState<string | null>(null);

  if (!clip || !track || !sequence) {
    return (
      <aside
        className={cn(
          'w-[320px] border-l border-border bg-elevated/70 p-4 flex flex-col justify-center',
          className,
        )}
        data-testid="timeline-clip-inspector-empty"
      >
        <p className="text-sm text-text-primary">Clip Inspector</p>
        <p className="mt-2 text-sm text-text-muted">
          Select a clip to edit timing, transitions, and track placement.
        </p>
      </aside>
    );
  }

  const frameStepMs = Math.max(1, Math.round(1000 / Math.max(1, sequence.fps)));
  const isAudioClip = mediaAsset?.type === 'audio' || track.kind === 'audio';
  const isVideoClip = mediaAsset?.type === 'video';
  const retakePlayheadMs = Math.max(0, Math.min(clip.durationMs, currentTime - clip.startMs));
  const isAiBusy =
    generationBinding?.lastRunSummary?.status === 'queued' ||
    generationBinding?.lastRunSummary?.status === 'running';
  const isRetakeBusy = selectedRetakeTakes.some(
    (take) => take.status === 'queued' || take.status === 'rendering',
  );
  const canGenerateRetake =
    isVideoClip &&
    Boolean(selectedRetakeRange) &&
    generationBinding?.generationType === 'video' &&
    !isAiBusy &&
    !isRetakeBusy;
  const isStoryboardPlaceholder = isStoryboardPlaceholderAsset(mediaAsset);
  const lastRunLabel =
    generationBinding?.lastRunSummary?.status === 'complete'
      ? 'Last run complete'
      : generationBinding?.lastRunSummary?.status === 'failed'
        ? 'Last run failed'
        : generationBinding?.lastRunSummary?.status === 'running'
          ? 'Generation running'
          : generationBinding?.lastRunSummary?.status === 'queued'
            ? 'Queued for generation'
            : 'No AI binding yet';
  const canExtendShot = generationBinding?.generationType === 'video';
  const retakeStatusMessage = !isVideoClip
    ? 'Retakes are only available for video clips.'
    : selectedRetakeRange
      ? `Range ${formatRetakeRangeLabel(selectedRetakeRange.startMs, selectedRetakeRange.endMs)}`
      : 'No retake range selected yet. Use the timeline toolbar to mark retake in and out.';

  const handleRetakeRangeTimeChange = (
    edge: 'startMs' | 'endMs',
    value: string,
  ) => {
    if (!selectedRetakeRange) {
      return;
    }

    const parsedValue = parseSeconds(
      value,
      edge === 'startMs' ? selectedRetakeRange.startMs : selectedRetakeRange.endMs,
    );
    updateTimelineClipRetakeRange(clip.id, selectedRetakeRange.id, {
      [edge]: parsedValue,
    });
  };

  const handleAiAction = async (operation: 'regenerate' | 'variant' | 'extend' | 'retake') => {
    setAiActionError(null);

    if (operation === 'retake' && !selectedRetakeRange) {
      setAiActionError('Select a retake range before generating a candidate.');
      return;
    }

    try {
      await runTimelineClipGeneration({
        operation,
        clipId: clip.id,
        retakeRangeId: operation === 'retake' ? selectedRetakeRange?.id : undefined,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Timeline AI action failed.';
      setAiActionError(message);
    }
  };

  return (
    <aside
      className={cn('w-[320px] border-l border-border bg-elevated/70 p-4 overflow-y-auto', className)}
      data-testid="timeline-clip-inspector"
    >
      <div className="rounded-xl border border-border bg-surface p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-base text-text-primary">Clip Inspector</p>
            <p className="mt-1 text-xs text-text-muted">
              {mediaAsset?.name ?? clip.label} on {track.name}
            </p>
          </div>
          <span className="rounded-full border border-border bg-elevated px-2 py-1 mono-label text-text-muted">
            {mediaAsset?.type ?? track.kind}
          </span>
        </div>

        {clip.storyboardDerived ? (
          <div
            className="mt-4 rounded-xl border border-border bg-canvas p-3"
            data-testid="timeline-inspector-storyboard-context"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs text-text-muted">Storyboard Context</p>
                <p className="mt-1 text-sm text-text-primary">
                  {sourceScene?.name ?? 'Derived storyboard scene'}
                </p>
              </div>
              <span className="rounded-full border border-border bg-surface px-2 py-1 mono-label text-text-muted">
                Derived
              </span>
            </div>

            {isStoryboardPlaceholder ? (
              <p
                className="mt-3 rounded-md border border-status-warning-border bg-status-warning-muted px-3 py-2 text-xs text-status-warning"
                data-testid="timeline-inspector-placeholder"
              >
                This clip is still using storyboard placeholder media. Generate or attach a source asset to replace it.
              </p>
            ) : null}

            {storyboardBeatMarkers.length > 0 ? (
              <div className="mt-3 space-y-2">
                {storyboardBeatMarkers.map((marker) => (
                  <div
                    key={marker.id}
                    className="rounded-md border border-border bg-surface px-3 py-2"
                    data-testid={`timeline-inspector-beat-${marker.id}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm text-text-primary">{marker.label}</p>
                        {marker.notes ? (
                          <p className="mt-1 line-clamp-2 text-xs text-text-muted">{marker.notes}</p>
                        ) : null}
                      </div>
                      <div className="text-right">
                        <p className="data-mono text-text-primary">
                          {formatSeconds(marker.relativeStartMs)}s
                        </p>
                        <p className="mt-1 text-xs text-text-muted">
                          {marker.durationMs ? `${formatSeconds(marker.durationMs)}s beat` : 'Open beat'}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-xs text-text-muted">
                No preserved shot beats were attached to this storyboard-derived clip.
              </p>
            )}
          </div>
        ) : null}

        <div className="mt-4 space-y-3">
          <label htmlFor="timeline-clip-label" className="block text-xs text-text-muted">
            Label
            <input
              id="timeline-clip-label"
              data-testid="timeline-clip-label-input"
              className="mt-1 w-full rounded-md border border-border bg-canvas px-3 py-2 text-sm text-text-primary"
              value={clip.label}
              onChange={(event) => updateTimelineClip(clip.id, { label: event.target.value })}
            />
          </label>

          <label htmlFor="timeline-clip-track" className="block text-xs text-text-muted">
            Track
            <select
              id="timeline-clip-track"
              data-testid="timeline-clip-track-select"
              className="mt-1 w-full rounded-md border border-border bg-canvas px-3 py-2 text-sm text-text-primary"
              value={clip.trackId}
              onChange={(event) => moveTimelineClip(clip.id, { trackId: event.target.value })}
            >
              {sequenceTracks.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <label htmlFor="timeline-clip-start" className="block text-xs text-text-muted">
            Start
            <input
              id="timeline-clip-start"
              data-testid="timeline-clip-start-input"
              type="number"
              min={0}
              step="0.1"
              className="mt-1 w-full rounded-md border border-border bg-canvas px-3 py-2 text-sm text-text-primary"
              value={formatSeconds(clip.startMs)}
              onChange={(event) =>
                moveTimelineClip(clip.id, { startMs: parseSeconds(event.target.value, clip.startMs) })
              }
            />
          </label>

          <label htmlFor="timeline-clip-duration" className="block text-xs text-text-muted">
            Duration
            <input
              id="timeline-clip-duration"
              type="number"
              min={0.1}
              step="0.1"
              className="mt-1 w-full rounded-md border border-border bg-canvas px-3 py-2 text-sm text-text-primary"
              value={formatSeconds(clip.durationMs)}
              onChange={(event) =>
                trimTimelineClip(clip.id, {
                  endMs: clip.startMs + parseSeconds(event.target.value, clip.durationMs),
                })
              }
            />
          </label>
        </div>

        <div className="mt-4 rounded-xl border border-border bg-canvas p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-text-muted">Source Window</span>
            <span className="data-mono text-text-primary">
              {formatSeconds(clip.sourceInMs)}s to {formatSeconds(clip.sourceOutMs)}s
            </span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              className="rounded-md border border-border bg-surface px-3 py-2 text-xs text-text-primary transition hover:bg-elevated"
              onClick={() => trimTimelineClip(clip.id, { startMs: currentTime })}
            >
              Trim Start To Playhead
            </button>
            <button
              type="button"
              className="rounded-md border border-border bg-surface px-3 py-2 text-xs text-text-primary transition hover:bg-elevated"
              onClick={() => trimTimelineClip(clip.id, { endMs: currentTime })}
            >
              Trim End To Playhead
            </button>
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-border bg-canvas p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-text-muted">Movement</span>
            <span className="data-mono text-text-muted">{sequence.fps} fps snap</span>
          </div>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              className="flex-1 rounded-md border border-border bg-surface px-3 py-2 text-xs text-text-primary transition hover:bg-elevated"
              onClick={() => moveTimelineClip(clip.id, { startMs: clip.startMs - frameStepMs })}
            >
              Earlier
            </button>
            <button
              type="button"
              className="flex-1 rounded-md border border-border bg-surface px-3 py-2 text-xs text-text-primary transition hover:bg-elevated"
              onClick={() => moveTimelineClip(clip.id, { startMs: clip.startMs + frameStepMs })}
            >
              Later
            </button>
          </div>
          <p className="mt-2 text-xs text-text-muted">
            Moves and trims stay ripple-safe and snap to nearby edit points.
          </p>
        </div>

        {isAudioClip ? (
          <div className="mt-4 rounded-xl border border-border bg-canvas p-3" data-testid="timeline-audio-controls">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs text-text-muted">Audio Clip</p>
                <p className="mt-1 text-sm text-text-primary">Gain, fades, and edit boundaries</p>
              </div>
              <span className="rounded-full border border-border bg-surface px-2 py-1 mono-label text-text-muted">
                <span className="inline-flex items-center gap-1">
                  <Volume2 className="h-3 w-3" />
                  Audio
                </span>
              </span>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-3">
              <label className="block text-xs text-text-muted">
                Gain
                <input
                  data-testid="timeline-audio-gain-input"
                  type="number"
                  min={0}
                  max={200}
                  step={5}
                  className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary"
                  value={Math.round(clip.gain * 100)}
                  onChange={(event) =>
                    updateTimelineClip(clip.id, {
                      gain: Number.parseFloat(event.target.value || '100') / 100,
                    })
                  }
                />
              </label>
              <label className="block text-xs text-text-muted">
                Fade In
                <input
                  data-testid="timeline-audio-fade-in-input"
                  type="number"
                  min={0}
                  step={50}
                  className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary"
                  value={clip.fadeInMs}
                  onChange={(event) =>
                    updateTimelineClip(clip.id, {
                      fadeInMs: Number.parseInt(event.target.value || '0', 10),
                    })
                  }
                />
              </label>
              <label className="block text-xs text-text-muted">
                Fade Out
                <input
                  data-testid="timeline-audio-fade-out-input"
                  type="number"
                  min={0}
                  step={50}
                  className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary"
                  value={clip.fadeOutMs}
                  onChange={(event) =>
                    updateTimelineClip(clip.id, {
                      fadeOutMs: Number.parseInt(event.target.value || '0', 10),
                    })
                  }
                />
              </label>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                className="rounded-md border border-border bg-surface px-3 py-2 text-xs text-text-primary transition hover:bg-elevated"
                onClick={() => seekTo(clip.startMs)}
              >
                Playhead To In
              </button>
              <button
                type="button"
                className="rounded-md border border-border bg-surface px-3 py-2 text-xs text-text-primary transition hover:bg-elevated"
                onClick={() => seekTo(clip.startMs + clip.durationMs)}
              >
                Playhead To Out
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-4 rounded-xl border border-border bg-canvas p-3">
            <p className="text-xs text-text-muted">Transitions</p>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-text-muted">
                  In Type
                  <select
                    id="timeline-transition-in-type"
                    data-testid="timeline-transition-in-type-select"
                    className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary"
                    value={clip.transitionIn?.type ?? ''}
                    onChange={(event) =>
                      setTimelineClipTransition(
                        clip.id,
                        'in',
                        event.target.value
                          ? {
                              type: event.target.value as TimelineTransitionType,
                              durationMs: clip.transitionIn?.durationMs ?? 300,
                            }
                          : null,
                      )
                    }
                  >
                    <option value="">None</option>
                    {TRANSITION_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <input
                  id="timeline-transition-in-duration"
                  aria-label="Transition in duration"
                  data-testid="timeline-transition-in-duration-input"
                  type="number"
                  min={50}
                  step={50}
                  className="mt-2 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary"
                  value={clip.transitionIn?.durationMs ?? 300}
                  onChange={(event) =>
                    setTimelineClipTransition(
                      clip.id,
                      'in',
                      clip.transitionIn
                        ? {
                            ...clip.transitionIn,
                            durationMs: Number.parseInt(event.target.value || '300', 10),
                          }
                        : {
                            type: 'fade',
                            durationMs: Number.parseInt(event.target.value || '300', 10),
                          },
                    )
                  }
                />
              </div>
              <div>
                <label className="block text-xs text-text-muted">
                  Out Type
                  <select
                    id="timeline-transition-out-type"
                    className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary"
                    value={clip.transitionOut?.type ?? ''}
                    onChange={(event) =>
                      setTimelineClipTransition(
                        clip.id,
                        'out',
                        event.target.value
                          ? {
                              type: event.target.value as TimelineTransitionType,
                              durationMs: clip.transitionOut?.durationMs ?? 300,
                            }
                          : null,
                      )
                    }
                  >
                    <option value="">None</option>
                    {TRANSITION_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <input
                  id="timeline-transition-out-duration"
                  aria-label="Transition out duration"
                  type="number"
                  min={50}
                  step={50}
                  className="mt-2 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary"
                  value={clip.transitionOut?.durationMs ?? 300}
                  onChange={(event) =>
                    setTimelineClipTransition(
                      clip.id,
                      'out',
                      clip.transitionOut
                        ? {
                            ...clip.transitionOut,
                            durationMs: Number.parseInt(event.target.value || '300', 10),
                          }
                        : {
                            type: 'fade',
                            durationMs: Number.parseInt(event.target.value || '300', 10),
                          },
                    )
                  }
                />
              </div>
            </div>
          </div>
        )}

        <div className="mt-4 rounded-xl border border-border bg-canvas p-3" data-testid="timeline-retake-controls">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs text-text-muted">Retake Ranges</p>
              <p className="mt-1 text-sm text-text-primary">{retakeStatusMessage}</p>
            </div>
            <span
              className={cn(
                'rounded-full border px-2 py-1 mono-label',
                isVideoClip
                  ? 'border-accent-primary/30 bg-accent-primary-muted text-accent-primary'
                  : 'border-border bg-surface text-text-muted',
              )}
            >
              {isVideoClip ? `${retakeRanges.length} range${retakeRanges.length === 1 ? '' : 's'}` : 'Blocked'}
            </span>
          </div>

          {!isVideoClip ? (
            <p
              className="mt-3 rounded-md border border-border bg-surface px-3 py-3 text-xs text-text-muted"
              data-testid="timeline-retake-blocked"
            >
              Select a generated or imported video clip to author a retake range.
            </p>
          ) : (
            <>
              {retakeRanges.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {retakeRanges.map((range) => (
                    <button
                      key={range.id}
                      type="button"
                      data-testid={`timeline-retake-range-${range.id}`}
                      onClick={() => {
                        setActiveTimelineRetakeRange(range.id);
                        const preferredTakeId =
                          range.acceptedTakeId ??
                          sortRetakeTakesByCreatedAt(
                            retakeTakesForClip.filter((item) => item.retakeRangeId === range.id),
                          ).find((item) => item.status !== 'rejected')?.id ??
                          null;
                        setActiveTimelineRetakeTake(preferredTakeId);
                      }}
                      className={cn(
                        'rounded-full border px-3 py-1.5 mono-label transition',
                        getRetakeStatusClasses(range.status),
                        selectedRetakeRange?.id === range.id ? 'shadow-[0_0_0_1px_rgba(255,255,255,0.16)]' : '',
                      )}
                    >
                      {formatRetakeRangeLabel(range.startMs, range.endMs)}
                    </button>
                  ))}
                </div>
              ) : (
                <p
                  className="mt-3 rounded-md border border-border bg-surface px-3 py-3 text-xs text-text-muted"
                  data-testid="timeline-retake-empty"
                >
                  No retake ranges yet. Use <span className="text-text-primary">Retake In</span> and{' '}
                  <span className="text-text-primary">Retake Out</span> in the timeline toolbar, then create the range.
                </p>
              )}

              {selectedRetakeRange ? (
                <div
                  className="mt-3 rounded-md border border-border bg-surface px-3 py-3"
                  data-testid="timeline-retake-range-editor"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="mono-label text-text-muted">Selected Range</p>
                      <p className="mt-1 text-sm text-text-primary">
                        {formatRetakeRangeLabel(selectedRetakeRange.startMs, selectedRetakeRange.endMs)}
                      </p>
                    </div>
                    <span
                      className={cn(
                        'rounded-full border px-2 py-1 mono-label',
                        getRetakeStatusClasses(selectedRetakeRange.status),
                      )}
                    >
                      {selectedRetakeRange.status}
                    </span>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <label className="block text-xs text-text-muted">
                      Retake In
                      <input
                        data-testid="timeline-retake-start-input"
                        type="number"
                        min={0}
                        step="0.1"
                        className="mt-1 w-full rounded-md border border-border bg-canvas px-3 py-2 text-sm text-text-primary"
                        value={formatSeconds(selectedRetakeRange.startMs)}
                        onChange={(event) => handleRetakeRangeTimeChange('startMs', event.target.value)}
                      />
                    </label>
                    <label className="block text-xs text-text-muted">
                      Retake Out
                      <input
                        data-testid="timeline-retake-end-input"
                        type="number"
                        min={0}
                        step="0.1"
                        className="mt-1 w-full rounded-md border border-border bg-canvas px-3 py-2 text-sm text-text-primary"
                        value={formatSeconds(selectedRetakeRange.endMs)}
                        onChange={(event) => handleRetakeRangeTimeChange('endMs', event.target.value)}
                      />
                    </label>
                  </div>

                  <div className="mt-3 grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      className="rounded-md border border-border bg-canvas px-3 py-2 text-xs text-text-primary transition hover:bg-elevated"
                      onClick={() => seekTo(clip.startMs + selectedRetakeRange.startMs)}
                    >
                      Playhead To In
                    </button>
                    <button
                      type="button"
                      className="rounded-md border border-border bg-canvas px-3 py-2 text-xs text-text-primary transition hover:bg-elevated"
                      onClick={() => seekTo(clip.startMs + selectedRetakeRange.endMs)}
                    >
                      Playhead To Out
                    </button>
                    <button
                      type="button"
                      data-testid="timeline-retake-delete-range"
                      className="rounded-md border border-status-error/30 bg-status-error-muted px-3 py-2 text-xs text-status-error transition hover:bg-status-error-muted/80"
                      onClick={() => deleteTimelineClipRetakeRange(clip.id, selectedRetakeRange.id)}
                    >
                      Clear Range
                    </button>
                  </div>
                </div>
              ) : null}

              <div className="mt-3 rounded-md border border-border bg-surface px-3 py-3" data-testid="timeline-retake-candidates">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="mono-label text-text-muted">Candidate Takes</p>
                    <p className="mt-1 text-sm text-text-primary">
                      {selectedRetakeRange ? `${selectedRetakeTakes.length} candidate take${selectedRetakeTakes.length === 1 ? '' : 's'}` : 'Select a range'}
                    </p>
                  </div>
                  <span className="data-mono text-text-muted">
                    {selectedRetakeRange ? formatSeconds(retakePlayheadMs) : '--'}
                  </span>
                </div>
                <button
                  type="button"
                  data-testid="timeline-retake-generate"
                  disabled={!canGenerateRetake}
                  className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-md border border-border bg-canvas px-3 py-2 text-xs text-text-primary transition hover:bg-elevated disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={() => void handleAiAction('retake')}
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  Generate Retake
                </button>

                {selectedRetakeRange ? (
                  selectedRetakeTakes.length > 0 ? (
                    <div className="mt-3 space-y-2">
                      {selectedRetakeTakes.map((take) => (
                        <button
                          key={take.id}
                          type="button"
                          data-testid={`timeline-retake-take-${take.id}`}
                          onClick={() => setActiveTimelineRetakeTake(take.id)}
                          className={cn(
                            'w-full rounded-md border px-3 py-2 text-left transition',
                            selectedRetakeTake?.id === take.id
                              ? 'border-accent-primary bg-accent-primary-muted/50'
                              : 'border-border bg-canvas hover:bg-elevated',
                          )}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm text-text-primary">
                                {take.mediaAssetId ? `Take ${take.mediaAssetId}` : 'Pending retake take'}
                              </p>
                              <p className="mt-1 text-xs text-text-muted">
                                {take.prompt ? take.prompt.slice(0, 96) : 'No prompt override yet.'}
                              </p>
                            </div>
                            <span
                              className={cn(
                                'rounded-full border px-2 py-1 mono-label',
                                take.status === 'accepted'
                                  ? 'border-status-success-border bg-status-success-muted text-status-success'
                                  : take.status === 'candidate'
                                    ? 'border-accent-primary/30 bg-accent-primary-muted text-accent-primary'
                                    : take.status === 'queued' || take.status === 'rendering'
                                      ? 'border-status-warning-border bg-status-warning-muted text-status-warning'
                                      : 'border-border bg-surface text-text-muted',
                              )}
                            >
                              {take.status}
                            </span>
                          </div>
                        </button>
                      ))}
                      {selectedRetakeTake ? (
                        <div className="grid grid-cols-3 gap-2">
                          <button
                            type="button"
                            data-testid="timeline-retake-inspector-accept"
                            disabled={!selectedRetakeTake.mediaAssetId || selectedRetakeTake.status === 'accepted'}
                            className="rounded-md border border-status-success-border bg-status-success-muted px-2 py-2 text-xs text-status-success transition hover:bg-status-success-muted/80 disabled:cursor-not-allowed disabled:opacity-50"
                            onClick={() => acceptClipRetakeTake(selectedRetakeTake.id)}
                          >
                            Accept
                          </button>
                          <button
                            type="button"
                            data-testid="timeline-retake-inspector-reject"
                            disabled={selectedRetakeTake.status === 'rejected'}
                            className="rounded-md border border-status-error-border bg-status-error-muted px-2 py-2 text-xs text-status-error transition hover:bg-status-error-muted/80 disabled:cursor-not-allowed disabled:opacity-50"
                            onClick={() => rejectClipRetakeTake(selectedRetakeTake.id)}
                          >
                            Reject
                          </button>
                          <button
                            type="button"
                            data-testid="timeline-retake-inspector-revert"
                            disabled={!selectedRetakeRange.acceptedTakeId}
                            className="rounded-md border border-border bg-canvas px-2 py-2 text-xs text-text-primary transition hover:bg-elevated disabled:cursor-not-allowed disabled:opacity-50"
                            onClick={() => revertClipRetakeRange(clip.id, selectedRetakeRange.id)}
                          >
                            Revert
                          </button>
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <p className="mt-3 text-xs text-text-muted">
                      No candidate retakes yet. Use <span className="text-text-primary">Generate Retake</span> once the range is selected.
                    </p>
                  )
                ) : (
                  <p className="mt-3 text-xs text-text-muted">
                    Select a retake range to review future candidates and approval state.
                  </p>
                )}
              </div>
            </>
          )}
        </div>

        {!isAudioClip ? (
          <div className="mt-4 rounded-xl border border-border bg-canvas p-3" data-testid="timeline-ai-actions">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs text-text-muted">AI Clip Actions</p>
                <p className="mt-1 text-sm text-text-primary">{lastRunLabel}</p>
              </div>
              {generationBinding ? (
                <span className="rounded-full border border-border bg-surface px-2 py-1 mono-label text-text-muted">
                  {generationBinding.generationType}
                </span>
              ) : null}
            </div>

            {generationBinding ? (
              <>
                <div className="mt-3 rounded-md border border-border bg-surface px-3 py-3">
                  <p className="mono-label text-text-muted">Binding</p>
                  <p className="mt-2 text-sm text-text-primary">{generationBinding.model}</p>
                  <p className="mt-1 text-xs text-text-muted">
                    {generationBinding.prompt.slice(0, 120) || 'No prompt recorded.'}
                  </p>
                  <p className="mt-2 text-xs text-text-muted">
                    {generationBinding.referenceSetIds.length} reference set
                    {generationBinding.referenceSetIds.length === 1 ? '' : 's'} / {generationBinding.variantIds.length}{' '}
                    variant{generationBinding.variantIds.length === 1 ? '' : 's'}
                  </p>
                </div>

                <div className="mt-3 grid grid-cols-1 gap-2">
                  <button
                    type="button"
                    data-testid="timeline-ai-regenerate"
                    disabled={isAiBusy}
                    className="inline-flex items-center justify-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-xs text-text-primary transition hover:bg-elevated disabled:cursor-not-allowed disabled:opacity-50"
                    onClick={() => void handleAiAction('regenerate')}
                  >
                    <RefreshCcw className="h-3.5 w-3.5" />
                    Regenerate In Place
                  </button>
                  <button
                    type="button"
                    data-testid="timeline-ai-variant"
                    disabled={isAiBusy}
                    className="inline-flex items-center justify-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-xs text-text-primary transition hover:bg-elevated disabled:cursor-not-allowed disabled:opacity-50"
                    onClick={() => void handleAiAction('variant')}
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    Create Variant
                  </button>
                  <button
                    type="button"
                    data-testid="timeline-ai-extend"
                    disabled={!canExtendShot || isAiBusy}
                    className="inline-flex items-center justify-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-xs text-text-primary transition hover:bg-elevated disabled:cursor-not-allowed disabled:opacity-50"
                    onClick={() => void handleAiAction('extend')}
                  >
                    <Clapperboard className="h-3.5 w-3.5" />
                    Extend Shot
                  </button>
                </div>

                {aiActionError ? (
                  <p className="mt-3 text-xs text-status-error">{aiActionError}</p>
                ) : null}
              </>
            ) : (
              <p className="mt-3 text-xs text-text-muted">
                Generate from the main panel to create an AI-bound clip, then use regenerate, variant, and extend actions here.
              </p>
            )}
          </div>
        ) : null}

        <div className="mt-4 rounded-xl border border-border bg-canvas p-3" data-testid="timeline-export-actions">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs text-text-muted">Sequence Export</p>
              <p className="mt-1 text-sm text-text-primary">{exportScopeLabel}</p>
            </div>
            <span className="rounded-full border border-border bg-surface px-2 py-1 mono-label text-text-muted">
              MP4
            </span>
          </div>
          <p className="mt-3 text-xs leading-5 text-text-muted">
            {sequence.playRange
              ? 'The current in/out range will render exactly as previewed in the timeline playback surface.'
              : 'The full active sequence will render exactly as previewed in the timeline playback surface.'}
          </p>
          <button
            type="button"
            data-testid="timeline-inspector-export"
            disabled={exportDisabled}
            className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-xs text-text-primary transition hover:bg-elevated disabled:cursor-not-allowed disabled:opacity-50"
            onClick={onOpenExportDialog}
          >
            <Clapperboard className="h-3.5 w-3.5" />
            Export MP4
          </button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            data-testid="timeline-inspector-split"
            className="inline-flex items-center justify-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-xs text-text-primary transition hover:bg-elevated"
            onClick={() => splitTimelineClip(clip.id, currentTime)}
          >
            <Scissors className="h-3.5 w-3.5" />
            Split
          </button>
          <button
            type="button"
            data-testid="timeline-inspector-duplicate"
            className="inline-flex items-center justify-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-xs text-text-primary transition hover:bg-elevated"
            onClick={() => duplicateTimelineClip(clip.id)}
          >
            <Copy className="h-3.5 w-3.5" />
            Duplicate
          </button>
          <button
            type="button"
            className="inline-flex items-center justify-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-xs text-text-primary transition hover:bg-elevated"
            onClick={() => moveTimelineClip(clip.id, { startMs: currentTime })}
          >
            <MoveHorizontal className="h-3.5 w-3.5" />
            Move To Playhead
          </button>
          <button
            type="button"
            className="inline-flex items-center justify-center gap-2 rounded-md border border-status-error/30 bg-status-error-muted px-3 py-2 text-xs text-status-error transition hover:bg-status-error-muted/80"
            onClick={() => deleteTimelineClip(clip.id)}
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </button>
        </div>
      </div>
    </aside>
  );
}
