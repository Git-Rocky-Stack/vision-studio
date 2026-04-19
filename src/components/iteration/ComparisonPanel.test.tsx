import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
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
});