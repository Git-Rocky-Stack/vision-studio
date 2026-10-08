import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAppStore } from '@/store/appStore';

import { DockviewLayout } from './DockviewLayout';

/* -------------------------------------------------------------------------- */
/*  Mock heavy-dependency components                                          */
/* -------------------------------------------------------------------------- */

vi.mock('@/components/layout/Canvas', () => ({
  Canvas: () => <div data-testid="mock-canvas">Canvas</div>,
}));

vi.mock('@/components/layout/WorkbenchViewer', () => ({
  WorkbenchViewer: () => <div data-testid="mock-viewer">Viewer</div>,
}));

vi.mock('@/components/workflow/WorkflowWorkbench', () => ({
  WorkflowWorkbench: ({ library = 'inline' }: { library?: string }) => (
    <div data-testid="mock-workflow" data-library={library}>
      Workflow
    </div>
  ),
}));

vi.mock('@/pages/AssetsPanel', () => ({
  AssetsPanel: () => <div data-testid="mock-assets">Assets</div>,
}));

vi.mock('@/pages/SettingsPanel', () => ({
  SettingsPanel: () => <div data-testid="mock-settings">Settings</div>,
}));

vi.mock('@/pages/GeneratePanel', () => ({
  GeneratePanel: () => <div data-testid="mock-generate">Generate</div>,
}));

vi.mock('@/pages/QuickGeneratePanel', () => ({
  QuickGeneratePanel: () => <div data-testid="mock-quick-generate">Quick</div>,
}));

vi.mock('@/pages/BatchPanel', () => ({
  BatchPanel: () => <div data-testid="mock-batch">Batch</div>,
}));

vi.mock('@/pages/StoryboardPanel', () => ({
  StoryboardPanel: () => <div data-testid="mock-storyboard">Storyboard</div>,
}));

vi.mock('@/pages/TemplatesPanel', () => ({
  TemplatesPanel: () => <div data-testid="mock-templates">Templates</div>,
}));

vi.mock('@/components/edit/EditPropertiesPanel', () => ({
  EditPropertiesPanel: () => <div data-testid="mock-edit-properties">EditProperties</div>,
}));

vi.mock('@/components/edit/ToolStrip', () => ({
  ToolStrip: () => <div data-testid="mock-toolstrip">ToolStrip</div>,
}));

vi.mock('@/components/edit/LayerPanel', () => ({
  LayerPanel: () => <div data-testid="mock-layer-panel">LayerPanel</div>,
}));

vi.mock('@/components/layout/WorkbenchGalleryDock', () => ({
  WorkbenchGalleryDock: () => <div data-testid="mock-gallery-dock">GalleryDock</div>,
}));

vi.mock('@/components/layout/WorkbenchBoardsDock', () => ({
  WorkbenchBoardsDock: () => <div data-testid="mock-boards-dock">BoardsDock</div>,
}));

vi.mock('@/components/canvas/GenerationProgress', () => ({
  GenerationProgress: () => <div data-testid="mock-gen-progress">GenProgress</div>,
}));

vi.mock('@/components/canvas/GenerationQueue', () => ({
  GenerationQueue: () => <div data-testid="mock-gen-queue">GenQueue</div>,
}));

vi.mock('@/components/canvas/CanvasContextMenu', () => ({
  CanvasContextMenu: () => <div data-testid="mock-canvas-context-menu">ContextMenu</div>,
}));

vi.mock('@/components/edit/RegionLockOverlay', () => ({
  RegionLockOverlay: () => <div data-testid="mock-region-lock-overlay">RegionLockOverlay</div>,
}));

vi.mock('@/components/edit/RegionMaskDrawer', () => ({
  RegionMaskDrawer: () => <div data-testid="mock-region-mask-drawer">RegionMaskDrawer</div>,
}));

vi.mock('@/features/workflow/comfyExport', () => ({
  exportWorkflowGraphToComfyPrompt: vi.fn(() => ({})),
}));

vi.mock('@/features/workflow/nodeDefaults', () => ({
  createWorkflowNodeFromClassType: vi.fn(() => ({})),
}));

vi.mock('@/components/edit/EditCanvas', () => ({
  EditCanvas: () => <div data-testid="mock-edit-canvas">EditCanvas</div>,
}));

vi.mock('react-konva', () => ({
  Stage: () => <div data-testid="mock-konva-stage">Stage</div>,
  Layer: () => <div data-testid="mock-konva-layer">Layer</div>,
}));

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

function resetStore() {
  useAppStore.setState(useAppStore.getInitialState());
}

/* -------------------------------------------------------------------------- */
/*  Tests                                                                     */
/* -------------------------------------------------------------------------- */

describe('DockviewLayout', () => {
  beforeEach(() => {
    resetStore();
  });

  afterEach(cleanup);

  it('renders the layer-editing canvas on the canvas tab', () => {
    // EditCanvas is the only renderer of `editLayers`. Without it mounted, a
    // user can add a text layer from TextControls, see it listed in
    // LayerPanel, and never have it drawn or be able to move it.
    useAppStore.setState({ activeTab: 'canvas' });
    render(<DockviewLayout />);

    expect(screen.getByTestId('mock-edit-canvas')).toBeInTheDocument();
  });

  it('keeps the generate tab on the generation canvas, not the layer editor', () => {
    useAppStore.setState({ activeTab: 'generate' });
    render(<DockviewLayout />);

    expect(screen.queryByTestId('mock-edit-canvas')).not.toBeInTheDocument();
  });

  it('renders NavBar', () => {
    render(<DockviewLayout />);

    expect(screen.getByLabelText('Generate')).toBeInTheDocument();
  });

  it('renders left dock for generate tab', () => {
    useAppStore.setState({ activeTab: 'generate' });
    render(<DockviewLayout />);

    expect(screen.getByTestId('left-dock')).toBeInTheDocument();
  });

  it('renders right dock for generate tab', () => {
    useAppStore.setState({ activeTab: 'generate' });
    render(<DockviewLayout />);

    expect(screen.getByTestId('right-dock')).toBeInTheDocument();
  });

  // The Workflows tab docks the library on the left; the Generate tab's
  // workflow view has the Generate panel there and keeps the library inline.
  it('tells the workbench where its library is shown', () => {
    useAppStore.setState({ activeTab: 'workflows' });
    const workflows = render(<DockviewLayout />);
    expect(screen.getByTestId('mock-workflow')).toHaveAttribute('data-library', 'docked');
    workflows.unmount();

    useAppStore.setState({ activeTab: 'generate', centerView: 'workflow' });
    render(<DockviewLayout />);
    expect(screen.getByTestId('mock-workflow')).toHaveAttribute('data-library', 'inline');
  });

  // In the Pipelines sub-mode the left dock holds the pipeline builder, so the
  // library is not docked anywhere and the workbench has to show it itself.
  it('keeps the library in the workbench while the dock shows pipelines', () => {
    useAppStore.setState({ activeTab: 'workflows', activeSubMode: 'pipelines' });
    render(<DockviewLayout />);

    expect(screen.getByTestId('mock-workflow')).toHaveAttribute('data-library', 'inline');
  });

  // Below 1280px the review dock is collapsed so the centre stays usable, and
  // the window may be as narrow as 1200px. There was no control to bring the
  // dock back, so Gallery, Boards and History were unreachable at that size.
  describe('review dock toggle', () => {
    it.each(['generate', 'canvas', 'story', 'workflows'] as const)(
      'offers a control for the collapsed review dock on the %s tab',
      (activeTab) => {
        useAppStore.setState({ activeTab });
        render(<DockviewLayout />);

        const dock = screen.getByTestId('right-dock');
        const toggle = screen.getByRole('button', { name: 'Show review dock' });

        expect(toggle).toHaveAttribute('aria-expanded', 'false');
        expect(toggle).toHaveAttribute('aria-controls', dock.id);
        expect(dock.id).not.toBe('');
        // Collapsed below the xl breakpoint, always shown at and above it.
        expect(dock).toHaveClass('hidden', 'xl:flex');
        // The control itself is only needed while the dock is collapsed.
        expect(toggle).toHaveClass('xl:hidden');
      },
    );

    it('opens the dock over the workspace and says so', async () => {
      const user = userEvent.setup();
      render(<DockviewLayout />);

      await user.click(screen.getByRole('button', { name: 'Show review dock' }));

      const dock = screen.getByTestId('right-dock');
      const toggle = screen.getByRole('button', { name: 'Hide review dock' });
      expect(toggle).toHaveAttribute('aria-expanded', 'true');
      expect(dock).not.toHaveClass('hidden');
      expect(dock).toHaveClass('absolute', 'flex');
      expect(within(dock).getByTestId('mock-gallery-dock')).toBeInTheDocument();
    });

    it('closes again from the same control', async () => {
      const user = userEvent.setup();
      render(<DockviewLayout />);

      await user.click(screen.getByRole('button', { name: 'Show review dock' }));
      await user.click(screen.getByRole('button', { name: 'Hide review dock' }));

      expect(screen.getByTestId('right-dock')).toHaveClass('hidden');
      expect(screen.getByRole('button', { name: 'Show review dock' })).toHaveAttribute('aria-expanded', 'false');
    });

    it('closes on Escape', async () => {
      const user = userEvent.setup();
      render(<DockviewLayout />);

      await user.click(screen.getByRole('button', { name: 'Show review dock' }));
      await user.keyboard('{Escape}');

      expect(screen.getByTestId('right-dock')).toHaveClass('hidden');
    });

    it('offers no review dock control on a tab without one', () => {
      useAppStore.setState({ activeTab: 'settings' });
      render(<DockviewLayout />);

      expect(screen.queryByRole('button', { name: /review dock/i })).not.toBeInTheDocument();
    });
  });

  it('renders the expanded iteration timeline when timeline mode is selected', () => {
    useAppStore.setState({
      activeTab: 'generate',
      centerView: 'canvas',
      iterationView: 'timeline',
      iterationBranches: [
        {
          id: 'branch-1',
          name: 'Branch 1',
          rootNodeId: 'iter-1',
          activeNodeId: 'iter-1',
          createdAt: Date.now(),
        },
      ],
      iterationNodes: new Map([
        [
          'iter-1',
          {
            id: 'iter-1',
            parentId: null,
            branchId: 'branch-1',
            childrenIds: [],
            generationJob: {
              id: 'iter-1',
              type: 'image',
              status: 'completed',
              progress: 100,
              params: {},
              createdAt: new Date(),
            },
            thumbnail: '',
            settingsDiff: null,
            createdAt: Date.now(),
            isPinned: false,
            note: '',
          },
        ],
      ]),
      activeIterationId: 'iter-1',
    });
    render(<DockviewLayout />);

    expect(screen.getByLabelText('Expanded iteration timeline')).toBeInTheDocument();
  });

  it('renders shell splitter handles for docked layouts', () => {
    useAppStore.setState({ activeTab: 'generate' });
    render(<DockviewLayout />);

    expect(screen.getByTestId('splitter-left-dock')).toBeInTheDocument();
    expect(screen.getByTestId('splitter-right-dock')).toBeInTheDocument();
    expect(screen.getByTestId('splitter-right-dock-triple-0')).toBeInTheDocument();
  });

  it('does NOT render side docks for assets tab', () => {
    useAppStore.setState({ activeTab: 'assets' });
    render(<DockviewLayout />);

    expect(screen.queryByTestId('left-dock')).not.toBeInTheDocument();
    expect(screen.queryByTestId('right-dock')).not.toBeInTheDocument();
  });

  it('does NOT render side docks for settings tab', () => {
    useAppStore.setState({ activeTab: 'settings' });
    render(<DockviewLayout />);

    expect(screen.queryByTestId('left-dock')).not.toBeInTheDocument();
    expect(screen.queryByTestId('right-dock')).not.toBeInTheDocument();
  });

  it('renders Layers panel for canvas tab right dock', () => {
    useAppStore.setState({ activeTab: 'canvas', centerView: 'canvas' });
    render(<DockviewLayout />);

    const rightDock = screen.getByTestId('right-dock');
    expect(within(rightDock).getByText('Layers')).toBeInTheDocument();
  });

  it('renders Gallery panel in right dock for non-canvas tabs', () => {
    useAppStore.setState({ activeTab: 'generate', centerView: 'canvas' });
    render(<DockviewLayout />);

    // Gallery appears in the right dock for generate tab
    const rightDock = screen.getByTestId('right-dock');
    expect(within(rightDock).getByText('Gallery')).toBeInTheDocument();
  });

  it('renders Boards panel in right dock for non-canvas tabs', () => {
    useAppStore.setState({ activeTab: 'generate', centerView: 'canvas' });
    render(<DockviewLayout />);

    // Boards appears in the right dock for generate tab
    const rightDock = screen.getByTestId('right-dock');
    expect(within(rightDock).getByText('Boards')).toBeInTheDocument();
  });

  it('renders center tab bar when preset has multiple center views', () => {
    useAppStore.setState({ activeTab: 'generate', centerView: 'canvas' });
    render(<DockviewLayout />);

    expect(screen.getByTestId('center-tab-bar')).toBeInTheDocument();
    expect(screen.getByTestId('center-tab-canvas')).toBeInTheDocument();
    expect(screen.getByTestId('center-tab-viewer')).toBeInTheDocument();
  });

  it('does NOT render center tab bar when preset has a single center view', () => {
    useAppStore.setState({ activeTab: 'canvas', centerView: 'canvas' });
    render(<DockviewLayout />);

    expect(screen.queryByTestId('center-tab-bar')).not.toBeInTheDocument();
  });

  it('renders full-width AssetsPanel for assets tab', () => {
    useAppStore.setState({ activeTab: 'assets' });
    render(<DockviewLayout />);

    expect(screen.getByTestId('mock-assets')).toBeInTheDocument();
  });

  it('renders full-width SettingsPanel for settings tab', () => {
    useAppStore.setState({ activeTab: 'settings' });
    render(<DockviewLayout />);

    expect(screen.getByTestId('mock-settings')).toBeInTheDocument();
  });

  it('renders the Launchpad workspace for the launchpad center view', () => {
    useAppStore.setState({ activeTab: 'generate', centerView: 'launchpad' });

    render(<DockviewLayout />);

    // The real surface, not a name placeholder: its quick actions must be there.
    expect(screen.getByRole('button', { name: /new generation/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /quick generate/i })).toBeInTheDocument();
  });

  it('marks the active center view with aria-selected', () => {
    useAppStore.setState({ activeTab: 'generate', centerView: 'canvas' });
    render(<DockviewLayout />);

    const canvasTab = screen.getByTestId('center-tab-canvas');
    expect(canvasTab).toHaveAttribute('aria-selected', 'true');

    const viewerTab = screen.getByTestId('center-tab-viewer');
    expect(viewerTab).toHaveAttribute('aria-selected', 'false');
  });

  it('updates center view when center tab is clicked', async () => {
    const user = userEvent.setup();
    useAppStore.setState({ activeTab: 'generate', centerView: 'canvas' });
    render(<DockviewLayout />);

    const viewerTab = screen.getByTestId('center-tab-viewer');
    await user.click(viewerTab);

    expect(useAppStore.getState().centerView).toBe('viewer');
  });

  it('promotes canvas when overlay mode is selected away from canvas', async () => {
    useAppStore.setState({
      activeTab: 'generate',
      centerView: 'viewer',
      iterationView: 'overlay',
    });

    render(<DockviewLayout />);

    await waitFor(() => {
      expect(useAppStore.getState().centerView).toBe('canvas');
    });
  });

  it('supports keyboard resizing for the left dock splitter', async () => {
    const user = userEvent.setup();
    useAppStore.setState({ activeTab: 'generate' });
    render(<DockviewLayout />);

    const splitter = screen.getByTestId('splitter-left-dock');
    splitter.focus();
    await user.keyboard('{ArrowRight}');

    expect(useAppStore.getState().layoutPreferences.leftDockWidth).toBeGreaterThan(320);
  });

  it('resets the right dock width on splitter double click', async () => {
    const user = userEvent.setup();
    useAppStore.setState({
      activeTab: 'generate',
      layoutPreferences: {
        ...useAppStore.getState().layoutPreferences,
        rightDockWidth: 300,
      },
    });
    render(<DockviewLayout />);

    await user.dblClick(screen.getByTestId('splitter-right-dock'));

    expect(useAppStore.getState().layoutPreferences.rightDockWidth).toBe(360);
  });

  it('supports keyboard resizing for the triple right dock stack', async () => {
    const user = userEvent.setup();
    useAppStore.setState({ activeTab: 'generate' });
    render(<DockviewLayout />);

    const initialTopRatio = useAppStore.getState().layoutPreferences.rightDockTripleRatios[0];
    const splitter = screen.getByTestId('splitter-right-dock-triple-0');
    splitter.focus();
    await user.keyboard('{ArrowDown}');

    expect(useAppStore.getState().layoutPreferences.rightDockTripleRatios[0]).toBeGreaterThan(initialTopRatio);
  });
});
