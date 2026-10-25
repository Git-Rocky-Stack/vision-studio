import { cleanup, render, screen, within } from '@testing-library/react';
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

    // A gallery tile draws THIS asset's poster, not a <video>: every mounted
    // video element opens the file to read its metadata, which for a grid of
    // clips is a media pipeline per thumbnail. The viewer plays the clip.
    expect(reviewButton.querySelector('video')).toBeNull();
    const poster = within(reviewButton).getByAltText('Storyboard clip');
    expect(poster.tagName).toBe('IMG');
    expect(poster).toHaveAttribute('src', expect.stringContaining('data:image/svg+xml'));
    expect(poster).toHaveAttribute('loading', 'lazy');

    expect(screen.getByText('Video')).toHaveTextContent('Video');
    expect(reviewButton).toHaveTextContent('Storyboard clip prompt');
  });
});
