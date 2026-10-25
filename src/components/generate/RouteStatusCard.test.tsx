import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { RouteStatusCard } from './RouteStatusCard';

describe('RouteStatusCard', () => {
  afterEach(cleanup);

  // The LED reported "play" (green) even while the card read "Model: Not set
  // in Settings". A hardware indicator has to show real state.
  it('lights cue, not play, while the route is not configured', () => {
    const { container } = render(<RouteStatusCard title="OpenRouter Batch Route" ready={false} />);

    expect(container.firstElementChild).toHaveAttribute('data-route-ready', 'false');
    const led = container.querySelector('span[aria-hidden="true"]') as HTMLElement;
    expect(led.style.background).toContain('--color-led-cue');
    expect(screen.getByText('Not configured')).toHaveClass('sr-only');
  });

  it('lights play once the route can run', () => {
    const { container } = render(
      <RouteStatusCard title="OpenRouter Batch Route" ready>
        <p>Model: google/gemini</p>
      </RouteStatusCard>,
    );

    const led = container.querySelector('span[aria-hidden="true"]') as HTMLElement;
    expect(led.style.background).toContain('--color-led-play');
    expect(screen.getByText('Ready')).toHaveClass('sr-only');
    expect(screen.getByText('Model: google/gemini')).toBeInTheDocument();
  });
});
