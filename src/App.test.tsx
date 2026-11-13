import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import App from './App';
import { BACKGROUND_TAGGING_IDLE_MS } from './features/assets/backgroundTagging';
import { useAppStore } from './store/appStore';

vi.mock('@/../public/s2.png', () => ({
  default: '/s2.png',
}));

describe('App', () => {
  beforeEach(() => {
    useAppStore.setState(useAppStore.getInitialState(), true);
    delete (window as unknown as { electron?: unknown }).electron;
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockReturnValue({
        matches: true,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders the workbench in browser dev without the Electron preload API', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    render(<App />);

    expect(screen.getByTestId('app-header')).toBeInTheDocument();
    expect(document.getElementById('main-content')).toHaveClass('min-h-0', 'flex-1');
    expect(await screen.findByTestId('left-dock')).toHaveTextContent('Model Router');
    expect(screen.getByTestId('right-dock')).toHaveTextContent('Boards');
  });

  it('tags the Background Batch backlog once the app is idle', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(<App />);
    await screen.findByTestId('left-dock');

    // Fake timers only after mount, so the tagger's wait is the timer faked.
    vi.useFakeTimers();
    try {
      useAppStore.setState({
        taggingMode: 'background-batch',
        assetLibrary: [{
          id: 'asset-bg',
          jobId: 'job-bg',
          name: 'render.png',
          type: 'image',
          path: 'C:/out/render.png',
          previewUrl: 'file:///C:/out/render.png',
          thumbnail: '',
          createdAt: new Date(1_700_000_000_000).toISOString(),
          prompt: 'a cinematic portrait',
          negativePrompt: '',
          model: 'sdxl',
          favorite: false,
          params: {},
        }],
      });
      useAppStore.getState().enqueueForTagging(['asset-bg']);

      vi.advanceTimersByTime(BACKGROUND_TAGGING_IDLE_MS);

      expect(useAppStore.getState().assetMetadata.has('asset-bg')).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  describe('workspace shortcuts', () => {
    it('does not undo behind an open modal dialog', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const undo = vi.fn();
      useAppStore.setState({ undo });
      render(<App />);
      await screen.findByTestId('left-dock');

      const modal = document.createElement('div');
      modal.setAttribute('aria-modal', 'true');
      document.body.appendChild(modal);
      try {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true }));
        expect(undo).not.toHaveBeenCalled();
      } finally {
        modal.remove();
      }

      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true }));
      expect(undo).toHaveBeenCalledTimes(1);
    });
  });

  it('keeps the backend-reported feature availability in the store', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const availability = { tensorrt: { available: false, reason: 'Not bundled.' } };
    (window as unknown as { electron: unknown }).electron = {
      system: {
        getInfo: vi.fn().mockResolvedValue({
          gpu_available: true,
          comfyui_connected: false,
          models_count: 2,
          backendConnected: true,
          availability,
        }),
      },
    };

    render(<App />);

    await waitFor(() => expect(useAppStore.getState().systemInfo.availability).toEqual(availability));
  });

  describe('theme sync (#J6)', () => {
    it('a slow settings read cannot override a newer theme choice', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      let resolveSettings: (value: { theme: string }) => void = () => undefined;
      (window as unknown as { electron: unknown }).electron = {
        settings: {
          get: vi.fn(() => new Promise((resolve) => { resolveSettings = resolve; })),
        },
      };

      render(<App />);
      await screen.findByTestId('left-dock');
      window.dispatchEvent(new CustomEvent('vision-studio:theme-changed', { detail: { theme: 'light' } }));
      expect(document.documentElement.dataset.theme).toBe('light');

      await act(async () => {
        resolveSettings({ theme: 'dark' });
      });
      expect(document.documentElement.dataset.theme).toBe('light');
    });

    it('a failed settings read falls back to the system theme without an unhandled rejection', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      (window as unknown as { electron: unknown }).electron = {
        settings: { get: vi.fn().mockRejectedValue(new Error('IPC closed')) },
      };

      render(<App />);
      await screen.findByTestId('left-dock');
      await waitFor(() => expect(document.documentElement.dataset.theme).toBe('dark'));
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('[theme]'), expect.any(Error));
    });
  });
});
