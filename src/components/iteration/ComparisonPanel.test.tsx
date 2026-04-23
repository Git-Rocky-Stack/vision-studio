import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useAppStore } from '@/store/appStore';
import { ComparisonPanel } from './ComparisonPanel';

describe('ComparisonPanel', () => {
  beforeEach(() => {
    useAppStore.setState(useAppStore.getInitialState());
  });
  afterEach(cleanup);

  it('renders comparison mode tabs', () => {
    const job1 = { id: 'iter-1', type: 'image' as const, status: 'completed' as const, progress: 100, params: {}, createdAt: new Date() };
    const job2 = { id: 'iter-2', type: 'image' as const, status: 'completed' as const, progress: 100, params: {}, createdAt: new Date() };
    useAppStore.getState().addIteration({ job: job1, parentId: null, thumbnail: 'thumb1' });
    useAppStore.getState().addIteration({ job: job2, parentId: null, thumbnail: 'thumb2' });

    render(<ComparisonPanel leftId="iter-1" rightId="iter-2" />);
    expect(screen.getByRole('tab', { name: 'Side by Side' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Slider' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Grid' })).toBeInTheDocument();
  });

  it('switches comparison mode on click', async () => {
    const user = userEvent.setup();
    const job1 = { id: 'iter-1', type: 'image' as const, status: 'completed' as const, progress: 100, params: {}, createdAt: new Date() };
    const job2 = { id: 'iter-2', type: 'image' as const, status: 'completed' as const, progress: 100, params: {}, createdAt: new Date() };
    useAppStore.getState().addIteration({ job: job1, parentId: null, thumbnail: 'thumb1' });
    useAppStore.getState().addIteration({ job: job2, parentId: null, thumbnail: 'thumb2' });

    render(<ComparisonPanel leftId="iter-1" rightId="iter-2" />);
    const sliderTab = screen.getByRole('tab', { name: 'Slider' });
    await user.click(sliderTab);
    expect(useAppStore.getState().iterationComparisonMode).toBe('slider');
  });

  it('renders nothing for missing nodes', () => {
    const { container } = render(<ComparisonPanel leftId="nonexistent" rightId="alsomissing" />);
    expect(container.innerHTML).toBe('');
  });

  it('clears comparison ids from the compare panel header', async () => {
    const user = userEvent.setup();
    const job1 = { id: 'iter-1', type: 'image' as const, status: 'completed' as const, progress: 100, params: {}, createdAt: new Date() };
    const job2 = { id: 'iter-2', type: 'image' as const, status: 'completed' as const, progress: 100, params: {}, createdAt: new Date() };
    useAppStore.getState().addIteration({ job: job1, parentId: null, thumbnail: 'thumb1' });
    useAppStore.getState().addIteration({ job: job2, parentId: null, thumbnail: 'thumb2' });
    useAppStore.getState().setComparisonIds(['iter-1', 'iter-2']);

    render(<ComparisonPanel leftId="iter-1" rightId="iter-2" />);
    await user.click(screen.getByRole('button', { name: 'Clear Compare' }));

    expect(useAppStore.getState().comparisonIds).toBeNull();
  });

  it('shows a cross-branch badge for cross-branch comparisons', () => {
    const rootJob = { id: 'iter-1', type: 'image' as const, status: 'completed' as const, progress: 100, params: {}, createdAt: new Date() };
    const childJob = { id: 'iter-2', type: 'image' as const, status: 'completed' as const, progress: 100, params: {}, createdAt: new Date() };
    const forkJob = { id: 'iter-3', type: 'image' as const, status: 'completed' as const, progress: 100, params: {}, createdAt: new Date() };
    useAppStore.getState().addIteration({ job: rootJob, parentId: null, thumbnail: 'thumb1' });
    const branchId = useAppStore.getState().iterationBranches[0].id;
    useAppStore.getState().addIteration({ job: childJob, parentId: 'iter-1', thumbnail: 'thumb2', branchId });
    useAppStore.getState().forkIteration({ job: forkJob, parentId: 'iter-1', thumbnail: 'thumb3' });

    render(<ComparisonPanel leftId="iter-2" rightId="iter-3" />);

    expect(screen.getByText('Cross branch')).toBeInTheDocument();
  });
});
