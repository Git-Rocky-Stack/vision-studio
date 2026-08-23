import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { FrameFilmstrip, type FrameItem } from './FrameFilmstrip';

function makeFrames(...durations: number[]): FrameItem[] {
  return durations.map((duration, i) => ({
    id: `frame-${i}`,
    thumbnail: null,
    label: `Frame ${i + 1}`,
    duration,
  }));
}

describe('FrameFilmstrip', () => {
  afterEach(cleanup);

  it('renders one entry per frame with its real duration', () => {
    render(
      <FrameFilmstrip
        frames={makeFrames(750, 1250)}
        activeFrameId={null}
        onFrameSelect={vi.fn()}
        onFrameAdd={vi.fn()}
      />,
    );

    expect(screen.getByText('750ms')).toBeInTheDocument();
    expect(screen.getByText('1250ms')).toBeInTheDocument();
  });

  it('defaults the add control to "Add frame"', () => {
    render(
      <FrameFilmstrip
        frames={makeFrames(500)}
        activeFrameId={null}
        onFrameSelect={vi.fn()}
        onFrameAdd={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Add frame' })).toBeInTheDocument();
  });

  it('lets the host name the add control so the wording matches its domain', () => {
    render(
      <FrameFilmstrip
        frames={makeFrames(500)}
        activeFrameId={null}
        onFrameSelect={vi.fn()}
        onFrameAdd={vi.fn()}
        addLabel="Add keyframe"
      />,
    );

    expect(screen.getByRole('button', { name: 'Add keyframe' })).toBeInTheDocument();
  });

  it('disables the add control when the host says adding is not possible', () => {
    const onFrameAdd = vi.fn();
    render(
      <FrameFilmstrip
        frames={makeFrames(500)}
        activeFrameId={null}
        onFrameSelect={vi.fn()}
        onFrameAdd={onFrameAdd}
        addLabel="Add keyframe"
        addDisabled
      />,
    );

    const button = screen.getByRole('button', { name: 'Add keyframe' });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(onFrameAdd).not.toHaveBeenCalled();
  });

  it('selects a frame on click', () => {
    const onFrameSelect = vi.fn();
    render(
      <FrameFilmstrip
        frames={makeFrames(500, 500)}
        activeFrameId="frame-0"
        onFrameSelect={onFrameSelect}
        onFrameAdd={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Frame 2' }));
    expect(onFrameSelect).toHaveBeenCalledWith('frame-1');
  });

  it('marks the active frame as pressed', () => {
    render(
      <FrameFilmstrip
        frames={makeFrames(500, 500)}
        activeFrameId="frame-1"
        onFrameSelect={vi.fn()}
        onFrameAdd={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Frame 2' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Frame 1' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });
});
