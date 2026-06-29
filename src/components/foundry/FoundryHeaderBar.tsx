import { Cpu } from 'lucide-react';
import { useAppStore } from '@/store/appStore';
import { Led } from '@/components/hardware';
import { ModelTokensBar } from './ModelTokensBar';

/**
 * Foundry header: a live GPU summary chip (from the hardware profile) plus the
 * HF/CivitAI token inputs. The chip mirrors the detected accelerator so the
 * acquisition surface always shows what the machine can run against.
 */
export function FoundryHeaderBar() {
  const hardwareProfile = useAppStore((s) => s.hardwareProfile);

  const gpuLabel = hardwareProfile
    ? (hardwareProfile.gpu_name ?? (hardwareProfile.gpu_available ? 'GPU detected' : 'CPU only'))
    : 'Detecting...';
  const ready = Boolean(hardwareProfile?.gpu_available);

  return (
    <div className="flex flex-col gap-4 border-b border-border pb-4 md:flex-row md:items-start md:justify-between">
      <div className="raised-control inline-flex items-center gap-2 self-start rounded-md px-3 py-1.5">
        <Cpu aria-hidden="true" className="h-4 w-4 text-text-muted" />
        <span className="text-sm text-text-primary">{gpuLabel}</span>
        {hardwareProfile && <Led color={ready ? 'play' : 'rec'} size={6} />}
      </div>
      <div className="w-full md:max-w-md">
        <ModelTokensBar />
      </div>
    </div>
  );
}
