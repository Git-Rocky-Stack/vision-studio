import { useState } from 'react';
import { Trash2, RefreshCw, Gauge, Loader2 } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useAppStore } from '@/store/appStore';
import type { ModelRecord, RuntimePlan } from '@/types/model';
import { SecurityBadges } from './SecurityBadges';
import { FitChip } from './FitChip';

interface InstalledModelCardProps {
  model: ModelRecord;
}

/** Neutral capability/runtime/quality/hardware chip. */
function MetaChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="mono-label rounded border border-border px-1.5 py-0.5 text-text-muted">
      {children}
    </span>
  );
}

/**
 * One installed model with its metadata, security posture, and lifecycle
 * actions. Remove confirms through the shared ConfirmDialog before calling
 * models.delete and reloading the catalog; Convert (offered only for pickle
 * checkpoints) calls convertModel; "Check fit" resolves the runtime plan on
 * demand and renders the shared FitChip so the verdict matches Generate.
 */
export function InstalledModelCard({ model }: InstalledModelCardProps) {
  const { convertModel, resolveRuntime, loadModels } = useAppStore(
    useShallow((s) => ({
      convertModel: s.convertModel,
      resolveRuntime: s.resolveRuntime,
      loadModels: s.loadModels,
    })),
  );

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [converting, setConverting] = useState(false);
  const [fitPlan, setFitPlan] = useState<RuntimePlan | null>(null);
  const [fitLoading, setFitLoading] = useState(false);
  const [fitError, setFitError] = useState<string | null>(null);

  const confirmDelete = async () => {
    setBusy(true);
    try {
      await window.electron.models.delete(model.id);
      await loadModels();
    } finally {
      setBusy(false);
      setDeleteOpen(false);
    }
  };

  const handleConvert = async () => {
    setConverting(true);
    try {
      await convertModel(model.id);
      await loadModels();
    } finally {
      setConverting(false);
    }
  };

  const checkFit = async () => {
    setFitLoading(true);
    setFitError(null);
    try {
      const plan = await resolveRuntime(model.id);
      setFitPlan(plan);
    } catch (error) {
      setFitError(error instanceof Error ? error.message : 'Preflight failed');
    } finally {
      setFitLoading(false);
    }
  };

  const isPickle = model.format === 'pickle';

  return (
    <div className="raised-panel flex flex-col gap-3 rounded-md p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-text-primary" title={model.name}>
            {model.name}
          </p>
          <p className="mono-label truncate text-text-muted">
            {model.base_architecture} - {model.size}
          </p>
        </div>
        <button
          type="button"
          aria-label="Remove model"
          disabled={busy}
          onClick={() => setDeleteOpen(true)}
          className="flex-shrink-0 rounded-md p-1.5 text-text-body hover:bg-status-error/10 hover:text-status-error disabled:opacity-40"
        >
          <Trash2 aria-hidden="true" className="h-4 w-4" />
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <MetaChip>{model.capability}</MetaChip>
        <MetaChip>{model.runtime}</MetaChip>
        <MetaChip>{model.quality}</MetaChip>
        <MetaChip>{model.hardware_class}</MetaChip>
        {model.vram && <MetaChip>{model.vram} VRAM</MetaChip>}
      </div>

      <SecurityBadges record={model} />

      <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
        {fitLoading || fitPlan ? (
          <FitChip plan={fitPlan} loading={fitLoading} />
        ) : (
          <Button variant="secondary" size="sm" icon={Gauge} onClick={checkFit}>
            Check fit
          </Button>
        )}
        {fitError && <span className="text-xs text-status-error">{fitError}</span>}
        {isPickle && (
          <Button
            variant="secondary"
            size="sm"
            icon={converting ? Loader2 : RefreshCw}
            isLoading={converting}
            onClick={handleConvert}
            title="Convert this pickle checkpoint to the safer safetensors format"
          >
            Convert
          </Button>
        )}
      </div>

      <ConfirmDialog
        open={deleteOpen}
        title="Remove model"
        message={`Remove "${model.name}" from your library? Linked source files are left in place; managed downloads are deleted from disk.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteOpen(false)}
      />
    </div>
  );
}
