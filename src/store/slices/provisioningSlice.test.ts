import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAppStore } from '../appStore';
import { hasLiveProvisionJob, provisioningInitialState } from './provisioningSlice';
import type { ProvisionModel, ProvisionStatus } from '@/types/model';

function model(over: Partial<ProvisionModel> = {}): ProvisionModel {
  return {
    id: 'sd-1-5', name: 'Stable Diffusion 1.5', license: 'creativeml-openrail-m',
    attribution: null, approx_bytes: 100, format: null, gated: false,
    status: 'missing', progress: 0, error: null, gate_url: null, ...over,
  };
}

function snapshot(over: Partial<ProvisionStatus> = {}): ProvisionStatus {
  return {
    schema_version: 1, overall_progress: 0.5, total_bytes: 200, present_bytes: 100,
    remaining_bytes: 100, speed: 0, eta: null, total_count: 2, ready_count: 1,
    active_count: 0, error_count: 0, complete: false,
    attribution: 'Powered by Stability AI', models: [model()], ...over,
  };
}

function stubProvisioning(overrides: Record<string, ReturnType<typeof vi.fn>> = {}) {
  const bridge = {
    status: vi.fn().mockResolvedValue(snapshot()),
    start: vi.fn().mockResolvedValue(snapshot({ active_count: 1 })),
    pause: vi.fn().mockResolvedValue(snapshot()),
    resume: vi.fn().mockResolvedValue(snapshot()),
    cancel: vi.fn().mockResolvedValue(snapshot()),
    reverify: vi.fn().mockResolvedValue(snapshot()),
    ...overrides,
  };
  (globalThis as any).window = { electron: { provisioning: bridge } };
  return bridge;
}

describe('provisioningSlice', () => {
  beforeEach(() => {
    useAppStore.setState({ ...provisioningInitialState });
  });

  it('refreshProvisionStatus stores a valid snapshot', async () => {
    stubProvisioning();
    await useAppStore.getState().refreshProvisionStatus();
    expect(useAppStore.getState().provisionStatus?.total_count).toBe(2);
  });

  it('refresh keeps the last-known snapshot on an envelope failure', async () => {
    useAppStore.setState({ provisionStatus: snapshot({ ready_count: 2 }) });
    stubProvisioning({ status: vi.fn().mockResolvedValue({ success: false, error: 'down' }) });
    await useAppStore.getState().refreshProvisionStatus();
    expect(useAppStore.getState().provisionStatus?.ready_count).toBe(2);
  });

  it('refresh swallows a rejected bridge call (local-first)', async () => {
    useAppStore.setState({ provisionStatus: snapshot() });
    stubProvisioning({ status: vi.fn().mockRejectedValue(new Error('ipc')) });
    await useAppStore.getState().refreshProvisionStatus();
    expect(useAppStore.getState().provisionStatus).not.toBeNull();
  });

  it('startProvisioning stores the returned snapshot and clears the action error', async () => {
    useAppStore.setState({ provisionActionError: 'stale' });
    const bridge = stubProvisioning();
    await useAppStore.getState().startProvisioning();
    expect(bridge.start).toHaveBeenCalledOnce();
    expect(useAppStore.getState().provisionStatus?.active_count).toBe(1);
    expect(useAppStore.getState().provisionActionError).toBeNull();
    expect(useAppStore.getState().provisionBusy).toBe(false);
  });

  it('a user action surfaces an envelope failure (never vanishes)', async () => {
    stubProvisioning({ start: vi.fn().mockResolvedValue({ success: false, error: 'no space' }) });
    await useAppStore.getState().startProvisioning();
    expect(useAppStore.getState().provisionActionError).toBe('no space');
  });

  it('busy guard drops a second concurrent action', async () => {
    let release: (v: ProvisionStatus) => void = () => {};
    const gate = new Promise<ProvisionStatus>((resolve) => { release = resolve; });
    const bridge = stubProvisioning({ start: vi.fn().mockReturnValue(gate) });
    const first = useAppStore.getState().startProvisioning();
    await useAppStore.getState().startProvisioning(); // dropped by the guard
    release(snapshot());
    await first;
    expect(bridge.start).toHaveBeenCalledOnce();
  });

  it('pause / resume / cancel / reverify dispatch to their channels', async () => {
    const bridge = stubProvisioning();
    await useAppStore.getState().pauseProvisioning();
    await useAppStore.getState().resumeProvisioning();
    await useAppStore.getState().cancelProvisioning();
    await useAppStore.getState().reverifyProvisioning();
    expect(bridge.pause).toHaveBeenCalledOnce();
    expect(bridge.resume).toHaveBeenCalledOnce();
    expect(bridge.cancel).toHaveBeenCalledOnce();
    expect(bridge.reverify).toHaveBeenCalledOnce();
  });

  it('dismiss and open toggle the persisted first-run flag', () => {
    useAppStore.getState().dismissFirstRunProvisioning();
    expect(useAppStore.getState().firstRunProvisionDismissed).toBe(true);
    useAppStore.getState().openFirstRunProvisioning();
    expect(useAppStore.getState().firstRunProvisionDismissed).toBe(false);
  });
});

describe('hasLiveProvisionJob', () => {
  it('true only for queued/downloading/verifying rows', () => {
    expect(hasLiveProvisionJob(null)).toBe(false);
    expect(hasLiveProvisionJob(snapshot({ models: [model({ status: 'paused' })] }))).toBe(false);
    expect(hasLiveProvisionJob(snapshot({ models: [model({ status: 'downloading' })] }))).toBe(true);
    expect(hasLiveProvisionJob(snapshot({ models: [model({ status: 'queued' })] }))).toBe(true);
    expect(hasLiveProvisionJob(snapshot({ models: [model({ status: 'verifying' })] }))).toBe(true);
  });
});
