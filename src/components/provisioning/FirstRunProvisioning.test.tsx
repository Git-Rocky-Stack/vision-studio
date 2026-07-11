import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useAppStore } from '@/store/appStore';
import { provisioningInitialState } from '@/store/slices/provisioningSlice';
import { FirstRunProvisioning, diskCheck } from './FirstRunProvisioning';
import type { HardwareProfile, ProvisionModel, ProvisionStatus } from '@/types/model';

const GB = 1024 ** 3;

function model(over: Partial<ProvisionModel> = {}): ProvisionModel {
  return {
    id: 'sd-1-5', name: 'Stable Diffusion 1.5', license: 'creativeml-openrail-m',
    attribution: null, approx_bytes: 4 * GB, format: 'safetensors', gated: false,
    status: 'missing', progress: 0, error: null, gate_url: null, ...over,
  };
}

function snapshot(over: Partial<ProvisionStatus> = {}): ProvisionStatus {
  return {
    schema_version: 1, overall_progress: 0, total_bytes: 8 * GB, present_bytes: 0,
    remaining_bytes: 8 * GB, speed: 0, eta: null, total_count: 2, ready_count: 0,
    active_count: 0, error_count: 0, complete: false,
    attribution: 'Powered by Stability AI',
    models: [
      model(),
      model({ id: 'edit-gfpgan-v14', name: 'GFPGAN v1.4', format: 'pickle' }),
    ],
    ...over,
  };
}

function hardware(freeBytes: number): HardwareProfile {
  return { disk_free_bytes: freeBytes } as HardwareProfile;
}

function seed(status: ProvisionStatus | null, extra: Record<string, unknown> = {}) {
  useAppStore.setState({ ...provisioningInitialState, provisionStatus: status, ...extra });
}

afterEach(cleanup);

describe('FirstRunProvisioning visibility', () => {
  beforeEach(() => {
    window.electron = { app: { openExternal: vi.fn() } } as unknown as Window['electron'];
    seed(null);
  });

  it('hidden without a valid snapshot', () => {
    render(<FirstRunProvisioning />);
    expect(screen.queryByTestId('first-run-provisioning')).toBeNull();
  });

  it('hidden when the set is complete', () => {
    seed(snapshot({ complete: true }));
    render(<FirstRunProvisioning />);
    expect(screen.queryByTestId('first-run-provisioning')).toBeNull();
  });

  it('hidden when dismissed', () => {
    seed(snapshot(), { firstRunProvisionDismissed: true });
    render(<FirstRunProvisioning />);
    expect(screen.queryByTestId('first-run-provisioning')).toBeNull();
  });

  it('visible for a valid incomplete snapshot', () => {
    seed(snapshot());
    render(<FirstRunProvisioning />);
    expect(screen.getByTestId('first-run-provisioning')).toBeInTheDocument();
  });
});

describe('pre-start view', () => {
  beforeEach(() => {
    window.electron = { app: { openExternal: vi.fn() } } as unknown as Window['electron'];
    seed(snapshot(), { hardwareProfile: hardware(500 * GB) });
  });

  it('summarizes the set and derives the disclosure from row data', () => {
    render(<FirstRunProvisioning />);
    const disclosure = screen.getByTestId('provision-disclosure');
    expect(disclosure).toHaveTextContent('GFPGAN v1.4'); // pickle list is data-derived
    expect(disclosure).toHaveTextContent('Stability AI Community License');
    expect(screen.getByText(/2 models/)).toBeInTheDocument();
    expect(screen.getAllByText(/8\.0 GB/).length).toBeGreaterThan(0);
  });

  it('names gated models needing a Hugging Face account', () => {
    seed(snapshot({
      models: [model(), model({ id: 'sd3.5-large', name: 'SD 3.5 Large', gated: true })],
    }), { hardwareProfile: hardware(500 * GB) });
    render(<FirstRunProvisioning />);
    expect(screen.getByTestId('provision-disclosure')).toHaveTextContent(/Hugging Face/);
  });

  it('Install starts provisioning', () => {
    const startProvisioning = vi.fn();
    useAppStore.setState({ startProvisioning });
    render(<FirstRunProvisioning />);
    fireEvent.click(screen.getByTestId('provision-install'));
    expect(startProvisioning).toHaveBeenCalledOnce();
  });

  it('Skip dismisses the overlay', () => {
    render(<FirstRunProvisioning />);
    fireEvent.click(screen.getByTestId('provision-skip'));
    expect(useAppStore.getState().firstRunProvisionDismissed).toBe(true);
  });

  it('blocks Install with the exact shortfall when disk is insufficient', () => {
    seed(snapshot(), { hardwareProfile: hardware(1 * GB) });
    render(<FirstRunProvisioning />);
    expect(screen.getByTestId('provision-install')).toBeDisabled();
    expect(screen.getByText(/Not enough disk space/)).toBeInTheDocument();
    expect(screen.getByTestId('provision-disk-recheck')).toBeInTheDocument();
  });
});

describe('active view', () => {
  beforeEach(() => {
    window.electron = { app: { openExternal: vi.fn() } } as unknown as Window['electron'];
    seed(snapshot({
      overall_progress: 0.42, active_count: 1, speed: 10 * 1024 ** 2, eta: 600,
      models: [
        model({ status: 'ready', progress: 1 }),
        model({ id: 'edit-gfpgan-v14', name: 'GFPGAN v1.4', status: 'downloading', progress: 0.5 }),
      ],
    }));
  });

  it('renders aggregate progress from the snapshot only', () => {
    render(<FirstRunProvisioning />);
    const bar = screen.getByRole('progressbar', { name: /overall/i });
    expect(bar).toHaveAttribute('aria-valuenow', '42');
  });

  it('fake timers alone never advance progress (no progress theater)', () => {
    vi.useFakeTimers();
    render(<FirstRunProvisioning />);
    const bar = screen.getByRole('progressbar', { name: /overall/i });
    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(bar).toHaveAttribute('aria-valuenow', '42');
    vi.useRealTimers();
  });

  it('renders per-model rows with honest statuses', () => {
    render(<FirstRunProvisioning />);
    expect(screen.getByTestId('provision-row-sd-1-5')).toHaveTextContent(/ready/i);
    expect(screen.getByTestId('provision-row-edit-gfpgan-v14')).toHaveTextContent(/downloading/i);
  });

  it('surfaces a gated row with an Accept license action', () => {
    const openExternal = vi.fn();
    window.electron = { app: { openExternal } } as unknown as Window['electron'];
    seed(snapshot({
      active_count: 1,
      models: [model({ status: 'error', error: 'gated', gate_url: 'https://hf.co/gate' })],
    }));
    render(<FirstRunProvisioning />);
    fireEvent.click(screen.getByRole('button', { name: /accept license/i }));
    expect(openExternal).toHaveBeenCalledWith('https://hf.co/gate');
  });

  it('Pause all / Continue in background wire to the store', () => {
    const pauseProvisioning = vi.fn();
    useAppStore.setState({ pauseProvisioning });
    render(<FirstRunProvisioning />);
    fireEvent.click(screen.getByTestId('provision-pause'));
    expect(pauseProvisioning).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByTestId('provision-background'));
    expect(useAppStore.getState().firstRunProvisionDismissed).toBe(true);
  });

  it('a paused set offers Resume all', () => {
    const resumeProvisioning = vi.fn();
    seed(snapshot({
      active_count: 1,
      models: [model({ status: 'paused', progress: 0.3 })],
    }));
    useAppStore.setState({ resumeProvisioning });
    render(<FirstRunProvisioning />);
    fireEvent.click(screen.getByTestId('provision-resume'));
    expect(resumeProvisioning).toHaveBeenCalledOnce();
  });

  it('errors offer Retry failed and Cancel asks for confirmation', () => {
    const resumeProvisioning = vi.fn();
    const cancelProvisioning = vi.fn();
    seed(snapshot({
      active_count: 1, error_count: 1,
      models: [model({ status: 'error', error: 'network' })],
    }));
    useAppStore.setState({ resumeProvisioning, cancelProvisioning });
    render(<FirstRunProvisioning />);
    fireEvent.click(screen.getByTestId('provision-retry'));
    expect(resumeProvisioning).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByTestId('provision-cancel'));
    expect(cancelProvisioning).not.toHaveBeenCalled(); // confirm gate first
    fireEvent.click(screen.getByRole('button', { name: /stop downloads/i }));
    expect(cancelProvisioning).toHaveBeenCalledOnce();
  });

  it('a surfaced action error renders', () => {
    seed(snapshot(), { provisionActionError: 'no space' });
    render(<FirstRunProvisioning />);
    expect(screen.getByText(/no space/)).toBeInTheDocument();
  });

  it('Escape continues in background', () => {
    render(<FirstRunProvisioning />);
    fireEvent.keyDown(screen.getByTestId('first-run-provisioning'), { key: 'Escape' });
    expect(useAppStore.getState().firstRunProvisionDismissed).toBe(true);
  });
});

describe('diskCheck', () => {
  it('unknown without a profile', () => {
    expect(diskCheck(null, 10 * GB).level).toBe('unknown');
  });
  it('ok with ample headroom', () => {
    expect(diskCheck(100 * GB, 10 * GB).level).toBe('ok');
  });
  it('tight under 10 percent headroom', () => {
    expect(diskCheck(10.5 * GB, 10 * GB).level).toBe('tight');
  });
  it('insufficient below the requirement, message carries exact sizes', () => {
    const check = diskCheck(1 * GB, 10 * GB);
    expect(check.level).toBe('insufficient');
    expect(check.message).toContain('10.0 GB');
    expect(check.message).toContain('1.0 GB');
  });
});
