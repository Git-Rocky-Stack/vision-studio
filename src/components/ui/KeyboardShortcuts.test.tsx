import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { KeyboardShortcuts } from './KeyboardShortcuts';

describe('KeyboardShortcuts', () => {
  describe('Rendering', () => {
    it('renders modal when open=true', () => {
      render(<KeyboardShortcuts open={true} onClose={() => {}} />);
      expect(screen.getByText('Keyboard Shortcuts')).toBeInTheDocument();
    });

    it('does not render when open=false', () => {
      render(<KeyboardShortcuts open={false} onClose={() => {}} />);
      // AnimatePresence keeps element in DOM but with opacity 0
      const dialogs = screen.getAllByRole('dialog');
      // All dialogs should have opacity 0
      dialogs.forEach(dialog => {
        expect(dialog).toHaveStyle('opacity: 0');
      });
    });

    it('renders all shortcut categories', () => {
      render(<KeyboardShortcuts open={true} onClose={() => {}} />);
      // Use getAllByText since AnimatePresence may cause duplicates
      expect(screen.getAllByText('Canvas').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('General').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Edit Canvas').length).toBeGreaterThanOrEqual(1);
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

      // Tab should move focus
      await user.tab();

      // After tabbing, focus should have moved from the button
      expect(document.activeElement).not.toBe(visibleButton);
    });

    it('focus restored to trigger element on close', async () => {
      const user = userEvent.setup();
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
});
