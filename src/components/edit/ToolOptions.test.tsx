import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createShapeLayer, shapeDataFromDrag } from '@/features/edit/shapeLayers';
import { useAppStore } from '@/store/appStore';
import type { EditTool } from '@/types/editor';

import { ToolOptions } from './ToolOptions';

function renderFor(tool: EditTool) {
  act(() => useAppStore.getState().setActiveEditTool(tool));
  return render(<ToolOptions />);
}

describe('ToolOptions', () => {
  beforeEach(() => {
    useAppStore.setState(useAppStore.getInitialState(), true);
    useAppStore.getState().setCurrentImage('img.png', 'C:/img.png');
  });
  afterEach(cleanup);

  it.each(['move', 'crop', 'text', 'hand', 'zoom', 'eyedropper'] as const)('renders nothing for %s', (tool) => {
    const { container } = renderFor(tool);
    expect(container).toBeEmptyDOMElement();
  });

  it('sizes and colours the brush', () => {
    renderFor('brush');
    expect(screen.getByRole('region', { name: 'Tool options' })).toHaveTextContent('Brush');
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Size' }), { key: 'ArrowRight' });
    expect(useAppStore.getState().editBrushSize).toBe(11);
    expect(screen.getByText(useAppStore.getState().editBrushColor)).toBeInTheDocument();
  });

  it('clears brush strokes when there are some', () => {
    renderFor('eraser');
    const clear = screen.getByRole('button', { name: 'Clear strokes' });
    expect(clear).toBeDisabled();
    act(() =>
      useAppStore.getState().addEditStroke({ id: 's', tool: 'brush', points: [0, 0], color: '#fff', size: 4 }),
    );
    fireEvent.click(clear);
    expect(useAppStore.getState().editStrokes).toEqual([]);
  });

  it('shows the clone source, and clears it', () => {
    renderFor('clone');
    expect(screen.getByTestId('clone-source-status')).toHaveTextContent('Not set');
    expect(screen.getByText(/Alt\+click the image to pick where to copy from/)).toBeInTheDocument();

    act(() => useAppStore.getState().setEditCloneSource({ x: 12.4, y: 30.6 }));
    expect(screen.getByTestId('clone-source-status')).toHaveTextContent('12, 31');
    fireEvent.click(screen.getByRole('button', { name: 'Clear source' }));
    expect(useAppStore.getState().editCloneSource).toBeNull();
  });

  it('explains spot healing when no source is set', () => {
    renderFor('heal');
    expect(screen.getByTestId('clone-source-status')).toHaveTextContent('Automatic');
    expect(screen.getByText(/finds matching texture nearby/)).toBeInTheDocument();
  });

  it('sets retouch hardness and opacity as fractions', () => {
    renderFor('heal');
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Hardness' }), { key: 'Home' });
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Opacity' }), { key: 'ArrowLeft' });
    expect(useAppStore.getState().editRetouchHardness).toBe(0);
    expect(useAppStore.getState().editRetouchOpacity).toBe(0.99);
  });

  it('picks the shape kind', () => {
    renderFor('shape');
    fireEvent.click(screen.getByRole('radio', { name: 'Arrow' }));
    expect(useAppStore.getState().editShapeKind).toBe('arrow');
    expect(screen.getByRole('radio', { name: 'Arrow' })).toHaveAttribute('aria-checked', 'true');
  });

  it('restyles the selected shape as well as the next one', () => {
    const data = shapeDataFromDrag('rectangle', { x: 0, y: 0 }, { x: 20, y: 20 }, useAppStore.getState().editShapeStyle)!;
    const layer = createShapeLayer(data);
    act(() => {
      useAppStore.getState().addEditLayer(layer);
      useAppStore.getState().setSelectedEditLayerId(layer.id);
    });
    renderFor('shape');
    expect(screen.getByText('Editing the selected rectangle.')).toBeInTheDocument();

    fireEvent.keyDown(screen.getByRole('slider', { name: 'Outline width' }), { key: 'ArrowRight' });
    fireEvent.click(screen.getByRole('switch', { name: 'Fill' }));
    const updated = useAppStore.getState().editLayers.find((l) => l.id === layer.id)!;
    expect(updated.data).toMatchObject({ strokeWidth: 5, fillEnabled: true });
    expect(useAppStore.getState().editShapeStyle).toMatchObject({ strokeWidth: 5, fillEnabled: true });
  });

  it('never fills a selected line', () => {
    const data = shapeDataFromDrag('line', { x: 0, y: 0 }, { x: 20, y: 20 }, useAppStore.getState().editShapeStyle)!;
    const layer = createShapeLayer(data);
    act(() => {
      useAppStore.getState().addEditLayer(layer);
      useAppStore.getState().setSelectedEditLayerId(layer.id);
    });
    renderFor('shape');
    fireEvent.click(screen.getByRole('switch', { name: 'Fill' }));
    expect(useAppStore.getState().editLayers.find((l) => l.id === layer.id)!.data.fillEnabled).toBe(false);
  });

  it('finishes, closes and cancels a pen path from the buttons', () => {
    renderFor('pen');
    expect(screen.queryByRole('button', { name: 'Finish path' })).toBeNull();

    act(() => useAppStore.getState().setEditPenDraft([0, 0, 10, 0]));
    expect(screen.getByText(/2 points/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close shape' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Finish path' }));
    expect(useAppStore.getState().editLayers.at(-1)?.data).toMatchObject({ kind: 'path', closed: false });

    act(() => useAppStore.getState().setEditPenDraft([0, 0, 10, 0, 10, 10]));
    fireEvent.click(screen.getByRole('button', { name: 'Close shape' }));
    expect(useAppStore.getState().editLayers.at(-1)?.data).toMatchObject({ kind: 'path', closed: true });

    act(() => useAppStore.getState().setEditPenDraft([0, 0]));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(useAppStore.getState().editPenDraft).toBeNull();
  });

  it('toggles smooth pen curves', () => {
    renderFor('pen');
    fireEvent.click(screen.getByRole('switch', { name: 'Smooth curves' }));
    expect(useAppStore.getState().editPenSmooth).toBe(true);
  });
});
