import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { FilmGrainOverlay } from './FilmGrainOverlay';
import {
  FILM_GRAIN_STORAGE_KEY,
  resetFilmGrainModeForTests,
  setFilmGrainMode,
} from '@/features/theme/filmGrainPreference';

/** jsdom without a URL has no usable localStorage; the preference reads globalThis. */
function installMemoryStorage(): Storage {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, String(value)),
    removeItem: (key: string) => void values.delete(key),
    clear: () => values.clear(),
    key: (index: number) => [...values.keys()][index] ?? null,
    get length() {
      return values.size;
    },
  } as Storage;
  vi.stubGlobal('localStorage', storage);
  return storage;
}

describe('FilmGrainOverlay', () => {
  let storage: Storage;

  beforeEach(() => {
    storage = installMemoryStorage();
    resetFilmGrainModeForTests();
  });

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
    vi.unstubAllGlobals();
    resetFilmGrainModeForTests();
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

  it('sits on the overlay z-index token rather than a literal', () => {
    render(<FilmGrainOverlay />);
    expect(screen.getByTestId('film-grain-overlay')).toHaveClass('z-[var(--z-overlay)]');
  });

  it('freezes the grain when the user picks the static texture', () => {
    render(<FilmGrainOverlay />);
    act(() => {
      setFilmGrainMode('static');
    });
    expect(screen.getByTestId('film-grain-overlay').getAttribute('data-animated')).toBe('false');
  });

  it('unmounts the overlay entirely when the user turns grain off', () => {
    render(<FilmGrainOverlay />);
    expect(screen.getByTestId('film-grain-overlay')).toBeInTheDocument();
    act(() => {
      setFilmGrainMode('off');
    });
    expect(screen.queryByTestId('film-grain-overlay')).toBeNull();
    act(() => {
      setFilmGrainMode('animated');
    });
    expect(screen.getByTestId('film-grain-overlay').getAttribute('data-animated')).toBe('true');
  });

  it('restores the stored preference on the next launch', () => {
    storage.setItem(FILM_GRAIN_STORAGE_KEY, 'off');
    resetFilmGrainModeForTests();
    render(<FilmGrainOverlay />);
    expect(screen.queryByTestId('film-grain-overlay')).toBeNull();
  });

  it('persists the choice for the next launch', () => {
    render(<FilmGrainOverlay />);
    act(() => {
      setFilmGrainMode('static');
    });
    expect(storage.getItem(FILM_GRAIN_STORAGE_KEY)).toBe('static');
  });

  it('still applies the choice this session when storage refuses the write', () => {
    storage.setItem = () => {
      throw new Error('QuotaExceededError');
    };
    render(<FilmGrainOverlay />);
    let persisted = true;
    act(() => {
      persisted = setFilmGrainMode('off');
    });
    expect(persisted).toBe(false);
    expect(screen.queryByTestId('film-grain-overlay')).toBeNull();
  });

  it('falls back to the default when storage holds an unknown value', () => {
    storage.setItem(FILM_GRAIN_STORAGE_KEY, 'sparkly');
    resetFilmGrainModeForTests();
    render(<FilmGrainOverlay />);
    expect(screen.getByTestId('film-grain-overlay').getAttribute('data-animated')).toBe('true');
  });
});
