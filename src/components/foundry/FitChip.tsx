import { Loader2 } from 'lucide-react';
import { Led } from '@/components/hardware';
import type { RuntimePlan } from '@/types/model';
import { foundryFit } from './foundryFit';

interface FitChipProps {
  /** Resolved runtime plan, or null when none has been requested yet. */
  plan: RuntimePlan | null;
  /** Show the resolving spinner while a runtime plan is in flight. */
  loading?: boolean;
}

/**
 * Compact hardware-fit chip: a spinner while resolving, otherwise an LED whose
 * tone reflects the real fit verdict plus the readiness label. Renders nothing
 * when there is no plan and not loading.
 */
export function FitChip({ plan, loading = false }: FitChipProps) {
  if (loading) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-text-muted" data-testid="fit-chip-loading">
        <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />
        Checking fit...
      </span>
    );
  }

  if (!plan) return null;

  const { tone, label } = foundryFit(plan);
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-text-body" data-testid="fit-chip">
      {tone ? <Led color={tone} size={6} /> : null}
      <span>{label}</span>
    </span>
  );
}
