import type { MediaAsset } from '@/types/media';
import type {
  TimelineClip,
  TimelineCompositionFrame,
  TimelineCompositionIssue,
  TimelineCompositionLayer,
  TimelineCompositionTransition,
  TimelineResolvedPlayRange,
  TimelineSequence,
  TimelineTrack,
  TimelineTransition,
} from '@/types/timeline';

interface ResolveSequenceCompositionOptions {
  sequence: TimelineSequence;
  tracks: TimelineTrack[];
  clips: TimelineClip[];
  mediaAssets: MediaAsset[];
  timeMs: number;
}

const SUPPORTED_VISUAL_TRACK_KINDS = new Set<TimelineTrack['kind']>(['image', 'video']);
const SUPPORTED_TRANSITION_TYPES = new Set<TimelineTransition['type']>(['cut', 'fade', 'dissolve']);

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function sortClipsByStart(clips: TimelineClip[]) {
  return [...clips].sort((left, right) => {
    if (left.startMs === right.startMs) {
      return left.createdAt.localeCompare(right.createdAt);
    }

    return left.startMs - right.startMs;
  });
}

function buildCutTransition(primaryClipId: string | null): TimelineCompositionTransition {
  return {
    kind: 'cut',
    edge: 'none',
    progress: 1,
    durationMs: 0,
    type: 'cut',
    fromClipId: primaryClipId,
    toClipId: primaryClipId,
  };
}

function createFrame(
  requestedTimeMs: number,
  resolvedTimeMs: number,
  playRange: TimelineResolvedPlayRange,
  inPlayRange: boolean,
  issues: TimelineCompositionIssue[],
): TimelineCompositionFrame {
  return {
    requestedTimeMs,
    resolvedTimeMs,
    inPlayRange,
    playRange,
    activeTrackId: null,
    primaryClipId: null,
    layers: [],
    transition: buildCutTransition(null),
    issues,
  };
}

function buildIssue(
  code: TimelineCompositionIssue['code'],
  message: string,
  details: Partial<TimelineCompositionIssue> = {},
): TimelineCompositionIssue {
  return {
    code,
    message,
    ...details,
  };
}

function isTimeWithinClip(clip: TimelineClip, timeMs: number, allowInclusiveEnd: boolean) {
  const clipEndMs = clip.startMs + clip.durationMs;
  return allowInclusiveEnd ? timeMs >= clip.startMs && timeMs <= clipEndMs : timeMs >= clip.startMs && timeMs < clipEndMs;
}

function findActiveClip(clips: TimelineClip[], timeMs: number, allowInclusiveEnd: boolean) {
  for (const clip of clips) {
    if (isTimeWithinClip(clip, timeMs, allowInclusiveEnd)) {
      return clip;
    }
  }

  return null;
}

function findClipIndex(clips: TimelineClip[], clipId: string) {
  return clips.findIndex((clip) => clip.id === clipId);
}

function buildLayer(
  clip: TimelineClip,
  mediaAsset: MediaAsset,
  trackId: string,
  resolvedTimeMs: number,
  opacity: number,
): TimelineCompositionLayer {
  const clipOffsetMs = clamp(resolvedTimeMs - clip.startMs, 0, clip.durationMs);
  const lastSourceTimeMs = Math.max(clip.sourceInMs, clip.sourceOutMs - 1);
  const unclampedSourceTimeMs = clip.sourceInMs + clipOffsetMs;
  const sourceTimeMs = mediaAsset.type === 'image'
    ? clip.sourceInMs
    : clamp(unclampedSourceTimeMs, clip.sourceInMs, lastSourceTimeMs);

  return {
    clipId: clip.id,
    mediaAssetId: mediaAsset.id,
    trackId,
    mediaType: mediaAsset.type,
    sourcePath: mediaAsset.path,
    posterUrl: clip.posterUrl ?? mediaAsset.posterUrl ?? null,
    opacity: clamp(opacity, 0, 1),
    heldFrame: mediaAsset.type === 'image',
    sourceTimeMs,
    clipOffsetMs,
  };
}

function resolveTransitionProgress(
  clip: TimelineClip,
  transition: TimelineTransition,
  edge: 'in' | 'out',
  resolvedTimeMs: number,
) {
  if (transition.durationMs <= 0) {
    return 1;
  }

  if (edge === 'in') {
    return clamp((resolvedTimeMs - clip.startMs) / transition.durationMs, 0, 1);
  }

  const transitionStartMs = clip.startMs + clip.durationMs - transition.durationMs;
  return clamp((resolvedTimeMs - transitionStartMs) / transition.durationMs, 0, 1);
}

export function resolveTimelinePlayRange(sequence: TimelineSequence): TimelineResolvedPlayRange {
  const startCandidate = sequence.playRange?.startMs ?? 0;
  const endCandidate = sequence.playRange?.endMs ?? sequence.durationMs;
  const startMs = clamp(startCandidate, 0, Math.max(0, sequence.durationMs));
  const endMs = clamp(endCandidate, startMs, Math.max(startMs, sequence.durationMs));

  return {
    startMs,
    endMs,
    durationMs: Math.max(0, endMs - startMs),
  };
}

export function resolveSequenceComposition({
  sequence,
  tracks,
  clips,
  mediaAssets,
  timeMs,
}: ResolveSequenceCompositionOptions): TimelineCompositionFrame {
  const playRange = resolveTimelinePlayRange(sequence);
  const clampedTimeMs = clamp(timeMs, playRange.startMs, playRange.endMs);
  const issues: TimelineCompositionIssue[] = [];
  const inPlayRange = timeMs >= playRange.startMs && timeMs <= playRange.endMs;

  if (clampedTimeMs !== timeMs) {
    issues.push(
      buildIssue(
        'play-range-clamped',
        'Requested playhead time was clamped into the active play range.',
      ),
    );
  }

  const sequenceTrackIds = new Set(sequence.trackIds);
  const orderedTracks = [...tracks]
    .filter((track) => track.sequenceId === sequence.id && sequenceTrackIds.has(track.id))
    .sort((left, right) => left.orderIndex - right.orderIndex);
  const clipsByTrackId = new Map(
    orderedTracks.map((track) => [
      track.id,
      sortClipsByStart(clips.filter((clip) => clip.trackId === track.id)),
    ]),
  );
  const mediaAssetById = new Map(mediaAssets.map((asset) => [asset.id, asset]));
  const allowInclusiveEnd = clampedTimeMs === playRange.endMs;
  const activeVisualTracks: Array<{
    track: TimelineTrack;
    clip: TimelineClip;
    orderedTrackClips: TimelineClip[];
  }> = [];

  for (const track of orderedTracks) {
    const orderedTrackClips = clipsByTrackId.get(track.id) ?? [];
    const activeClip = findActiveClip(orderedTrackClips, clampedTimeMs, allowInclusiveEnd);
    if (!activeClip || track.hidden || track.muted) {
      continue;
    }

    if (!SUPPORTED_VISUAL_TRACK_KINDS.has(track.kind)) {
      issues.push(
        buildIssue(
          'unsupported-track-kind',
          `Track "${track.name}" is not a supported visual playback track yet.`,
          { clipId: activeClip.id, trackId: track.id },
        ),
      );
      continue;
    }

    activeVisualTracks.push({
      track,
      clip: activeClip,
      orderedTrackClips,
    });
  }

  if (activeVisualTracks.length === 0) {
    issues.push(
      buildIssue(
        'no-active-clip',
        'No visible clip is active at the requested playhead time.',
      ),
    );
    return createFrame(timeMs, clampedTimeMs, playRange, inPlayRange, issues);
  }

  if (activeVisualTracks.length > 1) {
    issues.push(
      buildIssue(
        'multiple-active-tracks',
        'Multiple visual tracks overlap at the current playhead time; using the top track for program output.',
        {
          clipId: activeVisualTracks[0]?.clip.id ?? null,
          trackId: activeVisualTracks[0]?.track.id ?? null,
        },
      ),
    );
  }

  const [{ track, clip, orderedTrackClips }] = activeVisualTracks;
  const primaryMediaAsset = mediaAssetById.get(clip.mediaAssetId);
  const frame = createFrame(timeMs, clampedTimeMs, playRange, inPlayRange, issues);
  frame.activeTrackId = track.id;
  frame.primaryClipId = clip.id;
  frame.transition = buildCutTransition(clip.id);

  if (!primaryMediaAsset) {
    frame.issues.push(
      buildIssue(
        'missing-media-asset',
        'The active clip is missing its backing media asset.',
        { clipId: clip.id, trackId: track.id },
      ),
    );
    return frame;
  }

  frame.layers = [buildLayer(clip, primaryMediaAsset, track.id, clampedTimeMs, 1)];
  const clipIndex = findClipIndex(orderedTrackClips, clip.id);
  const previousClip = clipIndex > 0 ? orderedTrackClips[clipIndex - 1] ?? null : null;
  const nextClip = clipIndex >= 0 ? orderedTrackClips[clipIndex + 1] ?? null : null;

  const transitionCandidates: Array<{
    transition: TimelineTransition;
    edge: 'in' | 'out';
    relatedClip: TimelineClip | null;
  }> = [];

  if (clip.transitionIn) {
    transitionCandidates.push({
      transition: clip.transitionIn,
      edge: 'in',
      relatedClip: previousClip,
    });
  }

  if (clip.transitionOut) {
    transitionCandidates.push({
      transition: clip.transitionOut,
      edge: 'out',
      relatedClip: nextClip,
    });
  }

  for (const candidate of transitionCandidates) {
    const { transition, edge, relatedClip } = candidate;
    if (!SUPPORTED_TRANSITION_TYPES.has(transition.type)) {
      frame.transition = {
        kind: 'unsupported',
        edge,
        progress: 0,
        durationMs: transition.durationMs,
        type: transition.type,
        fromClipId: edge === 'in' ? relatedClip?.id ?? null : clip.id,
        toClipId: edge === 'in' ? clip.id : relatedClip?.id ?? null,
      };
      frame.issues.push(
        buildIssue(
          'unsupported-transition',
          `Transition "${transition.type}" is not supported by sequence playback yet.`,
          { clipId: clip.id, trackId: track.id, transitionType: transition.type },
        ),
      );
      return frame;
    }

    if (transition.type === 'cut') {
      continue;
    }

    const progress = resolveTransitionProgress(clip, transition, edge, clampedTimeMs);
    if (progress <= 0 || progress >= 1 && transition.type !== 'fade') {
      continue;
    }

    if (edge === 'in' && clampedTimeMs > clip.startMs + transition.durationMs) {
      continue;
    }

    if (edge === 'out' && clampedTimeMs < clip.startMs + clip.durationMs - transition.durationMs) {
      continue;
    }

    if (transition.type === 'fade') {
      frame.transition = {
        kind: 'fade',
        edge,
        progress,
        durationMs: transition.durationMs,
        type: transition.type,
        fromClipId: edge === 'in' ? null : clip.id,
        toClipId: edge === 'in' ? clip.id : null,
      };
      frame.layers = [
        buildLayer(
          clip,
          primaryMediaAsset,
          track.id,
          clampedTimeMs,
          edge === 'in' ? progress : 1 - progress,
        ),
      ];
      return frame;
    }

    if (!relatedClip) {
      frame.transition = {
        kind: 'unsupported',
        edge,
        progress,
        durationMs: transition.durationMs,
        type: transition.type,
        fromClipId: edge === 'in' ? null : clip.id,
        toClipId: edge === 'in' ? clip.id : null,
      };
      frame.issues.push(
        buildIssue(
          'transition-target-missing',
          'The transition has no adjacent clip to blend with.',
          { clipId: clip.id, trackId: track.id, transitionType: transition.type },
        ),
      );
      return frame;
    }

    const relatedMediaAsset = mediaAssetById.get(relatedClip.mediaAssetId);
    if (!relatedMediaAsset) {
      frame.transition = {
        kind: 'unsupported',
        edge,
        progress,
        durationMs: transition.durationMs,
        type: transition.type,
        fromClipId: edge === 'in' ? relatedClip.id : clip.id,
        toClipId: edge === 'in' ? clip.id : relatedClip.id,
      };
      frame.issues.push(
        buildIssue(
          'transition-target-missing',
          'The adjacent transition clip is missing its media asset.',
          { clipId: relatedClip.id, trackId: track.id, transitionType: transition.type },
        ),
      );
      return frame;
    }

    frame.transition = {
      kind: 'dissolve',
      edge,
      progress,
      durationMs: transition.durationMs,
      type: transition.type,
      fromClipId: edge === 'in' ? relatedClip.id : clip.id,
      toClipId: edge === 'in' ? clip.id : relatedClip.id,
    };
    frame.layers =
      edge === 'in'
        ? [
            buildLayer(relatedClip, relatedMediaAsset, track.id, clampedTimeMs, 1 - progress),
            buildLayer(clip, primaryMediaAsset, track.id, clampedTimeMs, progress),
          ]
        : [
            buildLayer(clip, primaryMediaAsset, track.id, clampedTimeMs, 1 - progress),
            buildLayer(relatedClip, relatedMediaAsset, track.id, clampedTimeMs, progress),
          ];
    return frame;
  }

  return frame;
}
