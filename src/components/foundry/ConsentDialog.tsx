import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import type { ConsentKind } from '@/types/model';

interface ConsentDialogProps {
  open: boolean;
  kind: ConsentKind;
  modelName: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Per-kind risk copy for the security consent gate. Pickle checkpoints execute
 * arbitrary code the instant they deserialize; trust_remote_code runs Python
 * shipped in the model repository. Both are real code-execution boundaries, so
 * the dialog states the risk plainly before the user proceeds.
 */
const CONSENT_COPY: Record<ConsentKind, { title: string; message: (name: string) => string }> = {
  pickle: {
    title: 'Pickle checkpoint - security risk',
    message: (name) =>
      `"${name}" is distributed as a pickle checkpoint, which can run arbitrary code the moment it loads. Only continue if you trust the publisher. Prefer a safetensors build when one is available.`,
  },
  trust_remote_code: {
    title: 'Runs repository code',
    message: (name) =>
      `"${name}" requires trust_remote_code: loading it runs Python code bundled in the model repository on your machine. Only continue if you trust the source.`,
  },
};

/**
 * Security consent gate shown before acquiring a model that executes code on
 * load. Wraps the shared focus-trapped ConfirmDialog with kind-specific copy so
 * the consent grant is an explicit, informed action.
 */
export function ConsentDialog({ open, kind, modelName, onConfirm, onCancel }: ConsentDialogProps) {
  const copy = CONSENT_COPY[kind];
  return (
    <ConfirmDialog
      open={open}
      title={copy.title}
      message={copy.message(modelName)}
      confirmLabel="I understand, continue"
      cancelLabel="Cancel"
      variant="danger"
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}
