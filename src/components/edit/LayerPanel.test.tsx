import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { useAppStore } from '@/store/appStore';
import { TEXT_LAYER_DEFAULT_STYLE, createTextLayer } from '@/features/edit/textLayers';
import { LayerPanel } from './LayerPanel';

function resetStore() {
  useAppStore.setState(useAppStore.getInitialState(), true);
}

function seedTextLayer(text: string) {
  const layer = createTextLayer({
    text,
    position: { x: 0, y: 0 },
    style: TEXT_LAYER_DEFAULT_STYLE,
  });
  act(() => {
    useAppStore.getState().addEditLayer(layer);
  });
  return layer;
}

describe('LayerPanel shared selection (#32)', () => {
  beforeEach(resetStore);
  afterEach(cleanup);

  it('selects a layer in the shared store selection when its row is clicked', () => {
    render(<LayerPanel />);
    const layer = seedTextLayer('Headline');

    fireEvent.click(screen.getByText('Headline'));

    expect(useAppStore.getState().selectedEditLayerId).toBe(layer.id);
  });

  it('reflects a selection made elsewhere (canvas, text panel)', () => {
    render(<LayerPanel />);
    const layer = seedTextLayer('Headline');

    act(() => {
      useAppStore.getState().setSelectedEditLayerId(layer.id);
    });

    // The delete control arms only for the selected layer.
    expect(
      screen.getByRole('button', { name: `Remove layer ${layer.name}` }),
    ).not.toBeDisabled();
  });

  it('deleting the selected layer clears the shared selection', () => {
    render(<LayerPanel />);
    const layer = seedTextLayer('Headline');

    fireEvent.click(screen.getByText('Headline'));
    fireEvent.click(screen.getByRole('button', { name: `Remove layer ${layer.name}` }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(useAppStore.getState().editLayers).toHaveLength(0);
    expect(useAppStore.getState().selectedEditLayerId).toBeNull();
  });
});
