import { cleanup, render, screen } from '@testing-library/react';
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
});
