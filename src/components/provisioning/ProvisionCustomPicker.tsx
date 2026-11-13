import { useEffect, useId, useRef } from 'react';
import { Download, HardDrive } from 'lucide-react';
import type { ProvisionModel } from '@/types/model';
import { cn } from '@/utils/cn';
import { formatBytes } from '@/utils/formatUtils';
import type { DiskCheck } from './FirstRunProvisioning';
import {
  groupByTier,
  isInstallable,
  modelRemainingBytes,
  type SelectionSummary,
} from './provisionSelection';

const LOCKED_STATUS_LABEL: Partial<Record<ProvisionModel['status'], string>> = {
  ready: 'Installed',
  queued: 'Queued',
  downloading: 'Downloading',
  verifying: 'Verifying',
  paused: 'Paused - resume below',
  error: 'Failed - retry below',
};

interface GroupCheckboxProps {
  id: string;
  label: string;
  checked: boolean;
  indeterminate: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
}

/** "Select all in group" box; `indeterminate` is a DOM property, not an attribute. */
function GroupCheckbox({ id, label, checked, indeterminate, disabled, onChange }: GroupCheckboxProps) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return (
    <input
      ref={ref}
      id={id}
      type="checkbox"
      aria-label={label}
      checked={checked}
      disabled={disabled}
      onChange={(event) => onChange(event.target.checked)}
      className="h-4 w-4 flex-shrink-0 accent-accent-primary disabled:cursor-not-allowed"
    />
  );
}

interface ProvisionCustomPickerProps {
  id: string;
  models: ProvisionModel[];
  selected: ReadonlySet<string>;
  onSelectedChange: (next: Set<string>) => void;
  summary: SelectionSummary;
  disk: DiskCheck;
  busy: boolean;
  onInstall: () => void;
  onClose: () => void;
}

/**
 * K3 "Custom..." checklist: the auto-set grouped by tier with per-model sizes,
 * a select-all per group and a live running total. Installed or in-flight
 * models are shown for context but cannot be toggled.
 */
export function ProvisionCustomPicker({
  id,
  models,
  selected,
  onSelectedChange,
  summary,
  disk,
  busy,
  onInstall,
  onClose,
}: ProvisionCustomPickerProps) {
  const baseId = useId();
  const groups = groupByTier(models);
  const blocked = disk.level === 'insufficient';

  const setMany = (ids: string[], include: boolean) => {
    const next = new Set(selected);
    for (const modelId of ids) {
      if (include) next.add(modelId);
      else next.delete(modelId);
    }
    onSelectedChange(next);
  };

  return (
    <section
      id={id}
      data-testid="provision-custom"
      aria-label="Choose models to install"
      className="recessed-well mt-6 rounded-md p-4"
    >
      <div className="flex flex-col gap-4">
        {groups.map((group) => {
          const installable = group.models.filter(isInstallable);
          const chosen = installable.filter((m) => selected.has(m.id));
          const groupBytes = installable.reduce((total, m) => total + modelRemainingBytes(m), 0);
          const groupLabelId = `${baseId}-${group.tier}-label`;
          return (
            <fieldset key={group.tier} aria-labelledby={groupLabelId} className="flex flex-col gap-2">
              <div className="flex items-center gap-3">
                <GroupCheckbox
                  id={`${baseId}-${group.tier}-all`}
                  label={`Select all ${group.label.toLowerCase()} models`}
                  checked={installable.length > 0 && chosen.length === installable.length}
                  indeterminate={chosen.length > 0 && chosen.length < installable.length}
                  disabled={installable.length === 0 || busy}
                  onChange={(checked) => setMany(installable.map((m) => m.id), checked)}
                />
                <div className="min-w-0 flex-1">
                  <p id={groupLabelId} className="mono-label text-text-primary">
                    {group.label}
                  </p>
                  <p className="text-xs text-text-muted">{group.description}</p>
                </div>
                <span className="mono-label flex-shrink-0 text-text-muted">
                  {installable.length > 0 ? formatBytes(groupBytes) : 'Installed'}
                </span>
              </div>
              <ul className="flex flex-col gap-1 pl-7">
                {group.models.map((model) => {
                  const toggleable = isInstallable(model);
                  const inputId = `${baseId}-model-${model.id}`;
                  return (
                    <li key={model.id} className="flex min-h-8 items-center gap-3">
                      <input
                        id={inputId}
                        type="checkbox"
                        checked={toggleable ? selected.has(model.id) : model.status === 'ready'}
                        disabled={!toggleable || busy}
                        onChange={(event) => setMany([model.id], event.target.checked)}
                        className="h-4 w-4 flex-shrink-0 accent-accent-primary disabled:cursor-not-allowed"
                      />
                      <label
                        htmlFor={inputId}
                        className={cn(
                          'min-w-0 flex-1 truncate text-sm',
                          toggleable ? 'cursor-pointer text-text-primary' : 'text-text-muted',
                        )}
                        title={model.name}
                      >
                        {model.name}
                        {model.gated ? <span className="ml-2 mono-label text-status-warning">Gated</span> : null}
                      </label>
                      <span className="mono-label flex-shrink-0 text-text-muted">
                        {toggleable ? formatBytes(modelRemainingBytes(model)) : LOCKED_STATUS_LABEL[model.status]}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </fieldset>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <div className="flex min-w-0 flex-col gap-1">
          <p data-testid="provision-custom-total" aria-live="polite" className="mono-label text-text-primary">
            {summary.count === 0
              ? 'No models selected'
              : `${summary.count} ${summary.count === 1 ? 'model' : 'models'} selected - ${formatBytes(summary.bytes)}`}
          </p>
          {summary.count > 0 ? (
            <p
              className={cn(
                'mono-label inline-flex items-center gap-1.5',
                disk.level === 'insufficient' && 'text-status-error',
                disk.level === 'tight' && 'text-status-warning',
                disk.level === 'ok' && 'text-status-success',
                disk.level === 'unknown' && 'text-text-muted',
              )}
            >
              <HardDrive aria-hidden="true" className="h-3.5 w-3.5" />
              {disk.message}
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-border px-4 py-2.5 text-sm text-text-body transition-colors hover:border-border-hover hover:text-text-primary"
          >
            Back
          </button>
          <button
            type="button"
            data-testid="provision-install-custom"
            onClick={onInstall}
            disabled={summary.count === 0 || blocked || busy}
            className="btn-chrome vx-btn-chrome inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Download aria-hidden="true" className="h-4 w-4" />
            {summary.count === 0 ? 'Install selected' : `Install selected (${formatBytes(summary.bytes)})`}
          </button>
        </div>
      </div>
    </section>
  );
}
