import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { FoundryPage } from './FoundryPage';

describe('FoundryPage', () => {
  afterEach(cleanup);

  it('renders the Foundry heading and three section tabs', () => {
    render(<FoundryPage />);
    expect(screen.getByRole('heading', { name: /foundry/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /discover/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /library/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /hardware/i })).toBeInTheDocument();
  });

  it('switches sections when a section tab is clicked', () => {
    render(<FoundryPage />);
    fireEvent.click(screen.getByRole('tab', { name: /library/i }));
    expect(screen.getByTestId('foundry-section-library')).toBeInTheDocument();
  });
});
