import { X } from 'lucide-react';

import { cn } from '@/utils/cn';

interface DialogCloseButtonProps {
  /** The button's accessible name, e.g. "Close shortcuts". */
  label: string;
  onClick: () => void;
  disabled?: boolean;
  /** Placement only, for a dialog with no header row to put the button in. */
  className?: string;
}

/**
 * The one way a dialog is closed from its corner: a 32px button with a 16px X.
 *
 * Dialogs had drifted into three affordances - a bare X in the header row, an
 * X on a tinted chip in two different icon sizes, and a text pill reading
 * "Close". Escape and the backdrop still close a dialog; this is the visible
 * control, and it should look the same wherever it appears.
 */
export function DialogCloseButton({ label, onClick, disabled, className }: DialogCloseButtonProps) {
  return (
    <button
      type="button"
      data-dialog-close
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md text-text-muted transition',
        'hover:bg-surface hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40',
        className,
      )}
    >
      <X className="h-4 w-4" aria-hidden="true" />
    </button>
  );
}
