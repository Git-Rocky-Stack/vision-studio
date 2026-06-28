import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAppStore } from '@/store/appStore';
import type { ModelRecord, RuntimePlan } from '@/types/model';

import { InstalledModelCard } from './InstalledModelCard';

function resetStore() {
  useAppStore.setState(useAppStore.getInitialState());
}

function makeModel(overrides: Partial<ModelRecord> = {}): ModelRecord {
  return {
    id: 'local:sdxl',
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

describe('InstalledModelCard', () => {
  beforeEach(resetStore);

  afterEach(() => {
    cleanup();
    delete (window as unknown as { electron?: unknown }).electron;
  });

  it('renders model metadata and security badges', () => {
    render(<InstalledModelCard model={makeModel({ format: 'pickle' })} />);
    expect(screen.getByText('SDXL Base')).toBeInTheDocument();
    expect(screen.getByTestId('badge-pickle')).toBeInTheDocument();
  });

  it('deletes after confirmation and reloads the catalog', async () => {
    const del = vi.fn().mockResolvedValue({ success: true });
    const loadModels = vi.fn();
    window.electron = { models: { delete: del } } as unknown as typeof window.electron;
    useAppStore.setState({ loadModels } as never);
    render(<InstalledModelCard model={makeModel()} />);

    fireEvent.click(screen.getByRole('button', { name: /remove/i }));
    fireEvent.click(await screen.findByRole('button', { name: /^delete$/i }));

    await waitFor(() => expect(del).toHaveBeenCalledWith('local:sdxl'));
    await waitFor(() => expect(loadModels).toHaveBeenCalled());
  });

  it('converts a pickle model', () => {
    const convertModel = vi.fn().mockResolvedValue({ success: true });
    useAppStore.setState({ convertModel } as never);
    render(<InstalledModelCard model={makeModel({ format: 'pickle' })} />);

    fireEvent.click(screen.getByRole('button', { name: /convert/i }));
    expect(convertModel).toHaveBeenCalledWith('local:sdxl');
  });

  it('does not offer convert for a safetensors model', () => {
    render(<InstalledModelCard model={makeModel({ format: 'safetensors' })} />);
    expect(screen.queryByRole('button', { name: /convert/i })).not.toBeInTheDocument();
  });

  it('resolves and shows hardware fit on demand', async () => {
    const resolveRuntime = vi
      .fn()
      .mockResolvedValue({ ...basePlan, fit: 'fits', readiness: 'Fits comfortably' });
    useAppStore.setState({ resolveRuntime } as never);
    render(<InstalledModelCard model={makeModel()} />);

    fireEvent.click(screen.getByRole('button', { name: /check fit/i }));
    expect(resolveRuntime).toHaveBeenCalledWith('local:sdxl');
    expect(await screen.findByText(/fits comfortably/i)).toBeInTheDocument();
  });
});
