import { cleanup, render, screen } from '@testing-library/react';
import { useRef, useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import userEvent from '@testing-library/user-event';

import { useFocusWhen } from './useFocusWhen';

function InlineRename({ select = false }: { select?: boolean }) {
  const [editing, setEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  useFocusWhen(inputRef, editing, { select });
  return editing ? (
    <input ref={inputRef} aria-label="Name" defaultValue="Draft" />
  ) : (
    <button type="button" onClick={() => setEditing(true)}>
      Rename
    </button>
  );
}

describe('useFocusWhen', () => {
  afterEach(cleanup);

  it('does not move focus while inactive', () => {
    render(<InlineRename />);
    expect(document.activeElement).toBe(document.body);
  });

  it('moves focus into the editor the user just opened', async () => {
    const user = userEvent.setup();
    render(<InlineRename />);
    await user.click(screen.getByRole('button', { name: 'Rename' }));
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveFocus();
  });

  it('selects the existing text when asked', async () => {
    const user = userEvent.setup();
    render(<InlineRename select />);
    await user.click(screen.getByRole('button', { name: 'Rename' }));
    const input = screen.getByRole('textbox', { name: 'Name' }) as HTMLInputElement;
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe('Draft'.length);
  });
});
