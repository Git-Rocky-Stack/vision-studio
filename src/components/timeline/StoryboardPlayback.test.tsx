import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { useAppStore } from '@/store/appStore';

import { StoryboardPlayback } from './StoryboardPlayback';

function resetStore() {
  useAppStore.setState(useAppStore.getInitialState());
}

/** Seed a project whose scenes carry real thumbnails and durations. */
function seedScenes(count: number) {
  const store = useAppStore.getState();
  const project = store.createProject('Onion Test');
  useAppStore.getState().setActiveProject(project.id);

  for (let i = 0; i < count; i++) {
    useAppStore.getState().addScene(project.id);
  }

  const scenes = useAppStore.getState().projects.find((p) => p.id === project.id)!.scenes;
  scenes.forEach((scene, i) => {
    useAppStore.getState().updateScene(project.id, scene.id, {
      name: `Scene ${i + 1}`,
      thumbnail: `file:///C:/thumbs/scene-${i}.png`,
      metadata: { ...scene.metadata, duration: 1000 },
    });
  });

  return useAppStore.getState().projects.find((p) => p.id === project.id)!;
}

describe('StoryboardPlayback onion skin', () => {
  beforeEach(resetStore);
  afterEach(cleanup);

  it('renders no onion skin while the feature is off', () => {
    seedScenes(3);
    useAppStore.setState({ onionSkinEnabled: false, currentTime: 1000 });
    render(<StoryboardPlayback />);

    expect(screen.queryByTestId('onion-skin-overlay')).not.toBeInTheDocument();
  });

  it('ghosts the neighbouring scenes onto the active card when enabled', () => {
    seedScenes(3);
    useAppStore.setState({
      onionSkinEnabled: true,
      onionSkinFrameCount: 1,
      onionSkinDirection: 'both',
      currentTime: 1000, // scene index 1
    });
    render(<StoryboardPlayback />);
    fireEvent.click(screen.getByRole('button', { name: /Scene 2: /i }));

    const overlay = screen.getByTestId('onion-skin-overlay');
    const ghosts = overlay.querySelectorAll('img');
    const sources = Array.from(ghosts).map((img) => img.getAttribute('src'));

    expect(sources).toContain('file:///C:/thumbs/scene-0.png');
    expect(sources).toContain('file:///C:/thumbs/scene-2.png');
    expect(sources).not.toContain('file:///C:/thumbs/scene-1.png');
  });

  it('honours the previous-only direction', () => {
    seedScenes(3);
    useAppStore.setState({
      onionSkinEnabled: true,
      onionSkinFrameCount: 1,
      onionSkinDirection: 'prev',
      currentTime: 1000,
    });
    render(<StoryboardPlayback />);
    fireEvent.click(screen.getByRole('button', { name: /Scene 2: /i }));

    const sources = Array.from(
      screen.getByTestId('onion-skin-overlay').querySelectorAll('img'),
    ).map((img) => img.getAttribute('src'));

    expect(sources).toEqual(['file:///C:/thumbs/scene-0.png']);
  });

  it('skips scenes that have no thumbnail rather than ghosting a blank', () => {
    const project = seedScenes(3);
    useAppStore.getState().updateScene(project.id, project.scenes[0].id, { thumbnail: '' });
    useAppStore.setState({
      onionSkinEnabled: true,
      onionSkinFrameCount: 1,
      onionSkinDirection: 'both',
      currentTime: 1000,
    });
    render(<StoryboardPlayback />);
    fireEvent.click(screen.getByRole('button', { name: /Scene 2: /i }));

    const sources = Array.from(
      screen.getByTestId('onion-skin-overlay').querySelectorAll('img'),
    ).map((img) => img.getAttribute('src'));

    expect(sources).toEqual(['file:///C:/thumbs/scene-2.png']);
  });

  it('exposes onion-skin depth, opacity and direction controls when enabled', () => {
    seedScenes(3);
    useAppStore.setState({ onionSkinEnabled: true, currentTime: 1000 });
    render(<StoryboardPlayback />);

    expect(screen.getByLabelText(/onion skin frames/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/onion skin opacity/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/onion skin direction/i)).toBeInTheDocument();
  });

  it('hides the onion-skin controls while the feature is off', () => {
    seedScenes(3);
    useAppStore.setState({ onionSkinEnabled: false });
    render(<StoryboardPlayback />);

    expect(screen.queryByLabelText(/onion skin frames/i)).not.toBeInTheDocument();
  });

  it('writes the depth control back to the store', () => {
    seedScenes(3);
    useAppStore.setState({ onionSkinEnabled: true, onionSkinFrameCount: 2 });
    render(<StoryboardPlayback />);

    fireEvent.change(screen.getByLabelText(/onion skin frames/i), { target: { value: '3' } });

    expect(useAppStore.getState().onionSkinFrameCount).toBe(3);
  });

  it('writes the direction control back to the store', () => {
    seedScenes(3);
    useAppStore.setState({ onionSkinEnabled: true, onionSkinDirection: 'both' });
    render(<StoryboardPlayback />);

    fireEvent.change(screen.getByLabelText(/onion skin direction/i), { target: { value: 'next' } });

    expect(useAppStore.getState().onionSkinDirection).toBe('next');
  });

  it('writes the opacity control back to the store', () => {
    seedScenes(3);
    useAppStore.setState({ onionSkinEnabled: true, onionSkinOpacity: 0.3 });
    render(<StoryboardPlayback />);

    fireEvent.change(screen.getByLabelText(/onion skin opacity/i), { target: { value: '60' } });

    expect(useAppStore.getState().onionSkinOpacity).toBeCloseTo(0.6, 5);
  });
});
