import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ScriptImportDialog } from '@/components/storyboard/ScriptImportDialog';
import { TemplateCreator } from '@/components/templates/TemplateCreator';
import { TemplatePreviewModal } from '@/components/templates/TemplatePreviewModal';
import { TimelineExportDialog } from '@/components/timeline/TimelineExportDialog';
import { KeyboardShortcuts } from '@/components/ui/KeyboardShortcuts';
import { PROJECT_TEMPLATES, useAppStore } from '@/store/appStore';

import { DialogCloseButton } from './DialogCloseButton';

afterEach(cleanup);

describe('DialogCloseButton', () => {
  it('is a named button that closes the dialog', () => {
    const onClose = vi.fn();
    render(<DialogCloseButton label="Close shortcuts" onClick={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: 'Close shortcuts' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('draws one glyph at one size, as decoration', () => {
    render(<DialogCloseButton label="Close" onClick={() => {}} />);

    const button = screen.getByRole('button', { name: 'Close' });
    const icon = button.querySelector('svg');
    expect(icon).toHaveClass('h-4', 'w-4');
    expect(icon).toHaveAttribute('aria-hidden', 'true');
    expect(button).toHaveClass('h-8', 'w-8');
  });

  it('can be disabled while the dialog is busy', () => {
    const onClose = vi.fn();
    render(<DialogCloseButton label="Close" onClick={onClose} disabled />);

    const button = screen.getByRole('button', { name: 'Close' });
    fireEvent.click(button);

    expect(button).toBeDisabled();
    expect(onClose).not.toHaveBeenCalled();
  });
});

/**
 * The audit found three close affordances: a bare X in the header row, an X on
 * a tinted chip floated over the corner (in two icon sizes), and a text pill
 * reading "Close". A dialog is closed the same way everywhere now.
 */
describe('every dialog closes with the shared button', () => {
  beforeEach(() => {
    useAppStore.setState(useAppStore.getInitialState(), true);
  });

  const expectSharedClose = (name: string | RegExp) => {
    const button = screen.getByRole('button', { name });
    expect(button).toHaveAttribute('data-dialog-close');
    expect(button.querySelector('svg')).toHaveClass('h-4', 'w-4');
    expect(button.textContent?.trim()).toBe('');
  };

  it('keyboard shortcuts', () => {
    render(<KeyboardShortcuts open onClose={() => {}} />);
    expectSharedClose('Close shortcuts');
  });

  it('template preview', () => {
    render(
      <TemplatePreviewModal
        template={PROJECT_TEMPLATES[0]}
        onClose={() => {}}
        onUseTemplate={() => {}}
        onEditTemplate={() => {}}
      />,
    );
    expectSharedClose('Close template preview');
  });

  it('template creator', () => {
    render(<TemplateCreator onClose={() => {}} />);
    expectSharedClose('Close template creator');
  });

  it('script import', () => {
    render(<ScriptImportDialog open projectName="Storyboard" onClose={() => {}} onGenerate={() => {}} />);
    expectSharedClose('Close script import');
  });

  it('timeline export', () => {
    const state = useAppStore.getState();
    const project = state.createProject('Export project');
    const sequence = state.ensureTimelineSequenceForProject(project.id, { fps: 24 });

    render(<TimelineExportDialog open sequenceId={sequence!.id} onClose={() => {}} />);
    expectSharedClose('Close timeline export');
  });
});
