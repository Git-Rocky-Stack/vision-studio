import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { useAppStore } from '@/store/appStore';
import { TimelineRetakeCompare } from './TimelineRetakeCompare';

function resetStore() {
  useAppStore.setState(useAppStore.getInitialState());
}

function seedRetakeCompareFixture() {
  const state = useAppStore.getState();
  const project = state.createProject('Retake Compare');
  state.setActiveProject(project.id);
  const sequence = state.ensureTimelineSequenceForProject(project.id, { fps: 24 })!;
  state.setActiveTimelineSequence(sequence.id);
  const track = useAppStore.getState().timelineTracks.find((item) => item.sequenceId === sequence.id)!;

  state.upsertMediaAsset({
    id: 'media-original-video',
    legacyAssetId: null,
    jobId: 'job-original',
    name: 'Original Shot',
    type: 'video',
    source: 'generated',
    path: 'C:/vision-studio/outputs/original.mp4',
    previewUrl: 'C:/vision-studio/outputs/original.mp4',
    thumbnailUrl: 'C:/vision-studio/outputs/original.jpg',
    posterUrl: 'C:/vision-studio/outputs/original.jpg',
    durationMs: 4000,
    fps: 24,
    metadata: {},
    createdAt: '2026-04-24T00:00:00.000Z',
  });
  state.upsertMediaAsset({
    id: 'media-retake-video',
    legacyAssetId: null,
    jobId: 'job-retake',
    name: 'Candidate Retake',
    type: 'video',
    source: 'generated',
    path: 'C:/vision-studio/outputs/retake.mp4',
    previewUrl: 'C:/vision-studio/outputs/retake.mp4',
    thumbnailUrl: 'C:/vision-studio/outputs/retake.jpg',
    posterUrl: 'C:/vision-studio/outputs/retake.jpg',
    durationMs: 1250,
    fps: 24,
    metadata: {},
    createdAt: '2026-04-24T00:01:00.000Z',
  });

  const clip = state.createTimelineClip({
    trackId: track.id,
    mediaAssetId: 'media-original-video',
    startMs: 2000,
    durationMs: 4000,
    label: 'Original Shot',
  })!;
  const range = state.createTimelineClipRetakeRange(clip.id, {
    startMs: 500,
    endMs: 1750,
  })!;
  const take = state.createClipRetakeTake({
    clipId: clip.id,
    retakeRangeId: range.id,
    mediaAssetId: 'media-retake-video',
    prompt: 'cleaner hand motion',
  })!;

  state.setActiveTimelineClip(clip.id);
  state.setActiveTimelineRetakeRange(range.id);
  state.setActiveTimelineRetakeTake(take.id);

  return { clip, range, sequence, take };
}

describe('TimelineRetakeCompare', () => {
  beforeEach(resetStore);
  afterEach(cleanup);

  it('previews the selected retake range and accepts a candidate take', async () => {
    const user = userEvent.setup();
    const { clip, range, sequence, take } = seedRetakeCompareFixture();

    render(<TimelineRetakeCompare />);

    expect(screen.getByTestId('timeline-retake-compare')).toBeInTheDocument();
    expect(screen.getByText('Current Editorial')).toBeInTheDocument();
    expect(screen.getByText('Candidate Take')).toBeInTheDocument();

    await user.click(screen.getByText('Preview Range'));
    expect(useAppStore.getState().currentTime).toBe(clip.startMs + range.startMs);
    expect(
      useAppStore.getState().timelineSequences.find((item) => item.id === sequence.id)?.playRange,
    ).toEqual({
      startMs: clip.startMs + range.startMs,
      endMs: clip.startMs + range.endMs,
    });

    await user.click(screen.getByTestId('timeline-retake-accept'));
    const nextClip = useAppStore.getState().timelineClips.find((item) => item.id === clip.id)!;
    expect(useAppStore.getState().clipRetakeTakes.find((item) => item.id === take.id)?.status).toBe('accepted');
    expect(nextClip.retakeRanges.find((item) => item.id === range.id)?.acceptedTakeId).toBe(take.id);
  });

  it('rejects a candidate and reverts an accepted range without marking the take rejected', async () => {
    const user = userEvent.setup();
    const { clip, range, take } = seedRetakeCompareFixture();

    render(<TimelineRetakeCompare />);

    await user.click(screen.getByTestId('timeline-retake-accept'));
    await user.click(screen.getByTestId('timeline-retake-revert'));

    let state = useAppStore.getState();
    expect(state.clipRetakeTakes.find((item) => item.id === take.id)?.status).toBe('candidate');
    expect(
      state.timelineClips.find((item) => item.id === clip.id)?.retakeRanges.find((item) => item.id === range.id)
        ?.acceptedTakeId,
    ).toBeNull();

    await user.click(screen.getByTestId('timeline-retake-reject'));
    state = useAppStore.getState();
    expect(state.clipRetakeTakes.find((item) => item.id === take.id)?.status).toBe('rejected');
  });

  it('shows the accepted take as the current editorial result when comparing a newer candidate', () => {
    const { range, take } = seedRetakeCompareFixture();
    const state = useAppStore.getState();

    state.acceptClipRetakeTake(take.id);
    state.upsertMediaAsset({
      id: 'media-retake-video-2',
      legacyAssetId: null,
      jobId: 'job-retake-2',
      name: 'Second Candidate Retake',
      type: 'video',
      source: 'generated',
      path: 'C:/vision-studio/outputs/retake-2.mp4',
      previewUrl: 'C:/vision-studio/outputs/retake-2.mp4',
      thumbnailUrl: 'C:/vision-studio/outputs/retake-2.jpg',
      posterUrl: 'C:/vision-studio/outputs/retake-2.jpg',
      durationMs: 1250,
      fps: 24,
      metadata: {},
      createdAt: '2026-04-24T00:02:00.000Z',
    });
    const secondTake = state.createClipRetakeTake({
      clipId: take.clipId,
      retakeRangeId: range.id,
      mediaAssetId: 'media-retake-video-2',
      prompt: 'more stable hand motion',
    })!;
    state.setActiveTimelineRetakeTake(secondTake.id);

    render(<TimelineRetakeCompare />);

    const currentPanelVideo = screen
      .getByTestId('timeline-retake-compare-current-panel')
      .querySelector('video') as HTMLVideoElement | null;
    const candidatePanelVideo = screen
      .getByTestId('timeline-retake-compare-candidate-panel')
      .querySelector('video') as HTMLVideoElement | null;

    expect(currentPanelVideo).not.toBeNull();
    expect(candidatePanelVideo).not.toBeNull();
    expect(currentPanelVideo!).toHaveAttribute('src', expect.stringContaining('retake.mp4'));
    expect(candidatePanelVideo!).toHaveAttribute('src', expect.stringContaining('retake-2.mp4'));
  });

  it('defaults to the newest non-rejected candidate when no retake take is selected', () => {
    const { range, take } = seedRetakeCompareFixture();
    const state = useAppStore.getState();

    state.upsertMediaAsset({
      id: 'media-retake-video-2',
      legacyAssetId: null,
      jobId: 'job-retake-2',
      name: 'Second Candidate Retake',
      type: 'video',
      source: 'generated',
      path: 'C:/vision-studio/outputs/retake-2.mp4',
      previewUrl: 'C:/vision-studio/outputs/retake-2.mp4',
      thumbnailUrl: 'C:/vision-studio/outputs/retake-2.jpg',
      posterUrl: 'C:/vision-studio/outputs/retake-2.jpg',
      durationMs: 1250,
      fps: 24,
      metadata: {},
      createdAt: '2026-04-24T00:02:00.000Z',
    });
    const secondTake = state.createClipRetakeTake({
      clipId: take.clipId,
      retakeRangeId: range.id,
      mediaAssetId: 'media-retake-video-2',
      prompt: 'more stable hand motion',
    })!;

    useAppStore.setState((current) => ({
      clipRetakeTakes: current.clipRetakeTakes.map((item) =>
        item.id === take.id
          ? { ...item, createdAt: '2026-04-24T00:01:00.000Z' }
          : item.id === secondTake.id
            ? { ...item, createdAt: '2026-04-24T00:02:00.000Z' }
            : item,
      ),
      activeTimelineRetakeTakeId: null,
    }));

    render(<TimelineRetakeCompare />);

    const candidatePanelVideo = screen
      .getByTestId('timeline-retake-compare-candidate-panel')
      .querySelector('video') as HTMLVideoElement | null;

    expect(candidatePanelVideo).not.toBeNull();
    expect(candidatePanelVideo!).toHaveAttribute('src', expect.stringContaining('retake-2.mp4'));
  });

  it('does not render without an active retake candidate', () => {
    seedRetakeCompareFixture();
    useAppStore.getState().setActiveTimelineRetakeTake(null);
    useAppStore.getState().deleteClipRetakeTake(useAppStore.getState().clipRetakeTakes[0].id);

    render(<TimelineRetakeCompare />);

    expect(screen.queryByTestId('timeline-retake-compare')).not.toBeInTheDocument();
  });
});
