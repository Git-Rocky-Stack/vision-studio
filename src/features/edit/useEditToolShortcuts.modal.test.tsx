import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { useAppStore } from '@/store/appStore';

import { handleEditToolShortcut, useEditToolShortcuts } from './useEditToolShortcuts';

function ShortcutHost() {
  useEditToolShortcuts();
  return null;
}

describe('edit tool shortcuts behind a modal dialog', () => {
  beforeEach(() => {
    useAppStore.setState(useAppStore.getInitialState(), true);
    useAppStore.getState().setCurrentImage('img.png', 'C:/img.png');
  });
  afterEach(cleanup);

  it('leaves an unfinished Pen path alone when Escape belongs to an open dialog', () => {
    useAppStore.getState().setActiveEditTool('pen');
    useAppStore.getState().setEditPenDraft([0, 0, 10, 10]);
    render(
      <>
        <ShortcutHost />
        <div role="dialog" aria-modal="true" aria-label="Keyboard shortcuts" />
      </>,
    );
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(useAppStore.getState().editPenDraft).toEqual([0, 0, 10, 10]);
  });

  it('ignores mask letters while a dialog is open, and honours them after it closes', () => {
    useAppStore.setState({ regionMode: true });
    const { rerender } = render(
      <>
        <ShortcutHost />
        <div role="dialog" aria-modal="true" aria-label="Preview" />
      </>,
    );
    fireEvent.keyDown(window, { key: 'r' });
    expect(useAppStore.getState().activeMaskTool).not.toBe('rectangle');

    rerender(<ShortcutHost />);
    fireEvent.keyDown(window, { key: 'r' });
    expect(useAppStore.getState().activeMaskTool).toBe('rectangle');
  });

  it('reports a letter as unhandled while a dialog is open', () => {
    render(<div role="dialog" aria-modal="true" aria-label="Preview" />);
    expect(handleEditToolShortcut(new KeyboardEvent('keydown', { key: 'b' }))).toBe(false);
    expect(useAppStore.getState().activeEditTool).not.toBe('brush');
  });
});
