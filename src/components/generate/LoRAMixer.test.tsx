import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LoRAMixer } from './LoRAMixer';
import { useAppStore } from '@/store/appStore';
import type { ModelRecord } from '@/types/model';

function lora(over: Partial<ModelRecord>): ModelRecord {
  return {
    id: 'l1', name: 'Detail SDXL', artifact_type: 'lora', capability: 'image',
    base_architecture: 'sdxl', source: 'local', repo_id: null, revision: null,
    aux_repo_id: null, size: '144 MB', status: 'ready', tier: 'compatible',
    quality: 'balanced', runtime: 'local', hardware_class: 'creator', vram: '',
    description: '', license: null, gated: false, trigger_words: ['det_sdxl'], ...over,
  };
}

describe('LoRAMixer', () => {
  beforeEach(() => {
    useAppStore.setState({
      availableModels: [
        lora({ id: 'l1', name: 'Detail SDXL', base_architecture: 'sdxl', trigger_words: ['det_sdxl'] }),
        lora({ id: 'l2', name: 'Flux Film', base_architecture: 'flux' }),
      ],
    });
  });
  afterEach(cleanup);

  it('lists only base-compatible installed LoRAs in the picker', async () => {
    const user = userEvent.setup();
    render(<LoRAMixer configs={[]} onChange={vi.fn()} baseArchitecture="sdxl" onInsertTrigger={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: /add lora/i }));
    expect(screen.getByText('Detail SDXL')).toBeInTheDocument();
    expect(screen.queryByText('Flux Film')).not.toBeInTheDocument();
  });

  it('adds a LoRA keyed by the model id', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<LoRAMixer configs={[]} onChange={onChange} baseArchitecture="sdxl" onInsertTrigger={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: /add lora/i }));
    await user.click(screen.getByText('Detail SDXL'));
    expect(onChange).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'l1', name: 'Detail SDXL', weight: 1 }),
    ]);
  });

  it('reveals incompatible LoRAs behind the override toggle', async () => {
    const user = userEvent.setup();
    render(<LoRAMixer configs={[]} onChange={vi.fn()} baseArchitecture="sdxl" onInsertTrigger={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: /add lora/i }));
    await user.click(screen.getByRole('button', { name: /show incompatible/i }));
    expect(screen.getByText('Flux Film')).toBeInTheDocument();
  });

  it('inserts a trigger word from a selected LoRA', async () => {
    const user = userEvent.setup();
    const onInsertTrigger = vi.fn();
    render(
      <LoRAMixer
        configs={[{ id: 'l1', name: 'Detail SDXL', triggerWord: 'det_sdxl', weight: 1, color: '#000' }]}
        onChange={vi.fn()}
        baseArchitecture="sdxl"
        onInsertTrigger={onInsertTrigger}
      />,
    );
    await user.click(screen.getByRole('button', { name: /insert trigger det_sdxl/i }));
    expect(onInsertTrigger).toHaveBeenCalledWith('det_sdxl');
  });

  it('renders a disabled reason instead of the picker', () => {
    render(
      <LoRAMixer configs={[]} onChange={vi.fn()} baseArchitecture="svd" onInsertTrigger={vi.fn()}
        disabledReason="LoRA is not supported for this video model." />,
    );
    expect(screen.getByText(/not supported for this video model/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /add lora/i })).not.toBeInTheDocument();
  });
});
