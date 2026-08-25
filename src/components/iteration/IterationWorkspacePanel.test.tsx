import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { useAppStore } from '@/store/appStore';

import { IterationWorkspacePanel } from './IterationWorkspacePanel';

describe('IterationWorkspacePanel', () => {
  beforeEach(() => {
    useAppStore.setState(useAppStore.getInitialState());
  });

  afterEach(cleanup);

  // The three views are mutually exclusive branches of one component. Asserting
  // only that the selected view appears would pass just as happily if the panel
  // rendered all three at once, which is the actual failure mode worth catching.
  it('renders tree mode by default, to the exclusion of the others', () => {
    render(<IterationWorkspacePanel />);

    expect(screen.getByText('History')).toBeInTheDocument();
    expect(screen.queryByLabelText('Expanded iteration timeline')).toBeNull();
    expect(screen.queryByLabelText('Canvas overlay')).toBeNull();
  });

  it('renders timeline mode when selected, to the exclusion of the others', () => {
    useAppStore.getState().setIterationView('timeline');

    render(<IterationWorkspacePanel />);

    expect(screen.getByLabelText('Expanded iteration timeline')).toHaveAttribute(
      'aria-label',
      'Expanded iteration timeline'
    );
    expect(screen.queryByLabelText('Canvas overlay')).toBeNull();
    expect(screen.queryByText('History')).toBeNull();
  });

  it('renders overlay companion mode when selected, to the exclusion of the others', () => {
    useAppStore.getState().setIterationView('overlay');

    render(<IterationWorkspacePanel />);

    expect(screen.getByLabelText('Canvas overlay')).toHaveTextContent(
      'Browse the active selection and compare iterations while the overlay is visible on canvas.'
    );
    expect(screen.queryByLabelText('Expanded iteration timeline')).toBeNull();
    expect(screen.queryByText('History')).toBeNull();
  });
});
