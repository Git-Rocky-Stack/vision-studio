import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { WorkflowPlaceholder } from './WorkflowPlaceholder';

const legacyPrimarySelector = [
  '.text-red-primary',
  '.bg-red-aura',
  '.border-red-primary',
  '.ring-red-primary',
  '.glow-red',
  '.glow-red-subtle',
  '.shadow-red-glow',
].join(', ');

describe('WorkflowPlaceholder', () => {
  afterEach(cleanup);

  it('renders the planned workflow empty state without legacy primary red styling', () => {
    const { container } = render(<WorkflowPlaceholder />);

    expect(screen.getByRole('heading', { name: 'Workflow' })).toBeInTheDocument();
    expect(screen.getByText('Node workflows are coming to this workbench.')).toBeInTheDocument();
    expect(screen.getByText('For now, keep building through Canvas and Viewer.')).toBeInTheDocument();
    expect(screen.getByText('Planned')).toHaveClass('border-accent-primary-border');
    expect(screen.getByText('Linear UI')).toBeInTheDocument();
    expect(screen.getByText('Node Canvas')).toBeInTheDocument();
    expect(container.querySelector(legacyPrimarySelector)).not.toBeInTheDocument();
  });
});
