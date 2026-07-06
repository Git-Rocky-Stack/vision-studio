import { useEffect } from 'react';

import { useAppStore } from '@/store/appStore';

/**
 * Subscribes the Studio preview canvas to backend step-image pushes (#33).
 * Frames are keyed to the run the preview is tracking (previewJobId); pushes
 * for any other job are ignored. Safe to mount without the preload bridge
 * (tests, storybook-style rendering) - it just does nothing.
 */
export function useStepImageSubscription(): void {
  useEffect(() => {
    const subscribe = window.electron?.generation?.onStepImage;
    if (!subscribe) {
      return undefined;
    }

    return subscribe((data) => {
      const state = useAppStore.getState();
      if (!data || data.job_id !== state.previewJobId) {
        return;
      }
      if (data.total_steps > 0 && data.total_steps !== state.totalSteps) {
        state.setTotalSteps(data.total_steps);
      }
      state.addStepImage(data.step, data.image);
    });
  }, []);
}
