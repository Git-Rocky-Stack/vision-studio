import type { AppSet, AppGet } from '../appStore.types';
import type { AccelerationSettings, AppliedAcceleration } from '@/types/acceleration';
import { DEFAULT_ACCELERATION_SETTINGS } from '@/types/acceleration';

export const accelerationInitialState = {
  accelerationSettings: { ...DEFAULT_ACCELERATION_SETTINGS } as AccelerationSettings,
  lastAppliedAcceleration: null as AppliedAcceleration | null,
};

export function createAccelerationActions(set: AppSet, _get: AppGet) {
  return {
    updateAccelerationSettings: (patch: Partial<AccelerationSettings>) =>
      set((state) => ({
        accelerationSettings: { ...state.accelerationSettings, ...patch },
      })),
    setLastAppliedAcceleration: (applied: AppliedAcceleration | null) =>
      set({ lastAppliedAcceleration: applied }),
  };
}
