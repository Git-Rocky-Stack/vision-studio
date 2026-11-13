import { useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from './Button';
import { AlertTriangle } from 'lucide-react';
import { useDialogFocus } from '@/hooks/useDialogFocus';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'primary';
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'danger',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  // Focus moves to Cancel (the safe default), Tab stays inside, Escape cancels
  // without reaching workspace shortcuts, and focus returns to the opener.
  useDialogFocus(dialogRef, { open, onEscape: onCancel, initialFocusSelector: '[data-cancel]' });

  const handleConfirm = useCallback(() => {
    onConfirm();
  }, [onConfirm]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center"
          onClick={onCancel}
          role="dialog"
          aria-modal="true"
          aria-label={title}
        >
          <div className="absolute inset-0 bg-void/80 backdrop-blur-sm" />
          <motion.div
            ref={dialogRef}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            onClick={(e) => e.stopPropagation()}
            className="raised-panel dialog-shell relative w-full max-w-sm mx-4 p-6"
          >
            <div className="flex items-start gap-4">
              <div
                className={
                  variant === 'danger'
                    ? 'w-10 h-10 rounded-md bg-status-error-muted flex items-center justify-center flex-shrink-0'
                    : 'w-10 h-10 rounded-md bg-accent-primary-muted border border-accent-primary-border flex items-center justify-center flex-shrink-0'
                }
              >
                <AlertTriangle className={variant === 'danger' ? 'w-5 h-5 text-status-error' : 'w-5 h-5 text-accent-primary'} />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="type-section">
                  {title}
                </h3>
                <p className="mt-1 type-ui text-text-body leading-relaxed">
                  {message}
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <Button
                variant="secondary"
                size="sm"
                onClick={onCancel}
                data-cancel
              >
                {cancelLabel}
              </Button>
              <Button
                variant={variant === 'danger' ? 'danger' : 'primary'}
                size="sm"
                onClick={handleConfirm}
              >
                {confirmLabel}
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
