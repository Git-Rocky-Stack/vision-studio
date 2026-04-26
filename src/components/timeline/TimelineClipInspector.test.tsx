import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
  state.setActiveProject(project.id);
  const sequence = state.ensureTimelineSequenceForProject(project.id)!;
  state.setActiveTimelineSequence(sequence.id);
  const altTrack = state.createTimelineTrack(sequence.id, { kind: 'video', name: 'Alt Track' })!;
  const scene = state.addScene(project.id, {
    name: 'Opening Scene',
    shotBeats: [
      {
        id: 'beat-1',
        orderIndex: 0,
        summary: 'Wide establish',
        promptSeed: 'wide city street',
        notes: 'Begin with a slow push in.',
        durationMs: 800,
        elementIds: [],
        metadata: {},
      },
      {
        id: 'beat-2',
        orderIndex: 1,
        summary: 'Hero reveal',
        promptSeed: 'hero enters frame',
        notes: '',
        durationMs: 1200,
        elementIds: [],
        metadata: {},
      },
    ],
  });

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
    sceneId: scene.id,
    startMs: 0,
    durationMs: 2000,
    label: 'Opening Shot',
    posterUrl: '/outputs/hero.jpg',
    storyboardDerived: true,
    storyboardDerivedAt: '2026-04-23T00:00:00.000Z',
    storyboardBeatMarkers: [
      {
        id: 'marker-1',
        sourceBeatId: 'beat-1',
        label: 'Wide establish',
        promptSeed: 'wide city street',
        notes: 'Begin with a slow push in.',
        relativeStartMs: 0,
        durationMs: 800,
        elementIds: [],
      },
      {
        id: 'marker-2',
        sourceBeatId: 'beat-2',
        label: 'Hero reveal',
        promptSeed: 'hero enters frame',
        notes: '',
        relativeStartMs: 800,
        durationMs: 1200,
        elementIds: [],
      },
    ],
  })!;

  state.setActiveTimelineClip(clip.id);
  state.seekTo(1000);

  return { sequence, clip, altTrack, scene };
}

function seedAudioTimelineFixture() {
  const state = useAppStore.getState();
  const project = state.createProject('Timeline Audio Inspector');
  state.setActiveProject(project.id);
  const sequence = state.ensureTimelineSequenceForProject(project.id)!;
  state.setActiveTimelineSequence(sequence.id);
  const audioTrack = state.createTimelineTrack(sequence.id, { kind: 'audio', name: 'Music Bed' })!;

  state.upsertMediaAsset({
    id: 'media-audio',
    name: 'Ambient Bed',
    type: 'audio',
    source: 'imported',
    path: '/imports/ambient.wav',
    previewUrl: 'file:///imports/ambient.wav',
    thumbnailUrl: 'data:image/svg+xml;base64,audio',
    posterUrl: null,
    durationMs: 5000,
    waveformSummary: [0.22, 0.48, 0.76, 0.61, 0.37, 0.55, 0.69, 0.44],
    metadata: {},
    createdAt: '2026-04-24T00:00:00.000Z',
  });

  const clip = state.createTimelineClip({
    trackId: audioTrack.id,
    mediaAssetId: 'media-audio',
    startMs: 500,
    durationMs: 2500,
    sourceInMs: 100,
    sourceOutMs: 2600,
    gain: 1,
    fadeInMs: 0,
    fadeOutMs: 0,
    label: 'Ambient Bed Clip',
  })!;

  state.setActiveTimelineClip(clip.id);
  state.seekTo(1400);

  return { clip };
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

  it('surfaces storyboard scene context and preserved beat markers', () => {
    seedTimelineFixture();

    render(<TimelineClipInspector />);

    expect(screen.getByTestId('timeline-inspector-storyboard-context')).toBeInTheDocument();
    expect(screen.getByText('Opening Scene')).toBeInTheDocument();
    expect(screen.getByTestId('timeline-inspector-beat-marker-1')).toBeInTheDocument();
    expect(screen.getByTestId('timeline-inspector-beat-marker-2')).toBeInTheDocument();
    expect(screen.getByText('Wide establish')).toBeInTheDocument();
    expect(screen.getByText('Hero reveal')).toBeInTheDocument();
  });

  it('flags storyboard placeholder media in the inspector', () => {
    const { clip, scene } = seedTimelineFixture();
    const state = useAppStore.getState();

    state.upsertMediaAsset({
      id: 'media-placeholder',
      name: 'Opening Placeholder',
      type: 'image',
      source: 'derived',
      path: 'data:image/svg+xml,<svg/>',
      previewUrl: 'data:image/svg+xml,<svg/>',
      thumbnailUrl: 'data:image/svg+xml,<svg/>',
      posterUrl: 'data:image/svg+xml,<svg/>',
      metadata: {
        storyboardPlaceholder: true,
        sceneId: scene.id,
      },
      createdAt: '2026-04-23T00:05:00.000Z',
    });
    state.updateTimelineClip(clip.id, { mediaAssetId: 'media-placeholder' });

    render(<TimelineClipInspector />);

    expect(screen.getByTestId('timeline-inspector-placeholder')).toBeInTheDocument();
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

  it('exposes a sequence export action for the active clip context', async () => {
    const user = userEvent.setup();
    const onOpenExportDialog = vi.fn();
    seedTimelineFixture();

    render(
      <TimelineClipInspector
        onOpenExportDialog={onOpenExportDialog}
        exportScopeLabel="Active Range"
      />,
    );

    expect(screen.getByText('Active Range')).toBeInTheDocument();

    await user.click(screen.getByTestId('timeline-inspector-export'));
    expect(onOpenExportDialog).toHaveBeenCalledTimes(1);
  });

  it('shows audio-specific controls and updates gain fades and playhead actions', async () => {
    const user = userEvent.setup();
    const { clip } = seedAudioTimelineFixture();

    render(<TimelineClipInspector />);

    expect(screen.getByTestId('timeline-audio-controls')).toBeInTheDocument();
    expect(screen.queryByTestId('timeline-ai-actions')).not.toBeInTheDocument();
    expect(screen.queryByTestId('timeline-transition-in-type-select')).not.toBeInTheDocument();

    fireEvent.change(screen.getByTestId('timeline-audio-gain-input'), { target: { value: '140' } });
    fireEvent.change(screen.getByTestId('timeline-audio-fade-in-input'), { target: { value: '250' } });
    fireEvent.change(screen.getByTestId('timeline-audio-fade-out-input'), { target: { value: '600' } });

    let updatedClip = useAppStore.getState().timelineClips.find((item) => item.id === clip.id);
    expect(updatedClip?.gain).toBe(1.4);
    expect(updatedClip?.fadeInMs).toBe(250);
    expect(updatedClip?.fadeOutMs).toBe(600);

    await user.click(screen.getByRole('button', { name: 'Playhead To In' }));
    expect(useAppStore.getState().currentTime).toBe(500);

    await user.click(screen.getByRole('button', { name: 'Playhead To Out' }));
    updatedClip = useAppStore.getState().timelineClips.find((item) => item.id === clip.id);
    expect(useAppStore.getState().currentTime).toBe(updatedClip!.startMs + updatedClip!.durationMs);
  });

  it('shows selected retake range controls and candidate take shell', async () => {
    const user = userEvent.setup();
    const { clip } = seedTimelineFixture();
    const state = useAppStore.getState();

    const range = state.createTimelineClipRetakeRange(clip.id, {
      startMs: 250,
      endMs: 1100,
    })!;
    const take = state.createClipRetakeTake({
      clipId: clip.id,
      retakeRangeId: range.id,
      mediaAssetId: 'media-video',
      prompt: 'hero retake candidate',
    })!;

    render(<TimelineClipInspector />);

    expect(screen.getByTestId('timeline-retake-controls')).toBeInTheDocument();
    expect(screen.getByTestId(`timeline-retake-range-${range.id}`)).toBeInTheDocument();
    expect(screen.getByTestId(`timeline-retake-take-${take.id}`)).toBeInTheDocument();
    expect(screen.getByTestId('timeline-retake-candidates')).toHaveTextContent('1 candidate take');

    fireEvent.change(screen.getByTestId('timeline-retake-start-input'), { target: { value: '0.4' } });
    expect(
      useAppStore.getState().timelineClips
        .find((item) => item.id === clip.id)
        ?.retakeRanges.find((item) => item.id === range.id)
        ?.startMs,
    ).toBe(400);

    await user.click(screen.getByRole('button', { name: 'Playhead To Out' }));
    expect(useAppStore.getState().currentTime).toBeGreaterThanOrEqual(clip.startMs + 1000);

    await user.click(screen.getByTestId('timeline-retake-inspector-accept'));
    expect(useAppStore.getState().clipRetakeTakes.find((item) => item.id === take.id)?.status).toBe('accepted');

    await user.click(screen.getByTestId('timeline-retake-inspector-revert'));
    expect(useAppStore.getState().clipRetakeTakes.find((item) => item.id === take.id)?.status).toBe('candidate');

    await user.click(screen.getByTestId('timeline-retake-inspector-reject'));
    expect(useAppStore.getState().clipRetakeTakes.find((item) => item.id === take.id)?.status).toBe('rejected');

    await user.click(screen.getByTestId('timeline-retake-delete-range'));
    expect(
      useAppStore.getState().timelineClips.find((item) => item.id === clip.id)?.retakeRanges,
    ).toEqual([]);
  });

  it('selects the newest candidate take when a retake range is chosen', async () => {
    const user = userEvent.setup();
    const { clip } = seedTimelineFixture();
    const state = useAppStore.getState();

    state.upsertMediaAsset({
      id: 'media-video-retake-2',
      name: 'Hero Shot Retake 2',
      type: 'video',
      source: 'generated',
      path: '/outputs/hero-retake-2.mp4',
      previewUrl: '/outputs/hero-retake-2.mp4',
      thumbnailUrl: '/outputs/hero-retake-2.jpg',
      posterUrl: '/outputs/hero-retake-2.jpg',
      durationMs: 4000,
      fps: 24,
      metadata: {},
      createdAt: '2026-04-24T00:00:00.000Z',
    });

    const range = state.createTimelineClipRetakeRange(clip.id, {
      startMs: 250,
      endMs: 1100,
    })!;
    const firstTake = state.createClipRetakeTake({
      clipId: clip.id,
      retakeRangeId: range.id,
      mediaAssetId: 'media-video',
      prompt: 'first pass',
    })!;
    const secondTake = state.createClipRetakeTake({
      clipId: clip.id,
      retakeRangeId: range.id,
      mediaAssetId: 'media-video-retake-2',
      prompt: 'second pass',
    })!;

    useAppStore.setState((current) => ({
      clipRetakeTakes: current.clipRetakeTakes.map((take) =>
        take.id === firstTake.id
          ? { ...take, createdAt: '2026-04-24T00:01:00.000Z' }
          : take.id === secondTake.id
            ? { ...take, createdAt: '2026-04-24T00:02:00.000Z' }
            : take,
      ),
      activeTimelineRetakeRangeId: null,
      activeTimelineRetakeTakeId: null,
    }));

    render(<TimelineClipInspector />);

    await user.click(screen.getByTestId(`timeline-retake-range-${range.id}`));

    expect(useAppStore.getState().activeTimelineRetakeTakeId).toBe(secondTake.id);
  });

  it('shows retake blocked messaging for non-video clips', () => {
    seedAudioTimelineFixture();

    render(<TimelineClipInspector />);

    expect(screen.getByTestId('timeline-retake-blocked')).toBeInTheDocument();
    expect(screen.getByTestId('timeline-retake-controls')).toHaveTextContent('Retakes are only available for video clips.');
  });
});
