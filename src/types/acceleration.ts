// M9 acceleration settings + applied-acceleration surface (renderer side).
// Mirrors the backend foundry.accelerator AccelerationSettings/AppliedAcceleration.
// Tri-state per optimization: 'auto' lets the backend decide; 'on'/'off' override.

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
