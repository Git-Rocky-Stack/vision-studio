import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PreflightFooter } from './PreflightFooter';
import { useAppStore } from '@/store/appStore';
import type { RuntimePlan } from '@/types/model';

function plan(over: Partial<RuntimePlan>): RuntimePlan {
  return {
    pipeline_class: 'StableDiffusionXLPipeline', precision: 'bf16', offload: false,
    vae_tiling: false, attention_slicing: true, single_file: false, config_catalog_id: null,
    vram_plan: { weight_bytes: 1, activation_bytes: 1, runtime_bytes: 1, total_bytes: 3, basis: 'estimated' },
    fit: 'fits', missing_components: [], fallback_ladder: [],
    readiness: 'Ready - bf16 - fits (estimated)', refusal: null, ...over,
  };
}

describe('PreflightFooter', () => {
  beforeEach(() => {
    useAppStore.setState({
      loadHardwareProfile: vi.fn().mockResolvedValue(undefined),
      resolveRuntime: vi.fn().mockResolvedValue(plan({})),
    });
  });
  afterEach(cleanup);

  it('renders the empty state when no local model is selected', () => {
    render(<PreflightFooter modelId={null} />);
    expect(screen.getByTestId('preflight-empty')).toBeInTheDocument();
    expect(useAppStore.getState().resolveRuntime).not.toHaveBeenCalled();
  });

  it('renders the readiness line with the fit LED for a clean plan', async () => {
    render(<PreflightFooter modelId="sdxl-base" />);
    expect(await screen.findByTestId('preflight-ready')).toHaveTextContent(
      'Ready - bf16 - fits (estimated)',
    );
  });

  it('renders a refusal verbatim and never the ready row', async () => {
    useAppStore.setState({
      resolveRuntime: vi.fn().mockResolvedValue(
        plan({ refusal: 'pickle weights - convert to safetensors first (Models > Convert)' }),
      ),
    });
    render(<PreflightFooter modelId="sketchy" />);
    expect(await screen.findByTestId('preflight-refusal')).toHaveTextContent(
      'pickle weights - convert to safetensors first',
    );
    expect(screen.queryByTestId('preflight-ready')).not.toBeInTheDocument();
  });

  it('renders the Needs line when components are missing', async () => {
    useAppStore.setState({
      resolveRuntime: vi.fn().mockResolvedValue(
        plan({ missing_components: ['vae'], readiness: 'Needs vae' }),
      ),
    });
    render(<PreflightFooter modelId="sdxl-base" />);
    expect(await screen.findByTestId('preflight-missing')).toHaveTextContent('Needs vae');
  });

  it('surfaces the real failure detail in the error state', async () => {
    useAppStore.setState({
      resolveRuntime: vi.fn().mockRejectedValue(new Error("Model 'ghost' not found")),
    });
    render(<PreflightFooter modelId="ghost" />);
    expect(await screen.findByTestId('preflight-error')).toHaveTextContent(
      "Model 'ghost' not found",
    );
  });

  it('ignores a stale resolution after a rapid model switch', async () => {
    let resolveFirst: (value: RuntimePlan) => void = () => {};
    const first = new Promise<RuntimePlan>((resolve) => {
      resolveFirst = resolve;
    });
    const resolveRuntime = vi
      .fn()
      .mockReturnValueOnce(first)
      .mockResolvedValueOnce(plan({ readiness: 'Ready - fp16 - fits (estimated)' }));
    useAppStore.setState({ resolveRuntime });

    const { rerender } = render(<PreflightFooter modelId="model-a" />);
    rerender(<PreflightFooter modelId="model-b" />);
    await screen.findByTestId('preflight-ready');

    // The first model's late resolution must not clobber the second's plan.
    resolveFirst(plan({ readiness: 'Ready - bf16 - STALE' }));
    await waitFor(() =>
      expect(screen.getByTestId('preflight-ready')).toHaveTextContent(
        'Ready - fp16 - fits (estimated)',
      ),
    );
  });
});
