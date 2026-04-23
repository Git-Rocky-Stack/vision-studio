import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { FileText, Sparkles } from 'lucide-react';

import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';

interface ScriptImportDialogProps {
  open: boolean;
  projectName: string;
  onClose: () => void;
  onGenerate: (payload: { title?: string; sourceText: string }) => void | Promise<void>;
}

export function ScriptImportDialog({
  open,
  projectName,
  onClose,
  onGenerate,
}: ScriptImportDialogProps) {
  const [title, setTitle] = useState('');
  const [sourceText, setSourceText] = useState('');
  const [sourceError, setSourceError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!open) {
      setTitle('');
      setSourceText('');
      setSourceError(null);
      setIsGenerating(false);
      return;
    }

    previousFocusRef.current = document.activeElement as HTMLElement | null;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isGenerating) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
    });

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      previousFocusRef.current?.focus();
    };
  }, [isGenerating, onClose, open]);

  if (!open) {
    return null;
  }

  const handleGenerate = async () => {
    const trimmedSource = sourceText.trim();
    if (!trimmedSource) {
      setSourceError('Paste a script, outline, or scene brief to generate a draft.');
      return;
    }

    setSourceError(null);
    setIsGenerating(true);

    try {
      await onGenerate({
        title: title.trim() || undefined,
        sourceText: trimmedSource,
      });
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        onClick={() => {
          if (!isGenerating) {
            onClose();
          }
        }}
        role="dialog"
        aria-modal="true"
        aria-label="Import Script"
      >
        <div className="absolute inset-0 bg-void/80 backdrop-blur-sm" />
        <motion.div
          ref={dialogRef}
          initial={{ opacity: 0, scale: 0.96, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 10 }}
          className="relative w-full max-w-3xl overflow-hidden rounded-3xl border border-border bg-elevated shadow-cinematic"
          onClick={(event) => event.stopPropagation()}
          data-testid="script-import-dialog"
        >
          <div className="border-b border-border bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.01))] px-6 py-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 type-caption text-text-muted">
                  <FileText className="h-3.5 w-3.5" />
                  Storyboard Import
                </p>
                <h2 className="mt-3 type-title text-text-primary">Import script into {projectName}</h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-text-body">
                  Paste screenplay pages, an outline, or a rough creative brief. Vision Studio will stage scenes,
                  beats, and continuity elements into a reviewable draft before anything touches the live storyboard.
                </p>
              </div>

              <button
                type="button"
                onClick={onClose}
                disabled={isGenerating}
                className="rounded-full border border-border bg-surface px-3 py-1.5 text-xs text-text-body transition hover:bg-canvas hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40"
              >
                Close
              </button>
            </div>
          </div>

          <div className="space-y-5 px-6 py-6">
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
              <div className="space-y-4">
                <Input
                  label="Draft title"
                  placeholder="Optional draft title"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  helper="Leave blank to let the importer derive a title from the first detected scene."
                />

                <Textarea
                  ref={textareaRef}
                  label="Script or outline"
                  placeholder={`INT. CONTROL ROOM - NIGHT\n- Captain Nova scans the console.\n\nEXT. ROOFTOP - DAWN\n- The skyline flickers below.`}
                  rows={14}
                  value={sourceText}
                  onChange={(event) => setSourceText(event.target.value)}
                  error={sourceError ?? undefined}
                  helper="Screenplay headings, paragraphs, bullets, and rough briefs all work. The first pass is deterministic and review-first."
                />
              </div>

              <div className="space-y-4 rounded-2xl border border-border bg-surface/70 p-4">
                <div className="rounded-2xl border border-border bg-canvas px-4 py-4">
                  <p className="type-ui text-text-muted">What gets staged</p>
                  <ul className="mt-3 space-y-2 text-sm text-text-body">
                    <li>Scene candidates and ordering</li>
                    <li>Shot beat suggestions</li>
                    <li>Characters, locations, props, and style cues</li>
                    <li>Review issues before storyboard commit</li>
                  </ul>
                </div>

                <div className="rounded-2xl border border-dashed border-accent-primary/30 bg-accent-primary-muted/30 px-4 py-4">
                  <div className="flex items-start gap-3">
                    <Sparkles className="mt-0.5 h-4 w-4 text-accent-primary" />
                    <div>
                      <p className="type-ui text-text-primary">Review-first import</p>
                      <p className="mt-1 text-sm leading-6 text-text-body">
                        Import generates a draft only. You will still rename scenes, discard weak candidates, and
                        approve the draft before the storyboard changes.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-border pt-4">
              <Button variant="secondary" onClick={onClose} disabled={isGenerating}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handleGenerate}
                isLoading={isGenerating}
                data-primary-action
              >
                Generate Draft
              </Button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
