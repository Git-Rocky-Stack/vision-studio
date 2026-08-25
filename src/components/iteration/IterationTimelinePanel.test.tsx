import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { useAppStore } from '@/store/appStore';

import { IterationTimelinePanel } from './IterationTimelinePanel';

describe('IterationTimelinePanel', () => {
  beforeEach(() => {
    useAppStore.setState(useAppStore.getInitialState());
  });

  afterEach(cleanup);

  it('names the timeline surface as a landmark region and heading', () => {
    render(<IterationTimelinePanel />);

    // The section must carry the accessible name AND a real <h2>, not just have
    // the string present somewhere in the subtree - that is what lets assistive
    // technology jump to this panel.
    const surface = screen.getByLabelText('Expanded iteration timeline');
    expect(surface.tagName).toBe('SECTION');
    expect(
      screen.getByRole('heading', { level: 2, name: 'Expanded iteration timeline' })
    ).toHaveTextContent('Expanded iteration timeline');
    expect(surface).toHaveTextContent(
      'Review the active branch, inspect changes, and compare selected iterations.'
    );
  });
});
