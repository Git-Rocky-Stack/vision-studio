import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
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
});
