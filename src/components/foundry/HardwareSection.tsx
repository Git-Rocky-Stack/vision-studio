import { useState } from 'react';
import { RefreshCw, Cpu, Gauge } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { Button } from '@/components/ui/Button';
import { useAppStore } from '@/store/appStore';
import type { ModelRecord, RuntimePlan } from '@/types/model';
import { FitChip } from './FitChip';

/** Format a byte count as a human string, e.g. "24.0 GB". */
function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(1)} ${units[unit]}`;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="mono-label text-text-muted">{label}</span>
      <span className="text-sm text-text-primary">{value}</span>
    </div>
  );
}

/** One model row with a lazily-resolved hardware fit verdict. */
function ModelFitRow({ model }: { model: ModelRecord }) {
  const resolveRuntime = useAppStore((s) => s.resolveRuntime);
  const [plan, setPlan] = useState<RuntimePlan | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checkFit = async () => {
    setLoading(true);
    setError(null);
    try {
      setPlan(await resolveRuntime(model.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Preflight failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <li className="recessed-well flex items-center justify-between gap-2 rounded-md p-2">
      <div className="min-w-0">
        <p className="truncate text-sm text-text-primary" title={model.name}>
          {model.name}
        </p>
        <span className="mono-label text-text-muted">{model.base_architecture}</span>
      </div>
      <div className="flex flex-shrink-0 items-center gap-2">
        {error && <span className="text-xs text-status-error">{error}</span>}
        {loading || plan ? (
          <FitChip plan={plan} loading={loading} />
        ) : (
          <Button variant="secondary" size="sm" icon={Gauge} onClick={checkFit}>
            Check fit
          </Button>
        )}
      </div>
    </li>
  );
}

/**
 * Hardware - the GPU/CPU profile plus per-model fit. The profile card mirrors
 * GET /api/hardware (GPU, VRAM, system RAM, disk) with byte formatting and a
 * Refresh that re-reads the live snapshot. Each installed model resolves its
 * runtime fit on demand into the shared FitChip, so the Foundry and Generate
 * agree on the verdict.
 */
export function HardwareSection() {
  const { hardwareProfile, availableModels, loadHardwareProfile } = useAppStore(
    useShallow((s) => ({
      hardwareProfile: s.hardwareProfile,
      availableModels: s.availableModels,
      loadHardwareProfile: s.loadHardwareProfile,
    })),
  );

  const [refreshing, setRefreshing] = useState(false);

  const refresh = async () => {
    setRefreshing(true);
    try {
      await loadHardwareProfile();
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2">
        <h2 className="mono-label text-text-muted">Hardware profile</h2>
        <Button
          variant="secondary"
          size="sm"
          icon={RefreshCw}
          isLoading={refreshing}
          onClick={refresh}
        >
          Refresh
        </Button>
      </div>

      {hardwareProfile ? (
        <div className="raised-panel rounded-md p-4">
          <div className="flex items-center gap-2 pb-3">
            <Cpu aria-hidden="true" className="h-4 w-4 text-text-muted" />
            <span className="text-sm font-medium text-text-primary">
              {hardwareProfile.gpu_name ?? 'No CUDA GPU detected'}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
            <Stat label="VRAM total" value={formatBytes(hardwareProfile.vram_total_bytes)} />
            <Stat label="VRAM free" value={formatBytes(hardwareProfile.vram_free_bytes)} />
            <Stat
              label="System RAM"
              value={formatBytes(hardwareProfile.system_ram_total_bytes)}
            />
            <Stat label="Disk free" value={formatBytes(hardwareProfile.disk_free_bytes)} />
            <Stat label="CUDA" value={hardwareProfile.cuda_version ?? 'n/a'} />
            <Stat
              label="Compute"
              value={
                hardwareProfile.gpu_available
                  ? `${hardwareProfile.compute_major}.${hardwareProfile.compute_minor}`
                  : 'CPU only'
              }
            />
          </div>
        </div>
      ) : (
        <p className="text-sm text-text-muted">
          Hardware information unavailable. Connect the backend, then refresh.
        </p>
      )}

      <div className="space-y-3">
        <h2 className="mono-label text-text-muted">Model fit</h2>
        {availableModels.length === 0 ? (
          <p className="text-sm text-text-muted">
            No installed models to check. Acquire a model to preflight its hardware fit.
          </p>
        ) : (
          <ul className="space-y-2">
            {availableModels.map((model) => (
              <ModelFitRow key={model.id} model={model} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
