import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { PipelineExecution } from '@/types/pipeline';

import { PipelinePreview } from './PipelinePreview';

function makeExecution(overrides: Partial<PipelineExecution> = {}): PipelineExecution {
  return {
    id: 'exec-1',
    pipelineId: 'p1',
    status: 'complete',
    startedAt: 0,
    stepResults: [
      { stepId: 's1', status: 'complete', output: 'file:///a.png' },
      { stepId: 's2', status: 'running', output: null },
      { stepId: 's3', status: 'pending', output: null },
    ],
    ...overrides,
  } as PipelineExecution;
}

describe('PipelinePreview step dots', () => {
  afterEach(cleanup);

  it('moves the preview to the step whose dot is clicked', () => {
    const onStepSelect = vi.fn();
    render(
      <PipelinePreview execution={makeExecution()} stepIndex={0} onStepSelect={onStepSelect} />,
    );

    fireEvent.click(screen.getByRole('button', { name: /^Step 3:/ }));

    expect(onStepSelect).toHaveBeenCalledWith(2);
  });

  it('renders the dots as plain status indicators when selection is unavailable', () => {
    render(<PipelinePreview execution={makeExecution()} stepIndex={0} />);

    // Without a handler the dots must not claim to be actionable controls.
    expect(screen.queryByRole('button', { name: /^Step 3:/ })).not.toBeInTheDocument();
    expect(screen.getByLabelText(/^Step 3:/)).toBeInTheDocument();
  });

  it('marks only the active dot as selected', () => {
    render(
      <PipelinePreview execution={makeExecution()} stepIndex={1} onStepSelect={vi.fn()} />,
    );

    expect(screen.getByRole('button', { name: /^Step 2:/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: /^Step 1:/ })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('names each dot with its real step status', () => {
    render(
      <PipelinePreview execution={makeExecution()} stepIndex={0} onStepSelect={vi.fn()} />,
    );

    expect(screen.getByRole('button', { name: 'Step 1: complete' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Step 2: running' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Step 3: pending' })).toBeInTheDocument();
  });
});
