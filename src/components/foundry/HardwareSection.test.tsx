import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAppStore } from '@/store/appStore';
import type { ModelRecord, HardwareProfile, RuntimePlan } from '@/types/model';

import { HardwareSection } from './HardwareSection';

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

function makeModel(overrides: Partial<ModelRecord> = {}): ModelRecord {
  return {
    id: 'm1',
    name: 'SDXL Base',
    artifact_type: 'checkpoint',
    capability: 'image',
    base_architecture: 'sdxl',
    source: 'local',
    repo_id: null,
    revision: null,
    aux_repo_id: null,
    size: '6.9 GB',
    status: 'ready',
    tier: 'verified',
    quality: 'pro',
    runtime: 'local',
    hardware_class: 'creator',
    vram: '8 GB',
    description: '',
    license: 'openrail',
    gated: false,
    format: 'safetensors',
    trust_remote_code: false,
    nsfw: false,
    ...overrides,
  };
}

const basePlan: RuntimePlan = {
  pipeline_class: null,
  precision: null,
  offload: false,
  vae_tiling: false,
  attention_slicing: false,
  single_file: false,
  config_catalog_id: null,
  vram_plan: null,
  fit: null,
  missing_components: [],
  fallback_ladder: [],
  readiness: '',
  refusal: null,
};

describe('HardwareSection', () => {
  beforeEach(resetStore);
  afterEach(cleanup);

  it('renders the GPU profile with formatted VRAM', () => {
    useAppStore.setState({ hardwareProfile: makeProfile(), availableModels: [] } as never);
    render(<HardwareSection />);

    expect(screen.getByText('RTX 4090')).toBeInTheDocument();
    expect(screen.getByText(/24(\.0)? GB/)).toBeInTheDocument();
  });

  it('shows a hardware-unavailable hint when no profile is loaded', () => {
    useAppStore.setState({ hardwareProfile: null } as never);
    render(<HardwareSection />);
    expect(screen.getByText(/hardware information unavailable/i)).toBeInTheDocument();
  });

  it('refreshes the hardware profile', () => {
    const loadHardwareProfile = vi.fn();
    useAppStore.setState({ loadHardwareProfile, hardwareProfile: makeProfile() } as never);
    render(<HardwareSection />);

    fireEvent.click(screen.getByRole('button', { name: /refresh/i }));
    expect(loadHardwareProfile).toHaveBeenCalled();
  });

  it('resolves a per-model fit chip on demand', async () => {
    const resolveRuntime = vi
      .fn()
      .mockResolvedValue({ ...basePlan, fit: 'fits', readiness: 'Fits comfortably' });
    useAppStore.setState({
      resolveRuntime,
      hardwareProfile: makeProfile(),
      availableModels: [makeModel({ id: 'm1', name: 'SDXL Base' })],
    } as never);
    render(<HardwareSection />);

    fireEvent.click(screen.getByRole('button', { name: /check fit/i }));
    expect(resolveRuntime).toHaveBeenCalledWith('m1');
    expect(await screen.findByText(/fits comfortably/i)).toBeInTheDocument();
  });
});
