import { useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '@/store/appStore';
import { hasLiveProvisionJob } from '@/store/slices/provisioningSlice';

/** How often the auto-set snapshot is re-polled while a download is in flight
 * (matches the Foundry download-queue poller cadence). */
export const PROVISION_POLL_INTERVAL_MS = 2500;

/**
 * #34 installer PR3: app-level provisioning status keeper.
 *
 * Fetches the auto-set snapshot whenever the backend comes up, then re-arms a
 * short poll only while a provisioning job is actually moving. Paused and
 * terminal sets stop polling - the next state change is user-driven and every
 * user action already returns a fresh snapshot.
 */
export function useProvisioningStatus(): void {
  const { backendConnected, provisionStatus, refreshProvisionStatus } = useAppStore(
    useShallow((s) => ({
      backendConnected: s.systemInfo.backendConnected,
      provisionStatus: s.provisionStatus,
      refreshProvisionStatus: s.refreshProvisionStatus,
    })),
  );

  useEffect(() => {
    if (!backendConnected || !window.electron?.provisioning) return;
    void refreshProvisionStatus();
  }, [backendConnected, refreshProvisionStatus]);

  useEffect(() => {
    if (!hasLiveProvisionJob(provisionStatus)) return;
    const timer = setTimeout(() => {
      void refreshProvisionStatus();
    }, PROVISION_POLL_INTERVAL_MS);
    return () => clearTimeout(timer);
  }, [provisionStatus, refreshProvisionStatus]);
}
