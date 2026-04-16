import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { WorkbenchShell } from './WorkbenchShell';

function renderShell(activeView: 'canvas' | 'viewer' | 'workflow' = 'canvas') {
  return render(
    <WorkbenchShell
      activeView={activeView}
      onViewChange={vi.fn()}
      toolRail={<div>Tool rail content</div>}
      canvas={<div>Canvas content</div>}
      viewer={<div>Viewer content</div>}
      workflow={<div>Workflow content</div>}
      bottom={<div>Timeline content</div>}
      rightDockTabs={[
        { id: 'settings', label: 'Settings', content: <div>Settings content</div> },
        { id: 'layers', label: 'Layers', content: <div>Layers content</div> },
      ]}
    />
  );
}

describe('WorkbenchShell', () => {
  afterEach(cleanup);

  it('renders stable workbench zones with Canvas selected by default', () => {
    renderShell();

    expect(screen.getByRole('tab', { name: 'Canvas' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Viewer' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Workflow' })).toBeInTheDocument();
    expect(screen.getByTestId('workbench-tool-rail')).toBeInTheDocument();
    expect(screen.getByTestId('workbench-right-dock')).toBeInTheDocument();
    expect(screen.getByTestId('workbench-bottom')).toBeInTheDocument();
    expect(screen.getByText('Canvas content')).toBeInTheDocument();
    expect(screen.getByText('Settings content')).toBeInTheDocument();
  });

  it('requests a workbench view change when the Workflow tab is clicked', () => {
    const onViewChange = vi.fn();
    render(
      <WorkbenchShell
        activeView="canvas"
        onViewChange={onViewChange}
        canvas={<div>Canvas content</div>}
        viewer={<div>Viewer content</div>}
        workflow={<div>Workflow content</div>}
      />
    );

    fireEvent.click(screen.getByRole('tab', { name: 'Workflow' }));

    expect(onViewChange).toHaveBeenCalledWith('workflow');
  });

  it('renders the active Workflow panel', () => {
    renderShell('workflow');

    expect(screen.getByRole('tab', { name: 'Workflow' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('Workflow content')).toBeInTheDocument();
    expect(screen.queryByText('Canvas content')).not.toBeInTheDocument();
  });
});
