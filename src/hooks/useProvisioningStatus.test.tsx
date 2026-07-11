import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useAppStore } from '@/store/appStore';
import { provisioningInitialState } from '@/store/slices/provisioningSlice';
import { PROVISION_POLL_INTERVAL_MS, useProvisioningStatus } from './useProvisioningStatus';
import type { ProvisionModel, ProvisionStatus } from '@/types/model';

function model(over: Partial<ProvisionModel> = {}): ProvisionModel {
  return {
    id: 'sd-1-5', name: 'Stable Diffusion 1.5', license: null, attribution: null,
    approx_bytes: 100, format: null, gated: false, status: 'missing',
    progress: 0, error: null, gate_url: null, ...over,
  };
}

function snapshot(over: Partial<ProvisionStatus> = {}): ProvisionStatus {
  return {
    schema_version: 1, overall_progress: 0, total_bytes: 100, present_bytes: 0,
    remaining_bytes: 100, speed: 0, eta: null, total_count: 1, ready_count: 0,
    active_count: 0, error_count: 0, complete: false, attribution: null,
    models: [model()], ...over,
  };
}

describe('useProvisioningStatus', () => {
  let statusMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    statusMock = vi.fn().mockResolvedValue(snapshot());
    window.electron = { provisioning: { status: statusMock } } as unknown as Window['electron'];
    useAppStore.setState({
      ...provisioningInitialState,
      systemInfo: { ...useAppStore.getState().systemInfo, backendConnected: false },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('fetches once the backend connects', async () => {
    renderHook(() => useProvisioningStatus());
    expect(statusMock).not.toHaveBeenCalled();
    await act(async () => {
      useAppStore.setState({
        systemInfo: { ...useAppStore.getState().systemInfo, backendConnected: true },
      });
    });
    expect(statusMock).toHaveBeenCalledOnce();
  });

  it('re-polls while a job is live', async () => {
    renderHook(() => useProvisioningStatus());
    await act(async () => {
      useAppStore.setState({
        provisionStatus: snapshot({ models: [model({ status: 'downloading' })] }),
      });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PROVISION_POLL_INTERVAL_MS);
    });
    expect(statusMock).toHaveBeenCalled();
  });

  it('does not poll a paused set', async () => {
    renderHook(() => useProvisioningStatus());
    await act(async () => {
      useAppStore.setState({
        provisionStatus: snapshot({ models: [model({ status: 'paused' })] }),
      });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PROVISION_POLL_INTERVAL_MS * 3);
    });
    expect(statusMock).not.toHaveBeenCalled();
  });
});
