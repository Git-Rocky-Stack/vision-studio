import { useRef, useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { getManagedDialogCount, useDialogFocus } from './useDialogFocus';
import { isModalDialogOpen, isWorkspaceShortcutBlocked } from '@/utils/modalGuard';

async function flushFrame() {
  await act(async () => {
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
  });
}

function Dialog({ onEscape, label = 'Dialog' }: { onEscape?: () => void; label?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useDialogFocus(ref, { open: true, onEscape });
  return (
    <div ref={ref} role="dialog" aria-modal="true" aria-label={label}>
      <button type="button">{label} first</button>
      <input aria-label={`${label} field`} />
      <button type="button" disabled>
        {label} disabled
      </button>
      <button type="button">{label} last</button>
    </div>
  );
}

function Harness({ onEscape }: { onEscape?: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button type="button" onClick={() => setOpen(true)}>
        Open
      </button>
      {open ? (
        <Dialog
          onEscape={() => {
            onEscape?.();
            setOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('useDialogFocus', () => {
  it('moves focus into the dialog and restores it to the opener on close', async () => {
    render(<Harness />);
    const opener = screen.getByRole('button', { name: 'Open' });
    opener.focus();
    fireEvent.click(opener);
    await flushFrame();
    expect(screen.getByRole('button', { name: 'Dialog first' })).toHaveFocus();

    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(opener).toHaveFocus();
    expect(getManagedDialogCount()).toBe(0);
  });

  it('wraps Tab and Shift+Tab inside the dialog, skipping disabled controls', async () => {
    render(<Dialog />);
    await flushFrame();
    const first = screen.getByRole('button', { name: 'Dialog first' });
    const last = screen.getByRole('button', { name: 'Dialog last' });

    last.focus();
    fireEvent.keyDown(last, { key: 'Tab' });
    expect(first).toHaveFocus();

    fireEvent.keyDown(first, { key: 'Tab', shiftKey: true });
    expect(last).toHaveFocus();
  });

  it('pulls focus back in when it has drifted outside the dialog', async () => {
    render(
      <>
        <button type="button">Outside</button>
        <Dialog />
      </>,
    );
    await flushFrame();
    const outside = screen.getByRole('button', { name: 'Outside' });
    outside.focus();
    fireEvent.keyDown(outside, { key: 'Tab' });
    expect(screen.getByRole('button', { name: 'Dialog first' })).toHaveFocus();
  });

  it('stops Escape from reaching window-level workspace shortcuts', async () => {
    const onEscape = vi.fn();
    const windowHandler = vi.fn();
    window.addEventListener('keydown', windowHandler);
    render(<Dialog onEscape={onEscape} />);
    await flushFrame();

    fireEvent.keyDown(screen.getByRole('button', { name: 'Dialog first' }), { key: 'Escape' });
    expect(onEscape).toHaveBeenCalledTimes(1);
    expect(windowHandler).not.toHaveBeenCalled();
    window.removeEventListener('keydown', windowHandler);
  });

  it('only lets the topmost of nested dialogs handle Escape', async () => {
    const outer = vi.fn();
    const inner = vi.fn();
    render(
      <>
        <Dialog onEscape={outer} label="Outer" />
        <Dialog onEscape={inner} label="Inner" />
      </>,
    );
    await flushFrame();
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(inner).toHaveBeenCalledTimes(1);
    expect(outer).not.toHaveBeenCalled();
  });

  it('leaves Escape alone when a widget inside the dialog already claimed it', async () => {
    const onEscape = vi.fn();
    render(<Dialog onEscape={onEscape} />);
    await flushFrame();
    const field = screen.getByRole('textbox', { name: 'Dialog field' });
    field.addEventListener('keydown', (event) => event.preventDefault());
    fireEvent.keyDown(field, { key: 'Escape' });
    expect(onEscape).not.toHaveBeenCalled();
  });
});

describe('modalGuard', () => {
  it('reports an open aria-modal dialog and blocks workspace shortcuts', () => {
    expect(isModalDialogOpen()).toBe(false);
    expect(isWorkspaceShortcutBlocked(new KeyboardEvent('keydown', { key: 's' }))).toBe(false);
    const { unmount } = render(<div role="dialog" aria-modal="true" />);
    expect(isModalDialogOpen()).toBe(true);
    expect(isWorkspaceShortcutBlocked(new KeyboardEvent('keydown', { key: 's' }))).toBe(true);
    unmount();
    expect(isModalDialogOpen()).toBe(false);
  });
});
