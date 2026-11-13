import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { useAppStore } from '@/store/appStore';
import { CanvasControlLayerRail, moveLayerId } from './CanvasControlLayerRail';

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
    expect(screen.getByText('No control layers yet').closest('[data-testid="empty-state"]')).not.toBeNull();
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

  function seedThreeLayers() {
    const ids = seedActiveScene();
    const state = useAppStore.getState();
    state.createCanvasControlLayer(ids.sceneId, { name: 'Alpha' });
    state.createCanvasControlLayer(ids.sceneId, { name: 'Beta' });
    state.createCanvasControlLayer(ids.sceneId, { name: 'Gamma' });
    return ids;
  }

  const order = (projectId: string, sceneId: string) =>
    getStoredScene(projectId, sceneId)?.canvasControlLayers.map((layer) => layer.name);

  it('reorders layers with the move up / move down buttons, disabled at the ends', () => {
    const { projectId, sceneId } = seedThreeLayers();
    render(<CanvasControlLayerRail />);

    expect(screen.getByRole('button', { name: 'Move Alpha up' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move Gamma down' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Move Gamma up' }));
    expect(order(projectId, sceneId)).toEqual(['Alpha', 'Gamma', 'Beta']);
    expect(screen.getByRole('status')).toHaveTextContent('Gamma moved to position 2 of 3');

    fireEvent.click(screen.getByRole('button', { name: 'Move Alpha down' }));
    expect(order(projectId, sceneId)).toEqual(['Gamma', 'Alpha', 'Beta']);
  });

  it('reorders with Alt+Arrow on a layer and keeps focus on the moved layer', () => {
    const { projectId, sceneId } = seedThreeLayers();
    render(<CanvasControlLayerRail />);

    const beta = screen.getByRole('button', { name: 'Select Beta' });
    beta.focus();
    fireEvent.keyDown(beta, { key: 'ArrowUp', altKey: true });
    expect(order(projectId, sceneId)).toEqual(['Beta', 'Alpha', 'Gamma']);
    expect(screen.getByRole('button', { name: 'Select Beta' })).toHaveFocus();

    // Plain arrows and moves past the end do nothing.
    fireEvent.keyDown(screen.getByRole('button', { name: 'Select Beta' }), { key: 'ArrowUp' });
    fireEvent.keyDown(screen.getByRole('button', { name: 'Select Beta' }), { key: 'ArrowUp', altKey: true });
    expect(order(projectId, sceneId)).toEqual(['Beta', 'Alpha', 'Gamma']);
  });

  it('reorders by dragging one layer onto another', () => {
    const { projectId, sceneId } = seedThreeLayers();
    render(<CanvasControlLayerRail />);
    const rowOf = (name: string) =>
      screen.getByRole('button', { name: `Select ${name}` }).closest('[data-layer-id]') as HTMLElement;

    const store = new Map<string, string>();
    const dataTransfer = {
      effectAllowed: 'none',
      dropEffect: 'none',
      get types() {
        return [...store.keys()];
      },
      setData: (type: string, value: string) => store.set(type, value),
      getData: (type: string) => store.get(type) ?? '',
    };
    fireEvent.dragStart(rowOf('Gamma'), { dataTransfer });
    fireEvent.dragOver(rowOf('Alpha'), { dataTransfer });
    fireEvent.drop(rowOf('Alpha'), { dataTransfer });
    expect(order(projectId, sceneId)).toEqual(['Gamma', 'Alpha', 'Beta']);
  });

  it('moveLayerId clamps the target and ignores unknown ids', () => {
    expect(moveLayerId(['a', 'b', 'c'], 'a', 9)).toEqual(['b', 'c', 'a']);
    expect(moveLayerId(['a', 'b', 'c'], 'c', -3)).toEqual(['c', 'a', 'b']);
    expect(moveLayerId(['a', 'b'], 'z', 0)).toEqual(['a', 'b']);
  });
});
