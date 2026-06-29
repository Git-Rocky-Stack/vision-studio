import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

    expect(screen.getByText(/RTX 4090/)).toBeInTheDocument();
    expect(screen.getByLabelText(/hugging face token/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/civitai token/i)).toBeInTheDocument();
  });

  it('shows a detecting state when no profile is loaded', () => {
    window.electron = {
      auth: { setHfToken: vi.fn(), setCivitaiToken: vi.fn() },
    } as unknown as typeof window.electron;
    useAppStore.setState({ hardwareProfile: null } as never);
    render(<FoundryHeaderBar />);

    expect(screen.getByText(/detecting/i)).toBeInTheDocument();
  });
});
