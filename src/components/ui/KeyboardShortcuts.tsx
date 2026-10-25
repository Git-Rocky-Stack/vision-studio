import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Keyboard } from 'lucide-react';
import { DialogCloseButton } from '@/components/ui/DialogCloseButton';
import { EDIT_TOOL_SHORTCUTS } from '@/features/edit/useEditToolShortcuts';
import type { EditTool } from '@/types/editor';

interface ShortcutGroup {
  title: string;
  /** Where the group's keys are live, when that is not everywhere. */
  scope?: string;
  /** Each shortcut lists one or more alternative chords; a chord is a key sequence. */
  shortcuts: { chords: string[][]; description: string }[];
}

const MOD = 'Ctrl/Cmd';

const EDIT_TOOL_LABELS: Partial<Record<EditTool, string>> = {
  move: 'Move tool',
  scale: 'Scale tool',
  crop: 'Crop tool',
  rotate: 'Rotate tool',
  brush: 'Brush tool',
  eraser: 'Eraser tool',
  clone: 'Clone Stamp tool',
  heal: 'Heal tool',
  text: 'Text tool',
  shape: 'Shape tool',
  pen: 'Pen tool',
  hand: 'Hand tool',
  zoom: 'Zoom tool',
  eyedropper: 'Eyedropper tool',
};

// Generated from the live key map, so the sheet cannot drift from what the
// editor actually binds.
const EDIT_TOOL_ROWS = Object.entries(EDIT_TOOL_SHORTCUTS).map(([key, tool]) => ({
  chords: [[key.toUpperCase()]],
  description: EDIT_TOOL_LABELS[tool] ?? tool,
}));

// Every row names a binding that exists in code (docs/KEYBOARD_SHORTCUTS.md
// lists the source of each). Packaged builds also disable reload and DevTools.
export const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    title: 'General',
    shortcuts: [
      { chords: [['?']], description: 'Show keyboard shortcuts' },
      { chords: [['Esc']], description: 'Close dialog / cancel' },
      { chords: [[MOD, 'Z']], description: 'Undo edit' },
      { chords: [[MOD, 'Y'], [MOD, 'Shift', 'Z']], description: 'Redo edit' },
    ],
  },
  {
    title: 'Edit Canvas',
    scope: 'Canvas tab',
    shortcuts: [
      ...EDIT_TOOL_ROWS,
      { chords: [['['], [']']], description: 'Brush, Eraser, Clone Stamp, Heal: smaller / larger' },
      { chords: [['Alt', 'Click']], description: 'Clone Stamp, Heal: set the source' },
      { chords: [['Shift', 'Drag']], description: 'Shape: square, circle, 45-degree line' },
      { chords: [['Enter'], ['Double-click']], description: 'Pen: finish an open path' },
      { chords: [['Backspace']], description: 'Pen: remove the last point' },
      { chords: [['Esc']], description: 'Pen: cancel the path' },
      { chords: [['Scroll']], description: 'Zoom in/out' },
      { chords: [['Click'], ['Shift', 'Click']], description: 'Zoom tool: zoom in / out' },
    ],
  },
  {
    title: 'Timeline',
    scope: 'Generate tab',
    shortcuts: [
      { chords: [['Space']], description: 'Play / pause' },
      { chords: [['Home'], ['End']], description: 'Jump to start / end of the play range' },
      { chords: [['Left'], ['Right']], description: 'Seek 250 ms (Shift: 1 s)' },
      { chords: [['Alt', 'Left'], ['Alt', 'Right']], description: 'Nudge the selected clip one frame' },
      { chords: [['S']], description: 'Split the selected clip at the playhead' },
      { chords: [[MOD, 'D']], description: 'Duplicate the selected clip' },
      { chords: [['Delete'], ['Backspace']], description: 'Delete the selected clip' },
    ],
  },
  {
    title: 'Preview Canvas',
    scope: 'center canvas, every tab but Canvas',
    shortcuts: [
      { chords: [['+'], ['=']], description: 'Zoom in' },
      { chords: [['-']], description: 'Zoom out' },
      { chords: [['0']], description: 'Reset zoom & pan' },
      { chords: [['Scroll']], description: 'Zoom in/out' },
      { chords: [['Shift', 'Drag'], ['Middle drag']], description: 'Pan canvas' },
      { chords: [['Right click'], ['Shift', 'F10']], description: 'Context menu' },
    ],
  },
  {
    title: 'Region Mask',
    scope: 'preview canvas in region mode',
    shortcuts: [
      { chords: [['V']], description: 'Select' },
      { chords: [['R']], description: 'Rectangle' },
      { chords: [['L']], description: 'Lasso' },
      { chords: [['B']], description: 'Brush' },
      { chords: [['E']], description: 'Erase' },
      { chords: [['I']], description: 'Invert mask' },
    ],
  },
  {
    title: 'Navigation',
    shortcuts: [
      { chords: [['Up'], ['Down'], ['Home'], ['End']], description: 'Move between workspace tabs (nav rail focused)' },
      { chords: [['Left'], ['Right']], description: 'Previous / next result (image preview)' },
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
            className="raised-panel dialog-shell relative w-full max-w-lg mx-4 overflow-hidden"
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
              <DialogCloseButton label="Close shortcuts" onClick={onClose} />
            </div>

            {/* Content */}
            <div className="px-6 py-4 max-h-[60vh] overflow-y-auto space-y-6">
              {SHORTCUT_GROUPS.map((group) => (
                <div key={group.title}>
                  <h3 className="text-label text-text-muted mb-3">
                    {group.title}
                    {group.scope ? <span className="ml-2 normal-case text-text-muted/70">{group.scope}</span> : null}
                  </h3>
                  <div className="space-y-2">
                    {group.shortcuts.map((shortcut, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between gap-4 py-2"
                      >
                        <span className="text-sm text-text-body">
                          {shortcut.description}
                        </span>
                        <div className="flex flex-wrap items-center justify-end gap-1">
                          {shortcut.chords.map((chord, c) => (
                            <span key={c} className="inline-flex items-center">
                              {c > 0 && (
                                <span className="text-text-muted text-xs mx-1.5">or</span>
                              )}
                              {chord.map((key, j) => (
                                <span key={j} className="inline-flex items-center">
                                  {j > 0 && (
                                    <span className="text-text-muted text-xs mx-1">+</span>
                                  )}
                                  <kbd className="inline-flex items-center justify-center min-w-[24px] px-1.5 py-0.5 rounded bg-surface border border-border font-mono text-xs text-text-primary">
                                    {key}
                                  </kbd>
                                </span>
                              ))}
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
              <p className="text-xs text-text-muted text-center">
                Press <kbd className="px-1 py-0.5 rounded bg-elevated border border-border font-mono text-xs">?</kbd> to toggle this overlay
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
