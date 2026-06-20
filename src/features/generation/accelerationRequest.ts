// M9: map the renderer's camelCase acceleration store settings to the snake_case
// `acceleration_settings` field the Python backend expects on a generate request.
// Acceleration is a global user preference, so every local generate surface sends
// the current settings; the backend resolves them against the hardware fit.

import type { AccelerationSettings } from '@/types/acceleration';
import type { AccelerationRequestPayload } from '@/types/generation';

export function toAccelerationRequestPayload(
  settings: AccelerationSettings,
): AccelerationRequestPayload {
  return {
    master_enable: settings.masterEnable,
    sdpa: settings.sdpa,
    channels_last: settings.channelsLast,
    compile: settings.compile,
    quantization: settings.quantization,
    attention_slicing: settings.attentionSlicing,
    tensorrt: settings.tensorrt,
  };
}

// M9: shape of the result-side `acceleration` object returned by the backend
// (snake_case) mapped to the camelCase AppliedAcceleration the store holds.
export function fromAccelerationResult(
  acceleration:
    | { applied?: string[]; skipped?: string[]; fell_back?: string[] }
    | null
    | undefined,
) {
  if (!acceleration) {
    return null;
  }
  return {
    applied: acceleration.applied ?? [],
    skipped: acceleration.skipped ?? [],
    fellBack: acceleration.fell_back ?? [],
  };
}
