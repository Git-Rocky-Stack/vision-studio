import { cleanup, render, screen } from '@testing-library/react';
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

  it('renders the editable workflow graph in the center work surface', () => {
    render(<WorkflowWorkbench />);

    expect(screen.getByRole('region', { name: 'Workflow graph editor' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Prompt Encode node' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sampler node' })).toBeInTheDocument();
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

  it('exports the active graph as ComfyUI API JSON', async () => {
    const user = userEvent.setup();

    render(<WorkflowWorkbench />);
    await user.click(screen.getByRole('button', { name: 'Export ComfyUI JSON' }));

    expect(screen.getByRole('region', { name: 'ComfyUI API JSON export' })).toHaveTextContent(
      '"class_type": "KSampler"'
    );
    expect(screen.getByRole('region', { name: 'ComfyUI API JSON export' })).toHaveTextContent('"positive"');
  });

  it('uses Carbon Pro accent tokens instead of legacy primary red chrome', () => {
    const { container } = render(<WorkflowWorkbench />);

    expect(screen.getByText('Draft')).toHaveClass('border-accent-primary-border');
    expect(container.querySelector(legacyPrimarySelector)).not.toBeInTheDocument();
  });
});
