import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { useAppStore } from '@/store/appStore';

import { WorkflowLibraryPanel } from './WorkflowLibraryPanel';

const headingOutline = () =>
  screen.getAllByRole('heading').map((heading) => `${heading.tagName} ${heading.textContent}`);

describe('WorkflowLibraryPanel', () => {
  beforeEach(() => {
    useAppStore.setState(useAppStore.getInitialState(), true);
  });

  afterEach(cleanup);

  // In the left dock the panel is the first thing on the Workflows tab, so it
  // carries the page heading. Inside the workbench the page already has one.
  it('heads the dock with the workspace name when docked', () => {
    render(<WorkflowLibraryPanel docked />);

    expect(headingOutline()).toEqual(['H1 Workflows', 'H2 Workflow Library', 'H2 Run Output']);
  });

  it('adds no page heading inside the workbench', () => {
    render(<WorkflowLibraryPanel />);

    expect(headingOutline()).toEqual(['H3 Workflow Library', 'H3 Run Output']);
  });

  it('lists the saved workflows and marks the active one', () => {
    render(<WorkflowLibraryPanel />);

    expect(screen.getByRole('heading', { name: 'Workflow Library' })).toBeInTheDocument();
    const active = screen.getByRole('button', { name: 'Image generation baseline' });
    const other = screen.getByRole('button', { name: 'Storyboard frame' });
    expect(active).toHaveAttribute('aria-pressed', 'true');
    expect(other).toHaveAttribute('aria-pressed', 'false');
  });

  it('switches the active workflow when another one is picked', () => {
    render(<WorkflowLibraryPanel />);

    fireEvent.click(screen.getByRole('button', { name: 'Storyboard frame' }));

    const picked = useAppStore
      .getState()
      .workflowRecords.find((workflow) => workflow.name === 'Storyboard frame');
    expect(useAppStore.getState().activeWorkflowId).toBe(picked?.id);
    expect(screen.getByRole('button', { name: 'Storyboard frame' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('says there is no run output until the active workflow has run', () => {
    render(<WorkflowLibraryPanel />);

    expect(screen.getByRole('heading', { name: 'Run Output' })).toBeInTheDocument();
    expect(screen.getByText('No run output yet.')).toBeInTheDocument();
  });

  it('lists the run history of the active workflow', () => {
    useAppStore.getState().recordWorkflowRun('image-generation-baseline', {
      id: 'run-1',
      status: 'complete',
      summary: 'Baseline run finished',
      createdAt: '2026-04-22T12:00:00.000Z',
    });

    render(<WorkflowLibraryPanel />);

    const history = screen.getByRole('list', { name: 'Workflow run history' });
    expect(history).toHaveTextContent('Baseline run finished');
    expect(history).toHaveTextContent('Complete');
    expect(screen.queryByText('No run output yet.')).not.toBeInTheDocument();
  });

  it('shows a run that is in flight', () => {
    useAppStore.getState().setWorkflowRuntimeState('image-generation-baseline', { activeJobId: 'job-42' });

    render(<WorkflowLibraryPanel />);

    expect(screen.getByText('Workflow run in progress')).toBeInTheDocument();
    expect(screen.getByText('Job job-42')).toBeInTheDocument();
  });
});
