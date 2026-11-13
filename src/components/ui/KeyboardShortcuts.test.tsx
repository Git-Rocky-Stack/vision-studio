import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, it, expect, vi } from 'vitest';
import { KeyboardShortcuts, SHORTCUT_GROUPS } from './KeyboardShortcuts';

describe('KeyboardShortcuts', () => {
  describe('Rendering', () => {
    it('renders modal when open=true', () => {
      render(<KeyboardShortcuts open={true} onClose={() => {}} />);
      expect(screen.getByText('Keyboard Shortcuts')).toBeInTheDocument();
    });

    it('does not render when open=false', () => {
      render(<KeyboardShortcuts open={false} onClose={() => {}} />);
      // Closed from the first render, AnimatePresence has nothing to animate
      // out, so no dialog is mounted at all.
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(screen.queryByText('Keyboard Shortcuts')).not.toBeInTheDocument();
    });

    it('renders all shortcut categories', () => {
      render(<KeyboardShortcuts open={true} onClose={() => {}} />);
      // Use getAllByText since AnimatePresence may cause duplicates
      for (const title of ['General', 'Edit Canvas', 'Timeline', 'Preview Canvas', 'Region Mask', 'Navigation']) {
        expect(screen.getAllByText(title).length, title).toBeGreaterThanOrEqual(1);
      }
    });

    it('renders shortcut table with key combinations and descriptions', () => {
      render(<KeyboardShortcuts open={true} onClose={() => {}} />);

      // Verify descriptions
      expect(screen.getAllByText('Zoom in').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Zoom out').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Show keyboard shortcuts').length).toBeGreaterThanOrEqual(1);

      // Verify key combinations use + separator
      const plusSeparators = screen.getAllByText('+');
      expect(plusSeparators.length).toBeGreaterThan(0);
    });
  });

  describe('Alternatives and modifiers', () => {
    it('shows alternative chords as alternatives, not as one chord', () => {
      render(<KeyboardShortcuts open={true} onClose={() => {}} />);
      const zoomIn = SHORTCUT_GROUPS.flatMap((g) => g.shortcuts).find((s) => s.description === 'Zoom in');
      expect(zoomIn?.chords).toEqual([['+'], ['=']]);
      expect(screen.getAllByText('or').length).toBeGreaterThan(0);
    });

    it('names Cmd as well as Ctrl for undo, redo and duplicate', () => {
      const chords = SHORTCUT_GROUPS.flatMap((g) => g.shortcuts)
        .filter((s) => ['Undo edit', 'Redo edit', 'Duplicate the selected clip'].includes(s.description))
        .flatMap((s) => s.chords);
      expect(chords.length).toBeGreaterThan(0);
      for (const chord of chords) expect(chord[0]).toBe('Ctrl/Cmd');
    });
  });

  describe('Edit shortcuts', () => {
    it('lists undo/redo and every bound edit tool letter', () => {
      render(<KeyboardShortcuts open={true} onClose={() => {}} />);
      expect(screen.getAllByText('Undo edit').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Redo edit').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Brush tool').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Eyedropper tool').length).toBeGreaterThanOrEqual(1);
      for (const label of ['Clone Stamp tool', 'Heal tool', 'Shape tool', 'Pen tool']) {
        expect(screen.getAllByText(label).length).toBeGreaterThanOrEqual(1);
      }
      expect(screen.getAllByText('Pen: finish an open path').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Clone Stamp, Heal: set the source').length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Accessibility', () => {
    it('has role="dialog" attribute', () => {
      render(<KeyboardShortcuts open={true} onClose={() => {}} />);
      const dialogs = screen.getAllByRole('dialog');
      // Check the first (visible) dialog
      expect(dialogs[0]).toBeInTheDocument();
    });

    it('has aria-modal="true" attribute', () => {
      render(<KeyboardShortcuts open={true} onClose={() => {}} />);
      const dialogs = screen.getAllByRole('dialog');
      expect(dialogs[0]).toHaveAttribute('aria-modal', 'true');
    });

    it('has aria-label="Keyboard shortcuts"', () => {
      render(<KeyboardShortcuts open={true} onClose={() => {}} />);
      const dialogs = screen.getAllByRole('dialog');
      expect(dialogs[0]).toHaveAttribute('aria-label', 'Keyboard shortcuts');
    });
  });

  describe('Interactions', () => {
    it('calls onClose when close button is clicked', async () => {
      const user = userEvent.setup();
      const onClose = vi.fn();

      render(<KeyboardShortcuts open={true} onClose={onClose} />);

      // Find the close button by text content in the visible dialog
      const allCloseButtons = screen.getAllByLabelText('Close shortcuts');
      // The visible button is the last one (not the exit DOM element)
      const visibleButton = allCloseButtons[allCloseButtons.length - 1];
      await user.click(visibleButton);

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('calls onClose when Escape key is pressed', async () => {
      const user = userEvent.setup();
      const onClose = vi.fn();

      render(<KeyboardShortcuts open={true} onClose={onClose} />);

      await user.keyboard('{Escape}');

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('calls onClose when backdrop is clicked', async () => {
      const user = userEvent.setup();
      const onClose = vi.fn();

      render(<KeyboardShortcuts open={true} onClose={onClose} />);

      // The backdrop click is handled by the outer container
      // which has onClick={onClose} and the inner modal has onClick={(e) => e.stopPropagation()}
      // Click on an area outside the modal content - the backdrop div
      const allTitles = screen.getAllByText('Keyboard Shortcuts');
      const visibleTitle = allTitles[allTitles.length - 1];
      const dialog = visibleTitle.closest('[role="dialog"]');
      const backdrop = dialog?.previousSibling as HTMLElement;

      if (backdrop) {
        await user.click(backdrop);
        expect(onClose).toHaveBeenCalledTimes(1);
      }
    });
  });

  describe('Focus Management', () => {
    it('focus trap works within modal - Tab cycles within dialog', async () => {
      const user = userEvent.setup();

      render(<KeyboardShortcuts open={true} onClose={() => {}} />);

      // Wait for component's requestAnimationFrame to set focus
      await new Promise(resolve => setTimeout(resolve, 50));

      // Initial focus should be on close button (per component useEffect)
      const allButtons = screen.getAllByLabelText('Close shortcuts');
      const visibleButton = allButtons[allButtons.length - 1];

      expect(visibleButton).toHaveFocus();

      // The close button is the overlay's only control, so Tab and Shift+Tab
      // wrap back to it instead of escaping to the page behind.
      await user.tab();
      expect(visibleButton).toHaveFocus();
      await user.tab({ shift: true });
      expect(visibleButton).toHaveFocus();
    });

    it('focus restored to trigger element on close', async () => {
      const onClose = vi.fn();

      // Create a trigger button that would have focus before modal opens
      const triggerButton = document.createElement('button');
      triggerButton.textContent = 'Open Shortcuts';
      document.body.appendChild(triggerButton);
      triggerButton.focus();

      // Store initial focus
      const initialFocus = document.activeElement;
      expect(initialFocus).toBe(triggerButton);

      // Render with open=true
      const { rerender } = render(<KeyboardShortcuts open={true} onClose={onClose} />);

      // Wait for focus to move to modal (component uses requestAnimationFrame)
      await new Promise(resolve => setTimeout(resolve, 50));

      // Focus should have moved from trigger to modal
      expect(document.activeElement).not.toBe(triggerButton);

      // Close by changing open prop to false (this triggers useEffect cleanup)
      rerender(<KeyboardShortcuts open={false} onClose={onClose} />);

      // Wait for cleanup to restore focus
      await new Promise(resolve => setTimeout(resolve, 50));

      // Focus should return to trigger button
      expect(document.activeElement).toBe(triggerButton);

      // Cleanup
      document.body.removeChild(triggerButton);
    });
  });

  describe('Modal keyboard contract', () => {
    // Earlier blocks leave their renders mounted; start from a clean document.
    beforeEach(cleanup);

    it('closes on Escape without the key reaching window-level workspace shortcuts', async () => {
      // An unfinished Pen path cancels on a window Escape; closing this overlay
      // must not also throw the path away.
      const onClose = vi.fn();
      const workspaceHandler = vi.fn();
      window.addEventListener('keydown', workspaceHandler);
      render(<KeyboardShortcuts open={true} onClose={onClose} />);
      await new Promise((resolve) => setTimeout(resolve, 20));

      await userEvent.keyboard('{Escape}');

      expect(onClose).toHaveBeenCalledTimes(1);
      expect(workspaceHandler).not.toHaveBeenCalled();
      window.removeEventListener('keydown', workspaceHandler);
    });

    it('keeps Tab inside the overlay', async () => {
      render(
        <>
          <button type="button">Behind the overlay</button>
          <KeyboardShortcuts open={true} onClose={() => {}} />
        </>,
      );
      await new Promise((resolve) => setTimeout(resolve, 20));
      const close = screen.getByRole('button', { name: 'Close shortcuts' });
      expect(close).toHaveFocus();

      await userEvent.tab();
      expect(close).toHaveFocus();
      await userEvent.tab({ shift: true });
      expect(close).toHaveFocus();
      expect(screen.getByRole('button', { name: 'Behind the overlay' })).not.toHaveFocus();
    });
  });

  describe('Shortcut sheet accuracy', () => {
    const group = (title: string) => SHORTCUT_GROUPS.find((item) => item.title === title)!;
    const row = (title: string, description: string) =>
      group(title).shortcuts.find((item) => item.description === description)!;

    it('scopes each group to the surface whose handler binds it', () => {
      // Timeline mounts only in the Generate tab's Canvas view; the preview
      // Canvas only on the Story tab; mask letters in EditCanvas (Control /
      // Region) and the Story canvas while region mode is on.
      expect(group('Timeline').scope).toBe('Generate tab, Canvas view');
      expect(group('Preview Canvas').scope).toBe('Story tab canvas');
      expect(group('Region Mask').scope).toBe('Canvas tab (Control/Region) or Story tab canvas, region mode');
    });

    it('lists every key the handlers accept as an alternative', () => {
      expect(row('Navigation', 'Move between workspace tabs (nav rail focused)').chords).toEqual(
        expect.arrayContaining([['Left'], ['Right']]),
      );
      expect(row('Edit Canvas', 'Pen: remove the last point').chords).toEqual([['Backspace'], ['Delete']]);
      expect(row('Preview Canvas', 'Context menu').chords).toContainEqual(['Menu']);
    });
  });
});
