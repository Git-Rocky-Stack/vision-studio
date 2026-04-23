import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { useAppStore } from '@/store/appStore';

import { IterationWorkspacePanel } from './IterationWorkspacePanel';

describe('IterationWorkspacePanel', () => {
  beforeEach(() => {
    useAppStore.setState(useAppStore.getInitialState());
  });

  afterEach(cleanup);

  it('renders tree mode by default', () => {
    render(<IterationWorkspacePanel />);

    expect(screen.getByText('History')).toBeInTheDocument();
  });

  it('renders timeline mode when selected', () => {
    useAppStore.getState().setIterationView('timeline');

    render(<IterationWorkspacePanel />);

    expect(screen.getByLabelText('Expanded iteration timeline')).toBeInTheDocument();
  });

  it('renders overlay companion mode when selected', () => {
    useAppStore.getState().setIterationView('overlay');

    render(<IterationWorkspacePanel />);

    expect(screen.getByLabelText('Canvas overlay')).toBeInTheDocument();
  });
});
