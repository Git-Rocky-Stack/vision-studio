import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { useAppStore } from '@/store/appStore';

import { GenerationQueue } from './GenerationQueue';

describe('GenerationQueue', () => {
  beforeEach(() => {
    useAppStore.setState(useAppStore.getInitialState());
    useAppStore.getState().addToGenerationQueue({
      id: 'queue-1',
      prompt: 'Carbon studio frame',
      thumbnail: 'data:image/png;base64,queue-thumb',
      params: { model: 'flux-dev' },
      status: 'completed',
      createdAt: new Date('2026-04-16T12:00:00Z'),
    });
  });

  afterEach(cleanup);

  it('uses accent selection styling for hovered thumbnails', async () => {
    const user = userEvent.setup();
    render(<GenerationQueue />);

    const thumbnail = screen.getByRole('button', { name: 'View generation 1' });
    await user.hover(thumbnail);

    expect(thumbnail).toHaveClass('border-accent-primary-border');
    expect(thumbnail).not.toHaveClass('border-red-primary');
    expect(screen.getByText('Click to load on canvas')).toBeInTheDocument();
  });

  it('loads a tile onto the canvas with its library path so it stays editable', async () => {
    const user = userEvent.setup();
    useAppStore.getState().updateGenerationQueueItem('queue-1', { assetPath: 'D:/Outputs/queue-1/generated.png' });
    render(<GenerationQueue />);

    await user.click(screen.getByRole('button', { name: 'View generation 1' }));

    expect(useAppStore.getState().currentImage).toBe('data:image/png;base64,queue-thumb');
    expect(useAppStore.getState().currentImageAssetPath).toBe('D:/Outputs/queue-1/generated.png');
  });

  it('falls back to the job image record for a tile recorded without a path', async () => {
    const user = userEvent.setup();
    useAppStore.setState({
      assetLibrary: [
        {
          id: 'queue-1::/outputs/queue-1/generated.png',
          jobId: 'queue-1',
          name: 'Image queue-1',
          type: 'image',
          path: 'D:/Outputs/queue-1/generated.png',
          previewUrl: 'http://localhost:8000/outputs/queue-1/generated.png',
          thumbnail: 'http://localhost:8000/outputs/queue-1/generated.png',
          createdAt: '2026-04-16T12:00:00Z',
          prompt: 'Carbon studio frame',
          negativePrompt: '',
          favorite: false,
          params: {},
        },
      ],
    });
    render(<GenerationQueue />);

    await user.click(screen.getByRole('button', { name: 'View generation 1' }));

    expect(useAppStore.getState().currentImageAssetPath).toBe('D:/Outputs/queue-1/generated.png');
  });
});
