import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { CameraKeyframeEditor } from './CameraKeyframeEditor';
import type { CameraKeyframe } from '@/types/project';

const baseKeyframe: CameraKeyframe = {
  id: 'kf-1',
  time: 0,
  pan: { x: 0, y: 0 },
  zoom: 1,
  rotation: 0,
  interpolation: 'linear',
  easingStrength: 0.5,
};

describe('CameraKeyframeEditor', () => {
  afterEach(cleanup);

  it('renders pan, zoom, rotation, and interpolation controls', () => {
    render(
      <CameraKeyframeEditor
        keyframe={baseKeyframe}
        onChange={() => {}}
      />
    );

    expect(screen.getByLabelText('Pan X')).toBeInTheDocument();
    expect(screen.getByLabelText('Pan Y')).toBeInTheDocument();
    expect(screen.getByLabelText('Zoom')).toBeInTheDocument();
    expect(screen.getByLabelText('Rotation')).toBeInTheDocument();
    expect(screen.getByLabelText('Interpolation')).toBeInTheDocument();
  });

  it('hides easing strength when interpolation is linear', () => {
    render(
      <CameraKeyframeEditor
        keyframe={{ ...baseKeyframe, interpolation: 'linear' }}
        onChange={() => {}}
      />
    );

    expect(screen.queryByLabelText('Easing Strength')).not.toBeInTheDocument();
  });

  it('shows easing strength when interpolation is ease-in', () => {
    render(
      <CameraKeyframeEditor
        keyframe={{ ...baseKeyframe, interpolation: 'ease-in' }}
        onChange={() => {}}
      />
    );

    expect(screen.getByLabelText('Easing Strength')).toBeInTheDocument();
  });

  it('shows easing strength when interpolation is ease-out', () => {
    render(
      <CameraKeyframeEditor
        keyframe={{ ...baseKeyframe, interpolation: 'ease-out' }}
        onChange={() => {}}
      />
    );

    expect(screen.getByLabelText('Easing Strength')).toBeInTheDocument();
  });

  it('shows easing strength when interpolation is ease-in-out', () => {
    render(
      <CameraKeyframeEditor
        keyframe={{ ...baseKeyframe, interpolation: 'ease-in-out' }}
        onChange={() => {}}
      />
    );

    expect(screen.getByLabelText('Easing Strength')).toBeInTheDocument();
  });

  it('displays all four interpolation options in the dropdown', () => {
    render(
      <CameraKeyframeEditor
        keyframe={baseKeyframe}
        onChange={() => {}}
      />
    );

    const select = screen.getByLabelText('Interpolation') as HTMLSelectElement;
    const options = Array.from(select.options).map((o) => o.value);

    expect(options).toEqual(['linear', 'ease-in', 'ease-out', 'ease-in-out']);
  });

  it('calls onChange with updated pan values', () => {
    const onChange = vi.fn();
    render(
      <CameraKeyframeEditor
        keyframe={baseKeyframe}
        onChange={onChange}
      />
    );

    const slider = screen.getByLabelText('Pan X');
    slider.focus();

    expect(onChange).not.toHaveBeenCalled();
  });

  it('calls onChange when interpolation changes', () => {
    const onChange = vi.fn();
    render(
      <CameraKeyframeEditor
        keyframe={baseKeyframe}
        onChange={onChange}
      />
    );

    const select = screen.getByLabelText('Interpolation');
    select.focus();

    expect(onChange).not.toHaveBeenCalled();
  });

  it('renders with custom className', () => {
    const { container } = render(
      <CameraKeyframeEditor
        keyframe={baseKeyframe}
        onChange={() => {}}
        className="custom-class"
      />
    );

    expect(container.firstElementChild).toHaveClass('custom-class');
  });
});
