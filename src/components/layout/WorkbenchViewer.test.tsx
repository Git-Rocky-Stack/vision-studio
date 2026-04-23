import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAppStore } from '@/store/appStore';

import { WorkbenchViewer } from './WorkbenchViewer';

function resetStore() {
  useAppStore.setState(useAppStore.getInitialState());
}

const extractVideoFrameMock = vi.fn();

function installElectronMock() {
  window.electron = {
    generation: {
      extractVideoFrame: extractVideoFrameMock,
    },
  } as unknown as typeof window.electron;
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
  beforeEach(() => {
    resetStore();
    extractVideoFrameMock.mockReset();
    installElectronMock();
  });

  afterEach(cleanup);

  it('renders a playable video preview for video assets', () => {
    seedVideoAsset();

    render(<WorkbenchViewer />);

    expect(screen.getByText('Video review is live')).toBeInTheDocument();
    expect(screen.getByTestId('viewer-active-preview').querySelector('video')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Extract to Edit' })).toBeInTheDocument();
  });

  it('extracts a managed frame from video assets into Canvas editing', async () => {
    seedVideoAsset();
    extractVideoFrameMock.mockResolvedValue({
      image: '/outputs/frame-010/launch-frame.png',
      output_path: 'C:/vision-studio-output/frame-010/launch-frame.png',
      width: 1280,
      height: 720,
      time_ms: 0,
      frame_index: 0,
    });

    render(<WorkbenchViewer />);

    fireEvent.click(screen.getByRole('button', { name: 'Extract to Edit' }));

    await waitFor(() => {
      expect(useAppStore.getState().currentImageAssetPath).toBe(
        'C:/vision-studio-output/frame-010/launch-frame.png',
      );
    });

    expect(extractVideoFrameMock).toHaveBeenCalledWith({
      source_path: 'C:/vision-studio-output/clips/launch.mp4',
      time_ms: 0,
    });
    expect(useAppStore.getState().activeTab).toBe('canvas');
    expect(useAppStore.getState().currentImage).toBe(
      'http://localhost:8000/outputs/frame-010/launch-frame.png',
    );
  });
});
