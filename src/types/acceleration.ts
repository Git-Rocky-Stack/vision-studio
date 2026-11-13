// M9 acceleration settings + applied-acceleration surface (renderer side).
// Mirrors the backend foundry.accelerator AccelerationSettings/AppliedAcceleration.
// Tri-state per optimization: 'auto' lets the backend decide; 'on'/'off' override.

import type { SystemInfo } from '@/types/electron';

export type TriState = 'auto' | 'on' | 'off';

export interface AccelerationSettings {
  masterEnable: boolean;
  sdpa: TriState;
  channelsLast: TriState;
  compile: TriState;
  quantization: TriState;
  attentionSlicing: TriState;
  tensorrt: TriState;
}

export interface AppliedAcceleration {
  applied: string[];
  skipped: string[];
  fellBack: string[];
}

export const DEFAULT_ACCELERATION_SETTINGS: AccelerationSettings = {
  masterEnable: true,
  sdpa: 'auto',
  channelsLast: 'auto',
  compile: 'auto',
  quantization: 'auto',
  attentionSlicing: 'auto',
  tensorrt: 'auto',
};

/**
 * Whether each optional, separately packaged runtime feature is present in
 * this build, as the backend reports it (GET /api/system/info `availability`,
 * passed through by the IPC SystemInfo contract and kept in the store's
 * systemInfo). Release builds ship without the quantization (optimum-quanto /
 * torchao), TensorRT and semantic-embedding packages, so those features always
 * fall back; the UI disables them up front instead of offering a choice that
 * can never take effect. Absent data means "unknown" and leaves every control
 * enabled.
 */
export type OptionalFeatureAvailability = NonNullable<SystemInfo['availability']>;

/** One feature's availability, with the plain-language reason when unavailable. */
export type FeatureAvailability = NonNullable<OptionalFeatureAvailability[keyof OptionalFeatureAvailability]>;

/** Availability as reported in systemInfo, or an empty object when unreported. */
export function selectOptionalFeatureAvailability(systemInfo: {
  availability?: OptionalFeatureAvailability;
}): OptionalFeatureAvailability {
  return systemInfo.availability ?? {};
}

/** Default explanation when the backend marks a feature unavailable without a reason. */
export const UNAVAILABLE_IN_BUILD_REASON = 'Not included in this build.';
