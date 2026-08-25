import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { useAppStore } from '@/store/appStore';

import { WorkbenchGalleryDock } from './WorkbenchGalleryDock';

function resetStore() {
  useAppStore.setState(useAppStore.getInitialState());
}

describe('WorkbenchGalleryDock', () => {
  beforeEach(resetStore);

  afterEach(cleanup);

  it('renders video assets as video-aware gallery cards', () => {
    useAppStore.setState((state) => ({
      ...state,
      assetLibrary: [
        {
          id: 'video-asset-1',
          jobId: 'job-video-1',
          name: 'Storyboard clip',
          type: 'video',
          path: 'C:/vision-studio-output/clips/storyboard.mp4',
          previewUrl: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"></svg>',
          thumbnail: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"></svg>',
          createdAt: '2026-04-22T00:00:00.000Z',
          prompt: 'Storyboard clip prompt',
          negativePrompt: '',
          favorite: false,
          params: {},
        },
      ],
    }));

    render(<WorkbenchGalleryDock />);

    const reviewButton = screen.getByRole('button', { name: 'Review Storyboard clip' });

    // The card must play THIS asset. A <video> element that exists but points at
    // the poster, or at a neighbouring asset, renders a plausible-looking card
    // for the wrong clip - which presence alone cannot distinguish.
    const video = reviewButton.querySelector('video');
    expect(video).not.toBeNull();
    expect(video).toHaveAttribute('src', expect.stringContaining('storyboard.mp4'));
    expect(video).toHaveAttribute('aria-label', 'Storyboard clip');

    expect(screen.getByText('Video')).toHaveTextContent('Video');
    expect(reviewButton).toHaveTextContent('Storyboard clip prompt');
  });
});
