import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { FilmGrainOverlay } from './FilmGrainOverlay';

describe('FilmGrainOverlay', () => {
  beforeAll(() => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
      () =>
        ({
          createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }),
          putImageData: () => undefined,
        }) as unknown as CanvasRenderingContext2D,
    );
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,grain');
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('paints a pre-rendered tile instead of running a per-frame loop', () => {
    const raf = vi.spyOn(window, 'requestAnimationFrame');
    render(<FilmGrainOverlay opacity={0.025} />);

    const overlay = screen.getByTestId('film-grain-overlay');
    expect(overlay.style.backgroundImage).toContain('data:image/png;base64,grain');
    expect(overlay.getAttribute('data-animated')).toBe('true');
    expect(overlay.getAttribute('aria-hidden')).toBe('true');
    expect(raf).not.toHaveBeenCalled();
  });

  it('pauses the drift while the document is hidden', () => {
    render(<FilmGrainOverlay />);
    const overlay = screen.getByTestId('film-grain-overlay');
    expect(overlay.getAttribute('data-paused')).toBe('false');

    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(overlay.getAttribute('data-paused')).toBe('true');

    visibility.mockReturnValue('visible');
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(overlay.getAttribute('data-paused')).toBe('false');
  });

  it('renders static grain when animation is off', () => {
    render(<FilmGrainOverlay animated={false} />);
    expect(screen.getByTestId('film-grain-overlay').getAttribute('data-animated')).toBe('false');
  });
});
