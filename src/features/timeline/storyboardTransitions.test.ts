import { describe, expect, it } from 'vitest';

import type { Scene, SceneTransition } from '@/types/project';
import type { TimelineClip } from '@/types/timeline';

import { planStoryboardTransitionSync, toTimelineTransition } from './storyboardTransitions';

function scene(id: string, orderIndex: number, transitions?: SceneTransition): Scene {
  return { id, orderIndex, transitions } as unknown as Scene;
}

function clip(overrides: Partial<TimelineClip> & Pick<TimelineClip, 'id' | 'sceneId'>): TimelineClip {
  return {
    trackId: 'track-a',
    mediaAssetId: 'media',
    startMs: 0,
    durationMs: 2000,
    sourceInMs: 0,
    sourceOutMs: 2000,
    transitionIn: null,
    transitionOut: null,
    gain: 1,
    fadeInMs: 0,
    fadeOutMs: 0,
    label: overrides.id,
    posterUrl: null,
    referenceSetIds: [],
    generationBindingId: null,
    retakeRanges: [],
    storyboardDerived: true,
    storyboardBeatMarkers: [],
    storyboardDerivedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

const tracks = [
  { id: 'track-a', sequenceId: 'seq-1' },
  { id: 'track-b', sequenceId: 'seq-2' },
];

describe('toTimelineTransition', () => {
  it('maps a timed transition, clears a cut, and has no opinion without a record', () => {
    expect(toTimelineTransition({ type: 'dissolve', duration: 500 })).toEqual({ type: 'dissolve', durationMs: 500 });
    expect(toTimelineTransition({ type: 'cut', duration: 0 })).toBeNull();
    expect(toTimelineTransition({ type: 'fade', duration: 0 })).toBeNull();
    expect(toTimelineTransition(undefined)).toBeUndefined();
  });

  it('never lets a transition outlast the clip it leaves', () => {
    expect(toTimelineTransition({ type: 'fade', duration: 5000 }, 1200)).toEqual({ type: 'fade', durationMs: 1200 });
  });
});

describe('planStoryboardTransitionSync', () => {
  it('writes each scene transition onto the outgoing edge of its derived clip', () => {
    const project = {
      scenes: [
        scene('s1', 0, { type: 'dissolve', duration: 600 }),
        scene('s2', 1, { type: 'wipe-left', duration: 400 }),
        scene('s3', 2, { type: 'cut', duration: 0 }),
      ],
    };
    const clips = [
      clip({ id: 'c1', sceneId: 's1' }),
      clip({ id: 'c2', sceneId: 's2', startMs: 2000 }),
      clip({ id: 'c3', sceneId: 's3', startMs: 4000 }),
    ];

    expect(planStoryboardTransitionSync({ project, timelineTracks: tracks, timelineClips: clips })).toEqual([
      { clipId: 'c1', sceneId: 's1', transitionOut: { type: 'dissolve', durationMs: 600 } },
      { clipId: 'c2', sceneId: 's2', transitionOut: { type: 'wipe-left', durationMs: 400 } },
    ]);
  });

  it('clears a stale outgoing transition when the storyboard switches to a cut', () => {
    const project = { scenes: [scene('s1', 0, { type: 'cut', duration: 0 }), scene('s2', 1)] };
    const clips = [
      clip({ id: 'c1', sceneId: 's1', transitionOut: { type: 'fade', durationMs: 300 } }),
      clip({ id: 'c2', sceneId: 's2', startMs: 2000 }),
    ];
    expect(planStoryboardTransitionSync({ project, timelineTracks: tracks, timelineClips: clips })).toEqual([
      { clipId: 'c1', sceneId: 's1', transitionOut: null },
    ]);
  });

  it('leaves the last scene and legacy scenes without a record alone', () => {
    const project = { scenes: [scene('s1', 0), scene('s2', 1, { type: 'fade', duration: 500 })] };
    const clips = [
      clip({ id: 'c1', sceneId: 's1', transitionOut: { type: 'zoom', durationMs: 200 } }),
      // A fade to black set on the final clip in the timeline is kept.
      clip({ id: 'c2', sceneId: 's2', startMs: 2000, transitionOut: { type: 'fade', durationMs: 900 } }),
    ];
    expect(planStoryboardTransitionSync({ project, timelineTracks: tracks, timelineClips: clips })).toEqual([]);
  });

  it('skips clips already in sync, hand-made clips, and other sequences when scoped', () => {
    const project = {
      scenes: [scene('s1', 0, { type: 'dissolve', duration: 600 }), scene('s2', 1)],
    };
    const clips = [
      clip({ id: 'synced', sceneId: 's1', transitionOut: { type: 'dissolve', durationMs: 600 } }),
      clip({ id: 'manual', sceneId: 's1', storyboardDerived: false }),
      clip({ id: 'other-seq', sceneId: 's1', trackId: 'track-b' }),
    ];

    expect(planStoryboardTransitionSync({ project, timelineTracks: tracks, timelineClips: clips, sequenceId: 'seq-1' })).toEqual([]);
    expect(planStoryboardTransitionSync({ project, timelineTracks: tracks, timelineClips: clips })).toEqual([
      { clipId: 'other-seq', sceneId: 's1', transitionOut: { type: 'dissolve', durationMs: 600 } },
    ]);
  });

  it('puts the transition on the clip that ends last when a scene has several', () => {
    const project = { scenes: [scene('s1', 0, { type: 'fade', duration: 250 }), scene('s2', 1)] };
    const clips = [
      clip({ id: 'early', sceneId: 's1', startMs: 0, durationMs: 1000 }),
      clip({ id: 'late', sceneId: 's1', startMs: 1000, durationMs: 1000 }),
    ];
    expect(
      planStoryboardTransitionSync({ project, timelineTracks: tracks, timelineClips: clips, sceneIds: ['s1'] }),
    ).toEqual([{ clipId: 'late', sceneId: 's1', transitionOut: { type: 'fade', durationMs: 250 } }]);
  });
});
