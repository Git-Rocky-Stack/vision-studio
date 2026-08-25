import { afterEach, describe, expect, it } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { VideoControls } from './VideoControls';

afterEach(cleanup);

describe('VideoControls', () => {
  // Slider is a custom role="slider" widget, so its range lives in the ARIA
  // values - which is also the only thing a screen reader can read out.
  it('renders the duration slider on its documented 1-10 second range', () => {
    render(<VideoControls />);
    const duration = screen.getByRole('slider', { name: 'Duration (seconds)' });
    expect(duration).toHaveAttribute('aria-valuenow', '3');
    expect(duration).toHaveAttribute('aria-valuemin', '1');
    expect(duration).toHaveAttribute('aria-valuemax', '10');
  });

  it('reflects a supplied duration rather than the default', () => {
    render(<VideoControls duration={7} />);
    expect(screen.getByRole('slider', { name: 'Duration (seconds)' })).toHaveAttribute(
      'aria-valuenow',
      '7'
    );
  });

  // data-active is what paints the selected FPS. Asserting only that the four
  // buttons exist would pass even if every one of them read as selected.
  it('marks exactly the active FPS option, not all of them', () => {
    render(<VideoControls fps={16} />);
    expect(screen.getByText('Frames per second')).toBeInTheDocument();
    expect(screen.getByLabelText('16 FPS')).toHaveAttribute('data-active', 'true');
    for (const inactive of ['8 FPS', '12 FPS', '24 FPS']) {
      expect(screen.getByLabelText(inactive)).toHaveAttribute('data-active', 'false');
    }
  });

  it('renders the motion strength slider on its documented 0.1-1 range', () => {
    render(<VideoControls />);
    const motionStrength = screen.getByRole('slider', { name: 'Motion strength' });
    expect(motionStrength).toHaveAttribute('aria-valuenow', '0.5');
    expect(motionStrength).toHaveAttribute('aria-valuemin', '0.1');
    expect(motionStrength).toHaveAttribute('aria-valuemax', '1');
  });

  it('drives the loop toggle from the loop prop', () => {
    const { rerender } = render(<VideoControls loop={false} />);
    expect(screen.getByRole('switch', { name: 'Loop video' })).not.toBeChecked();

    rerender(<VideoControls loop />);
    expect(screen.getByRole('switch', { name: 'Loop video' })).toBeChecked();
  });
});
