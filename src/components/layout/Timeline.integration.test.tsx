import { describe, expect, it, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Timeline } from './Timeline';
import { useAppStore } from '@/store/appStore';
import type { Keyframe } from '@/types/timeline';

function resetStore() {
  useAppStore.setState(useAppStore.getInitialState());
}

/**
 * Framer Motion AnimatePresence renders duplicate DOM elements during
 * exit transitions. Queries by aria-label can match multiple elements,
 * so we use getAllByLabelText and take the first (the "live" one).
 */
function getByLabel(label: string): HTMLElement {
  return screen.getAllByLabelText(label)[0];
}

describe('Timeline integration', () => {
  beforeEach(resetStore);

  it('renders timeline component without crashing', () => {
    render(<Timeline />);
    // The timeline should render in expanded view by default
    expect(getByLabel('Skip to beginning')).toBeInTheDocument();
  });

  it('can switch between timeline modes', async () => {
    const user = userEvent.setup();
    render(<Timeline />);

    // Default mode is canvas
    expect(useAppStore.getState().timelineMode).toBe('canvas');

    // Switch to storyboard
    await user.click(getByLabel('storyboard mode'));
    expect(useAppStore.getState().timelineMode).toBe('storyboard');

    // Switch to animation
    await user.click(getByLabel('animation mode'));
    expect(useAppStore.getState().timelineMode).toBe('animation');

    // Switch back to canvas
    await user.click(getByLabel('canvas mode'));
    expect(useAppStore.getState().timelineMode).toBe('canvas');
  });

  it('play/pause/stop controls work via store', () => {
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
    render(<Timeline />);

    useAppStore.getState().seekTo(3000);
    expect(useAppStore.getState().currentTime).toBe(3000);

    useAppStore.getState().seekTo(-100);
    expect(useAppStore.getState().currentTime).toBe(0);
  });

  it('onion skin toggle works', async () => {
    const user = userEvent.setup();
    render(<Timeline />);

    expect(useAppStore.getState().onionSkinEnabled).toBe(false);

    const onionBtn = getByLabel('Toggle onion skin');
    await user.click(onionBtn);
    expect(useAppStore.getState().onionSkinEnabled).toBe(true);

    await user.click(onionBtn);
    expect(useAppStore.getState().onionSkinEnabled).toBe(false);
  });

  it('can add and delete keyframes', () => {
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
    expect(useAppStore.getState().keyframes[0].id).toBe('kf-1');

    useAppStore.getState().deleteKeyframe('kf-1');
    expect(useAppStore.getState().keyframes).toHaveLength(0);
  });

  it('can update keyframes', () => {
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
    useAppStore.getState().updateKeyframe('kf-1', { time: 2000, interpolation: 'ease-in' });

    const updated = useAppStore.getState().keyframes[0];
    expect(updated.time).toBe(2000);
    expect(updated.interpolation).toBe('ease-in');
  });

  it('loop and speed controls work', () => {
    render(<Timeline />);

    expect(useAppStore.getState().timelineLoop).toBe(false);
    useAppStore.getState().toggleTimelineLoop();
    expect(useAppStore.getState().timelineLoop).toBe(true);

    useAppStore.getState().setTimelineSpeed(2);
    expect(useAppStore.getState().timelineSpeed).toBe(2);
  });

  it('can collapse and expand timeline', async () => {
    const user = userEvent.setup();
    render(<Timeline />);

    // Should be expanded by default (has skip to beginning button)
    expect(getByLabel('Skip to beginning')).toBeInTheDocument();

    // Collapse
    const collapseBtn = getByLabel('Collapse timeline');
    await user.click(collapseBtn);

    // After collapse animation settles, collapsed view should be present
    await waitFor(() => {
      expect(screen.getByLabelText('Expand timeline')).toBeInTheDocument();
    });

    // Expand
    await user.click(screen.getByLabelText('Expand timeline'));

    // After expand animation settles, expanded view should be present
    await waitFor(() => {
      expect(getByLabel('Skip to beginning')).toBeInTheDocument();
    });
  });
});
