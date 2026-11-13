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

describe('welcome band', () => {
  beforeEach(() => {
    window.electron = { app: { openExternal: vi.fn() } } as unknown as Window['electron'];
  });

  it('greets on the chrome plate in place of the old native dialog', () => {
    seed(snapshot());
    render(<FirstRunProvisioning />);
    expect(screen.getByText('Welcome to Vision Studio')).toBeInTheDocument();
  });

  it('reports the detected GPU from the live hardware profile', () => {
    seed(snapshot(), {
      hardwareProfile: { ...hardware(500 * GB), gpu_available: true, gpu_name: 'RTX 4090' },
    });
    render(<FirstRunProvisioning />);
    expect(screen.getByText('GPU detected: RTX 4090')).toBeInTheDocument();
  });

  it('states plainly when no dedicated GPU is present', () => {
    seed(snapshot(), {
      hardwareProfile: { ...hardware(500 * GB), gpu_available: false, gpu_name: null },
    });
    render(<FirstRunProvisioning />);
    expect(screen.getByText('No dedicated GPU detected')).toBeInTheDocument();
  });

  it('names a GPU the bundled CUDA build cannot run on, instead of claiming there is none', () => {
    seed(snapshot(), {
      hardwareProfile: {
        ...hardware(500 * GB),
        gpu_available: false,
        gpu_name: 'NVIDIA GeForce GTX 1080',
        gpu_unsupported_reason: 'NVIDIA GeForce GTX 1080 (compute capability 6.1) is older than this build supports.',
      },
    });
    render(<FirstRunProvisioning />);
    expect(screen.getByText('Unsupported GPU, runs on CPU: NVIDIA GeForce GTX 1080')).toBeInTheDocument();
    expect(screen.queryByText('No dedicated GPU detected')).toBeNull();
    expect(screen.queryByText(/GPU detected:/)).toBeNull();
  });

  it('claims nothing about the GPU before the profile loads', () => {
    seed(snapshot(), { hardwareProfile: null });
    render(<FirstRunProvisioning />);
    expect(screen.queryByText(/GPU detected/)).toBeNull();
    expect(screen.queryByText(/No dedicated GPU/)).toBeNull();
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

  it('sends gated-model users to the token field downloads read', () => {
    // Downloads send the Foundry token (backendAuth X-HF-Token). The Settings
    // token is a different one - the per-account key for cloud inference.
    seed(snapshot({
      models: [model(), model({ id: 'sd3.5-large', name: 'SD 3.5 Large', gated: true })],
    }), { hardwareProfile: hardware(500 * GB) });
    render(<FirstRunProvisioning />);
    const disclosure = screen.getByTestId('provision-disclosure');
    expect(disclosure).toHaveTextContent(/token at the top of the Foundry/);
    expect(disclosure).not.toHaveTextContent(/token in\s+Settings/);
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

describe('K3 install choices', () => {
  function tiered() {
    return snapshot({
      total_count: 3,
      remaining_bytes: 14 * GB,
      models: [
        model({ id: 'core-a', name: 'Core A', tier: 'core', size_bytes: 3 * GB }),
        model({ id: 'core-b', name: 'Core B', tier: 'core', size_bytes: 2 * GB }),
        model({ id: 'ext-a', name: 'Extended A', tier: 'extended', size_bytes: 9 * GB, gated: true }),
      ],
    });
  }

  beforeEach(() => {
    window.electron = { app: { openExternal: vi.fn() } } as unknown as Window['electron'];
  });

  it('offers core, everything and custom with their sizes', () => {
    seed(tiered(), { hardwareProfile: hardware(500 * GB) });
    render(<FirstRunProvisioning />);
    expect(screen.getByTestId('provision-install-core')).toHaveTextContent('Install core (5.0 GB)');
    expect(screen.getByTestId('provision-install')).toHaveTextContent('Install everything (14.0 GB)');
    expect(screen.getByTestId('provision-custom-toggle')).toHaveTextContent('Custom...');
  });

  it('Install core passes exactly the core model ids', () => {
    const startProvisioning = vi.fn();
    seed(tiered(), { hardwareProfile: hardware(500 * GB) });
    useAppStore.setState({ startProvisioning });
    render(<FirstRunProvisioning />);
    fireEvent.click(screen.getByTestId('provision-install-core'));
    expect(startProvisioning).toHaveBeenCalledWith({ modelIds: ['core-a', 'core-b'] });
  });

  it('Install everything sends no ids so the backend installs the whole auto-set', () => {
    const startProvisioning = vi.fn();
    seed(tiered(), { hardwareProfile: hardware(500 * GB) });
    useAppStore.setState({ startProvisioning });
    render(<FirstRunProvisioning />);
    fireEvent.click(screen.getByTestId('provision-install'));
    expect(startProvisioning).toHaveBeenCalledWith(undefined);
  });

  it('core stays installable when only the full set exceeds free space', () => {
    seed(tiered(), { hardwareProfile: hardware(8 * GB) });
    render(<FirstRunProvisioning />);
    expect(screen.getByTestId('provision-install')).toBeDisabled();
    expect(screen.getByTestId('provision-install-core')).toBeEnabled();
  });

  it('Custom lists models by tier with a running total and installs the selection', () => {
    const startProvisioning = vi.fn();
    seed(tiered(), { hardwareProfile: hardware(500 * GB) });
    useAppStore.setState({ startProvisioning });
    render(<FirstRunProvisioning />);

    const toggle = screen.getByTestId('provision-custom-toggle');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');

    const picker = screen.getByTestId('provision-custom');
    expect(screen.getByRole('group', { name: 'Core' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Extended' })).toBeInTheDocument();
    // Core is preselected by default.
    expect(screen.getByTestId('provision-custom-total')).toHaveTextContent('2 models selected - 5.0 GB');

    fireEvent.click(screen.getByRole('checkbox', { name: /Extended A/ }));
    expect(screen.getByTestId('provision-custom-total')).toHaveTextContent('3 models selected - 14.0 GB');
    fireEvent.click(screen.getByRole('checkbox', { name: /Core B/ }));
    expect(screen.getByTestId('provision-custom-total')).toHaveTextContent('2 models selected - 12.0 GB');
    expect(picker).toHaveTextContent('Gated');

    fireEvent.click(screen.getByTestId('provision-install-custom'));
    expect(startProvisioning).toHaveBeenCalledWith({ modelIds: ['core-a', 'ext-a'] });
  });

  it('group select-all toggles a whole tier and an empty selection cannot install', () => {
    seed(tiered(), { hardwareProfile: hardware(500 * GB) });
    render(<FirstRunProvisioning />);
    fireEvent.click(screen.getByTestId('provision-custom-toggle'));

    const coreAll = screen.getByRole('checkbox', { name: 'Select all core models' });
    expect(coreAll).toBeChecked();
    fireEvent.click(coreAll);
    expect(screen.getByTestId('provision-custom-total')).toHaveTextContent('No models selected');
    expect(screen.getByTestId('provision-install-custom')).toBeDisabled();

    fireEvent.click(screen.getByRole('checkbox', { name: 'Select all extended models' }));
    expect(screen.getByTestId('provision-custom-total')).toHaveTextContent('1 model selected - 9.0 GB');
  });

  it('Escape closes the custom list before it dismisses the screen', () => {
    seed(tiered(), { hardwareProfile: hardware(500 * GB) });
    render(<FirstRunProvisioning />);
    fireEvent.click(screen.getByTestId('provision-custom-toggle'));
    fireEvent.keyDown(screen.getByTestId('provision-custom'), { key: 'Escape' });
    expect(screen.queryByTestId('provision-custom')).toBeNull();
    expect(useAppStore.getState().firstRunProvisionDismissed).toBe(false);
  });

  it('degrades on a tierless backend: no core choice, one flat custom group', () => {
    seed(snapshot(), { hardwareProfile: hardware(500 * GB) });
    render(<FirstRunProvisioning />);
    expect(screen.queryByTestId('provision-install-core')).toBeNull();
    fireEvent.click(screen.getByTestId('provision-custom-toggle'));
    expect(screen.getByRole('group', { name: 'Models' })).toBeInTheDocument();
    expect(screen.getByTestId('provision-custom-total')).toHaveTextContent('2 models selected - 8.0 GB');
  });

  it('after a core-only install, hides unselected rows and offers the rest again', () => {
    seed(snapshot({
      total_count: 3, ready_count: 2,
      models: [
        model({ id: 'core-a', name: 'Core A', tier: 'core', status: 'ready', progress: 1 }),
        model({ id: 'core-b', name: 'Core B', tier: 'core', status: 'ready', progress: 1 }),
        model({ id: 'ext-a', name: 'Extended A', tier: 'extended', size_bytes: 9 * GB }),
      ],
    }), { hardwareProfile: hardware(500 * GB) });
    render(<FirstRunProvisioning />);
    expect(screen.queryByTestId('provision-row-ext-a')).toBeNull();
    expect(screen.getByText(/1 model not selected/)).toBeInTheDocument();
    // Core is done, so only everything (the remainder) and custom remain.
    expect(screen.queryByTestId('provision-install-core')).toBeNull();
    expect(screen.getByTestId('provision-install')).toBeInTheDocument();
  });

  it('keeps Tab inside the takeover', () => {
    seed(tiered(), { hardwareProfile: hardware(500 * GB) });
    render(<FirstRunProvisioning />);
    const dialog = screen.getByTestId('first-run-provisioning');
    const tabbables = Array.from(dialog.querySelectorAll<HTMLElement>('button:not([disabled])'));
    const last = tabbables[tabbables.length - 1];
    last.focus();
    fireEvent.keyDown(last, { key: 'Tab' });
    expect(document.activeElement).toBe(tabbables[0]);
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
