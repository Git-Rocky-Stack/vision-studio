import type {
  AppGet,
  AppSet,
  AppState,
} from '../appStore.types';
import type {
  MediaAsset,
  ReferenceSet,
  ReferenceSetItem,
  ReferenceSlotType,
} from '@/types/media';
import type { ReferenceImage } from '@/types/project';
import { planStoryboardTimelineDerivation } from '@/features/timeline/deriveStoryboardTimeline';
import type {
  ClipGenerationBinding,
  TimelineBeatMarker,
  TimelineClip,
  TimelineClipMoveOptions,
  TimelineClipTrimOptions,
  TimelineSequence,
  TimelineSplitResult,
  TimelineTrack,
  TimelineTransitionEdge,
  TimelinePlayRange,
  TimelineTransition,
} from '@/types/timeline';

export const mediaTimelineInitialState = {
  mediaAssets: [] as MediaAsset[],
  referenceSets: [] as ReferenceSet[],
  timelineSequences: [] as TimelineSequence[],
  timelineTracks: [] as TimelineTrack[],
  timelineClips: [] as TimelineClip[],
  clipGenerationBindings: [] as ClipGenerationBinding[],
  activeTimelineSequenceId: null as string | null,
  activeTimelineClipId: null as string | null,
};

interface CreateReferenceSetParams {
  name: string;
  scope: ReferenceSet['scope'];
  projectId?: string | null;
  sceneId?: string | null;
  clipId?: string | null;
  items?: ReferenceSetItem[];
  notes?: string;
  tags?: string[];
}

function resolveReferenceItemPath(
  item: ReferenceSetItem,
  mediaAssets: MediaAsset[],
): string | null {
  if (item.path) {
    return item.path;
  }

  if (!item.mediaAssetId) {
    return null;
  }

  return mediaAssets.find((asset) => asset.id === item.mediaAssetId)?.path ?? null;
}

function mapReferenceSlotToLegacyType(slot: ReferenceSlotType): ReferenceImage['type'] {
  switch (slot) {
    case 'character':
      return 'character';
    case 'motion':
      return 'motion';
    default:
      return slot;
  }
}

function buildSceneReferenceImages(
  scene: AppState['projects'][number]['scenes'][number],
  referenceSets: ReferenceSet[],
  mediaAssets: MediaAsset[],
): ReferenceImage[] {
  const attachedReferenceSets = (scene.referenceSetIds ?? [])
    .map((referenceSetId) => referenceSets.find((referenceSet) => referenceSet.id === referenceSetId))
    .filter((referenceSet): referenceSet is ReferenceSet => Boolean(referenceSet));

  return attachedReferenceSets.flatMap((referenceSet) =>
    [...referenceSet.items]
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .map((item) => {
        const path = resolveReferenceItemPath(item, mediaAssets);
        if (!path) {
          return null;
        }

        return {
          id: item.id,
          path,
          type: mapReferenceSlotToLegacyType(item.slot),
          label: item.label,
          mediaAssetId: item.mediaAssetId ?? undefined,
          referenceSetId: referenceSet.id,
        } satisfies ReferenceImage;
      })
      .filter((image): image is ReferenceImage => Boolean(image)),
  );
}

function syncProjectsWithReferenceAdapters(
  projects: AppState['projects'],
  referenceSets: ReferenceSet[],
  mediaAssets: MediaAsset[],
): AppState['projects'] {
  const validReferenceSetIds = new Set(referenceSets.map((referenceSet) => referenceSet.id));

  return projects.map((project) => ({
    ...project,
    referenceSetIds: (project.referenceSetIds ?? []).filter((referenceSetId) =>
      validReferenceSetIds.has(referenceSetId),
    ),
    elements: (project.elements ?? []).map((element) => ({
      ...element,
      referenceSetIds: element.referenceSetIds.filter((referenceSetId) =>
        validReferenceSetIds.has(referenceSetId),
      ),
    })),
    scenes: project.scenes.map((scene) => {
      const nextReferenceSetIds = (scene.referenceSetIds ?? []).filter((referenceSetId) =>
        validReferenceSetIds.has(referenceSetId),
      );
      const preservedReferenceImages = scene.referenceImages.filter((image) => !image.referenceSetId);
      const adapterReferenceImages = buildSceneReferenceImages(
        { ...scene, referenceSetIds: nextReferenceSetIds },
        referenceSets,
        mediaAssets,
      );

      return {
        ...scene,
        referenceSetIds: nextReferenceSetIds,
        referenceImages: [...preservedReferenceImages, ...adapterReferenceImages],
      };
    }),
  }));
}

function attachReferenceSetToProjects(
  projects: AppState['projects'],
  referenceSet: ReferenceSet,
): AppState['projects'] {
  return projects.map((project) => {
    const nextProjectReferenceSetIds =
      referenceSet.scope === 'project' && project.id === referenceSet.projectId
        ? Array.from(new Set([...(project.referenceSetIds ?? []), referenceSet.id]))
        : (project.referenceSetIds ?? []);

    return {
      ...project,
      referenceSetIds: nextProjectReferenceSetIds,
      scenes: project.scenes.map((scene) =>
        referenceSet.scope === 'scene' && scene.id === referenceSet.sceneId
          ? {
              ...scene,
              referenceSetIds: Array.from(new Set([...(scene.referenceSetIds ?? []), referenceSet.id])),
            }
          : scene,
      ),
    };
  });
}

function attachReferenceSetToClips(
  clips: TimelineClip[],
  referenceSet: ReferenceSet,
): TimelineClip[] {
  if (referenceSet.scope !== 'clip' || !referenceSet.clipId) {
    return clips;
  }

  return clips.map((clip) =>
    clip.id === referenceSet.clipId
      ? {
          ...clip,
          referenceSetIds: Array.from(new Set([...clip.referenceSetIds, referenceSet.id])),
        }
      : clip,
  );
}

interface EnsureTimelineSequenceParams {
  name?: string;
  fps?: number;
}

interface CreateTimelineTrackParams {
  kind?: TimelineTrack['kind'];
  name?: string;
  locked?: boolean;
  muted?: boolean;
  solo?: boolean;
  hidden?: boolean;
}

interface CreateTimelineClipParams {
  trackId: string;
  mediaAssetId: string;
  sceneId?: string | null;
  startMs: number;
  durationMs: number;
  sourceInMs?: number;
  sourceOutMs?: number;
  transitionIn?: TimelineTransition | null;
  transitionOut?: TimelineTransition | null;
  gain?: number;
  fadeInMs?: number;
  fadeOutMs?: number;
  label?: string;
  posterUrl?: string | null;
  referenceSetIds?: string[];
  generationBindingId?: string | null;
  storyboardDerived?: boolean;
  storyboardBeatMarkers?: TimelineBeatMarker[];
  storyboardDerivedAt?: string | null;
}

const DEFAULT_IMAGE_CLIP_DURATION_MS = 2000;
const DEFAULT_VIDEO_CLIP_DURATION_MS = 5000;
const DEFAULT_AUDIO_CLIP_DURATION_MS = 5000;
const MIN_TIMELINE_CLIP_DURATION_MS = 120;
const SNAP_TOLERANCE_MS = 120;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function normalizeTimelineBeatMarker(
  marker: Partial<TimelineBeatMarker> | undefined,
): TimelineBeatMarker | null {
  if (!marker || typeof marker.id !== 'string' || marker.id.length === 0) {
    return null;
  }

  return {
    id: marker.id,
    sourceBeatId:
      typeof marker.sourceBeatId === 'string' && marker.sourceBeatId.length > 0
        ? marker.sourceBeatId
        : marker.id,
    label: typeof marker.label === 'string' ? marker.label : '',
    promptSeed: typeof marker.promptSeed === 'string' ? marker.promptSeed : '',
    notes: typeof marker.notes === 'string' ? marker.notes : '',
    relativeStartMs:
      typeof marker.relativeStartMs === 'number' && Number.isFinite(marker.relativeStartMs)
        ? Math.max(0, Math.round(marker.relativeStartMs))
        : 0,
    durationMs:
      typeof marker.durationMs === 'number' && Number.isFinite(marker.durationMs)
        ? Math.max(0, Math.round(marker.durationMs))
        : null,
    elementIds: Array.isArray(marker.elementIds)
      ? marker.elementIds.filter((value): value is string => typeof value === 'string')
      : [],
  };
}

function normalizeTimelineBeatMarkers(
  markers: TimelineBeatMarker[] | Partial<TimelineBeatMarker>[] | undefined,
): TimelineBeatMarker[] {
  if (!Array.isArray(markers)) {
    return [];
  }

  return markers
    .map((marker) => normalizeTimelineBeatMarker(marker))
    .filter((marker): marker is TimelineBeatMarker => Boolean(marker));
}

function getTrackKindForMediaAsset(asset: MediaAsset): Extract<TimelineTrack['kind'], 'image' | 'video' | 'audio'> {
  if (asset.type === 'video') {
    return 'video';
  }

  if (asset.type === 'audio') {
    return 'audio';
  }

  return 'image';
}

function isEqualStringSet(left: string[], right: string[]) {
  if (left.length !== right.length) {
    return false;
  }

  const leftSorted = [...new Set(left)].sort();
  const rightSorted = [...new Set(right)].sort();

  return leftSorted.every((value, index) => value === rightSorted[index]);
}

function sortClipsByStart(clips: TimelineClip[]) {
  return [...clips].sort((left, right) => {
    if (left.startMs === right.startMs) {
      return left.createdAt.localeCompare(right.createdAt);
    }

    return left.startMs - right.startMs;
  });
}

function resolveMediaAssetDuration(mediaAsset: MediaAsset | undefined, clip: TimelineClip) {
  if (typeof mediaAsset?.durationMs === 'number' && Number.isFinite(mediaAsset.durationMs)) {
    return mediaAsset.durationMs;
  }

  if (mediaAsset?.type === 'image') {
    return clip.sourceOutMs;
  }

  return null;
}

function sortTrackClipIds(track: TimelineTrack, clips: TimelineClip[]) {
  const clipLookup = new Map(clips.map((clip) => [clip.id, clip]));

  return [...track.clipIds].sort((leftId, rightId) => {
    const left = clipLookup.get(leftId);
    const right = clipLookup.get(rightId);

    if (!left && !right) {
      return 0;
    }

    if (!left) {
      return 1;
    }

    if (!right) {
      return -1;
    }

    if (left.startMs === right.startMs) {
      return left.createdAt.localeCompare(right.createdAt);
    }

    return left.startMs - right.startMs;
  });
}

function syncTrackClipIds(tracks: TimelineTrack[], clips: TimelineClip[]) {
  return tracks.map((track) => ({
    ...track,
    clipIds: sortTrackClipIds(track, clips).filter((clipId) => clips.some((clip) => clip.id === clipId)),
  }));
}

function collectSnapAnchors(
  trackId: string,
  clips: TimelineClip[],
  excludeClipId: string,
  sequence: TimelineSequence | null,
) {
  const anchors = new Set<number>([
    0,
    sequence?.playRange?.startMs ?? 0,
    sequence?.playRange?.endMs ?? sequence?.durationMs ?? 0,
  ]);

  for (const clip of clips) {
    if (clip.trackId !== trackId || clip.id === excludeClipId) {
      continue;
    }

    anchors.add(clip.startMs);
    anchors.add(clip.startMs + clip.durationMs);
  }

  return [...anchors].filter((value) => Number.isFinite(value));
}

function snapTimelineValue(
  value: number,
  fps: number,
  anchors: number[],
  snapToFrames: boolean | undefined,
) {
  if (snapToFrames === false) {
    return Math.max(0, Math.round(value));
  }

  const frameMs = 1000 / Math.max(1, fps);
  let snapped = Math.round(value / frameMs) * frameMs;

  for (const anchor of anchors) {
    if (Math.abs(anchor - value) <= SNAP_TOLERANCE_MS) {
      snapped = anchor;
      break;
    }
  }

  return Math.max(0, Math.round(snapped));
}

function buildClipMap(clips: TimelineClip[]) {
  return new Map(clips.map((clip) => [clip.id, clip]));
}

function reflowTrackClips(
  trackId: string,
  clips: TimelineClip[],
  pinnedClipId: string,
  preferredStartMs: number,
) {
  const byId = buildClipMap(clips);
  const ordered = sortClipsByStart(clips.filter((clip) => clip.trackId === trackId)).map((clip) =>
    clip.id === pinnedClipId ? { ...clip, startMs: preferredStartMs } : clip,
  );

  let cursor = 0;
  const nextById = new Map<string, TimelineClip>();

  for (const clip of ordered) {
    const nextStartMs = Math.max(cursor, clip.startMs);
    const nextClip =
      nextStartMs === clip.startMs
        ? clip
        : {
            ...clip,
            startMs: nextStartMs,
            updatedAt: new Date().toISOString(),
          };
    cursor = nextClip.startMs + nextClip.durationMs;
    nextById.set(nextClip.id, nextClip);
  }

  return clips.map((clip) => nextById.get(clip.id) ?? byId.get(clip.id) ?? clip);
}

function pruneBindingVariantIds(
  bindings: ClipGenerationBinding[],
  removedClipIds: Set<string>,
  removedBindingIds?: Set<string>,
) {
  return bindings
    .filter((binding) => !(removedBindingIds?.has(binding.id) ?? false))
    .map((binding) => ({
      ...binding,
      variantIds: Array.from(
        new Set(binding.variantIds.filter((variantId) => !removedClipIds.has(variantId))),
      ),
    }));
}

function computeSequenceDuration(
  sequenceId: string,
  tracks: TimelineTrack[],
  clips: TimelineClip[],
): number {
  const clipIds = tracks
    .filter((track) => track.sequenceId === sequenceId)
    .flatMap((track) => track.clipIds);

  return clipIds.reduce((duration, clipId) => {
    const clip = clips.find((item) => item.id === clipId);
    if (!clip) {
      return duration;
    }

    return Math.max(duration, clip.startMs + clip.durationMs);
  }, 0);
}

function updateSceneClipIds(
  projects: AppState['projects'],
  sceneId: string,
  nextClipIds: string[],
): AppState['projects'] {
  return projects.map((project) => ({
    ...project,
    scenes: project.scenes.map((scene) =>
      scene.id === sceneId ? { ...scene, timelineClipIds: nextClipIds } : scene,
    ),
  }));
}

function appendSceneClipId(
  projects: AppState['projects'],
  sceneId: string,
  clipId: string,
): AppState['projects'] {
  const scene = projects.flatMap((project) => project.scenes).find((item) => item.id === sceneId);
  if (!scene) {
    return projects;
  }

  return updateSceneClipIds(
    projects,
    sceneId,
    scene.timelineClipIds.includes(clipId)
      ? scene.timelineClipIds
      : [...scene.timelineClipIds, clipId],
  );
}

function removeSceneClipId(
  projects: AppState['projects'],
  sceneId: string,
  clipId: string,
): AppState['projects'] {
  const scene = projects.flatMap((project) => project.scenes).find((item) => item.id === sceneId);
  if (!scene) {
    return projects;
  }

  return updateSceneClipIds(
    projects,
    sceneId,
    scene.timelineClipIds.filter((item) => item !== clipId),
  );
}

export function createMediaTimelineActions(set: AppSet, get: AppGet) {
  return {
    setActiveTimelineSequence: (id: string | null) => set({ activeTimelineSequenceId: id }),

    setActiveTimelineClip: (id: string | null) => set({ activeTimelineClipId: id }),

    upsertMediaAsset: (asset: MediaAsset) =>
      set((state) => {
        const existingIndex = state.mediaAssets.findIndex((item) => item.id === asset.id);
        const nextAssets =
          existingIndex === -1
            ? [...state.mediaAssets, asset]
            : state.mediaAssets.map((item) => (item.id === asset.id ? asset : item));

        return {
          mediaAssets: nextAssets,
          projects: syncProjectsWithReferenceAdapters(
            state.projects,
            state.referenceSets,
            nextAssets,
          ),
        };
      }),

    removeMediaAsset: (assetId: string) =>
      set((state) => {
        const nextAssets = state.mediaAssets.filter((asset) => asset.id !== assetId);

        return {
          mediaAssets: nextAssets,
          projects: syncProjectsWithReferenceAdapters(
            state.projects,
            state.referenceSets,
            nextAssets,
          ),
        };
      }),

    createReferenceSet: (params: CreateReferenceSetParams) => {
      const now = new Date().toISOString();
      const referenceSet: ReferenceSet = {
        id: crypto.randomUUID(),
        name: params.name,
        scope: params.scope,
        projectId: params.projectId ?? null,
        sceneId: params.sceneId ?? null,
        clipId: params.clipId ?? null,
        items: (params.items ?? []).map((item, index) => ({
          ...item,
          orderIndex: item.orderIndex ?? index,
        })),
        notes: params.notes ?? '',
        tags: params.tags ?? [],
        createdAt: now,
        updatedAt: now,
      };

      set((state) => {
        const nextReferenceSets = [...state.referenceSets, referenceSet];

        return {
          referenceSets: nextReferenceSets,
          projects: syncProjectsWithReferenceAdapters(
            attachReferenceSetToProjects(state.projects, referenceSet),
            nextReferenceSets,
            state.mediaAssets,
          ),
          timelineClips: attachReferenceSetToClips(state.timelineClips, referenceSet),
        };
      });

      return referenceSet;
    },

    updateReferenceSet: (id: string, updates: Partial<Omit<ReferenceSet, 'id' | 'createdAt'>>) =>
      set((state) => {
        const nextReferenceSets = state.referenceSets.map((referenceSet) =>
          referenceSet.id === id
            ? {
                ...referenceSet,
                ...updates,
                updatedAt: new Date().toISOString(),
              }
            : referenceSet,
        );

        return {
          referenceSets: nextReferenceSets,
          projects: syncProjectsWithReferenceAdapters(
            state.projects,
            nextReferenceSets,
            state.mediaAssets,
          ),
        };
      }),

    deleteReferenceSet: (id: string) =>
      set((state) => {
        const nextReferenceSets = state.referenceSets.filter((referenceSet) => referenceSet.id !== id);
        const nextProjects = state.projects.map((project) => ({
          ...project,
          referenceSetIds: (project.referenceSetIds ?? []).filter((referenceSetId) => referenceSetId !== id),
          scenes: project.scenes.map((scene) => ({
            ...scene,
            referenceSetIds: (scene.referenceSetIds ?? []).filter((referenceSetId) => referenceSetId !== id),
          })),
        }));

        return {
          referenceSets: nextReferenceSets,
          projects: syncProjectsWithReferenceAdapters(
            nextProjects,
            nextReferenceSets,
            state.mediaAssets,
          ),
          timelineClips: state.timelineClips.map((clip) => ({
            ...clip,
            referenceSetIds: clip.referenceSetIds.filter((referenceSetId) => referenceSetId !== id),
          })),
          clipGenerationBindings: state.clipGenerationBindings.map((binding) => ({
            ...binding,
            referenceSetIds: binding.referenceSetIds.filter((referenceSetId) => referenceSetId !== id),
          })),
        };
      }),

    setElementReferenceSetLink: (
      projectId: string,
      elementId: string,
      referenceSetId: string,
      linked: boolean,
    ) =>
      set((state) => {
        const referenceSet = state.referenceSets.find((item) => item.id === referenceSetId);
        if (
          !referenceSet ||
          !projectId ||
          referenceSet.projectId !== projectId ||
          !['project', 'scene'].includes(referenceSet.scope)
        ) {
          return {};
        }

        return {
          projects: state.projects.map((project) =>
            project.id !== projectId
              ? project
              : {
                  ...project,
                  elements: (project.elements ?? []).map((element) =>
                    element.id !== elementId
                      ? element
                      : {
                          ...element,
                          referenceSetIds: linked
                            ? Array.from(new Set([...element.referenceSetIds, referenceSetId]))
                            : element.referenceSetIds.filter((item) => item !== referenceSetId),
                        },
                  ),
                },
          ),
        };
      }),

    ensureTimelineSequenceForProject: (
      projectId: string,
      params?: EnsureTimelineSequenceParams,
    ) => {
      const state = get();
      const project = state.projects.find((item) => item.id === projectId);
      if (!project) {
        return null;
      }

      if (project.timelineSequenceId) {
        const existingSequence = state.timelineSequences.find(
          (sequence) => sequence.id === project.timelineSequenceId,
        );
        if (existingSequence) {
          return existingSequence;
        }
      }

      const now = new Date().toISOString();
      const sequenceId = crypto.randomUUID();
      const trackId = crypto.randomUUID();
      const sequence: TimelineSequence = {
        id: sequenceId,
        projectId,
        name: params?.name ?? `${project.name} Timeline`,
        trackIds: [trackId],
        durationMs: 0,
        fps: params?.fps ?? project.fps,
        playRange: null,
        createdAt: now,
        updatedAt: now,
      };
      const track: TimelineTrack = {
        id: trackId,
        sequenceId,
        kind: 'video',
        name: 'Primary Video',
        clipIds: [],
        orderIndex: 0,
        locked: false,
        muted: false,
        solo: false,
        hidden: false,
      };

      set((currentState) => ({
        timelineSequences: [...currentState.timelineSequences, sequence],
        timelineTracks: [...currentState.timelineTracks, track],
        activeTimelineSequenceId: sequenceId,
        projects: currentState.projects.map((item) =>
          item.id === projectId
            ? { ...item, timelineSequenceId: sequenceId, modified: now }
            : item,
        ),
      }));

      return sequence;
    },

    createTimelineTrack: (sequenceId: string, params?: CreateTimelineTrackParams) => {
      const state = get();
      const sequence = state.timelineSequences.find((item) => item.id === sequenceId);
      if (!sequence) {
        return null;
      }

      const track: TimelineTrack = {
        id: crypto.randomUUID(),
        sequenceId,
        kind: params?.kind ?? 'video',
        name: params?.name ?? `Track ${sequence.trackIds.length + 1}`,
        clipIds: [],
        orderIndex: state.timelineTracks.filter((item) => item.sequenceId === sequenceId).length,
        locked: params?.locked ?? false,
        muted: params?.muted ?? false,
        solo: params?.solo ?? false,
        hidden: params?.hidden ?? false,
      };

      set((currentState) => ({
        timelineTracks: [...currentState.timelineTracks, track],
        timelineSequences: currentState.timelineSequences.map((item) =>
          item.id === sequenceId
            ? {
                ...item,
                trackIds: [...item.trackIds, track.id],
                updatedAt: new Date().toISOString(),
              }
            : item,
        ),
      }));

      return track;
    },

    updateTimelineTrack: (trackId: string, updates: Partial<Omit<TimelineTrack, 'id' | 'sequenceId'>>) =>
      set((state) => ({
        timelineTracks: state.timelineTracks.map((track) =>
          track.id === trackId ? { ...track, ...updates } : track,
        ),
      })),

    deleteTimelineTrack: (trackId: string) =>
      set((state) => {
        const track = state.timelineTracks.find((item) => item.id === trackId);
        if (!track) {
          return {};
        }

        const removedClipIds = new Set(track.clipIds);
        let nextProjects = state.projects;
        const removedClips = state.timelineClips.filter((item) => removedClipIds.has(item.id));
        for (const clip of removedClips) {
          if (clip.sceneId) {
            const scene = state.projects
              .flatMap((project) => project.scenes)
              .find((item) => item.id === clip.sceneId);
            if (scene) {
              nextProjects = updateSceneClipIds(
                nextProjects,
                clip.sceneId,
                scene.timelineClipIds.filter((clipId) => clipId !== clip.id),
              );
            }
          }
        }

        const nextTracks = state.timelineTracks
          .filter((item) => item.id !== trackId)
          .map((item) =>
            item.sequenceId === track.sequenceId && item.orderIndex > track.orderIndex
              ? { ...item, orderIndex: item.orderIndex - 1 }
              : item,
          );
        const nextClips = state.timelineClips.filter((clip) => !removedClipIds.has(clip.id));
        const removedBindingIds = new Set(
          removedClips
            .map((clip) => clip.generationBindingId)
            .filter((bindingId): bindingId is string => Boolean(bindingId)),
        );
        const nextBindings = pruneBindingVariantIds(
          state.clipGenerationBindings,
          removedClipIds,
          removedBindingIds,
        );

        return {
          projects: nextProjects,
          timelineTracks: nextTracks,
          timelineClips: nextClips,
          clipGenerationBindings: nextBindings,
          timelineSequences: state.timelineSequences.map((sequence) =>
            sequence.id === track.sequenceId
              ? {
                  ...sequence,
                  trackIds: sequence.trackIds.filter((id) => id !== trackId),
                  durationMs: computeSequenceDuration(sequence.id, nextTracks, nextClips),
                  updatedAt: new Date().toISOString(),
                }
              : sequence,
          ),
          activeTimelineClipId:
            state.activeTimelineClipId && removedClipIds.has(state.activeTimelineClipId)
              ? null
              : state.activeTimelineClipId,
        };
      }),

    createTimelineClip: (params: CreateTimelineClipParams) => {
      const state = get();
      const track = state.timelineTracks.find((item) => item.id === params.trackId);
      if (!track || track.locked) {
        return null;
      }

      const now = new Date().toISOString();
      const mediaAsset = state.mediaAssets.find((item) => item.id === params.mediaAssetId);
      const storyboardBeatMarkers = normalizeTimelineBeatMarkers(params.storyboardBeatMarkers);
      const storyboardDerived =
        typeof params.storyboardDerived === 'boolean'
          ? (params.storyboardDerived || storyboardBeatMarkers.length > 0)
          : storyboardBeatMarkers.length > 0;
      const storyboardDerivedAt =
        storyboardDerived
          ? (params.storyboardDerivedAt ?? now)
          : null;
      const fallbackDuration =
        mediaAsset?.type === 'video'
          ? DEFAULT_VIDEO_CLIP_DURATION_MS
          : mediaAsset?.type === 'audio'
            ? DEFAULT_AUDIO_CLIP_DURATION_MS
            : DEFAULT_IMAGE_CLIP_DURATION_MS;
      const sourceInMs = Math.max(0, params.sourceInMs ?? 0);
      const requestedDurationMs = Math.max(
        MIN_TIMELINE_CLIP_DURATION_MS,
        params.durationMs || mediaAsset?.durationMs || fallbackDuration,
      );
      const resolvedMediaDuration = mediaAsset
        ? resolveMediaAssetDuration(mediaAsset, {
            id: 'preview',
            trackId: params.trackId,
            mediaAssetId: params.mediaAssetId,
            sceneId: params.sceneId ?? null,
            startMs: Math.max(0, params.startMs),
            durationMs: requestedDurationMs,
            sourceInMs,
            sourceOutMs: sourceInMs + requestedDurationMs,
            transitionIn: null,
            transitionOut: null,
            gain: typeof params.gain === 'number' && Number.isFinite(params.gain) ? params.gain : 1,
            fadeInMs: typeof params.fadeInMs === 'number' && Number.isFinite(params.fadeInMs) ? params.fadeInMs : 0,
            fadeOutMs: typeof params.fadeOutMs === 'number' && Number.isFinite(params.fadeOutMs) ? params.fadeOutMs : 0,
            label: params.label ?? 'Timeline Clip',
            posterUrl: params.posterUrl ?? null,
            referenceSetIds: params.referenceSetIds ?? [],
            generationBindingId: params.generationBindingId ?? null,
            storyboardDerived,
            storyboardBeatMarkers,
            storyboardDerivedAt,
            createdAt: now,
            updatedAt: now,
          })
        : null;
      const requestedSourceOutMs = params.sourceOutMs ?? sourceInMs + requestedDurationMs;
      const maxSourceOutMs = resolvedMediaDuration ?? requestedSourceOutMs;
      const sourceOutMs = clamp(
        requestedSourceOutMs,
        sourceInMs + MIN_TIMELINE_CLIP_DURATION_MS,
        Math.max(sourceInMs + MIN_TIMELINE_CLIP_DURATION_MS, maxSourceOutMs),
      );
      const clip: TimelineClip = {
        id: crypto.randomUUID(),
        trackId: params.trackId,
        mediaAssetId: params.mediaAssetId,
        sceneId: params.sceneId ?? null,
        startMs: Math.max(0, params.startMs),
        durationMs: sourceOutMs - sourceInMs,
        sourceInMs,
        sourceOutMs,
        transitionIn: params.transitionIn ?? null,
        transitionOut: params.transitionOut ?? null,
        gain:
          typeof params.gain === 'number' && Number.isFinite(params.gain)
            ? clamp(params.gain, 0, 2)
            : 1,
        fadeInMs:
          typeof params.fadeInMs === 'number' && Number.isFinite(params.fadeInMs)
            ? Math.max(0, Math.round(params.fadeInMs))
            : 0,
        fadeOutMs:
          typeof params.fadeOutMs === 'number' && Number.isFinite(params.fadeOutMs)
            ? Math.max(0, Math.round(params.fadeOutMs))
            : 0,
        label: params.label ?? 'Timeline Clip',
        posterUrl: params.posterUrl ?? mediaAsset?.posterUrl ?? null,
        referenceSetIds: params.referenceSetIds ?? [],
        generationBindingId: params.generationBindingId ?? null,
        storyboardDerived,
        storyboardBeatMarkers,
        storyboardDerivedAt,
        createdAt: now,
        updatedAt: now,
      };

      set((currentState) => {
        let nextClips = [...currentState.timelineClips, clip];
        nextClips = reflowTrackClips(track.id, nextClips, clip.id, clip.startMs);
        const nextTracks = syncTrackClipIds(
          currentState.timelineTracks.map((item) =>
            item.id === params.trackId
              ? { ...item, clipIds: [...item.clipIds, clip.id] }
              : item,
          ),
          nextClips,
        );
        const nextProjects =
          clip.sceneId === null
            ? currentState.projects
            : appendSceneClipId(currentState.projects, clip.sceneId, clip.id);

        return {
          projects: nextProjects,
          timelineTracks: nextTracks,
          timelineClips: nextClips,
          activeTimelineClipId: clip.id,
          timelineSequences: currentState.timelineSequences.map((sequence) =>
            sequence.id === track.sequenceId
              ? {
                  ...sequence,
                  durationMs: computeSequenceDuration(sequence.id, nextTracks, nextClips),
                  updatedAt: now,
                }
              : sequence,
          ),
        };
      });

      return clip;
    },

    updateTimelineClip: (clipId: string, updates: Partial<Omit<TimelineClip, 'id' | 'trackId' | 'createdAt'>>) =>
      set((state) => {
        const currentClip = state.timelineClips.find((item) => item.id === clipId);
        if (!currentClip) {
          return {};
        }

        const nextClip = {
          ...currentClip,
          ...updates,
          gain:
            typeof updates.gain === 'number' && Number.isFinite(updates.gain)
              ? clamp(updates.gain, 0, 2)
              : currentClip.gain,
          fadeInMs:
            typeof updates.fadeInMs === 'number' && Number.isFinite(updates.fadeInMs)
              ? Math.max(0, Math.round(updates.fadeInMs))
              : currentClip.fadeInMs,
          fadeOutMs:
            typeof updates.fadeOutMs === 'number' && Number.isFinite(updates.fadeOutMs)
              ? Math.max(0, Math.round(updates.fadeOutMs))
              : currentClip.fadeOutMs,
          storyboardBeatMarkers:
            Array.isArray(updates.storyboardBeatMarkers)
              ? normalizeTimelineBeatMarkers(updates.storyboardBeatMarkers)
              : currentClip.storyboardBeatMarkers,
          storyboardDerived:
            typeof updates.storyboardDerived === 'boolean'
              ? (
                  updates.storyboardDerived ||
                  (Array.isArray(updates.storyboardBeatMarkers)
                    ? normalizeTimelineBeatMarkers(updates.storyboardBeatMarkers).length > 0
                    : currentClip.storyboardBeatMarkers.length > 0)
                )
              : (
                  currentClip.storyboardDerived ||
                  (Array.isArray(updates.storyboardBeatMarkers)
                    ? normalizeTimelineBeatMarkers(updates.storyboardBeatMarkers).length > 0
                    : currentClip.storyboardBeatMarkers.length > 0)
                ),
          storyboardDerivedAt: null,
          updatedAt: new Date().toISOString(),
        };
        nextClip.storyboardDerivedAt = nextClip.storyboardDerived
          ? (
              typeof updates.storyboardDerivedAt === 'string'
                ? updates.storyboardDerivedAt
                : (currentClip.storyboardDerivedAt ?? nextClip.updatedAt)
            )
          : null;
        const nextClips = state.timelineClips.map((clip) =>
          clip.id === clipId ? nextClip : clip,
        );
        const track = state.timelineTracks.find((item) => item.id === currentClip.trackId);

        let nextProjects = state.projects;
        if (currentClip.sceneId !== nextClip.sceneId) {
          if (currentClip.sceneId) {
            const currentScene = state.projects
              .flatMap((project) => project.scenes)
              .find((scene) => scene.id === currentClip.sceneId);
            if (currentScene) {
              nextProjects = updateSceneClipIds(
                nextProjects,
                currentClip.sceneId,
                currentScene.timelineClipIds.filter((item) => item !== clipId),
              );
            }
          }

          if (nextClip.sceneId) {
            const nextScene = state.projects
              .flatMap((project) => project.scenes)
              .find((scene) => scene.id === nextClip.sceneId);
            if (nextScene && !nextScene.timelineClipIds.includes(clipId)) {
              nextProjects = updateSceneClipIds(
                nextProjects,
                nextClip.sceneId,
                [...nextScene.timelineClipIds, clipId],
              );
            }
          }
        }

        const nextTracks = syncTrackClipIds(state.timelineTracks, nextClips);

        return {
          projects: nextProjects,
          timelineTracks: nextTracks,
          timelineClips: nextClips,
          timelineSequences:
            track === undefined
              ? state.timelineSequences
              : state.timelineSequences.map((sequence) =>
                  sequence.id === track.sequenceId
                    ? {
                        ...sequence,
                        durationMs: computeSequenceDuration(
                          sequence.id,
                          nextTracks,
                          nextClips,
                        ),
                        updatedAt: new Date().toISOString(),
                      }
                    : sequence,
                ),
        };
      }),

    moveTimelineClip: (clipId: string, updates: TimelineClipMoveOptions) =>
      set((state) => {
        const currentClip = state.timelineClips.find((item) => item.id === clipId);
        if (!currentClip) {
          return {};
        }

        const sourceTrack = state.timelineTracks.find((item) => item.id === currentClip.trackId);
        const targetTrack = state.timelineTracks.find(
          (item) => item.id === (updates.trackId ?? currentClip.trackId),
        );
        if (!sourceTrack || !targetTrack || targetTrack.locked) {
          return {};
        }

        const sourceSequence = state.timelineSequences.find((item) => item.id === sourceTrack.sequenceId);
        const targetSequence = state.timelineSequences.find((item) => item.id === targetTrack.sequenceId);
        if (!sourceSequence || !targetSequence || sourceSequence.id !== targetSequence.id) {
          return {};
        }

        const now = new Date().toISOString();
        const desiredStartMs = snapTimelineValue(
          updates.startMs ?? currentClip.startMs,
          targetSequence.fps,
          collectSnapAnchors(targetTrack.id, state.timelineClips, clipId, targetSequence),
          updates.snapToFrames,
        );

        let nextClips = state.timelineClips.map((clip) =>
          clip.id === clipId
            ? {
                ...clip,
                trackId: targetTrack.id,
                startMs: desiredStartMs,
                updatedAt: now,
              }
            : clip,
        );

        nextClips = reflowTrackClips(targetTrack.id, nextClips, clipId, desiredStartMs);
        const nextTracks = syncTrackClipIds(
          state.timelineTracks.map((track) => {
            if (track.id === sourceTrack.id && sourceTrack.id !== targetTrack.id) {
              return {
                ...track,
                clipIds: track.clipIds.filter((id) => id !== clipId),
              };
            }

            if (track.id === targetTrack.id && !track.clipIds.includes(clipId)) {
              return {
                ...track,
                clipIds: [...track.clipIds, clipId],
              };
            }

            return track;
          }),
          nextClips,
        );

        return {
          timelineTracks: nextTracks,
          timelineClips: nextClips,
          timelineSequences: state.timelineSequences.map((sequence) =>
            sequence.id === targetSequence.id || sequence.id === sourceSequence.id
              ? {
                  ...sequence,
                  durationMs: computeSequenceDuration(sequence.id, nextTracks, nextClips),
                  updatedAt: now,
                }
              : sequence,
          ),
        };
      }),

    trimTimelineClip: (clipId: string, updates: TimelineClipTrimOptions) =>
      set((state) => {
        const currentClip = state.timelineClips.find((item) => item.id === clipId);
        if (!currentClip) {
          return {};
        }

        const track = state.timelineTracks.find((item) => item.id === currentClip.trackId);
        const sequence = track
          ? state.timelineSequences.find((item) => item.id === track.sequenceId) ?? null
          : null;
        if (!track || !sequence || track.locked) {
          return {};
        }

        const mediaAsset = state.mediaAssets.find((item) => item.id === currentClip.mediaAssetId);
        const mediaDuration = resolveMediaAssetDuration(mediaAsset, currentClip);
        const anchors = collectSnapAnchors(track.id, state.timelineClips, clipId, sequence);
        const now = new Date().toISOString();

        let nextStartMs = currentClip.startMs;
        let sourceInMs = currentClip.sourceInMs;
        let sourceOutMs = currentClip.sourceOutMs;

        if (typeof updates.startMs === 'number') {
          const requestedStartMs = snapTimelineValue(
            updates.startMs,
            sequence.fps,
            anchors,
            updates.snapToFrames,
          );
          const requestedSourceInMs = currentClip.sourceInMs + (requestedStartMs - currentClip.startMs);
          sourceInMs = clamp(
            requestedSourceInMs,
            0,
            Math.max(0, sourceOutMs - MIN_TIMELINE_CLIP_DURATION_MS),
          );
          nextStartMs = currentClip.startMs + (sourceInMs - currentClip.sourceInMs);
        }

        if (typeof updates.endMs === 'number') {
          const requestedEndMs = snapTimelineValue(
            updates.endMs,
            sequence.fps,
            anchors,
            updates.snapToFrames,
          );
          sourceOutMs = sourceInMs + Math.max(
            MIN_TIMELINE_CLIP_DURATION_MS,
            requestedEndMs - nextStartMs,
          );
        }

        if (mediaDuration !== null) {
          sourceOutMs = Math.min(sourceOutMs, mediaDuration);
        }

        if (sourceOutMs - sourceInMs < MIN_TIMELINE_CLIP_DURATION_MS) {
          sourceOutMs = sourceInMs + MIN_TIMELINE_CLIP_DURATION_MS;
        }

        const trimmedClip: TimelineClip = {
          ...currentClip,
          startMs: nextStartMs,
          durationMs: sourceOutMs - sourceInMs,
          sourceInMs,
          sourceOutMs,
          updatedAt: now,
        };

        let nextClips = state.timelineClips.map((clip) => (clip.id === clipId ? trimmedClip : clip));
        nextClips = reflowTrackClips(track.id, nextClips, clipId, trimmedClip.startMs);
        const nextTracks = syncTrackClipIds(state.timelineTracks, nextClips);

        return {
          timelineTracks: nextTracks,
          timelineClips: nextClips,
          timelineSequences: state.timelineSequences.map((item) =>
            item.id === sequence.id
              ? {
                  ...item,
                  durationMs: computeSequenceDuration(item.id, nextTracks, nextClips),
                  updatedAt: now,
                }
              : item,
          ),
        };
      }),

    splitTimelineClip: (clipId: string, splitMs: number): TimelineSplitResult | null => {
      const state = get();
      const currentClip = state.timelineClips.find((item) => item.id === clipId);
      if (!currentClip) {
        return null;
      }

      const track = state.timelineTracks.find((item) => item.id === currentClip.trackId);
      const sequence = track
        ? state.timelineSequences.find((item) => item.id === track.sequenceId) ?? null
        : null;
      if (!track || !sequence || track.locked) {
        return null;
      }

      const splitAtMs = snapTimelineValue(
        splitMs,
        sequence.fps,
        collectSnapAnchors(track.id, state.timelineClips, clipId, sequence),
        true,
      );
      const relativeSplitMs = splitAtMs - currentClip.startMs;
      if (
        relativeSplitMs <= MIN_TIMELINE_CLIP_DURATION_MS ||
        currentClip.durationMs - relativeSplitMs <= MIN_TIMELINE_CLIP_DURATION_MS
      ) {
        return null;
      }

      const now = new Date().toISOString();
      const trailingClipId = crypto.randomUUID();

      set((currentState) => {
        const updatedLeadingClip: TimelineClip = {
          ...currentClip,
          durationMs: relativeSplitMs,
          sourceOutMs: currentClip.sourceInMs + relativeSplitMs,
          transitionOut: null,
          updatedAt: now,
        };
        const trailingClip: TimelineClip = {
          ...currentClip,
          id: trailingClipId,
          startMs: splitAtMs,
          durationMs: currentClip.durationMs - relativeSplitMs,
          sourceInMs: currentClip.sourceInMs + relativeSplitMs,
          sourceOutMs: currentClip.sourceOutMs,
          transitionIn: null,
          generationBindingId: null,
          createdAt: now,
          updatedAt: now,
        };

        const nextClips = sortClipsByStart(
          currentState.timelineClips
            .map((clip) => (clip.id === clipId ? updatedLeadingClip : clip))
            .concat(trailingClip),
        );
        const nextTracks = syncTrackClipIds(
          currentState.timelineTracks.map((item) =>
            item.id === currentClip.trackId && !item.clipIds.includes(trailingClipId)
              ? { ...item, clipIds: [...item.clipIds, trailingClipId] }
              : item,
          ),
          nextClips,
        );
        const nextProjects =
          currentClip.sceneId === null
            ? currentState.projects
            : appendSceneClipId(currentState.projects, currentClip.sceneId, trailingClipId);

        return {
          projects: nextProjects,
          timelineTracks: nextTracks,
          timelineClips: nextClips,
          activeTimelineClipId: trailingClipId,
          timelineSequences: currentState.timelineSequences.map((item) =>
            item.id === sequence.id
              ? {
                  ...item,
                  durationMs: computeSequenceDuration(item.id, nextTracks, nextClips),
                  updatedAt: now,
                }
              : item,
          ),
        };
      });

      return {
        leftClipId: clipId,
        rightClipId: trailingClipId,
      };
    },

    duplicateTimelineClip: (clipId: string) => {
      const state = get();
      const currentClip = state.timelineClips.find((item) => item.id === clipId);
      if (!currentClip) {
        return null;
      }

      const track = state.timelineTracks.find((item) => item.id === currentClip.trackId);
      const sequence = track
        ? state.timelineSequences.find((item) => item.id === track.sequenceId) ?? null
        : null;
      if (!track || !sequence || track.locked) {
        return null;
      }

      const now = new Date().toISOString();
      const duplicate: TimelineClip = {
        ...currentClip,
        id: crypto.randomUUID(),
        startMs: currentClip.startMs + currentClip.durationMs,
        label: `${currentClip.label} Copy`,
        transitionIn: null,
        transitionOut: null,
        generationBindingId: null,
        createdAt: now,
        updatedAt: now,
      };

      set((currentState) => {
        let nextClips = [...currentState.timelineClips, duplicate];
        nextClips = reflowTrackClips(track.id, nextClips, duplicate.id, duplicate.startMs);
        const nextTracks = syncTrackClipIds(
          currentState.timelineTracks.map((item) =>
            item.id === track.id ? { ...item, clipIds: [...item.clipIds, duplicate.id] } : item,
          ),
          nextClips,
        );
        const nextProjects =
          duplicate.sceneId === null
            ? currentState.projects
            : appendSceneClipId(currentState.projects, duplicate.sceneId, duplicate.id);

        return {
          projects: nextProjects,
          timelineTracks: nextTracks,
          timelineClips: nextClips,
          activeTimelineClipId: duplicate.id,
          timelineSequences: currentState.timelineSequences.map((item) =>
            item.id === sequence.id
              ? {
                  ...item,
                  durationMs: computeSequenceDuration(item.id, nextTracks, nextClips),
                  updatedAt: now,
                }
              : item,
          ),
        };
      });

      return duplicate;
    },

    setTimelineClipTransition: (
      clipId: string,
      edge: TimelineTransitionEdge,
      transition: TimelineTransition | null,
    ) =>
      set((state) => ({
        timelineClips: state.timelineClips.map((clip) =>
          clip.id === clipId
            ? {
                ...clip,
                transitionIn: edge === 'in' ? transition : clip.transitionIn,
                transitionOut: edge === 'out' ? transition : clip.transitionOut,
                updatedAt: new Date().toISOString(),
              }
            : clip,
        ),
      })),

    deleteTimelineClip: (clipId: string) =>
      set((state) => {
        const clip = state.timelineClips.find((item) => item.id === clipId);
        if (!clip) {
          return {};
        }

        const nextTracks = syncTrackClipIds(state.timelineTracks.map((track) =>
          track.id === clip.trackId
            ? { ...track, clipIds: track.clipIds.filter((id) => id !== clipId) }
            : track,
        ), state.timelineClips.filter((item) => item.id !== clipId));
        const nextClips = state.timelineClips.filter((item) => item.id !== clipId);
        const nextBindings = pruneBindingVariantIds(
          state.clipGenerationBindings,
          new Set([clipId]),
          clip.generationBindingId ? new Set([clip.generationBindingId]) : undefined,
        );
        const nextProjects =
          clip.sceneId === null
            ? state.projects
            : removeSceneClipId(state.projects, clip.sceneId, clipId);
        const track = state.timelineTracks.find((item) => item.id === clip.trackId);

        return {
          projects: nextProjects,
          timelineTracks: nextTracks,
          timelineClips: nextClips,
          clipGenerationBindings: nextBindings,
          activeTimelineClipId:
            state.activeTimelineClipId === clipId ? null : state.activeTimelineClipId,
          timelineSequences:
            track === undefined
              ? state.timelineSequences
              : state.timelineSequences.map((sequence) =>
                  sequence.id === track.sequenceId
                    ? {
                        ...sequence,
                        durationMs: computeSequenceDuration(
                          sequence.id,
                          nextTracks,
                          nextClips,
                        ),
                        updatedAt: new Date().toISOString(),
                      }
                    : sequence,
                ),
        };
      }),

    setTimelineSequencePlayRange: (sequenceId: string, range: TimelinePlayRange | null) =>
      set((state) => ({
        timelineSequences: state.timelineSequences.map((sequence) => {
          if (sequence.id !== sequenceId) {
            return sequence;
          }

          if (!range) {
            return {
              ...sequence,
              playRange: null,
              updatedAt: new Date().toISOString(),
            };
          }

          const startMs = Math.max(0, Math.round(range.startMs));
          const endMs = Math.max(
            startMs + MIN_TIMELINE_CLIP_DURATION_MS,
            Math.round(range.endMs),
          );

          return {
            ...sequence,
            durationMs: Math.max(sequence.durationMs, endMs),
            playRange: {
              startMs,
              endMs,
            },
            updatedAt: new Date().toISOString(),
          };
        }),
      })),

    deriveStoryboardTimeline: (projectId: string, options?: { sceneIds?: string[] }) => {
      const ensuredSequence = get().ensureTimelineSequenceForProject(projectId);
      if (!ensuredSequence) {
        return null;
      }

      const initialState = get();
      const plan = planStoryboardTimelineDerivation({
        state: initialState,
        projectId,
        sequenceId: ensuredSequence.id,
        sceneIds: options?.sceneIds,
      });
      if (!plan || plan.scenePlans.length === 0) {
        return null;
      }

      for (const mediaAsset of plan.mediaAssetsToUpsert) {
        get().upsertMediaAsset(mediaAsset);
      }

      const ensuredSceneClipIds = new Map<string, Set<string>>();
      const rememberSceneClipId = (sceneId: string, clipId: string) => {
        if (!ensuredSceneClipIds.has(sceneId)) {
          ensuredSceneClipIds.set(sceneId, new Set());
        }
        ensuredSceneClipIds.get(sceneId)?.add(clipId);
      };

      const getCompatibleTrack = (sequenceId: string, mediaAsset: MediaAsset) => {
        const liveState = get();
        const sequenceTracks = liveState.timelineTracks
          .filter((track) => track.sequenceId === sequenceId)
          .sort((left, right) => left.orderIndex - right.orderIndex);
        const targetKind = getTrackKindForMediaAsset(mediaAsset);
        const existing =
          sequenceTracks.find((track) => !track.locked && track.kind === targetKind) ??
          (targetKind === 'image'
            ? sequenceTracks.find((track) => !track.locked && track.kind === 'overlay')
            : null);

        if (existing) {
          return existing;
        }

        return get().createTimelineTrack(sequenceId, {
          kind: targetKind,
          name: targetKind === 'video' ? `Video ${sequenceTracks.length + 1}` : `Image ${sequenceTracks.length + 1}`,
        });
      };

      const result = {
        projectId,
        sequenceId: ensuredSequence.id,
        sceneIds: plan.scenePlans.map((scenePlan) => scenePlan.sceneId),
        clipIds: [] as string[],
        added: 0,
        updated: 0,
        skipped: 0,
        placeholders: 0,
      };

      for (const scenePlan of plan.scenePlans) {
        if (scenePlan.placeholder) {
          result.placeholders += 1;
        }

        if (scenePlan.action === 'skip') {
          result.skipped += 1;
          if (scenePlan.existingClipId) {
            result.clipIds.push(scenePlan.existingClipId);
            rememberSceneClipId(scenePlan.sceneId, scenePlan.existingClipId);
          }
          continue;
        }

        if (scenePlan.action === 'update' && scenePlan.existingClipId && scenePlan.updates) {
          get().updateTimelineClip(scenePlan.existingClipId, scenePlan.updates);
          result.updated += 1;
          result.clipIds.push(scenePlan.existingClipId);
          rememberSceneClipId(scenePlan.sceneId, scenePlan.existingClipId);
          continue;
        }

        const liveState = get();
        const sequence =
          liveState.timelineSequences.find((item) => item.id === ensuredSequence.id) ?? ensuredSequence;
        const mediaAsset =
          liveState.mediaAssets.find((asset) => asset.id === scenePlan.mediaAsset.id) ?? scenePlan.mediaAsset;
        const targetTrack = getCompatibleTrack(ensuredSequence.id, mediaAsset);
        if (!targetTrack) {
          result.skipped += 1;
          continue;
        }

        const createdClip = get().createTimelineClip({
          trackId: targetTrack.id,
          mediaAssetId: mediaAsset.id,
          sceneId: scenePlan.sceneId,
          startMs: sequence.durationMs,
          durationMs: scenePlan.durationMs,
          label: scenePlan.label,
          posterUrl: scenePlan.posterUrl,
          referenceSetIds: scenePlan.referenceSetIds,
          storyboardDerived: true,
          storyboardBeatMarkers: scenePlan.storyboardBeatMarkers,
          storyboardDerivedAt: new Date().toISOString(),
        });

        if (!createdClip) {
          result.skipped += 1;
          continue;
        }

        result.added += 1;
        result.clipIds.push(createdClip.id);
        rememberSceneClipId(scenePlan.sceneId, createdClip.id);
      }

      if (ensuredSceneClipIds.size > 0) {
        set((state) => {
          let nextProjects = state.projects;

          for (const [sceneId, clipIds] of ensuredSceneClipIds.entries()) {
            const scene = nextProjects.flatMap((project) => project.scenes).find((item) => item.id === sceneId);
            if (!scene) {
              continue;
            }

            const nextClipIds = Array.from(new Set([...(scene.timelineClipIds ?? []), ...clipIds]));
            if (!isEqualStringSet(nextClipIds, scene.timelineClipIds ?? [])) {
              nextProjects = updateSceneClipIds(nextProjects, sceneId, nextClipIds);
            }
          }

          return {
            projects: nextProjects,
          };
        });
      }

      return result;
    },

    upsertClipGenerationBinding: (binding: ClipGenerationBinding) =>
      set((state) => {
        const normalizedBinding = {
          ...binding,
          variantIds: Array.from(new Set(binding.variantIds.filter((variantId) => variantId !== binding.clipId))),
        };
        const existingIndex = state.clipGenerationBindings.findIndex(
          (item) => item.id === normalizedBinding.id,
        );
        const nextBindings =
          existingIndex === -1
            ? [...state.clipGenerationBindings, normalizedBinding]
            : state.clipGenerationBindings.map((item) =>
                item.id === normalizedBinding.id ? normalizedBinding : item,
              );

        return {
          clipGenerationBindings: nextBindings,
          timelineClips: state.timelineClips.map((clip) =>
            clip.id === normalizedBinding.clipId
              ? { ...clip, generationBindingId: normalizedBinding.id, updatedAt: new Date().toISOString() }
              : clip,
          ),
        };
      }),
  };
}
