import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { useAppStore } from '@/store/appStore';
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
  beforeEach(() => {
    useAppStore.setState(useAppStore.getInitialState(), true);
  });

  afterEach(cleanup);

  it('renders workflow metadata instead of placeholder copy', () => {
    render(<WorkflowWorkbench />);

    expect(screen.getByRole('heading', { name: 'Workflow' })).toBeInTheDocument();
    expect(screen.getAllByText('Image generation baseline').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Draft')).toBeInTheDocument();
    expect(screen.queryByText('Node workflows are coming to this workbench.')).not.toBeInTheDocument();
  });

  it('renders active workflow description, tags, and notes', () => {
    render(<WorkflowWorkbench />);

    expect(
      screen.getByText('Reusable text-to-image pass for current prompt and reference context.')
    ).toBeInTheDocument();
    expect(screen.getByText('image')).toBeInTheDocument();
    expect(screen.getByText('baseline')).toBeInTheDocument();
    expect(
      screen.getByText('Use this path before branching accepted output into Viewer, Boards, or Gallery.')
    ).toBeInTheDocument();
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

  it('renders workflow library records and run output context', () => {
    render(<WorkflowWorkbench />);

    expect(screen.getByRole('heading', { name: 'Workflow Library' })).toBeInTheDocument();
    expect(screen.getAllByText('Image generation baseline')).toHaveLength(2);
    expect(screen.getByText('Storyboard frame')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Run Output' })).toBeInTheDocument();
    expect(screen.getByText('No run output yet.')).toBeInTheDocument();
  });

  it('renders recent workflow run history', () => {
    useAppStore.getState().recordWorkflowRun('image-generation-baseline', {
      id: 'run-1',
      status: 'complete',
      summary: 'Generated 2 images',
      createdAt: '2026-04-17T12:00:00.000Z',
    });

    render(<WorkflowWorkbench />);

    expect(screen.getByText('Generated 2 images')).toBeInTheDocument();
    expect(screen.getByText('Complete')).toBeInTheDocument();
  });

  it('selects a workflow from the library', async () => {
    const user = userEvent.setup();

    render(<WorkflowWorkbench />);
    await user.click(screen.getByRole('button', { name: 'Storyboard frame' }));

    expect(useAppStore.getState().activeWorkflowId).toBe('storyboard-frame');
    expect(screen.getByText('Scene continuity run')).toBeInTheDocument();
  });

  it('updates rendered metadata when selecting another workflow', async () => {
    const user = userEvent.setup();

    render(<WorkflowWorkbench />);
    await user.click(screen.getByRole('button', { name: 'Storyboard frame' }));

    expect(
      screen.getByText('Creates a scene-aligned frame while preserving character and board context.')
    ).toBeInTheDocument();
    expect(screen.getByText('storyboard')).toBeInTheDocument();
    expect(screen.getByText('scene')).toBeInTheDocument();
    expect(screen.getByText('Use this path when a single board frame needs continuity before review.')).toBeInTheDocument();
  });

  it('uses Carbon Pro accent tokens instead of legacy primary red chrome', () => {
    const { container } = render(<WorkflowWorkbench />);

    expect(screen.getByText('Draft')).toHaveClass('border-accent-primary-border');
    expect(container.querySelector(legacyPrimarySelector)).not.toBeInTheDocument();
  });
});
