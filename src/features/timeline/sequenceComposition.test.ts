import { describe, expect, it } from 'vitest';

import type { MediaAsset } from '@/types/media';
import type { TimelineClip, TimelineSequence, TimelineTrack } from '@/types/timeline';

import { resolveSequenceComposition, resolveTimelinePlayRange } from './sequenceComposition';

function createSequence(overrides: Partial<TimelineSequence> = {}): TimelineSequence {
  return {
    id: 'sequence-1',
    projectId: 'project-1',
    name: 'Sequence',
    trackIds: ['track-top'],
    durationMs: 6000,
    fps: 24,
    playRange: null,
    createdAt: '2026-04-23T00:00:00.000Z',
    updatedAt: '2026-04-23T00:00:00.000Z',
    ...overrides,
  };
}

function createTrack(overrides: Partial<TimelineTrack> = {}): TimelineTrack {
  return {
    id: 'track-top',
    sequenceId: 'sequence-1',
    kind: 'image',
    name: 'Track',
    clipIds: ['clip-1'],
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
    trackId: 'track-top',
    mediaAssetId: 'media-1',
    sceneId: null,
    startMs: 1000,
    durationMs: 2000,
    sourceInMs: 0,
    sourceOutMs: 2000,
    transitionIn: null,
    transitionOut: null,
    gain: 1,
    fadeInMs: 0,
    fadeOutMs: 0,
    label: 'Clip',
    posterUrl: null,
    referenceSetIds: [],
    generationBindingId: null,
    retakeRanges: [],
    storyboardDerived: false,
    storyboardBeatMarkers: [],
    storyboardDerivedAt: null,
    createdAt: '2026-04-23T00:00:00.000Z',
    updatedAt: '2026-04-23T00:00:00.000Z',
    ...overrides,
  };
}

function createMediaAsset(overrides: Partial<MediaAsset> = {}): MediaAsset {
  return {
    id: 'media-1',
    name: 'Asset',
    type: 'image',
    source: 'generated',
    path: 'C:/vision-studio/outputs/asset.png',
    previewUrl: 'file:///C:/vision-studio/outputs/asset.png',
    thumbnailUrl: 'file:///C:/vision-studio/outputs/asset-thumb.png',
    posterUrl: null,
    metadata: {},
    createdAt: '2026-04-23T00:00:00.000Z',
    ...overrides,
  };
}

describe('resolveTimelinePlayRange', () => {
  it('normalizes the configured play range against sequence duration', () => {
    const sequence = createSequence({
      durationMs: 5000,
      playRange: {
        startMs: -200,
        endMs: 9000,
      },
    });

    expect(resolveTimelinePlayRange(sequence)).toEqual({
      startMs: 0,
      endMs: 5000,
      durationMs: 5000,
    });
  });
});

describe('resolveSequenceComposition', () => {
  it('resolves an image clip as a held frame with cut metadata', () => {
    const sequence = createSequence();
    const track = createTrack();
    const clip = createClip();
    const mediaAsset = createMediaAsset();

    const result = resolveSequenceComposition({
      sequence,
      tracks: [track],
      clips: [clip],
      mediaAssets: [mediaAsset],
      timeMs: 1500,
    });

    expect(result.primaryClipId).toBe('clip-1');
    expect(result.activeTrackId).toBe('track-top');
    expect(result.transition).toMatchObject({
      kind: 'cut',
      edge: 'none',
      fromClipId: 'clip-1',
      toClipId: 'clip-1',
    });
    expect(result.layers).toEqual([
      expect.objectContaining({
        clipId: 'clip-1',
        mediaAssetId: 'media-1',
        mediaType: 'image',
        heldFrame: true,
        sourceTimeMs: 0,
        clipOffsetMs: 500,
        opacity: 1,
      }),
    ]);
    expect(result.issues).toEqual([]);
  });

  it('maps a trimmed video clip to the correct source time', () => {
    const sequence = createSequence();
    const track = createTrack({
      kind: 'video',
    });
    const clip = createClip({
      durationMs: 1800,
      sourceInMs: 400,
      sourceOutMs: 2200,
    });
    const mediaAsset = createMediaAsset({
      type: 'video',
      durationMs: 5000,
      path: 'C:/vision-studio/outputs/asset.mp4',
      previewUrl: 'file:///C:/vision-studio/outputs/asset.mp4',
      thumbnailUrl: 'file:///C:/vision-studio/outputs/asset-frame.jpg',
      posterUrl: 'file:///C:/vision-studio/outputs/asset-poster.jpg',
    });

    const result = resolveSequenceComposition({
      sequence,
      tracks: [track],
      clips: [clip],
      mediaAssets: [mediaAsset],
      timeMs: 1750,
    });

    expect(result.layers[0]).toMatchObject({
      mediaType: 'video',
      heldFrame: false,
      clipOffsetMs: 750,
      sourceTimeMs: 1150,
    });
  });

  it('resolves accepted retake media for only the approved clip range', () => {
    const sequence = createSequence();
    const track = createTrack({
      kind: 'video',
    });
    const clip = createClip({
      durationMs: 4000,
      sourceOutMs: 4000,
      retakeRanges: [
        {
          id: 'retake-range-1',
          clipId: 'clip-1',
          startMs: 500,
          endMs: 1750,
          status: 'accepted',
          acceptedTakeId: 'take-1',
          candidateTakeIds: ['take-1'],
          createdAt: '2026-04-24T00:00:00.000Z',
          updatedAt: '2026-04-24T00:00:00.000Z',
        },
      ],
    });
    const originalMedia = createMediaAsset({
      type: 'video',
      path: 'C:/vision-studio/outputs/original.mp4',
      previewUrl: 'file:///C:/vision-studio/outputs/original.mp4',
      thumbnailUrl: 'file:///C:/vision-studio/outputs/original.jpg',
      posterUrl: 'file:///C:/vision-studio/outputs/original.jpg',
      durationMs: 4000,
    });
    const retakeMedia = createMediaAsset({
      id: 'media-retake',
      type: 'video',
      path: 'C:/vision-studio/outputs/retake.mp4',
      previewUrl: 'file:///C:/vision-studio/outputs/retake.mp4',
      thumbnailUrl: 'file:///C:/vision-studio/outputs/retake.jpg',
      posterUrl: 'file:///C:/vision-studio/outputs/retake.jpg',
      durationMs: 1250,
    });

    const retakeFrame = resolveSequenceComposition({
      sequence,
      tracks: [track],
      clips: [clip],
      clipRetakeTakes: [
        {
          id: 'take-1',
          clipId: 'clip-1',
          retakeRangeId: 'retake-range-1',
          mediaAssetId: 'media-retake',
          prompt: 'cleaner hand motion',
          negativePrompt: '',
          model: 'svd',
          settings: {},
          referenceSetIds: [],
          status: 'accepted',
          createdAt: '2026-04-24T00:01:00.000Z',
          updatedAt: '2026-04-24T00:01:00.000Z',
        },
      ],
      mediaAssets: [originalMedia, retakeMedia],
      timeMs: 1750,
    });
    const originalFrame = resolveSequenceComposition({
      sequence,
      tracks: [track],
      clips: [clip],
      clipRetakeTakes: [
        {
          id: 'take-1',
          clipId: 'clip-1',
          retakeRangeId: 'retake-range-1',
          mediaAssetId: 'media-retake',
          prompt: 'cleaner hand motion',
          negativePrompt: '',
          model: 'svd',
          settings: {},
          referenceSetIds: [],
          status: 'accepted',
          createdAt: '2026-04-24T00:01:00.000Z',
          updatedAt: '2026-04-24T00:01:00.000Z',
        },
      ],
      mediaAssets: [originalMedia, retakeMedia],
      timeMs: 2900,
    });

    expect(retakeFrame.layers[0]).toMatchObject({
      clipId: 'clip-1',
      mediaAssetId: 'media-retake',
      sourcePath: 'C:/vision-studio/outputs/retake.mp4',
      sourceTimeMs: 250,
      clipOffsetMs: 750,
      retakeRangeId: 'retake-range-1',
      retakeTakeId: 'take-1',
    });
    expect(retakeFrame.issues).toEqual([]);
    expect(originalFrame.layers[0]).toMatchObject({
      mediaAssetId: 'media-1',
      sourcePath: 'C:/vision-studio/outputs/original.mp4',
      sourceTimeMs: 1900,
      retakeRangeId: null,
      retakeTakeId: null,
    });
  });

  it('fails explicitly when an accepted retake media asset is missing', () => {
    const sequence = createSequence();
    const track = createTrack({
      kind: 'video',
    });
    const clip = createClip({
      durationMs: 4000,
      sourceOutMs: 4000,
      retakeRanges: [
        {
          id: 'retake-range-1',
          clipId: 'clip-1',
          startMs: 500,
          endMs: 1750,
          status: 'accepted',
          acceptedTakeId: 'take-1',
          candidateTakeIds: ['take-1'],
          createdAt: '2026-04-24T00:00:00.000Z',
          updatedAt: '2026-04-24T00:00:00.000Z',
        },
      ],
    });

    const result = resolveSequenceComposition({
      sequence,
      tracks: [track],
      clips: [clip],
      clipRetakeTakes: [
        {
          id: 'take-1',
          clipId: 'clip-1',
          retakeRangeId: 'retake-range-1',
          mediaAssetId: 'missing-retake-media',
          prompt: 'cleaner hand motion',
          negativePrompt: '',
          model: 'svd',
          settings: {},
          referenceSetIds: [],
          status: 'accepted',
          createdAt: '2026-04-24T00:01:00.000Z',
          updatedAt: '2026-04-24T00:01:00.000Z',
        },
      ],
      mediaAssets: [
        createMediaAsset({
          type: 'video',
          path: 'C:/vision-studio/outputs/original.mp4',
          previewUrl: 'file:///C:/vision-studio/outputs/original.mp4',
        }),
      ],
      timeMs: 1750,
    });

    expect(result.layers).toEqual([]);
    expect(result.issues).toEqual([
      expect.objectContaining({
        code: 'missing-retake-media',
        clipId: 'clip-1',
        retakeRangeId: 'retake-range-1',
        retakeTakeId: 'take-1',
      }),
    ]);
  });

  it('clamps accepted retake playback to the candidate media duration', () => {
    const sequence = createSequence();
    const track = createTrack({
      kind: 'video',
    });
    const clip = createClip({
      durationMs: 4000,
      sourceOutMs: 4000,
      retakeRanges: [
        {
          id: 'retake-range-1',
          clipId: 'clip-1',
          startMs: 500,
          endMs: 1750,
          status: 'accepted',
          acceptedTakeId: 'take-1',
          candidateTakeIds: ['take-1'],
          createdAt: '2026-04-24T00:00:00.000Z',
          updatedAt: '2026-04-24T00:00:00.000Z',
        },
      ],
    });
    const originalMedia = createMediaAsset({
      type: 'video',
      path: 'C:/vision-studio/outputs/original.mp4',
      previewUrl: 'file:///C:/vision-studio/outputs/original.mp4',
      thumbnailUrl: 'file:///C:/vision-studio/outputs/original.jpg',
      posterUrl: 'file:///C:/vision-studio/outputs/original.jpg',
      durationMs: 4000,
    });
    const shortRetakeMedia = createMediaAsset({
      id: 'media-retake-short',
      type: 'video',
      path: 'C:/vision-studio/outputs/retake-short.mp4',
      previewUrl: 'file:///C:/vision-studio/outputs/retake-short.mp4',
      thumbnailUrl: 'file:///C:/vision-studio/outputs/retake-short.jpg',
      posterUrl: 'file:///C:/vision-studio/outputs/retake-short.jpg',
      durationMs: 900,
    });

    const result = resolveSequenceComposition({
      sequence,
      tracks: [track],
      clips: [clip],
      clipRetakeTakes: [
        {
          id: 'take-1',
          clipId: 'clip-1',
          retakeRangeId: 'retake-range-1',
          mediaAssetId: 'media-retake-short',
          prompt: 'cleaner hand motion',
          negativePrompt: '',
          model: 'svd',
          settings: {},
          referenceSetIds: [],
          status: 'accepted',
          createdAt: '2026-04-24T00:01:00.000Z',
          updatedAt: '2026-04-24T00:01:00.000Z',
        },
      ],
      mediaAssets: [originalMedia, shortRetakeMedia],
      timeMs: 2450,
    });

    expect(result.layers[0]).toMatchObject({
      mediaAssetId: 'media-retake-short',
      sourceTimeMs: 899,
      retakeRangeId: 'retake-range-1',
      retakeTakeId: 'take-1',
    });
    expect(result.issues).toEqual([]);
  });

  it('honors play range boundaries and flags clamping', () => {
    const sequence = createSequence({
      playRange: {
        startMs: 1000,
        endMs: 3000,
      },
    });
    const track = createTrack();
    const clip = createClip();
    const mediaAsset = createMediaAsset();

    const result = resolveSequenceComposition({
      sequence,
      tracks: [track],
      clips: [clip],
      mediaAssets: [mediaAsset],
      timeMs: 4200,
    });

    expect(result.inPlayRange).toBe(false);
    expect(result.requestedTimeMs).toBe(4200);
    expect(result.resolvedTimeMs).toBe(3000);
    expect(result.primaryClipId).toBe('clip-1');
    expect(result.issues).toEqual([
      expect.objectContaining({
        code: 'play-range-clamped',
      }),
    ]);
  });

  it('returns dissolve transition layers and progress near a clip boundary', () => {
    const sequence = createSequence({
      trackIds: ['track-top'],
      durationMs: 5000,
    });
    const track = createTrack({
      clipIds: ['clip-a', 'clip-b'],
    });
    const firstClip = createClip({
      id: 'clip-a',
      mediaAssetId: 'media-a',
      startMs: 0,
      durationMs: 2000,
      sourceOutMs: 2000,
      transitionOut: {
        type: 'dissolve',
        durationMs: 500,
      },
    });
    const secondClip = createClip({
      id: 'clip-b',
      mediaAssetId: 'media-b',
      startMs: 2000,
      durationMs: 2000,
      sourceOutMs: 2000,
      transitionIn: {
        type: 'dissolve',
        durationMs: 500,
      },
    });
    const mediaAssets = [
      createMediaAsset({
        id: 'media-a',
        path: 'C:/vision-studio/outputs/a.png',
        previewUrl: 'file:///C:/vision-studio/outputs/a.png',
        thumbnailUrl: 'file:///C:/vision-studio/outputs/a-thumb.png',
      }),
      createMediaAsset({
        id: 'media-b',
        path: 'C:/vision-studio/outputs/b.png',
        previewUrl: 'file:///C:/vision-studio/outputs/b.png',
        thumbnailUrl: 'file:///C:/vision-studio/outputs/b-thumb.png',
      }),
    ];

    const result = resolveSequenceComposition({
      sequence,
      tracks: [track],
      clips: [firstClip, secondClip],
      mediaAssets,
      timeMs: 2250,
    });

    expect(result.transition).toMatchObject({
      kind: 'dissolve',
      edge: 'in',
      type: 'dissolve',
      progress: 0.5,
      fromClipId: 'clip-a',
      toClipId: 'clip-b',
    });
    expect(result.layers).toEqual([
      expect.objectContaining({
        clipId: 'clip-a',
        opacity: 0.5,
      }),
      expect.objectContaining({
        clipId: 'clip-b',
        opacity: 0.5,
      }),
    ]);
  });

  it('chooses the top track when multiple visual tracks overlap and reports the issue', () => {
    const sequence = createSequence({
      trackIds: ['track-top', 'track-bottom'],
    });
    const topTrack = createTrack({
      id: 'track-top',
      orderIndex: 0,
      clipIds: ['clip-top'],
    });
    const bottomTrack = createTrack({
      id: 'track-bottom',
      orderIndex: 1,
      clipIds: ['clip-bottom'],
    });
    const topClip = createClip({
      id: 'clip-top',
      trackId: 'track-top',
      mediaAssetId: 'media-top',
    });
    const bottomClip = createClip({
      id: 'clip-bottom',
      trackId: 'track-bottom',
      mediaAssetId: 'media-bottom',
    });
    const mediaAssets = [
      createMediaAsset({
        id: 'media-top',
        path: 'C:/vision-studio/outputs/top.png',
        previewUrl: 'file:///C:/vision-studio/outputs/top.png',
        thumbnailUrl: 'file:///C:/vision-studio/outputs/top-thumb.png',
      }),
      createMediaAsset({
        id: 'media-bottom',
        path: 'C:/vision-studio/outputs/bottom.png',
        previewUrl: 'file:///C:/vision-studio/outputs/bottom.png',
        thumbnailUrl: 'file:///C:/vision-studio/outputs/bottom-thumb.png',
      }),
    ];

    const result = resolveSequenceComposition({
      sequence,
      tracks: [bottomTrack, topTrack],
      clips: [topClip, bottomClip],
      mediaAssets,
      timeMs: 1500,
    });

    expect(result.activeTrackId).toBe('track-top');
    expect(result.primaryClipId).toBe('clip-top');
    expect(result.issues).toEqual([
      expect.objectContaining({
        code: 'multiple-active-tracks',
        trackId: 'track-top',
      }),
    ]);
  });

  it('flags unsupported transition types explicitly', () => {
    const sequence = createSequence();
    const track = createTrack();
    const clip = createClip({
      transitionIn: {
        type: 'wipe-left',
        durationMs: 400,
      },
    });
    const mediaAsset = createMediaAsset();

    const result = resolveSequenceComposition({
      sequence,
      tracks: [track],
      clips: [clip],
      mediaAssets: [mediaAsset],
      timeMs: 1200,
    });

    expect(result.transition).toMatchObject({
      kind: 'unsupported',
      edge: 'in',
      type: 'wipe-left',
    });
    expect(result.issues).toEqual([
      expect.objectContaining({
        code: 'unsupported-transition',
        transitionType: 'wipe-left',
      }),
    ]);
  });

  it('resolves audible audio layers with trim, gain, and fades applied', () => {
    const sequence = createSequence({
      trackIds: ['track-audio'],
    });
    const track = createTrack({
      id: 'track-audio',
      kind: 'audio',
      name: 'Music Bed',
      clipIds: ['clip-audio'],
    });
    const clip = createClip({
      id: 'clip-audio',
      trackId: 'track-audio',
      mediaAssetId: 'media-audio',
      startMs: 1000,
      durationMs: 2000,
      sourceInMs: 400,
      sourceOutMs: 2400,
      gain: 1.5,
      fadeInMs: 1000,
      fadeOutMs: 500,
    });
    const mediaAsset = createMediaAsset({
      id: 'media-audio',
      type: 'audio',
      path: 'C:/vision-studio/imports/music.wav',
      previewUrl: 'file:///C:/vision-studio/imports/music.wav',
      thumbnailUrl: 'data:image/svg+xml;base64,audio',
      posterUrl: null,
      durationMs: 5000,
    });

    const result = resolveSequenceComposition({
      sequence,
      tracks: [track],
      clips: [clip],
      mediaAssets: [mediaAsset],
      timeMs: 1250,
    });

    expect(result.layers).toEqual([]);
    expect(result.audioLayers).toEqual([
      expect.objectContaining({
        clipId: 'clip-audio',
        mediaAssetId: 'media-audio',
        sourceTimeMs: 650,
        clipOffsetMs: 250,
        gain: 0.375,
      }),
    ]);
    expect(result.issues).toEqual([]);
  });

  it('honors track mute and solo rules for audio playback', () => {
    const sequence = createSequence({
      trackIds: ['track-solo', 'track-muted', 'track-background'],
    });
    const soloTrack = createTrack({
      id: 'track-solo',
      kind: 'audio',
      name: 'Solo Stem',
      clipIds: ['clip-solo'],
      orderIndex: 0,
      solo: true,
    });
    const mutedTrack = createTrack({
      id: 'track-muted',
      kind: 'audio',
      name: 'Muted Stem',
      clipIds: ['clip-muted'],
      orderIndex: 1,
      muted: true,
    });
    const backgroundTrack = createTrack({
      id: 'track-background',
      kind: 'audio',
      name: 'Background Stem',
      clipIds: ['clip-background'],
      orderIndex: 2,
    });
    const clips = [
      createClip({
        id: 'clip-solo',
        trackId: 'track-solo',
        mediaAssetId: 'media-solo',
      }),
      createClip({
        id: 'clip-muted',
        trackId: 'track-muted',
        mediaAssetId: 'media-muted',
      }),
      createClip({
        id: 'clip-background',
        trackId: 'track-background',
        mediaAssetId: 'media-background',
      }),
    ];
    const mediaAssets = [
      createMediaAsset({
        id: 'media-solo',
        type: 'audio',
        path: 'C:/vision-studio/imports/solo.wav',
        previewUrl: 'file:///C:/vision-studio/imports/solo.wav',
        thumbnailUrl: 'data:image/svg+xml;base64,audio',
        posterUrl: null,
      }),
      createMediaAsset({
        id: 'media-muted',
        type: 'audio',
        path: 'C:/vision-studio/imports/muted.wav',
        previewUrl: 'file:///C:/vision-studio/imports/muted.wav',
        thumbnailUrl: 'data:image/svg+xml;base64,audio',
        posterUrl: null,
      }),
      createMediaAsset({
        id: 'media-background',
        type: 'audio',
        path: 'C:/vision-studio/imports/background.wav',
        previewUrl: 'file:///C:/vision-studio/imports/background.wav',
        thumbnailUrl: 'data:image/svg+xml;base64,audio',
        posterUrl: null,
      }),
    ];

    const result = resolveSequenceComposition({
      sequence,
      tracks: [soloTrack, mutedTrack, backgroundTrack],
      clips,
      mediaAssets,
      timeMs: 1500,
    });

    expect(result.audioLayers).toHaveLength(1);
    expect(result.audioLayers[0]).toMatchObject({
      clipId: 'clip-solo',
      mediaAssetId: 'media-solo',
      gain: 1,
    });
  });
});
