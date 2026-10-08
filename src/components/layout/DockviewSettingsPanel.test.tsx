import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';

import { useAppStore } from '@/store/appStore';

import { DockviewSettingsPanel } from './DockviewSettingsPanel';

vi.mock('@/pages/GeneratePanel', () => ({
  GeneratePanel: () => <div data-testid="mock-generate">Generate</div>,
}));

vi.mock('@/pages/QuickGeneratePanel', () => ({
  QuickGeneratePanel: () => <div data-testid="mock-quick">Quick</div>,
}));

vi.mock('@/pages/BatchPanel', () => ({
  BatchPanel: () => <div data-testid="mock-batch">Batch</div>,
}));

vi.mock('@/components/studio/PromptStudioPanel', () => ({
  PromptStudioPanel: () => <div data-testid="mock-studio">Studio</div>,
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

vi.mock('@/components/pipeline/PipelineBuilder', () => ({
  PipelineBuilder: () => <div data-testid="mock-pipeline-builder">PipelineBuilder</div>,
}));

vi.mock('@/components/iteration/IterationTimeline', () => ({
  IterationTimeline: ({ className }: { className?: string }) => (
    <div className={className} data-testid="mock-iteration-timeline">
      Timeline
    </div>
  ),
}));

describe('DockviewSettingsPanel', () => {
  beforeEach(() => {
    useAppStore.setState(useAppStore.getInitialState());
  });

  afterEach(cleanup);

  it('shows the footer timeline when branches exist and timeline mode is inactive', () => {
    useAppStore.setState({
      activeTab: 'generate',
      iterationBranches: [
        {
          id: 'branch-1',
          name: 'Branch 1',
          rootNodeId: 'iter-1',
          activeNodeId: 'iter-1',
          createdAt: Date.now(),
        },
      ],
    });

    render(<DockviewSettingsPanel />);

    // h-16 is the footer slot's sizing. Asserting only that the timeline exists
    // would pass if it were mounted in the main body instead of the footer.
    expect(screen.getByTestId('mock-iteration-timeline')).toHaveClass('h-16');
  });

  it('hides the footer timeline when iteration timeline mode is active', () => {
    useAppStore.setState({
      activeTab: 'generate',
      iterationBranches: [
        {
          id: 'branch-1',
          name: 'Branch 1',
          rootNodeId: 'iter-1',
          activeNodeId: 'iter-1',
          createdAt: Date.now(),
        },
      ],
    });

    render(<DockviewSettingsPanel />);

    // In the footer first, so its absence below is the mode's doing and not a
    // panel that never mounted a footer.
    expect(screen.queryAllByTestId('mock-iteration-timeline')).toHaveLength(1);

    act(() => {
      useAppStore.getState().setIterationView('timeline');
    });

    // Only the footer slot goes; the panel body stays where it was.
    expect(screen.queryAllByTestId('mock-iteration-timeline')).toHaveLength(0);
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Generate');
  });

  // The Workflows tab used to dock the Storyboard panel: scenes and board
  // references beside a graph editor that has nothing to do with them.
  it('docks the workflow library on the Workflows tab, not the storyboard', async () => {
    useAppStore.getState().setActiveTab('workflows');

    render(<DockviewSettingsPanel />);

    expect(await screen.findByRole('heading', { name: 'Workflow Library' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Image generation baseline' })).toBeInTheDocument();
    expect(screen.queryByTestId('mock-storyboard')).not.toBeInTheDocument();
  });

  // Every other workspace tab carries a page heading for assistive tech; the
  // Canvas tab had none, so its outline started at the Layers panel's h2.
  it('gives the Canvas tab a page heading', async () => {
    useAppStore.getState().setActiveTab('canvas');

    render(<DockviewSettingsPanel />);

    const heading = await screen.findByRole('heading', { level: 1, name: 'Canvas' });
    expect(heading).toHaveClass('sr-only');
  });

  it('still docks the storyboard on the Story tab', async () => {
    useAppStore.getState().setActiveTab('story');

    render(<DockviewSettingsPanel />);

    const storyboard = await screen.findByTestId('mock-storyboard');
    expect(screen.getByRole('tabpanel')).toContainElement(storyboard);
    expect(storyboard).toHaveTextContent('Storyboard');
    expect(screen.queryAllByRole('heading', { name: 'Workflow Library' })).toHaveLength(0);
  });
});
