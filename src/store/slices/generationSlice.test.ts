import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAppStore } from '@/store/appStore';

describe('generationSlice no-op updates', () => {
  beforeEach(() => {
    useAppStore.setState(useAppStore.getInitialState());
  });

  it('updateJob for an unknown job id does not notify subscribers', () => {
    const listener = vi.fn();
    const unsubscribe = useAppStore.subscribe(listener);

    useAppStore.getState().updateJob('no-such-job', { progress: 50 });

    unsubscribe();
    expect(listener).not.toHaveBeenCalled();
  });

  it('setSystemInfo with identical fields keeps the existing object and notifies nobody', () => {
    const info = {
      gpuAvailable: true,
      gpuName: 'RTX',
      comfyuiConnected: false,
      modelsCount: 3,
      backendConnected: true,
    };
    useAppStore.getState().setSystemInfo(info);
    const stored = useAppStore.getState().systemInfo;

    const listener = vi.fn();
    const unsubscribe = useAppStore.subscribe(listener);
    useAppStore.getState().setSystemInfo({ ...info });
    unsubscribe();

    expect(listener).not.toHaveBeenCalled();
    expect(useAppStore.getState().systemInfo).toBe(stored);
  });

  it('setSystemInfo stores a changed report', () => {
    const info = { gpuAvailable: false, comfyuiConnected: false, modelsCount: 0, backendConnected: false };
    useAppStore.getState().setSystemInfo(info);
    useAppStore.getState().setSystemInfo({ ...info, backendConnected: true });

    expect(useAppStore.getState().systemInfo.backendConnected).toBe(true);
  });
});
