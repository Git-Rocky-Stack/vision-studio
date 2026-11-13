import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAppStore } from '@/store/appStore';
import { TemplateCreator } from './TemplateCreator';

describe('TemplateCreator', () => {
  beforeEach(() => {
    useAppStore.setState(useAppStore.getInitialState(), true);
  });

  afterEach(cleanup);

  it('renders as an accessible modal dialog', () => {
    render(<TemplateCreator onClose={vi.fn()} />);

    const dialog = screen.getByRole('dialog', { name: 'Create Template' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByRole('button', { name: 'Close template creator' })).toBeInTheDocument();
  });

  it('closes on Escape without the key reaching window-level shortcuts, and traps Tab', async () => {
    const onClose = vi.fn();
    const windowHandler = vi.fn();
    window.addEventListener('keydown', windowHandler);
    render(<TemplateCreator onClose={onClose} />);
    const close = screen.getByRole('button', { name: 'Close template creator' });
    await waitFor(() => expect(screen.getByRole('dialog')).toContainElement(document.activeElement as HTMLElement));

    // Shift+Tab from the first control wraps inside the dialog.
    close.focus();
    fireEvent.keyDown(close, { key: 'Tab', shiftKey: true });
    expect(screen.getByRole('dialog')).toContainElement(document.activeElement as HTMLElement);
    expect(document.activeElement).not.toBe(close);

    windowHandler.mockClear();
    fireEvent.keyDown(close, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(windowHandler).not.toHaveBeenCalled();
    window.removeEventListener('keydown', windowHandler);
  });

  it('labels the dimension presets as a group of pressed toggles', async () => {
    render(<TemplateCreator onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/name/i, { selector: 'input' }), { target: { value: 'Promo' } });
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    const group = await screen.findByRole('group', { name: 'Dimension Presets' });
    expect(group).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /1:1 Square/, pressed: true })).toBeInTheDocument();
  });
});
