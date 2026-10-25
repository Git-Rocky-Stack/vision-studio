import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ImageWithFallback } from './ImageWithFallback';

describe('ImageWithFallback', () => {
  afterEach(cleanup);

  it('defaults to lazy loading and async decoding', () => {
    render(<ImageWithFallback src="/a.png" alt="Still" />);

    const image = screen.getByAltText('Still');
    expect(image).toHaveAttribute('loading', 'lazy');
    expect(image).toHaveAttribute('decoding', 'async');
  });

  // A caller's onLoad used to replace the internal one (props were spread
  // after it), so the image never left its invisible loading state.
  it('reveals the image and still calls the caller when it loads', () => {
    const onLoad = vi.fn();
    render(<ImageWithFallback src="/a.png" alt="Still" onLoad={onLoad} loading="eager" />);

    const image = screen.getByAltText('Still');
    expect(image).toHaveClass('invisible');
    expect(image).toHaveAttribute('loading', 'eager');

    fireEvent.load(image);

    expect(onLoad).toHaveBeenCalledTimes(1);
    expect(image).not.toHaveClass('invisible');
  });

  it('shows the failure state and still calls the caller on error', () => {
    const onError = vi.fn();
    render(<ImageWithFallback src="/missing.png" alt="Still" onError={onError} />);

    fireEvent.error(screen.getByAltText('Still'));

    expect(onError).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Failed to load')).toBeInTheDocument();
  });
});
