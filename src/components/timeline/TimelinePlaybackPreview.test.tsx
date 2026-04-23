import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAppStore } from '@/store/appStore';

import { TimelinePlaybackPreview } from './TimelinePlaybackPreview';

function resetStore() {
  useAppStore.setState(useAppStore.getInitialState());
}

function seedSequence() {
  const state = useAppStore.getState();
  const project = state.createProject('Playback Project');
  const sequence = state.ensureTimelineSequenceForProject(project.id, { fps: 10 })!;
  const track = useAppStore.getState().timelineTracks.find((item) => item.sequenceId === sequence.id)!;

  return { state, sequence, track };
}

describe('TimelinePlaybackPreview', () => {
  let animationTime = 0;

  beforeEach(() => {
    resetStore();
    animationTime = 0;
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
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('renders the resolved image clip output for the active sequence', () => {
    const { state, sequence, track } = seedSequence();

    state.upsertMediaAsset({
      id: 'image-1',
      name: 'Hero still',
      type: 'image',
      source: 'generated',
      path: 'C:/vision-studio/outputs/hero.png',
      previewUrl: 'C:/vision-studio/outputs/hero.png',
      thumbnailUrl: 'C:/vision-studio/outputs/hero-thumb.png',
      posterUrl: 'C:/vision-studio/outputs/hero.png',
      metadata: {},
      createdAt: '2026-04-23T00:00:00.000Z',
    });

    state.createTimelineClip({
      trackId: track.id,
      mediaAssetId: 'image-1',
      startMs: 0,
      durationMs: 2000,
      label: 'Hero still',
    });
    state.setActiveTimelineSequence(sequence.id);

    render(<TimelinePlaybackPreview />);

    expect(screen.getByTestId('timeline-playback-preview')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Timeline playback layer 1' })).toBeInTheDocument();
    expect(screen.getByText(sequence.name)).toBeInTheDocument();
  });

  it('advances the playhead while playback is running', () => {
    const { state, sequence, track } = seedSequence();

    state.upsertMediaAsset({
      id: 'image-1',
      name: 'Hero still',
      type: 'image',
      source: 'generated',
      path: 'C:/vision-studio/outputs/hero.png',
      previewUrl: 'C:/vision-studio/outputs/hero.png',
      thumbnailUrl: 'C:/vision-studio/outputs/hero-thumb.png',
      posterUrl: 'C:/vision-studio/outputs/hero.png',
      metadata: {},
      createdAt: '2026-04-23T00:00:00.000Z',
    });

    state.createTimelineClip({
      trackId: track.id,
      mediaAssetId: 'image-1',
      startMs: 0,
      durationMs: 3000,
      label: 'Hero still',
    });
    state.setActiveTimelineSequence(sequence.id);
    useAppStore.getState().timelinePlay();

    render(<TimelinePlaybackPreview />);

    act(() => {
      vi.advanceTimersByTime(220);
    });

    expect(useAppStore.getState().playState).toBe('playing');
    expect(useAppStore.getState().currentTime).toBeGreaterThanOrEqual(100);
  });

  it('loops inside the configured play range when timeline looping is enabled', () => {
    const { state, sequence, track } = seedSequence();

    state.upsertMediaAsset({
      id: 'video-1',
      name: 'Loop clip',
      type: 'video',
      source: 'generated',
      path: 'C:/vision-studio/outputs/loop.mp4',
      previewUrl: 'C:/vision-studio/outputs/loop.mp4',
      thumbnailUrl: 'C:/vision-studio/outputs/loop.jpg',
      posterUrl: 'C:/vision-studio/outputs/loop.jpg',
      durationMs: 4000,
      fps: 10,
      metadata: {},
      createdAt: '2026-04-23T00:00:00.000Z',
    });

    state.createTimelineClip({
      trackId: track.id,
      mediaAssetId: 'video-1',
      startMs: 0,
      durationMs: 2000,
      sourceInMs: 0,
      sourceOutMs: 2000,
      label: 'Loop clip',
    });
    state.setActiveTimelineSequence(sequence.id);
    state.setTimelineSequencePlayRange(sequence.id, { startMs: 1000, endMs: 1200 });
    state.seekTo(1100);
    state.toggleTimelineLoop();

    render(<TimelinePlaybackPreview />);

    act(() => {
      useAppStore.getState().timelinePlay();
      vi.advanceTimersByTime(350);
    });

    const loopedTime = useAppStore.getState().currentTime;
    expect(loopedTime).toBeGreaterThanOrEqual(1000);
    expect(loopedTime).toBeLessThan(1200);
  });
});
