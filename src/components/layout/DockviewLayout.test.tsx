import { cleanup, render, screen, within } from '@testing-library/react';
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
  WorkflowWorkbench: () => <div data-testid="mock-workflow">Workflow</div>,
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

  it('renders Launchpad placeholder for launchpad center view', () => {
    useAppStore.setState({ activeTab: 'generate', centerView: 'launchpad' });
    render(<DockviewLayout />);

    // The Launchpad text appears in both the center tab button and the content area.
    // Verify the content placeholder specifically by checking multiple Launchpad elements exist.
    const launchpadElements = screen.getAllByText('Launchpad');
    // At least one is the tab button, and one is the content placeholder
    expect(launchpadElements.length).toBeGreaterThanOrEqual(2);
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
});