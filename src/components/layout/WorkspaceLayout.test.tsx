import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { WorkspaceLayout } from './WorkspaceLayout';

function renderWorkspace(
  activePanel: string,
  options: {
    activeWorkbenchView?: 'canvas' | 'viewer' | 'workflow';
    onWorkbenchViewChange?: (view: 'canvas' | 'viewer' | 'workflow') => void;
    activeWorkbenchDockTabs?: Record<string, string>;
    onWorkbenchDockTabChange?: (panel: 'generate' | 'quick' | 'edit', tabId: string) => void;
  } = {}
) {
  return render(
    <WorkspaceLayout
      activePanel={activePanel}
      activeWorkbenchView={options.activeWorkbenchView ?? 'canvas'}
      onWorkbenchViewChange={options.onWorkbenchViewChange ?? vi.fn()}
      activeWorkbenchDockTabs={options.activeWorkbenchDockTabs ?? {}}
      onWorkbenchDockTabChange={options.onWorkbenchDockTabChange ?? vi.fn()}
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

  it('routes Generate through the workbench shell', () => {
    renderWorkspace('generate');

    expect(screen.getByRole('tab', { name: 'Canvas' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Viewer' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Workflow' })).toBeInTheDocument();
    expect(screen.getByTestId('workbench-right-dock')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Settings' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Gallery' })).toBeInTheDocument();
    expect(screen.getByText('Generate settings')).toBeInTheDocument();
    expect(screen.getByTestId('workbench-bottom')).toHaveTextContent('Timeline strip');
  });

  it('persists Generate dock tab changes by panel', () => {
    const onWorkbenchDockTabChange = vi.fn();
    renderWorkspace('generate', { onWorkbenchDockTabChange });

    fireEvent.click(screen.getByRole('tab', { name: 'Gallery' }));

    expect(onWorkbenchDockTabChange).toHaveBeenCalledWith('generate', 'gallery');
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

  it('routes Edit through the workbench shell with tool rail and inspector dock', () => {
    renderWorkspace('edit');

    expect(screen.getByTestId('workbench-tool-rail')).toHaveTextContent('Edit tool rail');
    expect(screen.getByText('Edit canvas')).toBeInTheDocument();
    expect(screen.getByTestId('workbench-right-dock')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Inspector' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Layers' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Gallery' })).toBeInTheDocument();
    expect(screen.getByText('Edit inspector')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Workflow' })).toBeInTheDocument();
  });

  it('promotes Layers into the Edit dock', () => {
    renderWorkspace('edit', { activeWorkbenchDockTabs: { edit: 'layers' } });

    expect(screen.getByRole('tab', { name: 'Layers' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('No layers')).toBeInTheDocument();
  });

  it('renders the Workflow placeholder when the workbench view is workflow', () => {
    renderWorkspace('edit', { activeWorkbenchView: 'workflow' });

    expect(screen.getByRole('tab', { name: 'Workflow' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('Node workflows are coming to this workbench.')).toBeInTheDocument();
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
