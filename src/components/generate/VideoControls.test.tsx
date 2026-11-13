import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { VideoControls, VIDEO_FPS_OPTIONS } from './VideoControls';

afterEach(cleanup);

function renderControls(overrides: Partial<Parameters<typeof VideoControls>[0]> = {}) {
  const props = {
    duration: 3,
    fps: 24,
    onDurationChange: vi.fn(),
    onFpsChange: vi.fn(),
    ...overrides,
  };
  render(<VideoControls {...props} />);
  return props;
}

describe('VideoControls', () => {
  // Slider is a custom role="slider" widget, so its range lives in the ARIA
  // values - which is also the only thing a screen reader can read out.
  it('renders the duration slider on the backend 1-10 second range', () => {
    renderControls();
    const duration = screen.getByRole('slider', { name: 'Duration (seconds)' });
    expect(duration).toHaveAttribute('aria-valuenow', '3');
    expect(duration).toHaveAttribute('aria-valuemin', '1');
    expect(duration).toHaveAttribute('aria-valuemax', '10');
  });

  it('reports a duration change to the store-backed handler', () => {
    const props = renderControls({ duration: 7 });
    const duration = screen.getByRole('slider', { name: 'Duration (seconds)' });
    expect(duration).toHaveAttribute('aria-valuenow', '7');
    fireEvent.keyDown(duration, { key: 'ArrowRight' });
    expect(props.onDurationChange).toHaveBeenCalledWith(8);
  });

  // data-active is what paints the selected FPS. Asserting only that the
  // buttons exist would pass even if every one of them read as selected.
  it('marks exactly the active FPS option, not all of them', () => {
    renderControls({ fps: 16 });
    expect(screen.getByLabelText('16 FPS')).toHaveAttribute('data-active', 'true');
    expect(screen.getByLabelText('16 FPS')).toHaveAttribute('aria-pressed', 'true');
    for (const inactive of ['12 FPS', '24 FPS', '30 FPS']) {
      expect(screen.getByLabelText(inactive)).toHaveAttribute('data-active', 'false');
    }
  });

  it('only offers frame rates the backend accepts (12-60)', () => {
    renderControls();
    for (const option of VIDEO_FPS_OPTIONS) {
      expect(option).toBeGreaterThanOrEqual(12);
      expect(option).toBeLessThanOrEqual(60);
    }
    expect(screen.queryByLabelText('8 FPS')).toBeNull();
  });

  it('reports an FPS choice to the store-backed handler', async () => {
    const user = userEvent.setup();
    const props = renderControls();
    await user.click(screen.getByLabelText('30 FPS'));
    expect(props.onFpsChange).toHaveBeenCalledWith(30);
  });

  it('shows a non-preset frame rate instead of hiding it', () => {
    renderControls({ fps: 48 });
    expect(screen.getAllByText('48 fps').length).toBeGreaterThan(0);
    for (const option of VIDEO_FPS_OPTIONS) {
      expect(screen.getByLabelText(`${option} FPS`)).toHaveAttribute('data-active', 'false');
    }
  });

  it('has no inert controls: no motion strength and no loop toggle', () => {
    renderControls();
    expect(screen.queryByRole('slider', { name: 'Motion strength' })).toBeNull();
    expect(screen.queryByRole('switch', { name: 'Loop video' })).toBeNull();
  });

  it('collapses and expands from a keyboard-operable header button', async () => {
    const user = userEvent.setup();
    renderControls();
    const header = screen.getByRole('button', { name: /video settings/i });
    expect(header).toHaveAttribute('aria-expanded', 'true');
    header.focus();
    await user.keyboard('{Enter}');
    expect(header).toHaveAttribute('aria-expanded', 'false');
  });
});
