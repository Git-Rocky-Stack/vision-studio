import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { useAppStore } from '@/store/appStore';
import type { Keyframe } from '@/types/timeline';

import { AnimationTrackEditor } from './AnimationTrackEditor';

function resetStore() {
  useAppStore.setState(useAppStore.getInitialState());
}

function makeKeyframe(overrides: Partial<Keyframe> = {}): Keyframe {
  return {
    id: 'kf-1',
    entityId: 'layer-a',
    entityType: 'layer',
    property: 'opacity',
    time: 0,
    value: 1,
    interpolation: 'linear',
    easingStrength: 0.5,
    ...overrides,
  };
}

function seedKeyframes(...keyframes: Keyframe[]) {
  useAppStore.setState({ keyframes });
}

describe('AnimationTrackEditor: empty state', () => {
  beforeEach(resetStore);
  afterEach(cleanup);

  it('offers a way to create the first keyframe instead of a dead end', () => {
    useAppStore.setState({ editLayers: [], keyframes: [] });
    render(<AnimationTrackEditor />);

    expect(screen.getByRole('button', { name: /add keyframe/i })).toBeInTheDocument();
  });
});

describe('AnimationTrackEditor: frame durations', () => {
  beforeEach(resetStore);
  afterEach(cleanup);

  it('reports the real gap between keyframes, never a fixed placeholder', () => {
    seedKeyframes(
      makeKeyframe({ id: 'kf-1', time: 0 }),
      makeKeyframe({ id: 'kf-2', time: 750 }),
      makeKeyframe({ id: 'kf-3', time: 2000 }),
    );
    render(<AnimationTrackEditor />);

    expect(screen.getByText('750ms')).toBeInTheDocument();
    expect(screen.getByText('1250ms')).toBeInTheDocument();
    // The old build hardcoded `duration: 100` on every frame.
    expect(screen.queryByText('100ms')).not.toBeInTheDocument();
  });

  it('groups keyframes that share a time into a single frame', () => {
    seedKeyframes(
      makeKeyframe({ id: 'kf-1', entityId: 'layer-a', time: 0 }),
      makeKeyframe({ id: 'kf-2', entityId: 'layer-b', time: 0 }),
      makeKeyframe({ id: 'kf-3', entityId: 'layer-a', time: 500 }),
    );
    render(<AnimationTrackEditor />);

    expect(screen.getAllByRole('button', { name: /^Frame \d+$/ })).toHaveLength(2);
  });
});

describe('AnimationTrackEditor: adding keyframes', () => {
  beforeEach(resetStore);
  afterEach(cleanup);

  it('adds a real keyframe at the playhead for the selected layer', () => {
    useAppStore.setState({
      keyframes: [],
      editLayers: [
        {
          id: 'layer-a',
          name: 'Text 1',
          type: 'text',
          visible: true,
          locked: false,
          opacity: 1,
          blendMode: 'normal',
        },
      ] as never,
      selectedEditLayerId: 'layer-a',
      currentTime: 1200,
    });
    render(<AnimationTrackEditor />);

    fireEvent.click(screen.getByRole('button', { name: /add keyframe/i }));

    const keyframes = useAppStore.getState().keyframes;
    expect(keyframes).toHaveLength(1);
    expect(keyframes[0].entityId).toBe('layer-a');
    expect(keyframes[0].entityType).toBe('layer');
    expect(keyframes[0].time).toBe(1200);
  });

  it('does not add a duplicate keyframe for the same layer at the same time', () => {
    useAppStore.setState({
      keyframes: [makeKeyframe({ id: 'kf-1', entityId: 'layer-a', time: 1200 })],
      editLayers: [
        {
          id: 'layer-a',
          name: 'Text 1',
          type: 'text',
          visible: true,
          locked: false,
          opacity: 1,
          blendMode: 'normal',
        },
      ] as never,
      selectedEditLayerId: 'layer-a',
      currentTime: 1200,
    });
    render(<AnimationTrackEditor />);

    fireEvent.click(screen.getByRole('button', { name: /add keyframe/i }));

    expect(useAppStore.getState().keyframes).toHaveLength(1);
  });

  it('disables the add control with an explanation when no layer is selected', () => {
    useAppStore.setState({ keyframes: [], editLayers: [], selectedEditLayerId: null });
    render(<AnimationTrackEditor />);

    expect(screen.getByRole('button', { name: /add keyframe/i })).toBeDisabled();
  });
});

describe('AnimationTrackEditor: editing a keyframe', () => {
  beforeEach(resetStore);
  afterEach(cleanup);

  it('lets the selected keyframe change its interpolation', () => {
    seedKeyframes(makeKeyframe({ id: 'kf-1', time: 0, interpolation: 'linear' }));
    useAppStore.setState({ activeKeyframeId: 'kf-1' });
    render(<AnimationTrackEditor />);

    fireEvent.change(screen.getByLabelText(/interpolation/i), {
      target: { value: 'ease-in-out' },
    });

    expect(useAppStore.getState().keyframes[0].interpolation).toBe('ease-in-out');
  });

  it('deletes the selected keyframe', () => {
    seedKeyframes(
      makeKeyframe({ id: 'kf-1', time: 0 }),
      makeKeyframe({ id: 'kf-2', time: 500 }),
    );
    useAppStore.setState({ activeKeyframeId: 'kf-1' });
    render(<AnimationTrackEditor />);

    fireEvent.click(screen.getByRole('button', { name: /delete keyframe/i }));

    const keyframes = useAppStore.getState().keyframes;
    expect(keyframes).toHaveLength(1);
    expect(keyframes[0].id).toBe('kf-2');
    expect(useAppStore.getState().activeKeyframeId).toBeNull();
  });

  it('shows no keyframe inspector until one is selected', () => {
    seedKeyframes(makeKeyframe({ id: 'kf-1', time: 0 }));
    useAppStore.setState({ activeKeyframeId: null });
    render(<AnimationTrackEditor />);

    expect(screen.queryByLabelText(/interpolation/i)).not.toBeInTheDocument();
  });
});

describe('AnimationTrackEditor: track naming', () => {
  beforeEach(resetStore);
  afterEach(cleanup);

  it('labels a track with the real layer name rather than its raw id', () => {
    useAppStore.setState({
      keyframes: [makeKeyframe({ id: 'kf-1', entityId: 'layer-a', time: 0 })],
      editLayers: [
        {
          id: 'layer-a',
          name: 'Headline Text',
          type: 'text',
          visible: true,
          locked: false,
          opacity: 1,
          blendMode: 'normal',
        },
      ] as never,
    });
    render(<AnimationTrackEditor />);

    expect(screen.getByText('Headline Text')).toBeInTheDocument();
  });
});
