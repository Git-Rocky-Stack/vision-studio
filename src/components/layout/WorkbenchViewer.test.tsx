import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { useAppStore } from '@/store/appStore';
import { WorkbenchViewer } from './WorkbenchViewer';

describe('WorkbenchViewer', () => {
  beforeEach(() => {
    useAppStore.setState(useAppStore.getInitialState(), true);
  });

  afterEach(cleanup);

  it('renders an empty review state', () => {
    render(<WorkbenchViewer />);

    expect(screen.getByText('Outputs will appear here.')).toBeInTheDocument();
  });

  it('uses the newest asset as the active preview with metadata', () => {
    seedViewerState();

    render(<WorkbenchViewer />);

    expect(screen.getByText('Neon marketplace')).toBeInTheDocument();
    expect(screen.getByText('rainy neon marketplace')).toBeInTheDocument();
    expect(screen.getByText('flux-dev')).toBeInTheDocument();
    expect(screen.getByText('123')).toBeInTheDocument();
  });

  it('uses the shared active viewer item when opened from a dock selection', () => {
    seedViewerState({ activeViewerItemId: 'batch-batch-1' });

    render(<WorkbenchViewer />);

    expect(screen.getByText('misty mountain castle')).toBeInTheDocument();
    expect(screen.getByText('Batch result')).toBeInTheDocument();
  });

  it('selects a batch result from the thumbnail rail', async () => {
    const user = userEvent.setup();
    seedViewerState();

    render(<WorkbenchViewer />);
    await user.click(screen.getByRole('button', { name: /review Batch result/i }));

    expect(screen.getByText('misty mountain castle')).toBeInTheDocument();
    expect(screen.getByText('Batch result')).toBeInTheDocument();
  });

  it('sends the active output to Edit', async () => {
    const user = userEvent.setup();
    seedViewerState();

    render(<WorkbenchViewer />);
    await user.click(screen.getByRole('button', { name: 'Send to Edit' }));

    const state = useAppStore.getState();
    expect(state.activePanel).toBe('edit');
    expect(state.currentImage).toBe('/outputs/neon.png');
    expect(state.currentImageAssetPath).toBe('/outputs/neon.png');
  });

  it('branches the active output into a generation draft', async () => {
    const user = userEvent.setup();
    seedViewerState({ activeWorkbenchView: 'viewer' });

    render(<WorkbenchViewer />);
    await user.click(screen.getByRole('button', { name: 'Branch Variant' }));

    const state = useAppStore.getState();
    expect(state.activePanel).toBe('generate');
    expect(state.activeWorkbenchView).toBe('canvas');
    expect(state.generationDraft).toMatchObject({
      generationType: 'image',
      prompt: 'rainy neon marketplace',
      negativePrompt: '',
      width: 1024,
      height: 1024,
      steps: 25,
      cfgScale: 7.5,
      model: 'flux-dev',
      scheduler: 'Euler a',
      seed: 123,
    });
  });

  it('pins the active output for comparison', async () => {
    const user = userEvent.setup();
    seedViewerState();

    render(<WorkbenchViewer />);
    await user.click(screen.getByRole('button', { name: 'Pin Compare' }));

    expect(useAppStore.getState().comparisonImages).toEqual(['/outputs/neon.png']);
  });

  it('renders a compare review surface when two outputs are pinned', () => {
    seedViewerState({
      comparisonImages: ['/outputs/neon.png', '/outputs/castle.png'],
      comparisonMode: 'side-by-side',
    });

    render(<WorkbenchViewer />);

    const compareReview = screen.getByRole('region', { name: 'Compare review' });
    expect(within(compareReview).getByText('2 pinned')).toBeInTheDocument();
    expect(within(compareReview).getByAltText('Compare Neon marketplace')).toBeInTheDocument();
    expect(within(compareReview).getByAltText('Compare Batch result')).toBeInTheDocument();
  });

  it('clears pinned comparison outputs from the compare review surface', async () => {
    const user = userEvent.setup();
    seedViewerState({
      comparisonImages: ['/outputs/neon.png', '/outputs/castle.png'],
      comparisonMode: 'side-by-side',
    });

    render(<WorkbenchViewer />);
    await user.click(screen.getByRole('button', { name: 'Clear Compare' }));

    const state = useAppStore.getState();
    expect(state.comparisonImages).toEqual([]);
    expect(state.comparisonMode).toBe('off');
  });

  it('starts side-by-side comparison mode when a second output is pinned', async () => {
    const user = userEvent.setup();
    seedViewerState({ comparisonImages: ['/outputs/neon.png'] });

    render(<WorkbenchViewer />);
    await user.click(screen.getByRole('button', { name: /review Batch result/i }));
    await user.click(screen.getByRole('button', { name: 'Pin Compare' }));

    const state = useAppStore.getState();
    expect(state.comparisonImages).toEqual(['/outputs/neon.png', '/outputs/castle.png']);
    expect(state.comparisonMode).toBe('side-by-side');
  });

  it('switches compare review modes from the Viewer controls', async () => {
    const user = userEvent.setup();
    seedViewerState({
      comparisonImages: ['/outputs/neon.png', '/outputs/castle.png'],
      comparisonMode: 'side-by-side',
    });

    render(<WorkbenchViewer />);
    await user.click(screen.getByRole('button', { name: 'Slider' }));

    expect(useAppStore.getState().comparisonMode).toBe('slider');
    expect(screen.getByRole('button', { name: 'Slider' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('slider', { name: 'Comparison split' })).toBeInTheDocument();
  });

  it('renders onion skin controls for pinned outputs', () => {
    seedViewerState({
      comparisonImages: ['/outputs/neon.png', '/outputs/castle.png'],
      comparisonMode: 'onion',
    });

    render(<WorkbenchViewer />);

    expect(screen.getByAltText('Onion base Neon marketplace')).toBeInTheDocument();
    expect(screen.getByAltText('Onion overlay Batch result')).toBeInTheDocument();
    expect(screen.getByRole('slider', { name: 'Overlay opacity' })).toHaveValue('50');
  });

  it('renders all pinned outputs in grid comparison mode', () => {
    seedViewerState({
      comparisonImages: ['/outputs/neon.png', '/outputs/castle.png'],
      comparisonMode: 'grid',
    });

    render(<WorkbenchViewer />);

    const compareGrid = screen.getByRole('list', { name: 'Pinned comparison outputs' });
    expect(within(compareGrid).getByAltText('Grid compare Neon marketplace')).toBeInTheDocument();
    expect(within(compareGrid).getByAltText('Grid compare Batch result')).toBeInTheDocument();
  });
});

function seedViewerState(overrides: Partial<ReturnType<typeof useAppStore.getState>> = {}) {
  useAppStore.setState({
    assetLibrary: [
      {
        id: 'asset-1',
        jobId: 'job-1',
        name: 'Neon marketplace',
        type: 'image',
        path: '/outputs/neon.png',
        previewUrl: '/outputs/neon.png',
        thumbnail: '/outputs/neon-thumb.png',
        createdAt: '2026-04-16T20:00:00.000Z',
        prompt: 'rainy neon marketplace',
        negativePrompt: '',
        model: 'flux-dev',
        seed: 123,
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
        assetPath: '/outputs/castle.png',
        seed: 22,
        generationTime: 1.2,
        params: {},
        createdAt: new Date('2026-04-16T19:00:00.000Z'),
        isFavorite: true,
      },
    ],
    ...overrides,
  });
}
