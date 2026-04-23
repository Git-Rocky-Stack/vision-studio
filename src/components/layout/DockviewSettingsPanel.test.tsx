import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

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

    expect(screen.getByTestId('mock-iteration-timeline')).toBeInTheDocument();
  });

  it('hides the footer timeline when iteration timeline mode is active', () => {
    useAppStore.setState({
      activeTab: 'generate',
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
    });

    render(<DockviewSettingsPanel />);

    expect(screen.queryByTestId('mock-iteration-timeline')).not.toBeInTheDocument();
  });
});
