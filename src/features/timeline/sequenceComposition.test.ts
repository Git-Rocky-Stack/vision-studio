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
    label: 'Clip',
    posterUrl: null,
    referenceSetIds: [],
    generationBindingId: null,
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
});
