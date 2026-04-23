import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { useAppStore } from '@/store/appStore';

import { IterationTimelinePanel } from './IterationTimelinePanel';

describe('IterationTimelinePanel', () => {
  beforeEach(() => {
    useAppStore.setState(useAppStore.getInitialState());
  });

  afterEach(cleanup);

  it('renders the expanded timeline surface', () => {
    render(<IterationTimelinePanel />);

    expect(screen.getByLabelText('Expanded iteration timeline')).toBeInTheDocument();
    expect(screen.getByText('Expanded iteration timeline')).toBeInTheDocument();
  });
});
