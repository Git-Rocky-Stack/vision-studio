import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAppStore } from '@/store/appStore';
import type { StepImageEvent } from '@/types/electron';

import { useStepImageSubscription } from './useStepImageSubscription';

type StepImageCallback = (data: StepImageEvent) => void;

describe('useStepImageSubscription', () => {
  let capturedCallback: StepImageCallback | null;
  let unsubscribe: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    useAppStore.setState(useAppStore.getInitialState(), true);
    capturedCallback = null;
    unsubscribe = vi.fn();
    vi.stubGlobal('window', Object.assign(window, {
      electron: {
        generation: {
          onStepImage: (callback: StepImageCallback) => {
            capturedCallback = callback;
            return unsubscribe;
          },
        },
      },
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('stores frames for the tracked job', () => {
    useAppStore.getState().beginPreview('job-1', 0);
    renderHook(() => useStepImageSubscription());

    capturedCallback!({
      type: 'step_image', job_id: 'job-1', step: 4, total_steps: 25,
      image: 'data:image/jpeg;base64,AAAA',
    });

    const state = useAppStore.getState();
    expect(state.stepImages.get(4)).toBe('data:image/jpeg;base64,AAAA');
    expect(state.totalSteps).toBe(25);
    expect(state.currentStep).toBe(4);
  });

  it('ignores frames for other jobs', () => {
    useAppStore.getState().beginPreview('job-1', 25);
    renderHook(() => useStepImageSubscription());

    capturedCallback!({
      type: 'step_image', job_id: 'other-job', step: 4, total_steps: 25,
      image: 'data:image/jpeg;base64,BBBB',
    });

    expect(useAppStore.getState().stepImages.size).toBe(0);
  });

  it('ignores frames when no preview is tracking (previewJobId null)', () => {
    renderHook(() => useStepImageSubscription());

    capturedCallback!({
      type: 'step_image', job_id: 'job-1', step: 1, total_steps: 25,
      image: 'data:image/jpeg;base64,CCCC',
    });

    expect(useAppStore.getState().stepImages.size).toBe(0);
  });

  it('unsubscribes on unmount', () => {
    const { unmount } = renderHook(() => useStepImageSubscription());
    unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('is a no-op without the preload bridge', () => {
    vi.stubGlobal('window', Object.assign(window, { electron: undefined }));
    expect(() => renderHook(() => useStepImageSubscription())).not.toThrow();
  });
});
