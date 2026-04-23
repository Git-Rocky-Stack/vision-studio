import { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import {
  Copy,
  MoveHorizontal,
  Scissors,
  Trash2,
} from 'lucide-react';

import { useAppStore } from '@/store/appStore';
import { cn } from '@/utils/cn';
import type { TimelineTransitionType } from '@/types/timeline';

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

interface TimelineClipInspectorProps {
  className?: string;
}

export function TimelineClipInspector({ className }: TimelineClipInspectorProps) {
  const {
    activeTimelineClipId,
    activeTimelineSequenceId,
    timelineClips,
    timelineTracks,
    timelineSequences,
    mediaAssets,
    currentTime,
    moveTimelineClip,
    trimTimelineClip,
    splitTimelineClip,
    duplicateTimelineClip,
    deleteTimelineClip,
    updateTimelineClip,
    setTimelineClipTransition,
  } = useAppStore(
    useShallow((state) => ({
      activeTimelineClipId: state.activeTimelineClipId,
      activeTimelineSequenceId: state.activeTimelineSequenceId,
      timelineClips: state.timelineClips,
      timelineTracks: state.timelineTracks,
      timelineSequences: state.timelineSequences,
      mediaAssets: state.mediaAssets,
      currentTime: state.currentTime,
      moveTimelineClip: state.moveTimelineClip,
      trimTimelineClip: state.trimTimelineClip,
      splitTimelineClip: state.splitTimelineClip,
      duplicateTimelineClip: state.duplicateTimelineClip,
      deleteTimelineClip: state.deleteTimelineClip,
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
  const sequenceTracks = useMemo(
    () =>
      sequence
        ? timelineTracks
            .filter((item) => item.sequenceId === sequence.id)
            .sort((left, right) => left.orderIndex - right.orderIndex)
        : [],
    [sequence, timelineTracks],
  );

  if (!clip || !track || !sequence) {
    return (
      <aside
        className={cn(
          'w-[320px] border-l border-border bg-elevated/70 p-4 flex flex-col justify-center',
          className,
        )}
        data-testid="timeline-clip-inspector-empty"
      >
        <p className="font-display text-sm text-text-primary">Clip Inspector</p>
        <p className="mt-2 text-sm text-text-muted">
          Select a clip to edit timing, transitions, and track placement.
        </p>
      </aside>
    );
  }

  const frameStepMs = Math.max(1, Math.round(1000 / Math.max(1, sequence.fps)));

  return (
    <aside
      className={cn('w-[320px] border-l border-border bg-elevated/70 p-4 overflow-y-auto', className)}
      data-testid="timeline-clip-inspector"
    >
      <div className="rounded-xl border border-border bg-surface p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-display text-base text-text-primary">Clip Inspector</p>
            <p className="mt-1 text-xs text-text-muted">
              {mediaAsset?.name ?? clip.label} on {track.name}
            </p>
          </div>
          <span className="rounded-full border border-border bg-elevated px-2 py-1 text-[11px] uppercase tracking-[0.12em] text-text-muted">
            {mediaAsset?.type ?? track.kind}
          </span>
        </div>

        <div className="mt-4 space-y-3">
          <label htmlFor="timeline-clip-label" className="block text-xs text-text-muted">
            Label
            <input
              id="timeline-clip-label"
              data-testid="timeline-clip-label-input"
              className="mt-1 w-full rounded-lg border border-border bg-canvas px-3 py-2 text-sm text-text-primary"
              value={clip.label}
              onChange={(event) => updateTimelineClip(clip.id, { label: event.target.value })}
            />
          </label>

          <label htmlFor="timeline-clip-track" className="block text-xs text-text-muted">
            Track
            <select
              id="timeline-clip-track"
              data-testid="timeline-clip-track-select"
              className="mt-1 w-full rounded-lg border border-border bg-canvas px-3 py-2 text-sm text-text-primary"
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
              className="mt-1 w-full rounded-lg border border-border bg-canvas px-3 py-2 text-sm text-text-primary"
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
              className="mt-1 w-full rounded-lg border border-border bg-canvas px-3 py-2 text-sm text-text-primary"
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
            <span className="font-mono text-xs text-text-primary">
              {formatSeconds(clip.sourceInMs)}s to {formatSeconds(clip.sourceOutMs)}s
            </span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              className="rounded-lg border border-border bg-surface px-3 py-2 text-xs text-text-primary transition hover:bg-elevated"
              onClick={() => trimTimelineClip(clip.id, { startMs: currentTime })}
            >
              Trim Start To Playhead
            </button>
            <button
              type="button"
              className="rounded-lg border border-border bg-surface px-3 py-2 text-xs text-text-primary transition hover:bg-elevated"
              onClick={() => trimTimelineClip(clip.id, { endMs: currentTime })}
            >
              Trim End To Playhead
            </button>
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-border bg-canvas p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-text-muted">Movement</span>
            <span className="font-mono text-xs text-text-muted">{sequence.fps} fps snap</span>
          </div>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-xs text-text-primary transition hover:bg-elevated"
              onClick={() => moveTimelineClip(clip.id, { startMs: clip.startMs - frameStepMs })}
            >
              Earlier
            </button>
            <button
              type="button"
              className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-xs text-text-primary transition hover:bg-elevated"
              onClick={() => moveTimelineClip(clip.id, { startMs: clip.startMs + frameStepMs })}
            >
              Later
            </button>
          </div>
          <p className="mt-2 text-[11px] text-text-muted">
            Moves and trims stay ripple-safe and snap to nearby edit points.
          </p>
        </div>

        <div className="mt-4 rounded-xl border border-border bg-canvas p-3">
          <p className="text-xs text-text-muted">Transitions</p>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] text-text-muted">
                In Type
                <select
                  id="timeline-transition-in-type"
                  data-testid="timeline-transition-in-type-select"
                  className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary"
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
                className="mt-2 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary"
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
              <label className="block text-[11px] text-text-muted">
                Out Type
                <select
                  id="timeline-transition-out-type"
                  className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary"
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
                className="mt-2 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary"
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

        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            data-testid="timeline-inspector-split"
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-xs text-text-primary transition hover:bg-elevated"
            onClick={() => splitTimelineClip(clip.id, currentTime)}
          >
            <Scissors className="h-3.5 w-3.5" />
            Split
          </button>
          <button
            type="button"
            data-testid="timeline-inspector-duplicate"
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-xs text-text-primary transition hover:bg-elevated"
            onClick={() => duplicateTimelineClip(clip.id)}
          >
            <Copy className="h-3.5 w-3.5" />
            Duplicate
          </button>
          <button
            type="button"
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-xs text-text-primary transition hover:bg-elevated"
            onClick={() => moveTimelineClip(clip.id, { startMs: currentTime })}
          >
            <MoveHorizontal className="h-3.5 w-3.5" />
            Move To Playhead
          </button>
          <button
            type="button"
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-status-error/30 bg-status-error-muted px-3 py-2 text-xs text-status-error transition hover:bg-status-error-muted/80"
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
