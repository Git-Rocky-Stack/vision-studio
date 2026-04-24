import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { Timeline } from './Timeline';
import { useAppStore } from '@/store/appStore';
import type { Keyframe } from '@/types/timeline';

function resetStore() {
  useAppStore.setState(useAppStore.getInitialState());
}

function seedProjectAndMedia() {
  const state = useAppStore.getState();
  const project = state.createProject('Timeline Board');
  state.setActiveProject(project.id);
  const sequence = state.ensureTimelineSequenceForProject(project.id)!;
  state.setActiveTimelineSequence(sequence.id);

  state.upsertMediaAsset({
    id: 'media-video',
    name: 'Launch Clip',
    type: 'video',
    source: 'generated',
    path: '/outputs/launch.mp4',
    previewUrl: '/outputs/launch.mp4',
    thumbnailUrl: '/outputs/launch.jpg',
    posterUrl: '/outputs/launch.jpg',
    durationMs: 4000,
    fps: 24,
    metadata: {},
    createdAt: '2026-04-22T00:00:00.000Z',
  });

  state.upsertMediaAsset({
    id: 'media-image',
    name: 'Product Still',
    type: 'image',
    source: 'imported',
    path: '/imports/product.png',
    previewUrl: '/imports/product.png',
    thumbnailUrl: '/imports/product.png',
    posterUrl: '/imports/product.png',
    metadata: {},
    createdAt: '2026-04-22T00:01:00.000Z',
  });

  return { project, sequence };
}

describe('Timeline integration', () => {
  beforeEach(resetStore);
  afterEach(cleanup);

  it('renders timeline component without crashing', () => {
    seedProjectAndMedia();
    render(<Timeline />);

    expect(screen.getByLabelText('Skip to beginning')).toBeInTheDocument();
    expect(screen.getByLabelText('Add track')).toBeInTheDocument();
  });

  it('can switch between timeline modes', async () => {
    const user = userEvent.setup();
    seedProjectAndMedia();
    render(<Timeline />);

    expect(useAppStore.getState().timelineMode).toBe('canvas');

    await user.click(screen.getByLabelText('storyboard mode'));
    expect(useAppStore.getState().timelineMode).toBe('storyboard');

    await user.click(screen.getByLabelText('animation mode'));
    expect(useAppStore.getState().timelineMode).toBe('animation');

    await user.click(screen.getByLabelText('canvas mode'));
    expect(useAppStore.getState().timelineMode).toBe('canvas');
  });

  it('play/pause/stop controls work via store', () => {
    seedProjectAndMedia();
    render(<Timeline />);

    expect(useAppStore.getState().playState).toBe('stopped');

    useAppStore.getState().timelinePlay();
    expect(useAppStore.getState().playState).toBe('playing');

    useAppStore.getState().timelinePause();
    expect(useAppStore.getState().playState).toBe('paused');

    useAppStore.getState().timelineStop();
    expect(useAppStore.getState().playState).toBe('stopped');
  });

  it('seekTo updates currentTime', () => {
    seedProjectAndMedia();
    render(<Timeline />);

    useAppStore.getState().seekTo(3000);
    expect(useAppStore.getState().currentTime).toBe(3000);

    useAppStore.getState().seekTo(-100);
    expect(useAppStore.getState().currentTime).toBe(0);
  });

  it('onion skin toggle works', async () => {
    const user = userEvent.setup();
    seedProjectAndMedia();
    render(<Timeline />);

    expect(useAppStore.getState().onionSkinEnabled).toBe(false);

    await user.click(screen.getByLabelText('Toggle onion skin'));
    expect(useAppStore.getState().onionSkinEnabled).toBe(true);

    await user.click(screen.getByLabelText('Toggle onion skin'));
    expect(useAppStore.getState().onionSkinEnabled).toBe(false);
  });

  it('can add and delete keyframes', () => {
    seedProjectAndMedia();
    render(<Timeline />);

    const kf: Keyframe = {
      id: 'kf-1',
      entityId: 'track-1',
      entityType: 'layer',
      property: 'opacity',
      time: 1000,
      value: 1,
      interpolation: 'linear',
      easingStrength: 0.5,
    };

    useAppStore.getState().addKeyframe(kf);
    expect(useAppStore.getState().keyframes).toHaveLength(1);

    useAppStore.getState().deleteKeyframe('kf-1');
    expect(useAppStore.getState().keyframes).toHaveLength(0);
  });

  it('adds clips from selected media and supports split duplicate and delete actions', async () => {
    const user = userEvent.setup();
    seedProjectAndMedia();
    render(<Timeline />);

    await user.selectOptions(screen.getByLabelText('Media asset for timeline'), 'media-video');
    await user.click(screen.getByLabelText('Add clip to timeline'));
    expect(useAppStore.getState().timelineClips).toHaveLength(1);

    const clipId = useAppStore.getState().timelineClips[0].id;
    await user.click(screen.getByTestId(`timeline-clip-${clipId}`));
    useAppStore.getState().seekTo(1000);

    await user.click(screen.getByLabelText('Split clip'));
    expect(useAppStore.getState().timelineClips).toHaveLength(2);

    await user.click(screen.getByLabelText('Duplicate clip'));
    expect(useAppStore.getState().timelineClips).toHaveLength(3);

    await user.click(screen.getByLabelText('Delete clip'));
    await user.click(screen.getByRole('button', { name: 'Delete Clip' }));

    expect(useAppStore.getState().timelineClips).toHaveLength(2);
  });

  it('marks and clears a play range on the active sequence', async () => {
    const user = userEvent.setup();
    seedProjectAndMedia();
    render(<Timeline />);

    useAppStore.getState().seekTo(1000);
    await user.click(screen.getByLabelText('Mark range in'));

    useAppStore.getState().seekTo(2500);
    await user.click(screen.getByLabelText('Mark range out'));

    const sequence = useAppStore.getState().timelineSequences[0];
    expect(sequence.playRange).toEqual({ startMs: 1000, endMs: 2500 });

    await user.click(screen.getByLabelText('Clear play range'));
    expect(useAppStore.getState().timelineSequences[0].playRange).toBeNull();
  });

  it('opens the timeline export dialog from the transport controls', async () => {
    const user = userEvent.setup();
    seedProjectAndMedia();
    render(<Timeline />);

    await user.click(screen.getByLabelText('Export timeline as MP4'));

    expect(screen.getByTestId('timeline-export-dialog')).toBeInTheDocument();
    expect(screen.getByText('Timeline Export')).toBeInTheDocument();
  });

  it('can collapse and expand timeline', async () => {
    const user = userEvent.setup();
    seedProjectAndMedia();
    render(<Timeline />);

    expect(screen.getByLabelText('Skip to beginning')).toBeInTheDocument();

    await user.click(screen.getByLabelText('Collapse timeline'));
    await waitFor(() => {
      expect(screen.getByLabelText('Expand timeline')).toBeInTheDocument();
    });

    await user.click(screen.getByLabelText('Expand timeline'));
    await waitFor(() => {
      expect(screen.getByLabelText('Skip to beginning')).toBeInTheDocument();
    });
  });

  it('can collapse the track list and clip inspector to free timeline width', async () => {
    const user = userEvent.setup();
    seedProjectAndMedia();
    render(<Timeline />);

    expect(screen.getByTestId('timeline-track-sidebar')).toBeInTheDocument();
    expect(screen.getByTestId('timeline-clip-inspector-empty')).toBeInTheDocument();

    await user.click(screen.getByLabelText('Collapse track list'));
    expect(screen.queryByTestId('timeline-track-sidebar')).not.toBeInTheDocument();

    await user.click(screen.getByLabelText('Collapse clip inspector'));
    expect(screen.queryByTestId('timeline-clip-inspector-empty')).not.toBeInTheDocument();

    await user.click(screen.getByLabelText('Expand track list'));
    expect(screen.getByTestId('timeline-track-sidebar')).toBeInTheDocument();

    await user.click(screen.getByLabelText('Expand clip inspector'));
    expect(screen.getByTestId('timeline-clip-inspector-empty')).toBeInTheDocument();
  });

  it('supports frame stepping and stop transport controls', async () => {
    const user = userEvent.setup();
    seedProjectAndMedia();
    render(<Timeline />);

    useAppStore.getState().seekTo(1000);
    await user.click(screen.getByLabelText('Step forward one frame'));
    expect(useAppStore.getState().currentTime).toBeGreaterThan(1000);

    await user.click(screen.getByLabelText('Step backward one frame'));
    expect(useAppStore.getState().currentTime).toBe(1000);

    await user.click(screen.getByLabelText('Play'));
    expect(useAppStore.getState().playState).toBe('playing');

    await user.click(screen.getByLabelText('Stop playback'));
    expect(useAppStore.getState().playState).toBe('stopped');
    expect(useAppStore.getState().currentTime).toBe(0);
  });

  it('shows storyboard-derived scene context and beat markers on timeline clips', () => {
    const { project, sequence } = seedProjectAndMedia();
    const state = useAppStore.getState();
    const scene = state.addScene(project.id, {
      name: 'Launch Scene',
      shotBeats: [
        {
          id: 'beat-1',
          orderIndex: 0,
          summary: 'Product reveal',
          promptSeed: 'product reveal',
          notes: 'Push in to the hero frame.',
          durationMs: 1000,
          elementIds: [],
          metadata: {},
        },
      ],
    });
    const primaryTrack = state.timelineTracks.find((track) => track.sequenceId === sequence.id)!;
    const clip = state.createTimelineClip({
      trackId: primaryTrack.id,
      mediaAssetId: 'media-video',
      sceneId: scene.id,
      startMs: 0,
      durationMs: 2000,
      label: 'Launch Scene Clip',
      posterUrl: '/outputs/launch.jpg',
      storyboardDerived: true,
      storyboardDerivedAt: '2026-04-23T00:00:00.000Z',
      storyboardBeatMarkers: [
        {
          id: 'marker-1',
          sourceBeatId: 'beat-1',
          label: 'Product reveal',
          promptSeed: 'product reveal',
          notes: 'Push in to the hero frame.',
          relativeStartMs: 400,
          durationMs: 1000,
          elementIds: [],
        },
      ],
    })!;

    render(<Timeline />);

    const clipElement = screen.getByTestId(`timeline-clip-${clip.id}`);
    expect(within(clipElement).getByText('Derived')).toBeInTheDocument();
    expect(within(clipElement).getByText('Launch Scene')).toBeInTheDocument();
    expect(screen.getByTestId(`timeline-clip-beat-marker-${clip.id}-marker-1`)).toBeInTheDocument();
  });

  it('uses the active play range for skip to start and skip to end', async () => {
    const user = userEvent.setup();
    const { sequence } = seedProjectAndMedia();
    useAppStore.getState().setTimelineSequencePlayRange(sequence.id, {
      startMs: 500,
      endMs: 1500,
    });

    render(<Timeline />);

    useAppStore.getState().seekTo(1000);
    await user.click(screen.getByLabelText('Skip to end'));
    expect(useAppStore.getState().currentTime).toBe(1500);

    await user.click(screen.getByLabelText('Skip to beginning'));
    expect(useAppStore.getState().currentTime).toBe(500);
  });
});
