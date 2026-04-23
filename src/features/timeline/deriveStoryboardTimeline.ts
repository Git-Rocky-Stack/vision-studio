import { createMediaAssetFromAssetRecord, toPreviewUrl } from '@/features/assets/assetRecords';
import type { AppState } from '@/store/appStore.types';
import type { MediaAsset } from '@/types/media';
import type { Scene } from '@/types/project';
import type { TimelineBeatMarker, TimelineClip, TimelineTrack } from '@/types/timeline';

type DerivationState = Pick<
  AppState,
  | 'projects'
  | 'mediaAssets'
  | 'assetLibrary'
  | 'batchResults'
  | 'referenceSets'
  | 'timelineSequences'
  | 'timelineTracks'
  | 'timelineClips'
>;

export interface StoryboardTimelineScenePlan {
  sceneId: string;
  sceneName: string;
  action: 'create' | 'update' | 'skip';
  existingClipId: string | null;
  desiredTrackKind: Extract<TimelineTrack['kind'], 'image' | 'video'>;
  mediaAsset: MediaAsset;
  upsertMediaAsset: boolean;
  placeholder: boolean;
  label: string;
  posterUrl: string | null;
  durationMs: number;
  referenceSetIds: string[];
  storyboardBeatMarkers: TimelineBeatMarker[];
  updates:
    | Partial<
        Pick<
          TimelineClip,
          | 'mediaAssetId'
          | 'posterUrl'
          | 'referenceSetIds'
          | 'storyboardBeatMarkers'
          | 'storyboardDerived'
          | 'storyboardDerivedAt'
          | 'label'
        >
      >
    | null;
}

export interface StoryboardTimelineDerivationPlan {
  projectId: string;
  sequenceId: string;
  mediaAssetsToUpsert: MediaAsset[];
  scenePlans: StoryboardTimelineScenePlan[];
}

const DEFAULT_IMAGE_CLIP_DURATION_MS = 2000;
const DEFAULT_VIDEO_CLIP_DURATION_MS = 5000;
const LOCAL_BACKEND_HOSTS = new Set(['localhost:8000', '127.0.0.1:8000']);
const IMAGE_EXTENSION_RE = /\.(png|jpe?g|webp|bmp|gif|avif|svg)$/i;
const VIDEO_EXTENSION_RE = /\.(mp4|mov|webm|mkv|avi|m4v)$/i;

function normalizePathLike(value: string | null | undefined) {
  if (!value) {
    return '';
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }

  if (trimmed.startsWith('data:')) {
    return trimmed;
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'file:') {
      return decodeURIComponent(parsed.pathname.replace(/^\/([A-Za-z]:\/)/, '$1')).replace(/\\/g, '/');
    }

    if (parsed.protocol.startsWith('http') && LOCAL_BACKEND_HOSTS.has(parsed.host)) {
      return decodeURIComponent(parsed.pathname).replace(/\\/g, '/');
    }
  } catch {
    // Not a full URL; fall through to path normalization.
  }

  return decodeURIComponent(trimmed).replace(/\\/g, '/');
}

function looksLikeImageSource(value: string) {
  return value.startsWith('data:image/') || IMAGE_EXTENSION_RE.test(value);
}

function looksLikeVideoSource(value: string) {
  return value.startsWith('data:video/') || VIDEO_EXTENSION_RE.test(value);
}

function isPlaceholderMediaAsset(asset: MediaAsset | null | undefined) {
  return asset?.metadata?.storyboardPlaceholder === true;
}

function isEqualStringSet(left: string[], right: string[]) {
  if (left.length !== right.length) {
    return false;
  }

  const leftSorted = [...new Set(left)].sort();
  const rightSorted = [...new Set(right)].sort();

  return leftSorted.every((value, index) => value === rightSorted[index]);
}

function areBeatMarkersEqual(left: TimelineBeatMarker[], right: TimelineBeatMarker[]) {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((marker, index) => {
    const next = right[index];
    return (
      marker.id === next.id &&
      marker.sourceBeatId === next.sourceBeatId &&
      marker.label === next.label &&
      marker.promptSeed === next.promptSeed &&
      marker.notes === next.notes &&
      marker.relativeStartMs === next.relativeStartMs &&
      marker.durationMs === next.durationMs &&
      isEqualStringSet(marker.elementIds, next.elementIds)
    );
  });
}

function buildSceneBeatMarkers(scene: Scene): TimelineBeatMarker[] {
  const beats = [...(scene.shotBeats ?? [])].sort((left, right) => left.orderIndex - right.orderIndex);
  let cursor = 0;

  return beats.map((beat) => {
    const marker: TimelineBeatMarker = {
      id: `${scene.id}::${beat.id}`,
      sourceBeatId: beat.id,
      label: beat.summary,
      promptSeed: beat.promptSeed,
      notes: beat.notes,
      relativeStartMs: cursor,
      durationMs: beat.durationMs,
      elementIds: [...beat.elementIds],
    };

    if (typeof beat.durationMs === 'number' && Number.isFinite(beat.durationMs) && beat.durationMs > 0) {
      cursor += Math.round(beat.durationMs);
    }

    return marker;
  });
}

function collectSceneReferenceSetIds(state: DerivationState, projectId: string, scene: Scene) {
  const project = state.projects.find((item) => item.id === projectId);
  if (!project) {
    return [];
  }

  const elementReferenceIds = (scene.elementIds ?? []).flatMap((elementId) => {
    const element = (project.elements ?? []).find((item) => item.id === elementId);
    return element?.referenceSetIds ?? [];
  });

  return Array.from(new Set([...(scene.referenceSetIds ?? []), ...elementReferenceIds]));
}

function resolveSceneOutputHints(state: DerivationState, scene: Scene) {
  const hints: string[] = [];
  const latestRenderedFrame = [...scene.frames]
    .reverse()
    .find((frame) => typeof frame.renderOutput?.path === 'string' && frame.renderOutput.path.length > 0);
  if (latestRenderedFrame?.renderOutput?.path) {
    hints.push(latestRenderedFrame.renderOutput.path);
  }
  if (scene.thumbnail) {
    hints.push(scene.thumbnail);
  }

  const normalizedHints = hints
    .map((hint) => normalizePathLike(hint))
    .filter(Boolean);

  const linkedClipPaths = state.timelineClips
    .filter((clip) => clip.sceneId === scene.id)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .map((clip) => state.mediaAssets.find((asset) => asset.id === clip.mediaAssetId) ?? null)
    .filter((asset): asset is MediaAsset => Boolean(asset) && !isPlaceholderMediaAsset(asset))
    .map((asset) => asset.path);

  return [...linkedClipPaths, ...normalizedHints];
}

function findExistingMediaAssetByHint(state: DerivationState, hints: string[]) {
  const normalizedHints = hints.map((hint) => normalizePathLike(hint)).filter(Boolean);

  return (
    state.mediaAssets.find((asset) => {
      const assetCandidates = [
        asset.path,
        asset.previewUrl,
        asset.thumbnailUrl,
        asset.posterUrl ?? undefined,
      ]
        .map((value) => normalizePathLike(value))
        .filter(Boolean);

      return normalizedHints.some((hint) => assetCandidates.includes(hint));
    }) ?? null
  );
}

function findAssetRecordByHint(state: DerivationState, hints: string[]) {
  const normalizedHints = hints.map((hint) => normalizePathLike(hint)).filter(Boolean);

  return (
    state.assetLibrary.find((asset) => {
      const assetCandidates = [asset.path, asset.previewUrl, asset.thumbnail]
        .map((value) => normalizePathLike(value))
        .filter(Boolean);

      return normalizedHints.some((hint) => assetCandidates.includes(hint));
    }) ?? null
  );
}

function findBatchResultByHint(state: DerivationState, hints: string[]) {
  const normalizedHints = hints.map((hint) => normalizePathLike(hint)).filter(Boolean);

  return (
    state.batchResults.find((result) => {
      const candidates = [result.assetPath ?? undefined, result.imagePath]
        .map((value) => normalizePathLike(value))
        .filter(Boolean);

      return normalizedHints.some((hint) => candidates.includes(hint));
    }) ?? null
  );
}

function createMediaAssetFromBatchResult(
  scene: Scene,
  result: DerivationState['batchResults'][number],
): MediaAsset {
  const storedPath = normalizePathLike(result.assetPath ?? result.imagePath);
  const previewUrl = result.imagePath;
  const name = scene.name || 'Storyboard Result';

  return {
    id: `media::batch::${result.id}`,
    legacyAssetId: result.id,
    jobId: result.batchId,
    name,
    type: looksLikeVideoSource(storedPath) ? 'video' : 'image',
    source: 'generated',
    path: storedPath,
    previewUrl,
    thumbnailUrl: previewUrl,
    posterUrl: looksLikeVideoSource(storedPath) ? previewUrl : null,
    metadata: {
      fromBatchResult: true,
      prompt: result.prompt,
      ...result.params,
    },
    createdAt: new Date(result.createdAt).toISOString(),
  };
}

function createMediaAssetFromSceneHint(scene: Scene, hint: string): MediaAsset | null {
  const normalizedHint = normalizePathLike(hint);
  if (!normalizedHint || (!looksLikeImageSource(normalizedHint) && !looksLikeVideoSource(normalizedHint))) {
    return null;
  }

  const type = looksLikeVideoSource(normalizedHint) ? 'video' : 'image';
  const previewUrl = type === 'image' ? toPreviewUrl(normalizedHint, { type: 'image' }) : normalizedHint;
  const thumbnailUrl = type === 'image' ? previewUrl : toPreviewUrl(normalizedHint, { type: 'video', label: scene.name });
  const createdAt = scene.metadata.modified || scene.metadata.created || new Date().toISOString();

  return {
    id: `media::scene-hint::${scene.id}`,
    legacyAssetId: null,
    jobId: null,
    name: scene.name || 'Storyboard Source',
    type,
    source: 'derived',
    path: normalizedHint,
    previewUrl,
    thumbnailUrl,
    posterUrl: type === 'video' ? thumbnailUrl : null,
    metadata: {
      fromStoryboardScene: true,
      sourceHint: normalizedHint,
    },
    createdAt,
  };
}

function buildPlaceholderPreview(scene: Scene) {
  const safeLabel = (scene.name || 'Storyboard Scene').slice(0, 28);
  const safeBeatCount = String(scene.shotBeats?.length ?? 0);
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="512" height="320" viewBox="0 0 512 320">
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#151821" />
          <stop offset="100%" stop-color="#1e2430" />
        </linearGradient>
      </defs>
      <rect width="512" height="320" rx="28" fill="url(#bg)" />
      <rect x="40" y="40" width="432" height="180" rx="20" fill="#0f1218" stroke="#40495b" stroke-width="6" />
      <text x="256" y="108" fill="#f5f7fb" font-size="22" font-family="Segoe UI, Arial, sans-serif" text-anchor="middle">Storyboard Placeholder</text>
      <text x="256" y="148" fill="#a5b0c5" font-size="26" font-family="Segoe UI, Arial, sans-serif" text-anchor="middle">${safeLabel}</text>
      <text x="256" y="188" fill="#8b96ac" font-size="18" font-family="Segoe UI, Arial, sans-serif" text-anchor="middle">${safeBeatCount} beat markers preserved</text>
      <text x="256" y="268" fill="#f5f7fb" font-size="18" font-family="Segoe UI, Arial, sans-serif" text-anchor="middle">Add or generate media to replace this clip source</text>
    </svg>
  `.trim();

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function createPlaceholderMediaAsset(scene: Scene): MediaAsset {
  const previewUrl = buildPlaceholderPreview(scene);
  const createdAt = scene.metadata.modified || scene.metadata.created || new Date().toISOString();

  return {
    id: `media::storyboard-placeholder::${scene.id}`,
    legacyAssetId: null,
    jobId: null,
    name: `${scene.name || 'Storyboard Scene'} Placeholder`,
    type: 'image',
    source: 'derived',
    path: previewUrl,
    previewUrl,
    thumbnailUrl: previewUrl,
    posterUrl: previewUrl,
    metadata: {
      storyboardPlaceholder: true,
      sceneId: scene.id,
    },
    createdAt,
  };
}

function resolveSceneMediaAsset(
  state: DerivationState,
  scene: Scene,
  existingDerivedClip: TimelineClip | null,
) {
  const existingDerivedAsset =
    existingDerivedClip
      ? state.mediaAssets.find((asset) => asset.id === existingDerivedClip.mediaAssetId) ?? null
      : null;
  if (existingDerivedAsset && !isPlaceholderMediaAsset(existingDerivedAsset)) {
    return {
      mediaAsset: existingDerivedAsset,
      upsertMediaAsset: false,
      placeholder: false,
    };
  }

  const hints = resolveSceneOutputHints(state, scene);
  const existingMediaAsset = findExistingMediaAssetByHint(state, hints);
  if (existingMediaAsset && !isPlaceholderMediaAsset(existingMediaAsset)) {
    return {
      mediaAsset: existingMediaAsset,
      upsertMediaAsset: false,
      placeholder: false,
    };
  }

  const matchingAssetRecord = findAssetRecordByHint(state, hints);
  if (matchingAssetRecord) {
    return {
      mediaAsset: createMediaAssetFromAssetRecord(matchingAssetRecord),
      upsertMediaAsset: true,
      placeholder: false,
    };
  }

  const matchingBatchResult = findBatchResultByHint(state, hints);
  if (matchingBatchResult) {
    return {
      mediaAsset: createMediaAssetFromBatchResult(scene, matchingBatchResult),
      upsertMediaAsset: true,
      placeholder: false,
    };
  }

  const rawHintMediaAsset = hints
    .map((hint) => createMediaAssetFromSceneHint(scene, hint))
    .find((asset): asset is MediaAsset => Boolean(asset));
  if (rawHintMediaAsset) {
    return {
      mediaAsset: rawHintMediaAsset,
      upsertMediaAsset: true,
      placeholder: false,
    };
  }

  return {
    mediaAsset: existingDerivedAsset ?? createPlaceholderMediaAsset(scene),
    upsertMediaAsset: !Boolean(existingDerivedAsset),
    placeholder: true,
  };
}

function resolveClipDuration(scene: Scene, mediaAsset: MediaAsset) {
  if (mediaAsset.type === 'video') {
    return mediaAsset.durationMs ?? DEFAULT_VIDEO_CLIP_DURATION_MS;
  }

  if (typeof scene.metadata.duration === 'number' && scene.metadata.duration > 0) {
    return Math.round(scene.metadata.duration);
  }

  return DEFAULT_IMAGE_CLIP_DURATION_MS;
}

function findPrimaryDerivedClip(
  state: DerivationState,
  scene: Scene,
  sequenceId: string,
) {
  const trackById = new Map(state.timelineTracks.map((track) => [track.id, track]));
  const clipById = new Map(state.timelineClips.map((clip) => [clip.id, clip]));
  const orderedSceneClipIds = scene.timelineClipIds ?? [];

  const orderedDerived = orderedSceneClipIds
    .map((clipId) => clipById.get(clipId) ?? null)
    .filter((clip): clip is TimelineClip => Boolean(clip))
    .find((clip) => {
      const track = trackById.get(clip.trackId);
      return clip.storyboardDerived && track?.sequenceId === sequenceId;
    });

  if (orderedDerived) {
    return orderedDerived;
  }

  return (
    state.timelineClips.find((clip) => {
      const track = trackById.get(clip.trackId);
      return clip.sceneId === scene.id && clip.storyboardDerived && track?.sequenceId === sequenceId;
    }) ?? null
  );
}

function buildClipUpdates(
  scene: Scene,
  existingClip: TimelineClip,
  currentMediaAsset: MediaAsset | null,
  desiredMediaAsset: MediaAsset,
  posterUrl: string | null,
  referenceSetIds: string[],
  storyboardBeatMarkers: TimelineBeatMarker[],
) {
  const nextReferenceSetIds = Array.from(new Set([...existingClip.referenceSetIds, ...referenceSetIds]));
  const nextLabel = existingClip.label.trim().length > 0 ? existingClip.label : scene.name;
  const shouldReplaceMediaAsset =
    desiredMediaAsset.id !== existingClip.mediaAssetId &&
    (!currentMediaAsset || isPlaceholderMediaAsset(currentMediaAsset));
  const nextMediaAssetId = shouldReplaceMediaAsset ? desiredMediaAsset.id : existingClip.mediaAssetId;
  const nextPosterUrl =
    shouldReplaceMediaAsset || !existingClip.posterUrl
      ? (posterUrl ?? existingClip.posterUrl)
      : existingClip.posterUrl;
  const nextDerivedAt = existingClip.storyboardDerivedAt ?? new Date().toISOString();

  const updates = {
    mediaAssetId: nextMediaAssetId,
    posterUrl: nextPosterUrl,
    referenceSetIds: nextReferenceSetIds,
    storyboardBeatMarkers,
    storyboardDerived: true,
    storyboardDerivedAt: nextDerivedAt,
    label: nextLabel,
  } satisfies StoryboardTimelineScenePlan['updates'];

  const changed =
    updates.mediaAssetId !== existingClip.mediaAssetId ||
    updates.posterUrl !== existingClip.posterUrl ||
    updates.label !== existingClip.label ||
    updates.storyboardDerived !== existingClip.storyboardDerived ||
    updates.storyboardDerivedAt !== existingClip.storyboardDerivedAt ||
    !isEqualStringSet(updates.referenceSetIds ?? [], existingClip.referenceSetIds) ||
    !areBeatMarkersEqual(updates.storyboardBeatMarkers ?? [], existingClip.storyboardBeatMarkers);

  return {
    action: changed ? ('update' as const) : ('skip' as const),
    updates: changed ? updates : null,
  };
}

export function planStoryboardTimelineDerivation({
  state,
  projectId,
  sequenceId,
  sceneIds,
}: {
  state: DerivationState;
  projectId: string;
  sequenceId: string;
  sceneIds?: string[];
}): StoryboardTimelineDerivationPlan | null {
  const project = state.projects.find((item) => item.id === projectId);
  if (!project) {
    return null;
  }

  const requestedSceneIds = sceneIds ? new Set(sceneIds) : null;
  const sortedScenes = [...project.scenes]
    .filter((scene) => (requestedSceneIds ? requestedSceneIds.has(scene.id) : true))
    .sort((left, right) => left.orderIndex - right.orderIndex);

  const mediaAssetsToUpsert = new Map<string, MediaAsset>();
  const scenePlans: StoryboardTimelineScenePlan[] = [];

  for (const scene of sortedScenes) {
    const existingDerivedClip = findPrimaryDerivedClip(state, scene, sequenceId);
    const currentMediaAsset = existingDerivedClip
      ? state.mediaAssets.find((asset) => asset.id === existingDerivedClip.mediaAssetId) ?? null
      : null;
    const resolvedMedia = resolveSceneMediaAsset(state, scene, existingDerivedClip);
    if (resolvedMedia.upsertMediaAsset) {
      mediaAssetsToUpsert.set(resolvedMedia.mediaAsset.id, resolvedMedia.mediaAsset);
    }

    const storyboardBeatMarkers = buildSceneBeatMarkers(scene);
    const referenceSetIds = collectSceneReferenceSetIds(state, projectId, scene);
    const posterUrl =
      resolvedMedia.mediaAsset.posterUrl ??
      resolvedMedia.mediaAsset.thumbnailUrl ??
      resolvedMedia.mediaAsset.previewUrl;

    if (!existingDerivedClip) {
      scenePlans.push({
        sceneId: scene.id,
        sceneName: scene.name,
        action: 'create',
        existingClipId: null,
        desiredTrackKind: resolvedMedia.mediaAsset.type === 'video' ? 'video' : 'image',
        mediaAsset: resolvedMedia.mediaAsset,
        upsertMediaAsset: resolvedMedia.upsertMediaAsset,
        placeholder: resolvedMedia.placeholder,
        label: scene.name,
        posterUrl,
        durationMs: resolveClipDuration(scene, resolvedMedia.mediaAsset),
        referenceSetIds,
        storyboardBeatMarkers,
        updates: null,
      });
      continue;
    }

    const { action, updates } = buildClipUpdates(
      scene,
      existingDerivedClip,
      currentMediaAsset,
      resolvedMedia.mediaAsset,
      posterUrl,
      referenceSetIds,
      storyboardBeatMarkers,
    );

    scenePlans.push({
      sceneId: scene.id,
      sceneName: scene.name,
      action,
      existingClipId: existingDerivedClip.id,
      desiredTrackKind: resolvedMedia.mediaAsset.type === 'video' ? 'video' : 'image',
      mediaAsset: resolvedMedia.mediaAsset,
      upsertMediaAsset: resolvedMedia.upsertMediaAsset,
      placeholder: resolvedMedia.placeholder,
      label: scene.name,
      posterUrl,
      durationMs: resolveClipDuration(scene, resolvedMedia.mediaAsset),
      referenceSetIds,
      storyboardBeatMarkers,
      updates,
    });
  }

  return {
    projectId,
    sequenceId,
    mediaAssetsToUpsert: Array.from(mediaAssetsToUpsert.values()),
    scenePlans,
  };
}
