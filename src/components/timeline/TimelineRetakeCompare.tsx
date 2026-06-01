import { Check, Play, RotateCcw, X } from 'lucide-react';
import { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { resolveMediaSourceUrl } from '@/components/ui/MediaPreview';
import { useAppStore } from '@/store/appStore';
import { cn } from '@/utils/cn';

interface TimelineRetakeCompareProps {
  className?: string;
}

function formatSeconds(ms: number) {
  return `${(ms / 1000).toFixed(ms % 1000 === 0 ? 1 : 2)}s`;
}

function sortRetakeTakesByCreatedAt<T extends { createdAt: string }>(takes: T[]) {
  return [...takes].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export function TimelineRetakeCompare({ className }: TimelineRetakeCompareProps) {
  const {
    activeTimelineClipId,
    activeTimelineRetakeRangeId,
    activeTimelineRetakeTakeId,
    clipRetakeTakes,
    mediaAssets,
    setTimelineSequencePlayRange,
    timelineClips,
    timelineTracks,
    acceptClipRetakeTake,
    rejectClipRetakeTake,
    revertClipRetakeRange,
    seekTo,
  } = useAppStore(
    useShallow((state) => ({
      activeTimelineClipId: state.activeTimelineClipId,
      activeTimelineRetakeRangeId: state.activeTimelineRetakeRangeId,
      activeTimelineRetakeTakeId: state.activeTimelineRetakeTakeId,
      clipRetakeTakes: state.clipRetakeTakes,
      mediaAssets: state.mediaAssets,
      setTimelineSequencePlayRange: state.setTimelineSequencePlayRange,
      timelineClips: state.timelineClips,
      timelineTracks: state.timelineTracks,
      acceptClipRetakeTake: state.acceptClipRetakeTake,
      rejectClipRetakeTake: state.rejectClipRetakeTake,
      revertClipRetakeRange: state.revertClipRetakeRange,
      seekTo: state.seekTo,
    })),
  );

  const clip = useMemo(
    () => timelineClips.find((item) => item.id === activeTimelineClipId) ?? null,
    [activeTimelineClipId, timelineClips],
  );
  const range = useMemo(
    () => clip?.retakeRanges.find((item) => item.id === activeTimelineRetakeRangeId) ?? null,
    [activeTimelineRetakeRangeId, clip],
  );
  const take = useMemo(
    () => {
      if (!range) {
        return null;
      }

      const rangeTakes = sortRetakeTakesByCreatedAt(
        clipRetakeTakes.filter((item) => item.retakeRangeId === range.id),
      );

      return (
        rangeTakes.find((item) => item.id === activeTimelineRetakeTakeId) ??
        rangeTakes.find((item) => item.id === range.acceptedTakeId) ??
        rangeTakes.find((item) => item.status !== 'rejected') ??
        null
      );
    },
    [activeTimelineRetakeTakeId, clipRetakeTakes, range],
  );
  const sourceClipMediaAsset = useMemo(
    () => (clip ? mediaAssets.find((item) => item.id === clip.mediaAssetId) ?? null : null),
    [clip, mediaAssets],
  );
  const acceptedTake = useMemo(
    () =>
      range?.acceptedTakeId
        ? clipRetakeTakes.find((item) => item.id === range.acceptedTakeId) ?? null
        : null,
    [clipRetakeTakes, range?.acceptedTakeId],
  );
  const currentEditorialMediaAsset = useMemo(
    () =>
      acceptedTake?.mediaAssetId
        ? mediaAssets.find((item) => item.id === acceptedTake.mediaAssetId) ?? sourceClipMediaAsset
        : sourceClipMediaAsset,
    [acceptedTake?.mediaAssetId, mediaAssets, sourceClipMediaAsset],
  );
  const candidateMediaAsset = useMemo(
    () => (take?.mediaAssetId ? mediaAssets.find((item) => item.id === take.mediaAssetId) ?? null : null),
    [mediaAssets, take?.mediaAssetId],
  );
  const track = useMemo(
    () => (clip ? timelineTracks.find((item) => item.id === clip.trackId) ?? null : null),
    [clip, timelineTracks],
  );

  if (!clip || !range || !take) {
    return null;
  }

  const sequenceId = track?.sequenceId ?? null;
  const rangeStartMs = clip.startMs + range.startMs;
  const rangeEndMs = clip.startMs + range.endMs;
  const canApprove = Boolean(candidateMediaAsset) && take.status !== 'failed' && take.status !== 'rejected';
  const currentEditorialSource = resolveMediaSourceUrl(
    currentEditorialMediaAsset?.path ?? currentEditorialMediaAsset?.previewUrl,
  );
  const currentEditorialPoster = resolveMediaSourceUrl(
    currentEditorialMediaAsset?.posterUrl ?? currentEditorialMediaAsset?.thumbnailUrl,
  );
  const candidateSource = resolveMediaSourceUrl(candidateMediaAsset?.path ?? candidateMediaAsset?.previewUrl);
  const candidatePoster = resolveMediaSourceUrl(candidateMediaAsset?.posterUrl ?? candidateMediaAsset?.thumbnailUrl);

  const handlePreviewRange = () => {
    if (!sequenceId) {
      return;
    }

    setTimelineSequencePlayRange(sequenceId, { startMs: rangeStartMs, endMs: rangeEndMs });
    seekTo(rangeStartMs);
  };

  return (
    <section
      className={cn(
        'absolute bottom-4 right-4 z-20 w-[min(760px,calc(100%-2rem))] rounded-xl border border-border bg-void/90 p-3 text-text-body shadow-cinematic backdrop-blur-md',
        className,
      )}
      data-testid="timeline-retake-compare"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-text-primary">Retake Compare</p>
          <p className="mt-1 text-xs text-text-muted">
            {formatSeconds(range.startMs)} to {formatSeconds(range.endMs)} / {clip.label}
          </p>
        </div>
        <span
          className={cn(
            'rounded-full border px-2 py-1 mono-label',
            take.status === 'accepted'
              ? 'border-status-success-border bg-status-success-muted text-status-success'
              : take.status === 'candidate'
                ? 'border-accent-primary/30 bg-accent-primary-muted text-accent-primary'
                : take.status === 'failed' || take.status === 'rejected'
                  ? 'border-status-error-border bg-status-error-muted text-status-error'
                  : 'border-status-warning-border bg-status-warning-muted text-status-warning',
          )}
        >
          {take.status}
        </span>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <RetakePreviewPanel
          label="Current Editorial"
          panelTestId="timeline-retake-compare-current-panel"
          source={currentEditorialSource}
          poster={currentEditorialPoster}
          emptyMessage="Current editorial media is missing."
        />
        <RetakePreviewPanel
          label="Candidate Take"
          panelTestId="timeline-retake-compare-candidate-panel"
          source={candidateSource}
          poster={candidatePoster}
          emptyMessage="Candidate media is not available yet."
        />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-xs text-text-primary transition hover:bg-elevated"
          onClick={handlePreviewRange}
        >
          <Play className="h-3.5 w-3.5" />
          Preview Range
        </button>
        <button
          type="button"
          data-testid="timeline-retake-accept"
          disabled={!canApprove || take.status === 'accepted'}
          className="inline-flex items-center gap-2 rounded-md border border-status-success-border bg-status-success-muted px-3 py-2 text-xs text-status-success transition hover:bg-status-success-muted/80 disabled:cursor-not-allowed disabled:opacity-50"
          onClick={() => acceptClipRetakeTake(take.id)}
        >
          <Check className="h-3.5 w-3.5" />
          Accept
        </button>
        <button
          type="button"
          data-testid="timeline-retake-reject"
          disabled={take.status === 'rejected'}
          className="inline-flex items-center gap-2 rounded-md border border-status-error-border bg-status-error-muted px-3 py-2 text-xs text-status-error transition hover:bg-status-error-muted/80 disabled:cursor-not-allowed disabled:opacity-50"
          onClick={() => rejectClipRetakeTake(take.id)}
        >
          <X className="h-3.5 w-3.5" />
          Reject
        </button>
        <button
          type="button"
          data-testid="timeline-retake-revert"
          disabled={!range.acceptedTakeId}
          className="inline-flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-xs text-text-primary transition hover:bg-elevated disabled:cursor-not-allowed disabled:opacity-50"
          onClick={() => revertClipRetakeRange(clip.id, range.id)}
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Revert To Original
        </button>
      </div>
    </section>
  );
}

function RetakePreviewPanel({
  label,
  panelTestId,
  source,
  poster,
  emptyMessage,
}: {
  label: string;
  panelTestId?: string;
  source: string | null | undefined;
  poster: string | null | undefined;
  emptyMessage: string;
}) {
  return (
    <div
      className="overflow-hidden rounded-md border border-border bg-black"
      data-testid={panelTestId}
    >
      <div className="border-b border-border bg-surface px-3 py-2 mono-label text-text-muted">
        {label}
      </div>
      <div className="aspect-video bg-black">
        {source ? (
          <video
            src={source}
            poster={poster ?? undefined}
            muted
            controls
            playsInline
            preload="metadata"
            className="h-full w-full object-contain"
          />
        ) : (
          <div className="flex h-full items-center justify-center px-3 text-center text-xs text-text-muted">
            {emptyMessage}
          </div>
        )}
      </div>
    </div>
  );
}
