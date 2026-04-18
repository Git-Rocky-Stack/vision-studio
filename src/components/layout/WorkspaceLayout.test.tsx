import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { WorkspaceLayout } from './WorkspaceLayout';

function renderWorkspace(
  activePanel: string,
  options: {
    activeWorkbenchView?: 'canvas' | 'viewer' | 'workflow';
    onWorkbenchViewChange?: (view: 'canvas' | 'viewer' | 'workflow') => void;
  } = {}
) {
  return render(
    <WorkspaceLayout
      activePanel={activePanel}
      activeWorkbenchView={options.activeWorkbenchView ?? 'canvas'}
      onWorkbenchViewChange={options.onWorkbenchViewChange ?? vi.fn()}
      sidebar={<nav>Global rail</nav>}
      header={<header>Project chrome</header>}
      timeline={<div>Timeline strip</div>}
      canvas={<div>Canvas stage</div>}
      panels={{
        generate: <div>Generate settings</div>,
        quick: <div>Quick settings</div>,
        storyboard: <div>Storyboard settings</div>,
        edit: <div>Edit fallback panel</div>,
        assets: <div>Assets panel</div>,
        settings: <div>Settings panel</div>,
        templates: <div>Templates browser</div>,
      }}
      toolStrip={<div>Edit tool rail</div>}
      editCanvas={<div>Edit canvas</div>}
      editProperties={<div>Edit inspector</div>}
      batchQueue={<div>Batch queue</div>}
      batchResults={<div>Batch results</div>}
    />
  );
}

describe('WorkspaceLayout', () => {
  afterEach(cleanup);

  it('routes Generate through Invoke-style left settings and right context', () => {
    renderWorkspace('generate');

    expect(screen.getByTestId('workbench-left-dock')).toHaveTextContent('Generate settings');
    expect(screen.getByRole('tab', { name: 'Canvas' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Viewer' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Workflow' })).toBeInTheDocument();
    expect(screen.getByTestId('workbench-right-dock')).toHaveTextContent('Boards');
    expect(screen.getByTestId('workbench-right-dock')).toHaveTextContent('Gallery');
    expect(screen.queryByRole('tab', { name: 'Settings' })).not.toBeInTheDocument();
    expect(screen.getByTestId('workbench-bottom')).toHaveTextContent('Timeline strip');
  });

  it('routes Quick through Invoke-style left settings and right context', () => {
    renderWorkspace('quick');

    expect(screen.getByTestId('workbench-left-dock')).toHaveTextContent('Quick settings');
    expect(screen.getByTestId('workbench-right-dock')).toHaveTextContent('Boards');
    expect(screen.getByTestId('workbench-right-dock')).toHaveTextContent('Gallery');
    expect(screen.queryByRole('tab', { name: 'Settings' })).not.toBeInTheDocument();
  });

  it('requests workbench view changes from the mini-tabs', () => {
    const onWorkbenchViewChange = vi.fn();
    renderWorkspace('generate', { onWorkbenchViewChange });

    fireEvent.click(screen.getByRole('tab', { name: 'Workflow' }));

    expect(onWorkbenchViewChange).toHaveBeenCalledWith('workflow');
  });

  it('renders the real Viewer surface instead of the Canvas stage', () => {
    renderWorkspace('generate', { activeWorkbenchView: 'viewer' });

    expect(screen.getByRole('tab', { name: 'Viewer' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('Outputs will appear here.')).toBeInTheDocument();
    expect(screen.queryByText('Canvas stage')).not.toBeInTheDocument();
  });

  it('routes Edit through left inspector, tool rail, and right layers stack', () => {
    renderWorkspace('edit');

    expect(screen.getByTestId('workbench-left-dock')).toHaveTextContent('Edit inspector');
    expect(screen.getByTestId('workbench-tool-rail')).toHaveTextContent('Edit tool rail');
    expect(screen.getByText('Edit canvas')).toBeInTheDocument();
    expect(screen.getByTestId('workbench-right-dock')).toHaveTextContent('Layers');
    expect(screen.getByTestId('workbench-right-dock')).toHaveTextContent('Gallery');
    expect(screen.queryByRole('tab', { name: 'Inspector' })).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Workflow' })).toBeInTheDocument();
  });

  it('renders Layers in the Edit right context stack', () => {
    renderWorkspace('edit');

    expect(screen.getByTestId('workbench-right-dock')).toHaveTextContent('No layers');
  });

  it('renders the Workflow workbench when the workbench view is workflow', () => {
    renderWorkspace('edit', { activeWorkbenchView: 'workflow' });

    expect(screen.getByRole('tab', { name: 'Workflow' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('heading', { name: 'Workflow' })).toBeInTheDocument();
    expect(screen.getAllByText('Image generation baseline').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole('region', { name: 'Workflow graph editor' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sampler node' })).toBeInTheDocument();
    expect(screen.queryByText('Node workflows are coming to this workbench.')).not.toBeInTheDocument();
  });

  it('keeps Batch on its specialized queue and results layout', () => {
    renderWorkspace('batch');

    expect(screen.getByText('Batch results')).toBeInTheDocument();
    expect(screen.getByText('Batch queue')).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Canvas' })).not.toBeInTheDocument();
    expect(screen.queryByText('Timeline strip')).not.toBeInTheDocument();
  });

  it('keeps Templates on its specialized browser layout', () => {
    renderWorkspace('templates');

    expect(screen.getByText('Templates browser')).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Canvas' })).not.toBeInTheDocument();
    expect(screen.queryByText('Timeline strip')).not.toBeInTheDocument();
  });
});
