import { beforeEach, describe, expect, it } from 'vitest';

import { useAppStore } from '@/store/appStore';

function resetStore() {
  useAppStore.setState(useAppStore.getInitialState());
}

describe('MediaTimelineStore', () => {
  beforeEach(resetStore);

  it('defaults the media timeline domain to empty state', () => {
    const state = useAppStore.getState();

    expect(state.mediaAssets).toEqual([]);
    expect(state.referenceSets).toEqual([]);
    expect(state.timelineSequences).toEqual([]);
    expect(state.timelineTracks).toEqual([]);
    expect(state.timelineClips).toEqual([]);
    expect(state.clipGenerationBindings).toEqual([]);
    expect(state.activeTimelineSequenceId).toBeNull();
    expect(state.activeTimelineClipId).toBeNull();
  });

  it('creates and attaches a timeline sequence for a project with a default track', () => {
    const project = useAppStore.getState().createProject('Launch Board');

    const sequence = useAppStore
      .getState()
      .ensureTimelineSequenceForProject(project.id, { name: 'Launch Timeline' });

    const state = useAppStore.getState();
    const storedProject = state.projects.find((item) => item.id === project.id);
    const storedSequence = state.timelineSequences.find((item) => item.id === sequence?.id);
    const storedTrack = state.timelineTracks.find((item) => item.sequenceId === sequence?.id);

    expect(sequence).not.toBeNull();
    expect(storedProject?.timelineSequenceId).toBe(sequence?.id ?? null);
    expect(storedSequence?.name).toBe('Launch Timeline');
    expect(storedTrack?.name).toBe('Primary Video');
    expect(storedTrack?.orderIndex).toBe(0);
    expect(state.activeTimelineSequenceId).toBe(sequence?.id ?? null);
  });

  it('creates clips additively and syncs them back to scene adapters', () => {
    const state = useAppStore.getState();
    const project = state.createProject('Sequence Board');
    const scene = state.addScene(project.id, { name: 'Scene 1' });
    const sequence = state.ensureTimelineSequenceForProject(project.id);

    state.upsertMediaAsset({
      id: 'media-1',
      legacyAssetId: null,
      jobId: null,
      name: 'Shot 1',
      type: 'video',
      source: 'generated',
      path: '/outputs/shot-1.mp4',
      previewUrl: '/outputs/shot-1.mp4',
      thumbnailUrl: '/outputs/shot-1.jpg',
      posterUrl: '/outputs/shot-1.jpg',
      width: 1280,
      height: 720,
      durationMs: 4000,
      fps: 24,
      metadata: {},
      createdAt: '2026-04-22T00:00:00.000Z',
    });

    const trackId = useAppStore.getState().timelineTracks.find((item) => item.sequenceId === sequence?.id)?.id;
    expect(trackId).toBeDefined();

    const clip = useAppStore.getState().createTimelineClip({
      trackId: trackId!,
      mediaAssetId: 'media-1',
      sceneId: scene.id,
      startMs: 500,
      durationMs: 4000,
      label: 'Intro shot',
    });

    const nextState = useAppStore.getState();
    const storedTrack = nextState.timelineTracks.find((item) => item.id === trackId);
    const storedScene = nextState.projects
      .find((item) => item.id === project.id)
      ?.scenes.find((item) => item.id === scene.id);
    const storedSequence = nextState.timelineSequences.find((item) => item.id === sequence?.id);

    expect(clip).not.toBeNull();
    expect(storedTrack?.clipIds).toContain(clip?.id ?? '');
    expect(storedScene?.timelineClipIds).toContain(clip?.id ?? '');
    expect(storedSequence?.durationMs).toBe(4500);
    expect(nextState.activeTimelineClipId).toBe(clip?.id ?? null);
  });

  it('upserts clip generation bindings and attaches them to clips', () => {
    const state = useAppStore.getState();
    const project = state.createProject('Bindings Board');
    const sequence = state.ensureTimelineSequenceForProject(project.id);

    state.upsertMediaAsset({
      id: 'media-2',
      legacyAssetId: null,
      jobId: null,
      name: 'Frame 2',
      type: 'image',
      source: 'generated',
      path: '/outputs/frame-2.png',
      previewUrl: '/outputs/frame-2.png',
      thumbnailUrl: '/outputs/frame-2.png',
      posterUrl: '/outputs/frame-2.png',
      width: 1024,
      height: 1024,
      metadata: {},
      createdAt: '2026-04-22T00:00:00.000Z',
    });

    const trackId = useAppStore.getState().timelineTracks.find((item) => item.sequenceId === sequence?.id)?.id;
    const clip = useAppStore.getState().createTimelineClip({
      trackId: trackId!,
      mediaAssetId: 'media-2',
      startMs: 0,
      durationMs: 1000,
      label: 'Frame clip',
    });

    useAppStore.getState().upsertClipGenerationBinding({
      id: 'binding-1',
      clipId: clip!.id,
      prompt: 'launch product hero',
      negativePrompt: 'blurry',
      model: 'ltx-video',
      generationType: 'video',
      settings: { duration: 4, fps: 24 },
      referenceSetIds: [],
      variantIds: [],
      lastRunSummary: {
        status: 'complete',
        outputMediaAssetId: 'media-2',
        completedAt: '2026-04-22T00:01:00.000Z',
        errorMessage: null,
      },
    });

    const nextState = useAppStore.getState();

    expect(nextState.clipGenerationBindings).toHaveLength(1);
    expect(nextState.timelineClips.find((item) => item.id === clip!.id)?.generationBindingId).toBe(
      'binding-1',
    );
  });

  it('removes deleted reference sets from clips and bindings', () => {
    const state = useAppStore.getState();
    const project = state.createProject('Reference Board');
    const sequence = state.ensureTimelineSequenceForProject(project.id);
    const referenceSet = state.createReferenceSet({
      name: 'Hero refs',
      scope: 'project',
      projectId: project.id,
      items: [],
    });

    state.upsertMediaAsset({
      id: 'media-3',
      legacyAssetId: null,
      jobId: null,
      name: 'Shot 3',
      type: 'video',
      source: 'imported',
      path: '/imports/shot-3.mp4',
      previewUrl: '/imports/shot-3.mp4',
      thumbnailUrl: '/imports/shot-3.jpg',
      posterUrl: '/imports/shot-3.jpg',
      metadata: {},
      createdAt: '2026-04-22T00:00:00.000Z',
    });

    const trackId = useAppStore.getState().timelineTracks.find((item) => item.sequenceId === sequence?.id)?.id;
    const clip = useAppStore.getState().createTimelineClip({
      trackId: trackId!,
      mediaAssetId: 'media-3',
      startMs: 0,
      durationMs: 2000,
      referenceSetIds: [referenceSet.id],
    });

    useAppStore.getState().upsertClipGenerationBinding({
      id: 'binding-2',
      clipId: clip!.id,
      prompt: 'prompt',
      negativePrompt: '',
      model: 'flux-dev',
      generationType: 'image',
      settings: {},
      referenceSetIds: [referenceSet.id],
      variantIds: [],
      lastRunSummary: null,
    });

    useAppStore.getState().deleteReferenceSet(referenceSet.id);
    const nextState = useAppStore.getState();

    expect(nextState.referenceSets).toHaveLength(0);
    expect(nextState.timelineClips[0].referenceSetIds).toEqual([]);
    expect(nextState.clipGenerationBindings[0].referenceSetIds).toEqual([]);
  });
});
