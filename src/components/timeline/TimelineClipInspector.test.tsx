import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { TimelineClipInspector } from './TimelineClipInspector';
import { useAppStore } from '@/store/appStore';

function resetStore() {
  useAppStore.setState(useAppStore.getInitialState());
}

function seedTimelineFixture() {
  const state = useAppStore.getState();
  const project = state.createProject('Timeline Inspector');
  const sequence = state.ensureTimelineSequenceForProject(project.id)!;
  const altTrack = state.createTimelineTrack(sequence.id, { kind: 'video', name: 'Alt Track' })!;

  state.upsertMediaAsset({
    id: 'media-video',
    name: 'Hero Shot',
    type: 'video',
    source: 'generated',
    path: '/outputs/hero.mp4',
    previewUrl: '/outputs/hero.mp4',
    thumbnailUrl: '/outputs/hero.jpg',
    posterUrl: '/outputs/hero.jpg',
    durationMs: 4000,
    fps: 24,
    metadata: {},
    createdAt: '2026-04-22T00:00:00.000Z',
  });

  const primaryTrack = useAppStore.getState().timelineTracks.find((track) => track.sequenceId === sequence.id)!;
  const clip = state.createTimelineClip({
    trackId: primaryTrack.id,
    mediaAssetId: 'media-video',
    startMs: 0,
    durationMs: 2000,
    label: 'Opening Shot',
    posterUrl: '/outputs/hero.jpg',
  })!;

  state.setActiveTimelineClip(clip.id);
  state.seekTo(1000);

  return { sequence, clip, altTrack };
}

describe('TimelineClipInspector', () => {
  beforeEach(resetStore);
  afterEach(cleanup);

  it('renders an empty state when no clip is selected', () => {
    render(<TimelineClipInspector />);

    expect(screen.getByText('Clip Inspector')).toBeInTheDocument();
    expect(screen.getByText(/Select a clip to edit timing/i)).toBeInTheDocument();
  });

  it('updates clip placement and transitions from inspector controls', async () => {
    const user = userEvent.setup();
    const { clip, altTrack } = seedTimelineFixture();

    render(<TimelineClipInspector />);

    await user.clear(screen.getByTestId('timeline-clip-label-input'));
    await user.type(screen.getByTestId('timeline-clip-label-input'), 'Updated Hero');
    expect(useAppStore.getState().timelineClips.find((item) => item.id === clip.id)?.label).toBe('Updated Hero');

    await user.selectOptions(screen.getByTestId('timeline-clip-track-select'), altTrack.id);
    expect(useAppStore.getState().timelineClips.find((item) => item.id === clip.id)?.trackId).toBe(altTrack.id);

    fireEvent.change(screen.getByTestId('timeline-clip-start-input'), { target: { value: '1.5' } });
    expect(useAppStore.getState().timelineClips.find((item) => item.id === clip.id)?.startMs).toBeGreaterThanOrEqual(1500);

    await user.selectOptions(screen.getByTestId('timeline-transition-in-type-select'), 'fade');
    fireEvent.change(screen.getByTestId('timeline-transition-in-duration-input'), { target: { value: '600' } });

    const updatedClip = useAppStore.getState().timelineClips.find((item) => item.id === clip.id);
    expect(updatedClip?.transitionIn).toEqual({ type: 'fade', durationMs: 600 });
  });

  it('splits and duplicates the selected clip from inspector actions', async () => {
    const user = userEvent.setup();
    seedTimelineFixture();

    render(<TimelineClipInspector />);

    await user.click(screen.getByTestId('timeline-inspector-split'));
    expect(useAppStore.getState().timelineClips).toHaveLength(2);

    await user.click(screen.getByTestId('timeline-inspector-duplicate'));
    expect(useAppStore.getState().timelineClips).toHaveLength(3);
  });
});
