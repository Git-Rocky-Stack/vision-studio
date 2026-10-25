import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAppStore } from '@/store/appStore';
import { TEXT_LAYER_DEFAULT_STYLE, createTextLayer } from '@/features/edit/textLayers';
import { EXPORT_BRIDGE_MISSING_MESSAGE, registerEditFlattener } from '@/features/edit/exportEdit';
import { REGION_STYLE_UNSUPPORTED_MESSAGE } from '@/features/edit/regionLockGeneration';
import { EditPropertiesPanel } from './EditPropertiesPanel';

function addText(text: string) {
  act(() => {
    useAppStore
      .getState()
      .addEditLayer(createTextLayer({ text, position: { x: 0, y: 0 }, style: TEXT_LAYER_DEFAULT_STYLE }));
  });
}

describe('EditPropertiesPanel actions', () => {
  beforeEach(() => {
    useAppStore.setState(useAppStore.getInitialState(), true);
  });
  afterEach(() => {
    cleanup();
    registerEditFlattener(null);
    vi.unstubAllGlobals();
  });

  it('wires Undo and Redo to the real history', () => {
    render(<EditPropertiesPanel />);
    const undoButton = screen.getByRole('button', { name: /^undo/i });
    const redoButton = screen.getByRole('button', { name: /^redo/i });
    expect(undoButton).toBeDisabled();
    expect(redoButton).toBeDisabled();

    addText('one');
    expect(undoButton).toBeEnabled();
    fireEvent.click(undoButton);
    expect(useAppStore.getState().editLayers).toHaveLength(0);
    expect(redoButton).toBeEnabled();

    fireEvent.click(redoButton);
    expect(useAppStore.getState().editLayers).toHaveLength(1);
  });

  it('lists history entries and jumps to one on click', () => {
    addText('one');
    addText('two');
    render(<EditPropertiesPanel />);

    fireEvent.click(screen.getByRole('button', { name: 'Edit history' }));
    const dialog = screen.getByRole('dialog', { name: 'Edit history' });
    expect(dialog).toHaveTextContent('Original');
    fireEvent.click(screen.getByRole('button', { name: /Add layer "one"/ }));

    expect(useAppStore.getState().editLayers).toHaveLength(1);
    expect(useAppStore.getState().editHistoryIndex).toBe(1);
  });

  it('toggles the Before/After compare', () => {
    useAppStore.getState().setCurrentImage('img.png', 'C:/img.png');
    render(<EditPropertiesPanel />);
    const compare = screen.getByRole('button', { name: 'Before/After compare' });
    fireEvent.click(compare);
    expect(useAppStore.getState().editCompareOriginal).toBe(true);
    expect(compare).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(compare);
    expect(useAppStore.getState().editCompareOriginal).toBe(false);
  });

  it('stores Filters-tab choices so the canvas can apply them', async () => {
    render(<EditPropertiesPanel />);
    fireEvent.click(screen.getByRole('tab', { name: /filters/i }));
    fireEvent.click(await screen.findByRole('button', { name: 'Filter: Noir' }));
    expect(useAppStore.getState().editFilters.selected).toEqual(['noir']);

    fireEvent.click(screen.getByRole('switch', { name: /stack filters/i }));
    expect(useAppStore.getState().editFilters.stackMode).toBe(true);
  });

  it('opens the Crop tab when the Crop tool is picked', () => {
    render(<EditPropertiesPanel />);
    act(() => {
      useAppStore.getState().setActiveEditTool('crop');
    });
    expect(screen.getByRole('tab', { name: /crop/i })).toHaveAttribute('aria-selected', 'true');
  });

  it('shows an inline crop error and clears the busy state when the crop fails', async () => {
    const cropImage = vi.fn().mockRejectedValue(new Error('Backend offline'));
    vi.stubGlobal('electron', { generation: { cropImage } });
    useAppStore.getState().setCurrentImage('img.png', 'C:/img.png');
    render(<EditPropertiesPanel />);
    fireEvent.click(screen.getByRole('tab', { name: /crop/i }));
    fireEvent.click(await screen.findByRole('button', { name: /apply crop/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Backend offline');
    expect(screen.getByRole('button', { name: /apply crop/i })).toBeEnabled();
  });

  it('reports a missing export bridge instead of silently doing nothing', async () => {
    vi.stubGlobal('electron', { assets: {} });
    registerEditFlattener(() => 'data:image/png;base64,AAAA');
    useAppStore.getState().setCurrentImage('img.png', 'C:/img.png');
    render(<EditPropertiesPanel />);
    fireEvent.click(screen.getByRole('button', { name: /export edited image/i }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(EXPORT_BRIDGE_MISSING_MESSAGE));
  });

  it('refuses a region tool with no region-scoped operation, honestly', async () => {
    const state = useAppStore.getState();
    const project = state.createProject('P');
    const scene = state.addScene(project.id, { name: 'S' });
    state.setActiveProject(project.id);
    state.setActiveScene(scene.id);
    state.setCurrentImage('img.png', 'C:/img.png');
    const lock = useAppStore.getState().createRegionLock(scene.id, 'f1', {
      name: 'R',
      aiTool: 'style-transfer',
      mask: {
        type: 'rectangle',
        points: [{ x: 0, y: 0 }, { x: 4, y: 4 }],
        bounds: { x: 0, y: 0, width: 4, height: 4 },
        featherRadius: 2,
        blendEdges: true,
      },
    });
    const runPipeline = vi.spyOn(useAppStore.getState(), 'runPipeline');

    render(<EditPropertiesPanel />);
    // Enter the Region tab the way a user does, then select the lock.
    fireEvent.click(screen.getByRole('tab', { name: /region/i }));
    await act(async () => {
      useAppStore.getState().setActiveRegionId(lock.id);
    });
    fireEvent.click(await screen.findByRole('button', { name: /generate region/i }));

    expect(screen.getByRole('alert')).toHaveTextContent(REGION_STYLE_UNSUPPORTED_MESSAGE);
    expect(runPipeline).not.toHaveBeenCalled();
  });
});
