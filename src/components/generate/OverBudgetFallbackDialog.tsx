import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import type { ProviderId } from '../../../shared/providerRouting';

const PROVIDER_LABEL: Record<Exclude<ProviderId, 'local'>, string> = {
  openrouter: 'OpenRouter',
  huggingface: 'HuggingFace',
};

interface OverBudgetFallbackDialogProps {
  open: boolean;
  candidates: ProviderId[];
  onRouteTo: (provider: ProviderId) => void;
  onRunLocally: () => void;
  onCancel: () => void;
}

/**
 * Surfaces the M5 over-budget verdict (M6 S8): run locally anyway (likely OOM),
 * route to a capable configured hosted provider, or cancel. Mirrors
 * ConfirmDialog's focus-trap + Carbon Pro overlay pattern.
 */
export function OverBudgetFallbackDialog({
  open,
  candidates,
  onRouteTo,
  onRunLocally,
  onCancel,
}: OverBudgetFallbackDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onCancel]);

  const hosted = candidates.filter(
    (candidate): candidate is Exclude<ProviderId, 'local'> => candidate !== 'local',
  );

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
          aria-label="Local run is over budget"
        >
          <div className="absolute inset-0 bg-void/80 backdrop-blur-sm" />
          <motion.div
            ref={dialogRef}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            onClick={(event) => event.stopPropagation()}
            className="relative mx-4 w-full max-w-md rounded-xl border border-border bg-elevated p-6 shadow-cinematic"
          >
            <div className="flex items-start gap-4">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-md bg-status-warning-muted">
                <AlertTriangle className="h-5 w-5 text-status-warning" />
              </div>
              <div className="min-w-0">
                <h3 className="type-section text-text-primary">This run is over your GPU budget</h3>
                <p className="mt-1 type-ui leading-relaxed text-text-body">
                  The selected model is unlikely to fit in VRAM. Route it to a configured hosted
                  provider, or run locally anyway.
                </p>
              </div>
            </div>

            <div className="mt-5 flex flex-col gap-2">
              {hosted.length > 0 ? (
                hosted.map((provider) => (
                  <Button
                    key={provider}
                    variant="primary"
                    size="sm"
                    data-testid={`fallback-route-${provider}`}
                    onClick={() => onRouteTo(provider)}
                  >
                    Route to {PROVIDER_LABEL[provider]}
                  </Button>
                ))
              ) : (
                <p data-testid="fallback-no-candidates" className="type-caption text-text-muted">
                  No configured hosted provider can run this request. Add a key and model in
                  Settings, or run locally anyway.
                </p>
              )}
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={onCancel}>
                Cancel
              </Button>
              <Button variant="secondary" size="sm" data-testid="fallback-run-locally" onClick={onRunLocally}>
                Run locally anyway
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
