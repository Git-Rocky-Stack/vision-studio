import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { useAppStore } from '@/store/appStore';

import { GenerationQueue } from './GenerationQueue';

describe('GenerationQueue', () => {
  beforeEach(() => {
    useAppStore.setState(useAppStore.getInitialState());
    useAppStore.getState().addToGenerationQueue({
      id: 'queue-1',
      prompt: 'Carbon studio frame',
      thumbnail: 'data:image/png;base64,queue-thumb',
      params: { model: 'flux-dev' },
      status: 'completed',
      createdAt: new Date('2026-04-16T12:00:00Z'),
    });
  });

  afterEach(cleanup);

  it('uses accent selection styling for hovered thumbnails', async () => {
    const user = userEvent.setup();
    render(<GenerationQueue />);

    const thumbnail = screen.getByRole('button', { name: 'View generation 1' });
    await user.hover(thumbnail);

    expect(thumbnail).toHaveClass('border-accent-primary-border');
    expect(thumbnail).not.toHaveClass('border-red-primary');
    expect(screen.getByText('Click to load on canvas')).toBeInTheDocument();
  });
});
