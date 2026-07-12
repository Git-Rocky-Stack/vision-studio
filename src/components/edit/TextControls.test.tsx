import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { useAppStore } from '@/store/appStore';
import { TEXT_LAYER_DEFAULT_STYLE, createTextLayer, isTextLayer } from '@/features/edit/textLayers';
import { TextControls } from './TextControls';

function resetStore() {
  useAppStore.setState(useAppStore.getInitialState(), true);
}

function seedSelectedTextLayer(text = 'Existing headline') {
  const layer = createTextLayer({
    text,
    position: { x: 50, y: 60 },
    style: TEXT_LAYER_DEFAULT_STYLE,
  });
  act(() => {
    useAppStore.getState().addEditLayer(layer);
    useAppStore.getState().setSelectedEditLayerId(layer.id);
  });
  return layer;
}

describe('TextControls (#32)', () => {
  beforeEach(resetStore);
  afterEach(cleanup);

  it('adds a text layer with the panel content and styling, and selects it', () => {
    render(<TextControls />);

    fireEvent.change(screen.getByLabelText('Text content'), {
      target: { value: 'Chrome headline' },
    });
    fireEvent.click(screen.getByRole('button', { name: /add text/i }));

    const { editLayers, selectedEditLayerId, editHistory } = useAppStore.getState();
    expect(editLayers).toHaveLength(1);
    const layer = editLayers[0];
    expect(isTextLayer(layer)).toBe(true);
    expect(layer.data.text).toBe('Chrome headline');
    expect(selectedEditLayerId).toBe(layer.id);
    expect(editHistory).toHaveLength(1);
    expect(editHistory[0].action).toMatch(/add text/i);
  });

  it('adds a default-content layer when the content field is empty', () => {
    render(<TextControls />);
    fireEvent.click(screen.getByRole('button', { name: /add text/i }));

    const layer = useAppStore.getState().editLayers[0];
    expect(layer.data.text).toBe('New text');
  });

  it('centers new text on the loaded image when its intrinsic size is known', () => {
    act(() => {
      useAppStore.getState().setCurrentImageSize({ width: 800, height: 600 });
    });
    render(<TextControls />);
    fireEvent.click(screen.getByRole('button', { name: /add text/i }));

    const layer = useAppStore.getState().editLayers[0];
    expect(layer.data.x).toBe(400);
    expect(layer.data.y).toBe(300);
  });

  it('hides Delete until a text layer is selected', () => {
    render(<TextControls />);
    expect(screen.queryByRole('button', { name: /^delete$/i })).toBeNull();

    seedSelectedTextLayer();
    expect(screen.getByRole('button', { name: /^delete$/i })).toBeInTheDocument();
  });

  it('deletes the selected text layer after confirmation', () => {
    const layer = seedSelectedTextLayer();
    render(<TextControls />);

    fireEvent.click(screen.getByRole('button', { name: /^delete$/i }));
    // Confirm dialog appears; the destructive action needs explicit confirmation.
    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /delete text/i }));

    const { editLayers, selectedEditLayerId, editHistory } = useAppStore.getState();
    expect(editLayers.find((l) => l.id === layer.id)).toBeUndefined();
    expect(selectedEditLayerId).toBeNull();
    expect(editHistory.some((entry) => /delete text/i.test(entry.action))).toBe(true);
  });

  it('keeps the layer when the confirmation is cancelled', () => {
    const layer = seedSelectedTextLayer();
    render(<TextControls />);

    fireEvent.click(screen.getByRole('button', { name: /^delete$/i }));
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

    expect(useAppStore.getState().editLayers.find((l) => l.id === layer.id)).toBeDefined();
  });

  it('writes style changes through to the selected text layer', () => {
    const layer = seedSelectedTextLayer();
    render(<TextControls />);

    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '96' } });

    const updated = useAppStore.getState().editLayers.find((l) => l.id === layer.id);
    expect(updated?.data.fontSize).toBe(96);
  });

  it('edits the selected layer content and renames the layer to match', () => {
    const layer = seedSelectedTextLayer('Old content');
    render(<TextControls />);

    const field = screen.getByLabelText('Text content') as HTMLTextAreaElement;
    expect(field.value).toBe('Old content');
    fireEvent.change(field, { target: { value: 'Fresh copy' } });

    const updated = useAppStore.getState().editLayers.find((l) => l.id === layer.id);
    expect(updated?.data.text).toBe('Fresh copy');
    expect(updated?.name).toBe('Fresh copy');
  });

  it('offers only bundled or system-safe fonts in the picker', () => {
    render(<TextControls />);

    fireEvent.click(screen.getByRole('button', { name: /ibm plex sans/i }));
    const options = screen.getAllByRole('option').map((el) => el.textContent);
    expect(options).toContain('IBM Plex Sans');
    expect(options).toContain('IBM Plex Mono');
    expect(options).not.toContain('DM Sans');
    expect(options).not.toContain('JetBrains Mono');
  });
});
