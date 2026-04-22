import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useAppStore } from '@/store/appStore';
import { IterationTimeline } from './IterationTimeline';
import type { GenerationJob } from '@/store/appStore.types';

function makeIterationJob(
  id: string,
  prompt: string,
  overrides: Partial<GenerationJob['params']> = {},
): GenerationJob {
  return {
    id,
    type: 'image',
    status: 'completed',
    progress: 100,
    params: {
      prompt,
      steps: 24,
      ...overrides,
    },
    result: { images: [`/${id}.png`] },
    createdAt: new Date('2026-04-22T12:00:00.000Z'),
    completedAt: new Date('2026-04-22T12:00:02.000Z'),
  };
}

function seedIterationPath() {
  const rootJob = makeIterationJob('iter-1', 'base prompt');
  useAppStore.getState().addIteration({
    job: rootJob,
    parentId: null,
    thumbnail: 'data:image/png;base64,root',
  });

  const branchId = useAppStore.getState().iterationBranches[0].id;
  const refinedJob = makeIterationJob('iter-2', 'refined prompt');
  useAppStore.getState().addIteration({
    job: refinedJob,
    parentId: 'iter-1',
    thumbnail: 'data:image/png;base64,child',
    branchId,
  });

  useAppStore.getState().pinIteration('iter-1');
}

describe('IterationTimeline', () => {
  beforeEach(() => {
    useAppStore.setState(useAppStore.getInitialState());
  });

  afterEach(cleanup);

  it('renders an empty state when no iterations exist', () => {
    render(<IterationTimeline />);

    expect(screen.getByText('Iterations appear here as you branch results')).toBeInTheDocument();
  });

  it('renders branch summary and active step metadata for the current path', () => {
    seedIterationPath();

    render(<IterationTimeline />);

    expect(screen.getByTestId('iteration-timeline-summary')).toHaveTextContent('Step 2/2');
    expect(screen.getByTestId('iteration-timeline-summary')).toHaveTextContent('1 pinned');
    expect(screen.getByTestId('iteration-timeline-summary')).toHaveTextContent('1 change');
    expect(screen.getByTestId('iteration-timeline-node-iter-2')).toHaveAttribute('aria-current', 'step');
  });

  it('supports keyboard navigation across timeline steps', async () => {
    const user = userEvent.setup();
    seedIterationPath();

    render(<IterationTimeline />);

    const latestNode = screen.getByTestId('iteration-timeline-node-iter-2');
    latestNode.focus();
    await user.keyboard('{ArrowLeft}');

    await waitFor(() => {
      expect(useAppStore.getState().activeIterationId).toBe('iter-1');
    });

    expect(screen.getByTestId('iteration-timeline-summary')).toHaveTextContent('Step 1/2');
    expect(screen.getByTestId('iteration-timeline-node-iter-1')).toHaveAttribute('aria-current', 'step');
  });
});
