import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { useAppStore } from '@/store/appStore';
import type { AssetRecord } from '@/types/assets';

import { LaunchpadPanel } from './LaunchpadPanel';

function resetStore() {
  useAppStore.setState(useAppStore.getInitialState());
}

function seedAssets(count: number) {
  const assets: AssetRecord[] = Array.from({ length: count }, (_, i) => ({
    id: `asset-${i}`,
    jobId: `job-${i}`,
    name: `render-${i}.png`,
    type: 'image',
    path: `C:/out/render-${i}.png`,
    previewUrl: `file:///C:/out/render-${i}.png`,
    thumbnail: `file:///C:/out/thumb-${i}.png`,
    // Ascending timestamps: asset-(count-1) is the most recent.
    createdAt: new Date(1_700_000_000_000 + i * 60_000).toISOString(),
    prompt: `prompt ${i}`,
    negativePrompt: '',
    model: 'sdxl',
    favorite: false,
    params: {},
  }));
  useAppStore.setState({ assetLibrary: assets });
  return assets;
}

describe('LaunchpadPanel: quick actions', () => {
  beforeEach(resetStore);
  afterEach(cleanup);

  it('starts a full generation', () => {
    render(<LaunchpadPanel />);
    fireEvent.click(screen.getByRole('button', { name: /new generation/i }));

    const state = useAppStore.getState();
    expect(state.activeTab).toBe('generate');
    expect(state.activeSubMode).toBe('generate');
    expect(state.centerView).toBe('canvas');
  });

  it('starts a quick generation', () => {
    render(<LaunchpadPanel />);
    fireEvent.click(screen.getByRole('button', { name: /quick generate/i }));

    expect(useAppStore.getState().activeSubMode).toBe('quick');
  });

  it('starts a batch run', () => {
    render(<LaunchpadPanel />);
    fireEvent.click(screen.getByRole('button', { name: /batch run/i }));

    expect(useAppStore.getState().activeSubMode).toBe('batch');
  });

  it('opens the storyboard', () => {
    render(<LaunchpadPanel />);
    fireEvent.click(screen.getByRole('button', { name: /storyboard/i }));

    const state = useAppStore.getState();
    expect(state.activeTab).toBe('story');
    expect(state.activeSubMode).toBe('storyboard');
  });
});

describe('LaunchpadPanel: recent work', () => {
  beforeEach(resetStore);
  afterEach(cleanup);

  it('lists the most recent renders newest first', () => {
    seedAssets(3);
    render(<LaunchpadPanel />);

    const thumbs = screen.getAllByRole('img');
    expect(thumbs[0]).toHaveAttribute('src', 'file:///C:/out/thumb-2.png');
    expect(thumbs[2]).toHaveAttribute('src', 'file:///C:/out/thumb-0.png');
  });

  it('caps the recent strip rather than rendering the whole library', () => {
    seedAssets(20);
    render(<LaunchpadPanel />);

    expect(screen.getAllByRole('img').length).toBeLessThanOrEqual(8);
  });

  it('opens a recent render in the viewer', () => {
    seedAssets(2);
    render(<LaunchpadPanel />);

    fireEvent.click(screen.getByRole('button', { name: /open render-1\.png/i }));

    const state = useAppStore.getState();
    expect(state.centerView).toBe('viewer');
    expect(state.activeViewerItemId).toBe('asset-1');
  });

  it('says the library is empty instead of showing a hollow strip', () => {
    render(<LaunchpadPanel />);
    expect(screen.getByText(/no renders yet/i)).toBeInTheDocument();
  });
});

describe('LaunchpadPanel: projects', () => {
  beforeEach(resetStore);
  afterEach(cleanup);

  it('lists existing projects', () => {
    useAppStore.getState().createProject('Space Opera');
    render(<LaunchpadPanel />);

    expect(screen.getByRole('button', { name: /open project space opera/i })).toBeInTheDocument();
  });

  it('activates a project and opens the storyboard', () => {
    const project = useAppStore.getState().createProject('Space Opera');
    useAppStore.setState({ activeProjectId: null });
    render(<LaunchpadPanel />);

    fireEvent.click(screen.getByRole('button', { name: /open project space opera/i }));

    const state = useAppStore.getState();
    expect(state.activeProjectId).toBe(project.id);
    expect(state.activeTab).toBe('story');
  });

  it('creates a project when there are none', () => {
    render(<LaunchpadPanel />);

    fireEvent.click(screen.getByRole('button', { name: /new project/i }));

    expect(useAppStore.getState().projects).toHaveLength(1);
    expect(useAppStore.getState().activeProjectId).not.toBeNull();
  });

  it('reports the real scene count for a project', () => {
    const project = useAppStore.getState().createProject('Space Opera');
    useAppStore.getState().addScene(project.id);
    useAppStore.getState().addScene(project.id);
    render(<LaunchpadPanel />);

    expect(screen.getByText('2 scenes')).toBeInTheDocument();
  });
});
