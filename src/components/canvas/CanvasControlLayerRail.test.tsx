import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { useAppStore } from '@/store/appStore';
import { CanvasControlLayerRail } from './CanvasControlLayerRail';

function seedActiveScene() {
  const state = useAppStore.getState();
  const project = state.createProject('Canvas controls');
  const scene = state.addScene(project.id, { name: 'Shot 1' });

  state.setActiveProject(project.id);
  state.setActiveScene(scene.id);

  return { projectId: project.id, sceneId: scene.id };
}

function getStoredScene(projectId: string, sceneId: string) {
  return useAppStore
    .getState()
    .projects.find((project) => project.id === projectId)
    ?.scenes.find((scene) => scene.id === sceneId);
}

describe('CanvasControlLayerRail', () => {
  beforeEach(() => {
    useAppStore.setState(useAppStore.getInitialState(), true);
  });

  afterEach(cleanup);

  it('renders the empty state and creation actions for the active scene', () => {
    seedActiveScene();

    render(<CanvasControlLayerRail />);

    expect(screen.getByTestId('canvas-control-layer-rail')).toBeInTheDocument();
    expect(screen.getByText('Canvas Control Layers')).toBeInTheDocument();
    expect(screen.getByText('No control layers yet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add Control Layer' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add Reference Layer' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add Inpaint Mask' })).toBeInTheDocument();
  });

  it('creates, selects, toggles, duplicates, and deletes layers', () => {
    const { projectId, sceneId } = seedActiveScene();

    render(<CanvasControlLayerRail />);

    fireEvent.click(screen.getByRole('button', { name: 'Add Control Layer' }));
    let storedScene = getStoredScene(projectId, sceneId);
    expect(storedScene?.canvasControlLayers).toHaveLength(1);

    const firstLayer = storedScene!.canvasControlLayers[0];
    fireEvent.click(screen.getByRole('button', { name: `Hide ${firstLayer.name}` }));

    storedScene = getStoredScene(projectId, sceneId);
    expect(storedScene?.canvasControlLayers[0].visible).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'Add Reference Layer' }));
    storedScene = getStoredScene(projectId, sceneId);
    const secondLayer = storedScene!.canvasControlLayers[1];

    fireEvent.click(screen.getByRole('button', { name: `Select ${secondLayer.name}` }));
    expect(getStoredScene(projectId, sceneId)?.activeCanvasControlLayerId).toBe(secondLayer.id);

    fireEvent.click(screen.getByRole('button', { name: `Duplicate ${secondLayer.name}` }));
    storedScene = getStoredScene(projectId, sceneId);
    expect(storedScene?.canvasControlLayers).toHaveLength(3);

    const duplicate = storedScene!.canvasControlLayers[2];
    expect(duplicate.name).toContain('Copy');
    expect(storedScene?.activeCanvasControlLayerId).toBe(duplicate.id);

    fireEvent.click(screen.getByRole('button', { name: `Delete ${duplicate.name}` }));
    storedScene = getStoredScene(projectId, sceneId);
    expect(storedScene?.canvasControlLayers).toHaveLength(2);
    expect(storedScene?.activeCanvasControlLayerId).toBe(secondLayer.id);
  });
});
