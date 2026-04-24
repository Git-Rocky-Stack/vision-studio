import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useAppStore } from '@/store/appStore';
import { IterationTreePanel } from './IterationTreePanel';

describe('IterationTreePanel', () => {
  beforeEach(() => {
    useAppStore.setState(useAppStore.getInitialState());
  });
  afterEach(cleanup);

  it('renders empty state when no iterations', () => {
    render(<IterationTreePanel />);
    expect(screen.getByText('No iterations yet')).toBeInTheDocument();
  });

  it('renders iteration nodes after adding', () => {
    const job = { id: 'iter-1', type: 'image' as const, status: 'completed' as const, progress: 100, params: { prompt: 'test prompt' }, createdAt: new Date() };
    useAppStore.getState().addIteration({ job, parentId: null, thumbnail: '' });

    render(<IterationTreePanel />);
    expect(screen.getByText('History')).toBeInTheDocument();
  });

  it('shows branch tabs when multiple branches exist', () => {
    const job1 = { id: 'iter-1', type: 'image' as const, status: 'completed' as const, progress: 100, params: {}, createdAt: new Date() };
    useAppStore.getState().addIteration({ job: job1, parentId: null, thumbnail: '' });
    useAppStore.getState().forkIteration({ job: { id: 'iter-2', type: 'image' as const, status: 'completed' as const, progress: 100, params: {}, createdAt: new Date() }, parentId: 'iter-1', thumbnail: '' });

    render(<IterationTreePanel />);
    // Should have branch tabs visible
    expect(screen.getByText('Branch 1')).toBeInTheDocument();
  });

  it('adds the active node to comparison from node detail', async () => {
    const user = userEvent.setup();
    const job = { id: 'iter-1', type: 'image' as const, status: 'completed' as const, progress: 100, params: { prompt: 'test prompt' }, createdAt: new Date() };
    useAppStore.getState().addIteration({ job, parentId: null, thumbnail: '' });

    render(<IterationTreePanel />);
    await user.click(screen.getByRole('button', { name: 'Compare this iteration' }));

    expect(useAppStore.getState().comparisonIds).toEqual(['iter-1']);
  });
});
