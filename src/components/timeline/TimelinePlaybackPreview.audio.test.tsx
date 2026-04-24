import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAppStore } from '@/store/appStore';

import { TimelinePlaybackPreview } from './TimelinePlaybackPreview';

function resetStore() {
  useAppStore.setState(useAppStore.getInitialState());
}

function seedAudioSequence() {
  const state = useAppStore.getState();
  const project = state.createProject('Audio Playback Project');
  const sequence = state.ensureTimelineSequenceForProject(project.id, { fps: 10 })!;
  const videoTrack = useAppStore.getState().timelineTracks.find((item) => item.sequenceId === sequence.id)!;
  const audioTrack = state.createTimelineTrack(sequence.id, { kind: 'audio', name: 'Music Bed' })!;

  state.upsertMediaAsset({
    id: 'audio-1',
    name: 'Ambient Stem',
    type: 'audio',
    source: 'imported',
    path: 'C:/vision-studio/imports/ambient.wav',
    previewUrl: 'file:///C:/vision-studio/imports/ambient.wav',
    thumbnailUrl: 'data:image/svg+xml;base64,audio',
    posterUrl: null,
    durationMs: 5000,
    waveformSummary: [0.24, 0.52, 0.74, 0.43, 0.66, 0.38, 0.81, 0.57],
    metadata: {},
    createdAt: '2026-04-24T00:00:00.000Z',
  });

  state.upsertMediaAsset({
    id: 'image-1',
    name: 'Poster Frame',
    type: 'image',
    source: 'generated',
    path: 'C:/vision-studio/outputs/poster.png',
    previewUrl: 'C:/vision-studio/outputs/poster.png',
    thumbnailUrl: 'C:/vision-studio/outputs/poster-thumb.png',
    posterUrl: 'C:/vision-studio/outputs/poster.png',
    metadata: {},
    createdAt: '2026-04-24T00:00:01.000Z',
  });

  state.createTimelineClip({
    trackId: videoTrack.id,
    mediaAssetId: 'image-1',
    startMs: 0,
    durationMs: 3000,
    label: 'Poster Frame',
  });

  const audioClip = state.createTimelineClip({
    trackId: audioTrack.id,
    mediaAssetId: 'audio-1',
    startMs: 500,
    durationMs: 2500,
    sourceInMs: 100,
    sourceOutMs: 2600,
    gain: 0.8,
    fadeInMs: 500,
    fadeOutMs: 500,
    label: 'Ambient Stem',
  })!;

  state.setActiveTimelineSequence(sequence.id);
  state.seekTo(1000);

  return { sequence, audioTrack, audioClip };
}

describe('TimelinePlaybackPreview audio playback', () => {
  let animationTime = 0;
  let playMock: ReturnType<typeof vi.fn>;
  let pauseMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    resetStore();
    animationTime = 0;
    playMock = vi.fn().mockResolvedValue(undefined);
    pauseMock = vi.fn();
    vi.useFakeTimers();
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
      window.setTimeout(() => {
        animationTime += 16;
        callback(animationTime);
      }, 16),
    );
    vi.stubGlobal('cancelAnimationFrame', (handle: number) => {
      window.clearTimeout(handle);
    });
    vi.spyOn(window.HTMLMediaElement.prototype, 'play').mockImplementation(playMock as () => Promise<void>);
    vi.spyOn(window.HTMLMediaElement.prototype, 'pause').mockImplementation(pauseMock as () => void);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('renders pooled audio elements and keeps them aligned to the playhead', () => {
    const { audioClip } = seedAudioSequence();

    render(<TimelinePlaybackPreview />);

    const audioElement = screen.getByTestId(`timeline-playback-audio-${audioClip.id}`) as HTMLAudioElement;
    expect(audioElement).toBeInTheDocument();
    expect(audioElement.currentTime).toBeCloseTo(0.6, 3);
    expect(audioElement.volume).toBeCloseTo(0.8, 3);
    expect(screen.getByText('1 audio')).toBeInTheDocument();

    act(() => {
      useAppStore.getState().seekTo(1200);
    });

    expect(audioElement.currentTime).toBeCloseTo(0.8, 3);
  });

  it('plays while the timeline is running and pauses when playback stops', () => {
    seedAudioSequence();
    useAppStore.getState().timelinePlay();

    render(<TimelinePlaybackPreview />);

    act(() => {
      vi.advanceTimersByTime(220);
    });

    expect(playMock).toHaveBeenCalled();
    expect(useAppStore.getState().currentTime).toBeGreaterThan(1000);

    act(() => {
      useAppStore.getState().timelineStop();
    });

    expect(pauseMock).toHaveBeenCalled();
  });
});
