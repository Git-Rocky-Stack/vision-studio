import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { WorkflowWorkbench } from './WorkflowWorkbench';

const legacyPrimarySelector = [
  '.text-red-primary',
  '.bg-red-aura',
  '.border-red-primary',
  '.ring-red-primary',
  '.glow-red',
  '.glow-red-subtle',
  '.shadow-red-glow',
].join(', ');

describe('WorkflowWorkbench', () => {
  afterEach(cleanup);

  it('renders workflow metadata instead of placeholder copy', () => {
    render(<WorkflowWorkbench />);

    expect(screen.getByRole('heading', { name: 'Workflow' })).toBeInTheDocument();
    expect(screen.getByText('Image generation baseline')).toBeInTheDocument();
    expect(screen.getByText('Draft')).toBeInTheDocument();
    expect(screen.queryByText('Node workflows are coming to this workbench.')).not.toBeInTheDocument();
  });

  it('renders an ordered linear run plan', () => {
    render(<WorkflowWorkbench />);

    const runPlan = screen.getByRole('list', { name: 'Workflow run plan' });
    const steps = within(runPlan).getAllByRole('listitem');

    expect(steps).toHaveLength(5);
    expect(steps[0]).toHaveTextContent('Prompt');
    expect(steps[1]).toHaveTextContent('Model');
    expect(steps[2]).toHaveTextContent('Generate');
    expect(steps[3]).toHaveTextContent('Review');
    expect(steps[4]).toHaveTextContent('Save');
  });

  it('renders library presets and run output context', () => {
    render(<WorkflowWorkbench />);

    expect(screen.getByRole('heading', { name: 'Workflow Library' })).toBeInTheDocument();
    expect(screen.getByText('Text to image')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Run Output' })).toBeInTheDocument();
    expect(screen.getByText('No run output yet.')).toBeInTheDocument();
  });

  it('uses Carbon Pro accent tokens instead of legacy primary red chrome', () => {
    const { container } = render(<WorkflowWorkbench />);

    expect(screen.getByText('Draft')).toHaveClass('border-accent-primary-border');
    expect(container.querySelector(legacyPrimarySelector)).not.toBeInTheDocument();
  });
});
