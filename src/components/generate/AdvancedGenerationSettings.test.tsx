import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { useAppStore } from '@/store/appStore';
import { AdvancedGenerationSettings } from './AdvancedGenerationSettings';

describe('AdvancedGenerationSettings labelling', () => {
  beforeEach(() => {
    useAppStore.setState(useAppStore.getInitialState(), true);
    useAppStore.getState().updateAdvancedGeneration({ generationType: 'image' });
  });
  afterEach(cleanup);

  it('names the scheduler select by its visible label', () => {
    render(<AdvancedGenerationSettings />);
    const scheduler = screen.getByRole('combobox', { name: 'Scheduler' });
    fireEvent.change(scheduler, { target: { value: 'DDIM' } });
    expect(useAppStore.getState().advancedGeneration.scheduler).toBe('DDIM');
  });

  it('exposes CLIP Skip as a labelled group of pressed toggles', () => {
    render(<AdvancedGenerationSettings />);
    const group = screen.getByRole('group', { name: 'CLIP Skip' });
    expect(group).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '2' }));
    expect(useAppStore.getState().advancedGeneration.clipSkip).toBe(2);
    expect(screen.getByRole('button', { name: '2' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: '1' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('names the sliders by their visible label', () => {
    render(<AdvancedGenerationSettings />);
    expect(screen.getByRole('slider', { name: 'Sampling Steps' })).toBeInTheDocument();
    expect(screen.getByRole('slider', { name: 'CFG Scale' })).toBeInTheDocument();
  });

  it('always shows the image sampler settings: duration and frame rate belong to VideoControls', () => {
    // A stale store generationType must not swap in a second FPS control.
    useAppStore.getState().updateAdvancedGeneration({ generationType: 'video' });
    render(<AdvancedGenerationSettings />);
    expect(screen.getByRole('slider', { name: 'Sampling Steps' })).toBeInTheDocument();
    expect(screen.queryByRole('slider', { name: 'Duration' })).toBeNull();
    expect(screen.queryByRole('slider', { name: 'Frame Rate' })).toBeNull();
  });
});
