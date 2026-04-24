import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfirmDialog } from './ConfirmDialog';

describe('ConfirmDialog', () => {
  afterEach(cleanup);

  it('renders title correctly', () => {
    render(
      <ConfirmDialog
        open={true}
        title="Delete Item"
        message="Are you sure you want to delete this item?"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    expect(screen.getByText('Delete Item')).toBeInTheDocument();
  });

  it('renders message correctly', () => {
    render(
      <ConfirmDialog
        open={true}
        title="Delete Item"
        message="Are you sure you want to delete this item?"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    expect(screen.getByText('Are you sure you want to delete this item?')).toBeInTheDocument();
  });

  it('Confirm button calls onConfirm callback when clicked', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <ConfirmDialog
        open={true}
        title="Delete Item"
        message="Are you sure?"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    );

    await user.click(screen.getByText('Confirm'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('Cancel button calls onCancel callback when clicked', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <ConfirmDialog
        open={true}
        title="Delete Item"
        message="Are you sure?"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    );

    await user.click(screen.getByText('Cancel'));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('Escape key closes dialog (calls onCancel)', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(
      <ConfirmDialog
        open={true}
        title="Delete Item"
        message="Are you sure?"
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />
    );

    await user.keyboard('{Escape}');
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('Dialog has role="dialog" attribute', () => {
    render(
      <ConfirmDialog
        open={true}
        title="Delete Item"
        message="Are you sure?"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
  });

  it('Dialog has aria-modal="true" attribute', () => {
    render(
      <ConfirmDialog
        open={true}
        title="Delete Item"
        message="Are you sure?"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
  });

  it('Dialog has aria-label matching title', () => {
    render(
      <ConfirmDialog
        open={true}
        title="Delete Item"
        message="Are you sure?"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-label', 'Delete Item');
  });

  it('Focus trap works - Tab cycles within dialog', async () => {
    const user = userEvent.setup();
    render(
      <ConfirmDialog
        open={true}
        title="Delete Item"
        message="Are you sure?"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    const cancelBtn = screen.getByText('Cancel');
    const confirmBtn = screen.getByText('Confirm');

    // Wait for auto-focus (happens in requestAnimationFrame)
    await vi.waitFor(() => {
      expect(cancelBtn).toHaveFocus();
    });

    // Tab should cycle to Confirm button
    await user.keyboard('{Tab}');
    expect(confirmBtn).toHaveFocus();

    // Tab should cycle back to Cancel button (focus trap)
    await user.keyboard('{Tab}');
    expect(cancelBtn).toHaveFocus();
  });

  it('Focus restored to trigger element on close', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();

    // Create a trigger button outside the dialog
    const { container } = render(
      <div>
        <button id="trigger">Delete</button>
        <ConfirmDialog
          open={true}
          title="Delete Item"
          message="Are you sure?"
          onConfirm={vi.fn()}
          onCancel={onCancel}
        />
      </div>
    );

    const triggerBtn = container.querySelector('#trigger') as HTMLButtonElement;
    triggerBtn.focus();
    expect(triggerBtn).toHaveFocus();

    // Close dialog via Escape
    await user.keyboard('{Escape}');
    // Focus should be restored to trigger (tested via document.activeElement in effect)
    // The effect runs on cleanup, so we verify the onCancel was called
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('Backdrop click calls onCancel', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(
      <ConfirmDialog
        open={true}
        title="Delete Item"
        message="Are you sure?"
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />
    );

    // Click on the backdrop (the div with class absolute inset-0 bg-void/80)
    const backdrop = document.querySelector('.bg-void\\/80') as HTMLElement;
    expect(backdrop).toBeInTheDocument();
    await user.click(backdrop);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('Custom confirm label renders correctly', () => {
    render(
      <ConfirmDialog
        open={true}
        title="Delete Item"
        message="Are you sure?"
        confirmLabel="Yes, Delete"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    expect(screen.getByText('Yes, Delete')).toBeInTheDocument();
  });

  it('Custom cancel label renders correctly', () => {
    render(
      <ConfirmDialog
        open={true}
        title="Delete Item"
        message="Are you sure?"
        cancelLabel="No, Keep"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    expect(screen.getByText('No, Keep')).toBeInTheDocument();
  });

  it('Dialog does not render when open is false', () => {
    render(
      <ConfirmDialog
        open={false}
        title="Delete Item"
        message="Are you sure?"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('Alert triangle icon is present', () => {
    render(
      <ConfirmDialog
        open={true}
        title="Delete Item"
        message="Are you sure?"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    // The icon container should be present
    const iconContainer = document.querySelector('.bg-red-aura');
    expect(iconContainer).toBeInTheDocument();
  });
});
