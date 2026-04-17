import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { WorkflowPlaceholder } from '@/components/workflow/WorkflowPlaceholder';
import { useAppStore } from '@/store/appStore';
import { WorkbenchBoardsDock } from './WorkbenchBoardsDock';
import { WorkbenchRightStack } from './WorkbenchRightStack';
import { WorkbenchShell } from './WorkbenchShell';

const legacyPrimarySelector = [
  '.text-red-primary',
  '.bg-red-aura',
  '.border-red-primary',
  '.ring-red-primary',
  '.glow-red',
  '.glow-red-subtle',
  '.shadow-red-glow',
].join(', ');

describe('Workbench Carbon Pro chrome', () => {
  beforeEach(() => {
    useAppStore.setState({
      projects: [],
      activeProjectId: null,
    });
  });

  afterEach(cleanup);

  it('uses accent styling for active shell tabs without legacy primary red chrome', () => {
    const { container } = render(
      <WorkbenchShell
        activeView="canvas"
        onViewChange={vi.fn()}
        canvas={<div>Canvas content</div>}
        viewer={<div>Viewer content</div>}
        workflow={<WorkflowPlaceholder />}
        rightDockTabs={[
          { id: 'settings', label: 'Settings', content: <div>Settings content</div> },
        ]}
      />
    );

    expect(screen.getByRole('tab', { name: 'Canvas' })).toHaveClass('bg-accent-primary-muted');
    expect(screen.getByRole('tab', { name: 'Canvas' })).toHaveClass('text-accent-primary');
    expect(screen.getByRole('tab', { name: 'Settings' })).toHaveClass('border-accent-primary-border');
    expect(container.querySelector(legacyPrimarySelector)).not.toBeInTheDocument();
  });

  it('keeps Invoke-style shell docks on Carbon Pro chrome', () => {
    const { container } = render(
      <WorkbenchShell
        activeView="canvas"
        onViewChange={vi.fn()}
        leftDock={<div>Left settings content</div>}
        canvas={<div>Canvas content</div>}
        viewer={<div>Viewer content</div>}
        workflow={<WorkflowPlaceholder />}
        rightDock={
          <WorkbenchRightStack
            sections={[
              {
                id: 'boards',
                label: 'Boards',
                content: <WorkbenchBoardsDock />,
                defaultHeight: '34%',
              },
              {
                id: 'gallery',
                label: 'Gallery',
                content: <div>Gallery content</div>,
              },
            ]}
          />
        }
      />
    );

    expect(screen.getByTestId('workbench-left-dock')).toHaveTextContent('Left settings content');
    expect(screen.getByTestId('workbench-right-dock')).toHaveTextContent('Boards');
    expect(screen.getByTestId('workbench-right-dock')).toHaveTextContent('Gallery');
    expect(screen.getByRole('tab', { name: 'Canvas' }).className).toContain('bg-accent-primary-muted');
    expect(container.querySelector(legacyPrimarySelector)).toBeNull();
  });

  it('keeps stacked right dock sections on Carbon Pro chrome', () => {
    const { container } = render(
      <WorkbenchRightStack
        sections={[
          { id: 'boards', label: 'Boards', content: <div>Boards content</div> },
          { id: 'gallery', label: 'Gallery', content: <div>Gallery content</div> },
        ]}
      />
    );

    expect(screen.getByRole('button', { name: 'Boards' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Gallery' })).toBeInTheDocument();
    expect(container.querySelector(legacyPrimarySelector)).toBeNull();
  });

  it('keeps boards dock active board styling on Carbon Pro chrome', () => {
    const board = useAppStore.getState().createProject('Carbon Board', { width: 1024, height: 1024 });
    useAppStore.getState().setActiveProject(board.id);

    const { container } = render(<WorkbenchBoardsDock />);
    const activeBoard = screen.getByText('Carbon Board').closest('button');

    expect(activeBoard).toHaveClass('bg-accent-primary-muted');
    expect(container.querySelector(legacyPrimarySelector)).toBeNull();
  });

  it('keeps the Workflow placeholder on Carbon Pro accent tokens', () => {
    const { container } = render(<WorkflowPlaceholder />);

    expect(screen.getByText('Planned')).toHaveClass('bg-accent-primary-muted');
    expect(screen.getByText('Linear UI')).toHaveClass('text-accent-primary');
    expect(container.querySelector(legacyPrimarySelector)).not.toBeInTheDocument();
  });
});
