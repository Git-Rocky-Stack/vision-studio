import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ScriptImportDialog } from './ScriptImportDialog';

afterEach(() => {
  cleanup();
});

describe('ScriptImportDialog', () => {
  it('does not render when closed', () => {
    render(
      <ScriptImportDialog
        open={false}
        projectName="Storyboard"
        onClose={vi.fn()}
        onGenerate={vi.fn()}
      />,
    );

    expect(screen.queryByTestId('script-import-dialog')).not.toBeInTheDocument();
  });

  it('validates empty source text before generating', async () => {
    const user = userEvent.setup();
    const onGenerate = vi.fn();

    render(
      <ScriptImportDialog
        open
        projectName="Storyboard"
        onClose={vi.fn()}
        onGenerate={onGenerate}
      />,
    );

    await user.click(screen.getByRole('button', { name: /generate draft/i }));

    expect(onGenerate).not.toHaveBeenCalled();
    expect(
      screen.getByText('Paste a script, outline, or scene brief to generate a draft.'),
    ).toBeInTheDocument();
  });

  it('passes title and source text to the generate handler', async () => {
    const user = userEvent.setup();
    const onGenerate = vi.fn().mockResolvedValue(undefined);

    render(
      <ScriptImportDialog
        open
        projectName="Storyboard"
        onClose={vi.fn()}
        onGenerate={onGenerate}
      />,
    );

    const dialog = within(screen.getByTestId('script-import-dialog'));

    await user.type(dialog.getByLabelText('Draft title'), 'Opening Sequence');
    await user.type(
      dialog.getByLabelText('Script or outline'),
      'INT. CONTROL ROOM - NIGHT\n- Captain Nova scans the console.',
    );
    await user.click(dialog.getByRole('button', { name: /generate draft/i }));

    expect(onGenerate).toHaveBeenCalledWith({
      title: 'Opening Sequence',
      sourceText: 'INT. CONTROL ROOM - NIGHT\n- Captain Nova scans the console.',
    });
  });

  describe('focus management', () => {
    async function flushFrame() {
      await act(async () => {
        await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
      });
    }

    it('focuses the script field, traps Tab and closes on Escape without reaching the workspace', async () => {
      const user = userEvent.setup();
      const onClose = vi.fn();
      const windowHandler = vi.fn();
      window.addEventListener('keydown', windowHandler);
      try {
        render(
          <ScriptImportDialog open projectName="Storyboard" onClose={onClose} onGenerate={vi.fn()} />,
        );
        await flushFrame();
        expect(screen.getByLabelText('Script or outline')).toHaveFocus();

        screen.getByRole('button', { name: /generate draft/i }).focus();
        await user.tab();
        expect(screen.getByRole('button', { name: 'Close script import' })).toHaveFocus();
        await user.tab({ shift: true });
        expect(screen.getByRole('button', { name: /generate draft/i })).toHaveFocus();

        await user.keyboard('{Escape}');
        expect(onClose).toHaveBeenCalledTimes(1);
        expect(windowHandler).not.toHaveBeenCalledWith(expect.objectContaining({ key: 'Escape' }));
      } finally {
        window.removeEventListener('keydown', windowHandler);
      }
    });

    it('ignores Escape while a draft is generating', async () => {
      const user = userEvent.setup();
      const onClose = vi.fn();
      let finish: () => void = () => undefined;
      const onGenerate = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
      render(
        <ScriptImportDialog open projectName="Storyboard" onClose={onClose} onGenerate={onGenerate} />,
      );
      await user.type(screen.getByLabelText('Script or outline'), 'INT. ROOM - DAY');
      await user.click(screen.getByRole('button', { name: /generate draft/i }));
      await user.keyboard('{Escape}');
      expect(onClose).not.toHaveBeenCalled();

      await act(async () => finish());
      await user.keyboard('{Escape}');
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });
});
