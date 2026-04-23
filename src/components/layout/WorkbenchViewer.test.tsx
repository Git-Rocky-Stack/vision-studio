import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { useAppStore } from '@/store/appStore';

import { WorkbenchViewer } from './WorkbenchViewer';

function resetStore() {
  useAppStore.setState(useAppStore.getInitialState());
}

function seedVideoAsset() {
  useAppStore.setState((state) => ({
    ...state,
    assetLibrary: [
      {
        id: 'video-asset-1',
        jobId: 'job-video-1',
        name: 'Launch clip',
        type: 'video',
        path: 'C:/vision-studio-output/clips/launch.mp4',
        previewUrl: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"></svg>',
        thumbnail: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"></svg>',
        createdAt: '2026-04-22T00:00:00.000Z',
        prompt: 'Launch clip prompt',
        negativePrompt: '',
        model: 'ltx-video',
        fps: 24,
        duration: 4,
        favorite: false,
        params: {
          model: 'ltx-video',
        },
      },
    ],
  }));
}

describe('WorkbenchViewer', () => {
  beforeEach(resetStore);

  afterEach(cleanup);

  it('renders a playable video preview for video assets', () => {
    seedVideoAsset();

    render(<WorkbenchViewer />);

    expect(screen.getByText('Video review is live')).toBeInTheDocument();
    expect(screen.getByTestId('viewer-active-preview').querySelector('video')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Open in Canvas' })).toBeInTheDocument();
  });

  it('routes video assets into Canvas with the poster and asset path', () => {
    seedVideoAsset();

    render(<WorkbenchViewer />);

    fireEvent.click(screen.getByRole('button', { name: 'Open in Canvas' }));

    const state = useAppStore.getState();
    expect(state.activeTab).toBe('canvas');
    expect(state.currentImage).toBe('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"></svg>');
    expect(state.currentImageAssetPath).toBe('C:/vision-studio-output/clips/launch.mp4');
  });
});
