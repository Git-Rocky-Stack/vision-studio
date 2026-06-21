import { useShallow } from 'zustand/react/shallow';
import { Cpu, Gauge, Zap } from 'lucide-react';

import { MonoLabel } from '@/components/hardware/MonoLabel';
import { useAppStore } from '@/store/appStore';
import type { AppliedAcceleration, TriState } from '@/types/acceleration';

type OptimizationKey =
  | 'sdpa' | 'channelsLast' | 'compile' | 'quantization' | 'attentionSlicing' | 'tensorrt';

const OPTIMIZATIONS: Array<{ key: OptimizationKey; label: string; hint: string }> = [
  { key: 'compile', label: 'Compile', hint: 'torch.compile (reduce-overhead)' },
  { key: 'quantization', label: 'Quantization', hint: 'int8 / fp8 where proven safe' },
  { key: 'sdpa', label: 'SDPA', hint: 'Fused attention' },
  { key: 'channelsLast', label: 'Channels Last', hint: 'Conv-UNet families' },
  { key: 'attentionSlicing', label: 'Attention Slicing', hint: 'Only under VRAM pressure' },
  { key: 'tensorrt', label: 'TensorRT', hint: 'Engine build (one-time)' },
];

const TRISTATES: TriState[] = ['auto', 'on', 'off'];

export function PerformancePanel() {
  const { settings, updateSettings, applied } = useAppStore(
    useShallow((s) => ({
      settings: s.accelerationSettings,
      updateSettings: s.updateAccelerationSettings,
      applied: s.lastAppliedAcceleration,
    }))
  );
  const trtStatus = tensorrtStatus(applied);

  return (
    <div className="space-y-5">
      <header className="flex items-center gap-2">
        <Gauge className="w-4 h-4 text-accent-primary" aria-hidden />
        <MonoLabel>Performance</MonoLabel>
      </header>

      <label className="flex items-center justify-between rounded-md border border-border bg-elevated px-3 py-2">
        <span className="text-label text-text-body">Master Enable</span>
        <input
          type="checkbox"
          checked={settings.masterEnable}
          onChange={(e) => updateSettings({ masterEnable: e.target.checked })}
          aria-label="Master Enable"
        />
      </label>

      <div className={`space-y-3 transition-opacity ${settings.masterEnable ? '' : 'opacity-50'}`}>
        {OPTIMIZATIONS.map(({ key, label, hint }) => (
          <div key={key} className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-label text-text-body">{label}</span>
              <span className="text-xs text-text-muted data-mono">{hint}</span>
            </div>
            <div className="flex gap-2">
              {TRISTATES.map((value) => (
                <button
                  key={value}
                  type="button"
                  disabled={!settings.masterEnable}
                  onClick={() => updateSettings({ [key]: value })}
                  aria-label={`${label} ${value}`}
                  className={
                    settings[key] === value
                      ? 'flex-1 py-1.5 rounded-md data-mono text-xs font-medium transition-all bg-accent-primary text-void shadow-accent-subtle disabled:cursor-not-allowed'
                      : 'flex-1 py-1.5 rounded-md data-mono text-xs font-medium transition-all bg-elevated text-text-body border border-border hover:border-border-hover disabled:cursor-not-allowed disabled:hover:border-border'
                  }
                >
                  {value.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {applied ? (
        <section className="space-y-2 rounded-md border border-border bg-base p-3">
          <div className="flex items-center gap-2">
            <Zap className="w-3.5 h-3.5 text-accent-primary" aria-hidden />
            <MonoLabel>Applied This Run</MonoLabel>
          </div>
          {trtStatus ? (
            <div className="flex items-center justify-between">
              <span className="text-xs text-text-muted data-mono uppercase">TensorRT</span>
              <span className="text-xs data-mono text-text-body">{trtStatus}</span>
            </div>
          ) : null}
          <AppliedGroup title="Applied" items={applied.applied} tone="text-accent-primary" />
          <AppliedGroup title="Skipped" items={applied.skipped} tone="text-text-muted" />
          <AppliedGroup title="Fell Back" items={applied.fellBack} tone="text-amber-400" />
        </section>
      ) : (
        <p className="text-xs text-text-muted">
          <Cpu className="inline w-3 h-3 mr-1" aria-hidden />
          No generation has run yet this session.
        </p>
      )}
    </div>
  );
}

// Derive a concise TensorRT status from the applied readout. On fallback we
// return a short token rather than the full reason: the detailed reason already
// renders in the "Fell Back" group below, and duplicating it would surface the
// same text twice (and break single-match test queries).
function tensorrtStatus(applied: AppliedAcceleration | null): string | null {
  if (!applied) return null;
  const hit = applied.applied.find((a) => a.startsWith('tensorrt:'));
  if (hit === 'tensorrt:cached') return 'cached & active';
  if (hit === 'tensorrt:built') return 'built';
  const fell = applied.fellBack.find((f) => f.startsWith('tensorrt'));
  if (fell) return 'unavailable';
  return null;
}

function AppliedGroup({ title, items, tone }: { title: string; items: string[]; tone: string }) {
  if (items.length === 0) return null;
  return (
    <div className="space-y-1">
      <span className="text-xs text-text-muted data-mono uppercase">{title}</span>
      <ul className="space-y-0.5">
        {items.map((item) => (
          <li key={item} className={`text-xs data-mono ${tone}`}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
