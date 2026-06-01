import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ModelSelector } from './ModelSelector';
import { useAppStore } from '@/store/appStore';
import type { ModelRecord } from '@/types/model';

function record(over: Partial<ModelRecord>): ModelRecord {
  return {
    id: 'flux-dev', name: 'FLUX.1 [dev]', artifact_type: 'checkpoint', capability: 'image',
    base_architecture: 'flux', source: 'huggingface', repo_id: 'org/x', revision: 'main',
    aux_repo_id: null, size: '23.8 GB', status: 'not_found', tier: 'verified', quality: 'pro',
    runtime: 'byom', hardware_class: 'workstation', vram: '23.8 GB', description: 'desc',
    license: null, gated: false, ...over,
  };
}

describe('ModelSelector', () => {
  beforeEach(() => {
    useAppStore.setState({
      availableModels: [
        record({ id: 'sdxl-base', name: 'Stable Diffusion XL Base', capability: 'image' }),
        record({ id: 'ltx-video', name: 'LTX Video', capability: 'video', runtime: 'local' }),
        record({ id: 'animatediff', name: 'AnimateDiff', capability: 'video', runtime: 'local' }),
      ],
    });
  });
  afterEach(cleanup);

  it('renders the selected model from the store', () => {
    render(<ModelSelector value="sdxl-base" generationType="image" onChange={vi.fn()} />);
    expect(screen.getByText('Stable Diffusion XL Base')).toBeInTheDocument();
  });

  it('lists capability-filtered video models and keeps ids on select', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ModelSelector value="ltx-video" generationType="video" onChange={onChange} />);

    await user.click(screen.getByTestId('model-selector-trigger'));
    await user.click(screen.getByRole('option', { name: /AnimateDiff/i }));

    expect(onChange).toHaveBeenCalledWith('animatediff');
  });

  it('falls back to the first available model when value is unknown', () => {
    render(<ModelSelector value="legacy-unknown-id" generationType="image" onChange={vi.fn()} />);
    expect(screen.getByText('Stable Diffusion XL Base')).toBeInTheDocument();
  });
});
