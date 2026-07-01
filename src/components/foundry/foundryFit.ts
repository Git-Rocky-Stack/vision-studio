import type { RuntimePlan } from '@/types/model';

const FIT_TONE: Record<string, 'play' | 'cue' | 'rec'> = {
  fits: 'play',
  'fits-with-offload': 'cue',
  'over-budget': 'rec',
  'cpu-only': 'rec',
};

export interface FoundryFitResult {
  /** LED tone, or null when the verdict is unknown (render no LED). */
  tone: 'play' | 'cue' | 'rec' | null;
  /** Human-readable readiness label. */
  label: string;
}

/**
 * Resolve a runtime plan into an LED tone + label, mirroring the
 * PreflightFooter verdict semantics so the Foundry and Generate agree:
 * fits=play, fits-with-offload=cue, over-budget/cpu-only=rec. A refusal forces
 * rec; missing components force cue; an unknown verdict yields a null tone.
 */
export function foundryFit(plan: RuntimePlan): FoundryFitResult {
  if (plan.refusal) {
    return { tone: 'rec', label: plan.refusal };
  }
  if (plan.missing_components.length > 0) {
    return { tone: 'cue', label: plan.readiness || 'Missing components' };
  }
  const tone = plan.fit ? FIT_TONE[plan.fit] ?? null : null;
  return { tone, label: plan.readiness || plan.fit || 'Unknown' };
}
