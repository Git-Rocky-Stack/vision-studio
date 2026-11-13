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

describe('LayerPanel keyboard access', () => {
  beforeEach(resetStore);
  afterEach(cleanup);

  it('selects a row with Enter/Space and moves the selection with the arrow keys', () => {
    render(<LayerPanel />);
    const first = seedTextLayer('Alpha');
    const second = seedTextLayer('Beta');

    const alpha = screen.getByRole('button', { name: 'Select Alpha' });
    alpha.focus();
    fireEvent.click(alpha); // Enter / Space activate a native button
    expect(useAppStore.getState().selectedEditLayerId).toBe(first.id);
    expect(alpha).toHaveAttribute('aria-pressed', 'true');

    fireEvent.keyDown(alpha, { key: 'ArrowDown' });
    expect(useAppStore.getState().selectedEditLayerId).toBe(second.id);
    expect(screen.getByRole('button', { name: 'Select Beta' })).toHaveFocus();

    fireEvent.keyDown(screen.getByRole('button', { name: 'Select Beta' }), { key: 'Home' });
    expect(useAppStore.getState().selectedEditLayerId).toBe(first.id);
    expect(screen.getByRole('button', { name: 'Select Alpha' })).toHaveFocus();
  });

  it('renames with F2, commits on Enter and returns focus to the row', () => {
    render(<LayerPanel />);
    const layer = seedTextLayer('Alpha');

    fireEvent.keyDown(screen.getByRole('button', { name: 'Select Alpha' }), { key: 'F2' });
    const input = screen.getByRole('textbox', { name: 'Rename Alpha' });
    fireEvent.change(input, { target: { value: 'Hero title' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(useAppStore.getState().editLayers.find((l) => l.id === layer.id)?.name).toBe('Hero title');
    expect(screen.getByRole('button', { name: 'Select Hero title' })).toHaveFocus();
  });

  it('renames from the rename button and cancels on Escape without saving', () => {
    render(<LayerPanel />);
    const layer = seedTextLayer('Alpha');

    fireEvent.click(screen.getByRole('button', { name: 'Rename Alpha' }));
    const input = screen.getByRole('textbox', { name: 'Rename Alpha' });
    fireEvent.change(input, { target: { value: 'Discarded' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    fireEvent.blur(input);

    expect(useAppStore.getState().editLayers.find((l) => l.id === layer.id)?.name).toBe(layer.name);
    expect(screen.queryByRole('textbox', { name: 'Rename Alpha' })).toBeNull();
  });

  it('labels the blend-mode select for its layer', () => {
    render(<LayerPanel />);
    const layer = seedTextLayer('Alpha');
    fireEvent.change(screen.getByRole('combobox', { name: 'Blend mode for Alpha' }), {
      target: { value: 'Multiply' },
    });
    expect(useAppStore.getState().editLayers.find((l) => l.id === layer.id)?.blendMode).toBe('Multiply');
  });
});
