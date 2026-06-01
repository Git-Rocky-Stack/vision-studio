import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Keyboard, X } from 'lucide-react';

interface ShortcutGroup {
  title: string;
  shortcuts: { keys: string[]; description: string }[];
}

const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    title: 'Canvas',
    shortcuts: [
      { keys: ['+', '='], description: 'Zoom in' },
      { keys: ['-'], description: 'Zoom out' },
      { keys: ['0'], description: 'Reset zoom & pan' },
      { keys: ['Shift', 'Drag'], description: 'Pan canvas' },
      { keys: ['Scroll'], description: 'Zoom in/out' },
      { keys: ['Right Click'], description: 'Context menu' },
    ],
  },
  {
    title: 'General',
    shortcuts: [
      { keys: ['?'], description: 'Show keyboard shortcuts' },
      { keys: ['Esc'], description: 'Close dialog / cancel' },
    ],
  },
  {
    title: 'Edit Canvas',
    shortcuts: [
      { keys: ['Scroll'], description: 'Zoom in/out' },
    ],
  },
];

interface KeyboardShortcutsProps {
  open: boolean;
  onClose: () => void;
}

export function KeyboardShortcuts({ open, onClose }: KeyboardShortcutsProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    previousFocusRef.current = document.activeElement as HTMLElement;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    document.addEventListener('keydown', handleKeyDown);
    requestAnimationFrame(() => {
      dialogRef.current?.querySelector<HTMLElement>('button')?.focus();
    });

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      previousFocusRef.current?.focus();
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center"
          onClick={onClose}
          role="dialog"
          aria-modal="true"
          aria-label="Keyboard shortcuts"
        >
          <div className="absolute inset-0 bg-void/80 backdrop-blur-sm" />
          <motion.div
            ref={dialogRef}
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-lg mx-4 bg-elevated border border-border rounded-xl shadow-cinematic overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-md bg-accent-primary-muted flex items-center justify-center">
                  <Keyboard className="w-4 h-4 text-accent-primary" />
                </div>
                <h2 className="font-semibold text-text-primary text-base">
                  Keyboard Shortcuts
                </h2>
              </div>
              <button
                onClick={onClose}
                aria-label="Close shortcuts"
                className="p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface transition-all"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Content */}
            <div className="px-6 py-4 max-h-[60vh] overflow-y-auto space-y-6">
              {SHORTCUT_GROUPS.map((group) => (
                <div key={group.title}>
                  <h3 className="text-label text-text-muted mb-3">{group.title}</h3>
                  <div className="space-y-2">
                    {group.shortcuts.map((shortcut, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between py-2"
                      >
                        <span className="text-sm font-display text-text-body">
                          {shortcut.description}
                        </span>
                        <div className="flex items-center gap-1">
                          {shortcut.keys.map((key, j) => (
                            <span key={j}>
                              {j > 0 && (
                                <span className="text-text-muted text-xs mx-1">+</span>
                              )}
                              <kbd className="inline-flex items-center justify-center min-w-[24px] px-1.5 py-0.5 rounded bg-surface border border-border font-mono text-xs text-text-primary">
                                {key}
                              </kbd>
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Footer */}
            <div className="px-6 py-3 border-t border-border bg-surface/50">
              <p className="text-xs text-text-muted font-display text-center">
                Press <kbd className="px-1 py-0.5 rounded bg-elevated border border-border font-mono text-xs">?</kbd> to toggle this overlay
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
