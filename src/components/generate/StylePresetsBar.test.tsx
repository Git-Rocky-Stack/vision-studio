import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAppStore } from '@/store/appStore';
import { CUSTOM_STYLE_COLOR, StylePresetsBar } from './StylePresetsBar';

describe('StylePresetsBar', () => {
  beforeEach(() => {
    useAppStore.setState(useAppStore.getInitialState(), true);
  });
  afterEach(cleanup);

  function openAdd() {
    fireEvent.click(screen.getByRole('button', { name: 'Add style preset' }));
  }

  it('adds a custom style from the name and modifier popover', () => {
    const onToggle = vi.fn();
    render(<StylePresetsBar activePresets={[]} onTogglePreset={onToggle} />);
    openAdd();
    fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), { target: { value: 'Moody neon' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Prompt modifier' }), {
      target: { value: 'neon lighting, wet streets' },
    });
    fireEvent.click(screen.getAllByRole('button', { name: 'Add Style' }).at(-1)!);

    const custom = useAppStore.getState().customStylePresets;
    expect(custom).toEqual([
      expect.objectContaining({ name: 'Moody neon', modifier: 'neon lighting, wet streets', isCustom: true, color: CUSTOM_STYLE_COLOR }),
    ]);
    // The new style shows in an expanded Custom group and toggles like any other.
    fireEvent.click(screen.getByRole('button', { name: 'Style: Moody neon' }));
    expect(onToggle).toHaveBeenCalledWith(custom[0].id, 'neon lighting, wet streets');
  });

  it('refuses an empty or duplicate style with a reason', () => {
    render(<StylePresetsBar activePresets={[]} onTogglePreset={vi.fn()} />);
    openAdd();
    fireEvent.click(screen.getAllByRole('button', { name: 'Add Style' }).at(-1)!);
    expect(screen.getByRole('alert')).toHaveTextContent('needs a name');

    const existing = useAppStore.getState().stylePresets[0];
    fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), { target: { value: existing.name } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Prompt modifier' }), { target: { value: 'x' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Add Style' }).at(-1)!);
    expect(screen.getByRole('alert')).toHaveTextContent('already exists');
    expect(useAppStore.getState().customStylePresets).toHaveLength(0);
  });

  it('fills a selected chip even when its colour is a token, not a hex', () => {
    useAppStore.setState({
      customStylePresets: [
        { id: 'c1', name: 'Tokened', modifier: 'm', color: 'var(--color-feature-03)', category: 'creative', isCustom: true },
      ],
    });
    render(<StylePresetsBar activePresets={['c1']} onTogglePreset={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Custom styles' }));
    const chip = screen.getByRole('button', { name: 'Style: Tokened' });
    expect(chip.getAttribute('style')).not.toContain('NaN');
    expect(chip.getAttribute('style')).toContain('color-mix(in srgb, var(--color-feature-03) 9%, transparent)');
  });

  it('removes a custom style', () => {
    useAppStore.setState({
      customStylePresets: [{ id: 'c1', name: 'Mine', modifier: 'm', color: CUSTOM_STYLE_COLOR, category: 'creative', isCustom: true }],
    });
    render(<StylePresetsBar activePresets={[]} onTogglePreset={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Custom styles' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove style Mine' }));
    expect(useAppStore.getState().customStylePresets).toHaveLength(0);
  });
});
