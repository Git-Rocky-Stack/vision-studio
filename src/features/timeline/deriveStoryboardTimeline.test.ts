import { describe, expect, it } from 'vitest';

import type { AssetRecord } from '@/types/assets';
import type { MediaAsset } from '@/types/media';
import type { Project, Scene } from '@/types/project';
import type { TimelineClip, TimelineSequence, TimelineTrack } from '@/types/timeline';

import { planStoryboardTimelineDerivation } from './deriveStoryboardTimeline';

function createProject(overrides: Partial<Project> = {}): Project {
  return {
    id: 'project-1',
    name: 'Storyboard Project',
    created: '2026-04-23T00:00:00.000Z',
    modified: '2026-04-23T00:00:00.000Z',
    dimensions: { width: 1280, height: 720 },
    fps: 24,
    timelineSequenceId: 'sequence-1',
    referenceSetIds: [],
    characters: [],
    elements: [
      {
        id: 'element-1',
        projectId: 'project-1',
        type: 'character',
        name: 'Captain Nova',
        aliases: [],
        description: '',
        tags: [],
        continuityNotes: '',
        referenceSetIds: ['element-ref'],
        heroMediaAssetId: null,
        status: 'approved',
        color: '#fff',
        metadata: {},
      },
    ],
    scenes: [],
    metadata: {},
    ...overrides,
  };
}

function createScene(overrides: Partial<Scene> = {}): Scene {
  return {
    id: 'scene-1',
    orderIndex: 0,
    name: 'Opening Shot',
    prompt: 'Captain Nova in the control room',
    negativePrompt: '',
    generationConfig: {
      model: 'flux-dev',
      steps: 25,
      cfgScale: 7.5,
      scheduler: 'euler_a',
      seed: -1,
      width: 1280,
      height: 720,
      clipSkip: 1,
      lora: [],
      controlNet: [],
    },
    referenceImages: [],
    referenceSetIds: ['scene-ref'],
    canvasControlLayers: [],
    activeCanvasControlLayerId: null,
    timelineClipIds: [],
    frames: [],
    regionLocks: [],
    transitions: { type: 'cut', duration: 0 },
    camera: [],
    metadata: {
      created: '2026-04-23T00:00:00.000Z',
      modified: '2026-04-23T00:00:00.000Z',
      duration: 0,
      fps: 24,
      notes: '',
    },
    status: 'draft',
    characterRefs: [],
    elementIds: ['element-1'],
    shotBeats: [
      {
        id: 'beat-1',
        summary: 'Nova studies the console.',
        promptSeed: 'close-up on glowing console',
        notes: '',
        orderIndex: 0,
        durationMs: 1200,
        elementIds: ['element-1'],
        metadata: {},
      },
      {
        id: 'beat-2',
        summary: 'Warning lights pulse.',
        promptSeed: 'warning lights wide shot',
        notes: '',
        orderIndex: 1,
        durationMs: null,
        elementIds: [],
        metadata: {},
      },
    ],
    thumbnail: '/outputs/scenes/opening.png',
    ...overrides,
  };
}

function createSequence(overrides: Partial<TimelineSequence> = {}): TimelineSequence {
  return {
    id: 'sequence-1',
    projectId: 'project-1',
    name: 'Timeline',
    trackIds: ['track-1'],
    durationMs: 0,
    fps: 24,
    playRange: null,
    createdAt: '2026-04-23T00:00:00.000Z',
    updatedAt: '2026-04-23T00:00:00.000Z',
    ...overrides,
  };
}

function createTrack(overrides: Partial<TimelineTrack> = {}): TimelineTrack {
  return {
    id: 'track-1',
    sequenceId: 'sequence-1',
    kind: 'video',
    name: 'Primary Video',
    clipIds: [],
    orderIndex: 0,
    locked: false,
    muted: false,
    solo: false,
    hidden: false,
    ...overrides,
  };
}

function createClip(overrides: Partial<TimelineClip> = {}): TimelineClip {
  return {
    id: 'clip-1',
    trackId: 'track-1',
    mediaAssetId: 'media-1',
    sceneId: 'scene-1',
    startMs: 0,
    durationMs: 2000,
    sourceInMs: 0,
    sourceOutMs: 2000,
    transitionIn: null,
    transitionOut: null,
    gain: 1,
    fadeInMs: 0,
    fadeOutMs: 0,
    retakeRanges: [],
    label: 'Opening Shot',
    posterUrl: '/outputs/scenes/opening.png',
    referenceSetIds: ['scene-ref', 'element-ref'],
    generationBindingId: null,
    storyboardDerived: true,
    storyboardBeatMarkers: [
      {
        id: 'scene-1::beat-1',
        sourceBeatId: 'beat-1',
        label: 'Nova studies the console.',
        promptSeed: 'close-up on glowing console',
        notes: '',
        relativeStartMs: 0,
        durationMs: 1200,
        elementIds: ['element-1'],
      },
      {
        id: 'scene-1::beat-2',
        sourceBeatId: 'beat-2',
        label: 'Warning lights pulse.',
        promptSeed: 'warning lights wide shot',
        notes: '',
        relativeStartMs: 1200,
        durationMs: null,
        elementIds: [],
      },
    ],
    storyboardDerivedAt: '2026-04-23T00:00:00.000Z',
    createdAt: '2026-04-23T00:00:00.000Z',
    updatedAt: '2026-04-23T00:00:00.000Z',
    ...overrides,
  };
}

function createAssetRecord(overrides: Partial<AssetRecord> = {}): AssetRecord {
  return {
    id: 'asset-1',
    jobId: 'job-1',
    name: 'Opening Frame',
    type: 'image',
    path: 'C:/vision-studio-output/scenes/opening.png',
    previewUrl: 'http://localhost:8000/outputs/scenes/opening.png',
    thumbnail: 'http://localhost:8000/outputs/scenes/opening.png',
    createdAt: '2026-04-23T00:00:00.000Z',
    prompt: 'Captain Nova in the control room',
    negativePrompt: '',
    favorite: false,
    params: {
      source: 'generated',
    },
    ...overrides,
  };
}

function createMediaAsset(overrides: Partial<MediaAsset> = {}): MediaAsset {
  return {
    id: 'media-1',
    legacyAssetId: 'asset-1',
    jobId: 'job-1',
    name: 'Opening Frame',
    type: 'image',
    source: 'generated',
    path: 'C:/vision-studio-output/scenes/opening.png',
    previewUrl: 'http://localhost:8000/outputs/scenes/opening.png',
    thumbnailUrl: 'http://localhost:8000/outputs/scenes/opening.png',
    posterUrl: null,
    metadata: {},
    createdAt: '2026-04-23T00:00:00.000Z',
    ...overrides,
  };
}

describe('planStoryboardTimelineDerivation', () => {
  it('builds a create plan from scene output hints, beat markers, and linked references', () => {
    const scene = createScene();
    const plan = planStoryboardTimelineDerivation({
      state: {
        projects: [createProject({ scenes: [scene] })],
        mediaAssets: [],
        assetLibrary: [createAssetRecord()],
        batchResults: [],
        referenceSets: [],
        timelineSequences: [createSequence()],
        timelineTracks: [createTrack()],
        timelineClips: [],
      },
      projectId: 'project-1',
      sequenceId: 'sequence-1',
    });

    expect(plan).not.toBeNull();
    expect(plan?.mediaAssetsToUpsert).toHaveLength(1);
    expect(plan?.scenePlans).toHaveLength(1);
    expect(plan?.scenePlans[0]).toMatchObject({
      action: 'create',
      desiredTrackKind: 'image',
      placeholder: false,
      label: 'Opening Shot',
      referenceSetIds: ['scene-ref', 'element-ref'],
    });
    expect(plan?.scenePlans[0].storyboardBeatMarkers).toEqual([
      expect.objectContaining({
        sourceBeatId: 'beat-1',
        relativeStartMs: 0,
        durationMs: 1200,
      }),
      expect.objectContaining({
        sourceBeatId: 'beat-2',
        relativeStartMs: 1200,
        durationMs: null,
      }),
    ]);
  });

  it('skips scenes whose primary derived clip already matches the desired metadata', () => {
    const scene = createScene({ timelineClipIds: ['clip-1'] });
    const mediaAsset = createMediaAsset();
    const clip = createClip();

    const plan = planStoryboardTimelineDerivation({
      state: {
        projects: [createProject({ scenes: [scene] })],
        mediaAssets: [mediaAsset],
        assetLibrary: [],
        batchResults: [],
        referenceSets: [],
        timelineSequences: [createSequence()],
        timelineTracks: [createTrack({ clipIds: ['clip-1'] })],
        timelineClips: [clip],
      },
      projectId: 'project-1',
      sequenceId: 'sequence-1',
    });

    expect(plan?.scenePlans[0].action).toBe('skip');
    expect(plan?.scenePlans[0].updates).toBeNull();
  });

  it('updates placeholder-derived clips when a real scene output becomes available', () => {
    const scene = createScene({ timelineClipIds: ['clip-1'] });
    const placeholderAsset = createMediaAsset({
      id: 'media::storyboard-placeholder::scene-1',
      legacyAssetId: null,
      jobId: null,
      name: 'Opening Shot Placeholder',
      source: 'derived',
      path: 'data:image/svg+xml;charset=UTF-8,placeholder',
      previewUrl: 'data:image/svg+xml;charset=UTF-8,placeholder',
      thumbnailUrl: 'data:image/svg+xml;charset=UTF-8,placeholder',
      posterUrl: 'data:image/svg+xml;charset=UTF-8,placeholder',
      metadata: {
        storyboardPlaceholder: true,
      },
    });
    const clip = createClip({
      mediaAssetId: placeholderAsset.id,
      posterUrl: placeholderAsset.posterUrl,
    });

    const plan = planStoryboardTimelineDerivation({
      state: {
        projects: [createProject({ scenes: [scene] })],
        mediaAssets: [placeholderAsset],
        assetLibrary: [createAssetRecord()],
        batchResults: [],
        referenceSets: [],
        timelineSequences: [createSequence()],
        timelineTracks: [createTrack({ clipIds: ['clip-1'] })],
        timelineClips: [clip],
      },
      projectId: 'project-1',
      sequenceId: 'sequence-1',
    });

    expect(plan?.scenePlans[0].action).toBe('update');
    expect(plan?.scenePlans[0].updates).toMatchObject({
      mediaAssetId: 'media::asset::asset-1',
      posterUrl: 'http://localhost:8000/outputs/scenes/opening.png',
      storyboardDerived: true,
    });
  });

  it('creates placeholder plans when a scene has no recoverable media source yet', () => {
    const scene = createScene({
      id: 'scene-2',
      name: 'No Output Yet',
      thumbnail: undefined,
      frames: [],
      shotBeats: [],
    });

    const plan = planStoryboardTimelineDerivation({
      state: {
        projects: [createProject({ scenes: [scene] })],
        mediaAssets: [],
        assetLibrary: [],
        batchResults: [],
        referenceSets: [],
        timelineSequences: [createSequence()],
        timelineTracks: [createTrack()],
        timelineClips: [],
      },
      projectId: 'project-1',
      sequenceId: 'sequence-1',
    });

    expect(plan?.scenePlans[0]).toMatchObject({
      action: 'create',
      placeholder: true,
      desiredTrackKind: 'image',
    });
    expect(plan?.mediaAssetsToUpsert[0].metadata.storyboardPlaceholder).toBe(true);
  });
});
