import { afterEach, describe, expect, it } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { VideoControls } from './VideoControls';

afterEach(cleanup);

describe('VideoControls', () => {
  it('renders duration slider', () => {
    render(<VideoControls />);
    expect(screen.getByLabelText('Duration (seconds)')).toBeInTheDocument();
  });

  it('renders FPS selector with all options', () => {
    render(<VideoControls />);
    expect(screen.getByText('Frames per second')).toBeInTheDocument();
    expect(screen.getByLabelText('8 FPS')).toBeInTheDocument();
    expect(screen.getByLabelText('12 FPS')).toBeInTheDocument();
    expect(screen.getByLabelText('16 FPS')).toBeInTheDocument();
    expect(screen.getByLabelText('24 FPS')).toBeInTheDocument();
  });

  it('renders motion strength slider', () => {
    render(<VideoControls />);
    expect(screen.getByLabelText('Motion strength')).toBeInTheDocument();
  });

  it('renders loop toggle', () => {
    render(<VideoControls />);
    expect(screen.getByRole('switch', { name: 'Loop video' })).toBeInTheDocument();
  });
});
