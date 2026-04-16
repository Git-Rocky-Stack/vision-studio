import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { useAppStore } from '@/store/appStore';
import { WorkbenchGalleryDock } from './WorkbenchGalleryDock';

describe('WorkbenchGalleryDock', () => {
  beforeEach(() => {
    useAppStore.setState(useAppStore.getInitialState(), true);
  });

  afterEach(cleanup);

  it('renders an empty gallery state', () => {
    render(<WorkbenchGalleryDock />);

    expect(screen.getByText('Gallery')).toBeInTheDocument();
    expect(screen.getByText('Generated outputs will appear here.')).toBeInTheDocument();
  });

  it('renders assets and batch results as recent gallery items', () => {
    useAppStore.setState({
      assetLibrary: [
        {
          id: 'asset-1',
          jobId: 'job-1',
          name: 'Neon alley',
          type: 'image',
          path: '/outputs/neon.png',
          previewUrl: '/outputs/neon.png',
          thumbnail: '/outputs/neon-thumb.png',
          createdAt: '2026-04-16T20:00:00.000Z',
          prompt: 'rainy neon alley',
          negativePrompt: '',
          favorite: false,
          params: {},
        },
      ],
      batchResults: [
        {
          id: 'batch-1',
          batchId: 'queue-1',
          promptIndex: 0,
          prompt: 'misty mountain castle',
          imagePath: '/outputs/castle.png',
          seed: 22,
          generationTime: 1.2,
          params: {},
          createdAt: new Date('2026-04-16T19:00:00.000Z'),
          isFavorite: true,
        },
      ],
    });

    render(<WorkbenchGalleryDock />);

    expect(screen.getByText('Neon alley')).toBeInTheDocument();
    expect(screen.getByText('rainy neon alley')).toBeInTheDocument();
    expect(screen.getByText('Batch result')).toBeInTheDocument();
    expect(screen.getByText('misty mountain castle')).toBeInTheDocument();
  });
});
