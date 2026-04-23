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
import type {
  ClipGenerationBinding,
  TimelineClip,
  TimelineSequence,
  TimelineTrack,
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
  label?: string;
  posterUrl?: string | null;
  referenceSetIds?: string[];
  generationBindingId?: string | null;
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
        const nextBindings = state.clipGenerationBindings.filter(
          (binding) => !removedBindingIds.has(binding.id),
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
      if (!track) {
        return null;
      }

      const now = new Date().toISOString();
      const clip: TimelineClip = {
        id: crypto.randomUUID(),
        trackId: params.trackId,
        mediaAssetId: params.mediaAssetId,
        sceneId: params.sceneId ?? null,
        startMs: params.startMs,
        durationMs: params.durationMs,
        sourceInMs: params.sourceInMs ?? 0,
        sourceOutMs:
          params.sourceOutMs ?? (params.sourceInMs ?? 0) + params.durationMs,
        transitionIn: params.transitionIn ?? null,
        transitionOut: params.transitionOut ?? null,
        label: params.label ?? 'Timeline Clip',
        posterUrl: params.posterUrl ?? null,
        referenceSetIds: params.referenceSetIds ?? [],
        generationBindingId: params.generationBindingId ?? null,
        createdAt: now,
        updatedAt: now,
      };

      set((currentState) => {
        const nextTracks = currentState.timelineTracks.map((item) =>
          item.id === params.trackId
            ? { ...item, clipIds: [...item.clipIds, clip.id] }
            : item,
        );
        const nextClips = [...currentState.timelineClips, clip];
        const nextProjects =
          clip.sceneId === null
            ? currentState.projects
            : currentState.projects.map((project) => ({
                ...project,
                scenes: project.scenes.map((scene) =>
                  scene.id === clip.sceneId
                    ? { ...scene, timelineClipIds: [...scene.timelineClipIds, clip.id] }
                    : scene,
                ),
              }));

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
                  updatedAt: new Date().toISOString(),
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
          updatedAt: new Date().toISOString(),
        };
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

        return {
          projects: nextProjects,
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
                          state.timelineTracks,
                          nextClips,
                        ),
                        updatedAt: new Date().toISOString(),
                      }
                    : sequence,
                ),
        };
      }),

    deleteTimelineClip: (clipId: string) =>
      set((state) => {
        const clip = state.timelineClips.find((item) => item.id === clipId);
        if (!clip) {
          return {};
        }

        const nextTracks = state.timelineTracks.map((track) =>
          track.id === clip.trackId
            ? { ...track, clipIds: track.clipIds.filter((id) => id !== clipId) }
            : track,
        );
        const nextClips = state.timelineClips.filter((item) => item.id !== clipId);
        const nextBindings = clip.generationBindingId
          ? state.clipGenerationBindings.filter((binding) => binding.id !== clip.generationBindingId)
          : state.clipGenerationBindings;
        const nextProjects =
          clip.sceneId === null
            ? state.projects
            : state.projects.map((project) => ({
                ...project,
                scenes: project.scenes.map((scene) =>
                  scene.id === clip.sceneId
                    ? {
                        ...scene,
                        timelineClipIds: scene.timelineClipIds.filter((id) => id !== clipId),
                      }
                    : scene,
                ),
              }));
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

    upsertClipGenerationBinding: (binding: ClipGenerationBinding) =>
      set((state) => {
        const existingIndex = state.clipGenerationBindings.findIndex(
          (item) => item.id === binding.id,
        );
        const nextBindings =
          existingIndex === -1
            ? [...state.clipGenerationBindings, binding]
            : state.clipGenerationBindings.map((item) =>
                item.id === binding.id ? binding : item,
              );

        return {
          clipGenerationBindings: nextBindings,
          timelineClips: state.timelineClips.map((clip) =>
            clip.id === binding.clipId
              ? { ...clip, generationBindingId: binding.id, updatedAt: new Date().toISOString() }
              : clip,
          ),
        };
      }),
  };
}
