import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { useAppStore } from '@/store/appStore';

import { GenerationProgress } from './GenerationProgress';

describe('GenerationProgress', () => {
  beforeEach(() => {
    useAppStore.setState(useAppStore.getInitialState());
    useAppStore.getState().addJob({
      id: 'job-1',
      type: 'image',
      status: 'processing',
      progress: 44,
      params: {
        model: 'flux-dev',
        runtime: 'local',
        steps: 25,
      },
      createdAt: new Date('2026-04-16T12:00:00Z'),
    });
  });

  afterEach(cleanup);

  it('shows compact job metadata with progress', () => {
    render(<GenerationProgress />);

    expect(screen.getByRole('progressbar', { name: 'Generation progress' })).toHaveAttribute('aria-valuenow', '44');
    expect(screen.getByText('flux-dev')).toBeInTheDocument();
    expect(screen.getByText('local')).toBeInTheDocument();
    expect(screen.getByText('44% complete')).toBeInTheDocument();
  });
});
