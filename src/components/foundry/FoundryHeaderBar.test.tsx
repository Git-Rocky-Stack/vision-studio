import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { resolveHardwareColor } from '@/components/hardware/tokens';
import { useAppStore } from '@/store/appStore';
import type { HardwareProfile } from '@/types/model';

import { FoundryHeaderBar } from './FoundryHeaderBar';

function resetStore() {
  useAppStore.setState(useAppStore.getInitialState());
}

const GB = 1024 ** 3;

function makeProfile(overrides: Partial<HardwareProfile> = {}): HardwareProfile {
  return {
    gpu_available: true,
    gpu_name: 'RTX 4090',
    vram_total_bytes: 24 * GB,
    vram_free_bytes: 20 * GB,
    compute_major: 8,
    compute_minor: 9,
    cuda_version: '12.1',
    torch_available: true,
    system_ram_total_bytes: 64 * GB,
    system_ram_available_bytes: 32 * GB,
    disk_free_bytes: 500 * GB,
    ...overrides,
  };
}

describe('FoundryHeaderBar', () => {
  beforeEach(resetStore);

  afterEach(() => {
    cleanup();
    delete (window as unknown as { electron?: unknown }).electron;
  });

  it('shows the GPU summary and the token inputs', () => {
    window.electron = {
      auth: { setHfToken: vi.fn(), setCivitaiToken: vi.fn() },
    } as unknown as typeof window.electron;
    useAppStore.setState({ hardwareProfile: makeProfile({ gpu_name: 'RTX 4090' }) } as never);
    render(<FoundryHeaderBar />);

    expect(screen.getByText(/RTX 4090/)).toHaveTextContent('RTX 4090');
    expect(screen.getByLabelText(/hugging face token/i)).toHaveAttribute('type', 'password');
    expect(screen.getByLabelText(/civitai token/i)).toHaveAttribute('type', 'password');
  });

  // The LED is the at-a-glance readiness signal. A CPU-only machine lit in the
  // ready colour tells the user their GPU is fine when it is not - and an
  // existence check on the pill cannot tell the two colours apart.
  it('lights the readiness LED green only when a GPU is actually available', () => {
    window.electron = {
      auth: { setHfToken: vi.fn(), setCivitaiToken: vi.fn() },
    } as unknown as typeof window.electron;

    const { container, rerender } = render(<FoundryHeaderBar />);
    useAppStore.setState({ hardwareProfile: makeProfile({ gpu_available: true }) } as never);
    rerender(<FoundryHeaderBar />);
    expect(container.querySelector('span[aria-hidden="true"][style]')).toHaveStyle({
      background: resolveHardwareColor('play'),
    });

    useAppStore.setState({
      hardwareProfile: makeProfile({ gpu_available: false, gpu_name: 'CPU only' }),
    } as never);
    rerender(<FoundryHeaderBar />);
    expect(container.querySelector('span[aria-hidden="true"][style]')).toHaveStyle({
      background: resolveHardwareColor('rec'),
    });
  });

  it('shows a detecting state when no profile is loaded', () => {
    window.electron = {
      auth: { setHfToken: vi.fn(), setCivitaiToken: vi.fn() },
    } as unknown as typeof window.electron;
    useAppStore.setState({ hardwareProfile: null } as never);
    const { container } = render(<FoundryHeaderBar />);

    expect(screen.getByText(/detecting/i)).toHaveTextContent('Detecting...');
    // No profile means no verdict to report, so no LED is lit either way.
    expect(container.querySelector('span[aria-hidden="true"][style]')).toBeNull();
  });
});
