import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { useAppStore } from '@/store/appStore';
import { EditPropertiesPanel } from './EditPropertiesPanel';

describe('EditPropertiesPanel', () => {
  beforeEach(() => {
    cleanup();
    useAppStore.setState(useAppStore.getInitialState(), true);
  });

  it('renders the initial adjustment tab without a runtime initialization error', () => {
    expect(() => render(<EditPropertiesPanel />)).not.toThrow();

    expect(screen.getByRole('tab', { name: /adjust/i })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByText('No layers')).not.toBeInTheDocument();
  });

  it('switches to the control inspector when an active canvas control layer exists', async () => {
    const state = useAppStore.getState();
    const project = state.createProject('Canvas controls');
    const scene = state.addScene(project.id, { name: 'Shot 1' });

    state.setActiveProject(project.id);
    state.setActiveScene(scene.id);
    state.createCanvasControlLayer(scene.id, { name: 'Guide layer' });

    render(<EditPropertiesPanel />);

    await waitFor(() => {
      expect(screen.getByTestId('canvas-control-layer-properties')).toBeInTheDocument();
    });

    expect(screen.getByRole('tab', { name: /control/i })).toHaveAttribute('aria-selected', 'true');
  });
});
