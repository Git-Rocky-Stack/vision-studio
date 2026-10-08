import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { DiscoverSection } from '@/components/foundry/DiscoverSection';
import { IterationTreePanel } from '@/components/iteration/IterationTreePanel';
import { WorkbenchBoardsDock } from '@/components/layout/WorkbenchBoardsDock';
import { WorkbenchGalleryDock } from '@/components/layout/WorkbenchGalleryDock';
import { WorkbenchViewer } from '@/components/layout/WorkbenchViewer';
import { TimelinePlaybackPreview } from '@/components/timeline/TimelinePlaybackPreview';
import { AssetsPanel } from '@/pages/AssetsPanel';
import { CollectionsPage } from '@/pages/CollectionsPage';
import { StoryboardPanel } from '@/pages/StoryboardPanel';
import { TemplatesPanel } from '@/pages/TemplatesPanel';
import { useAppStore } from '@/store/appStore';

/**
 * The audit counted five different empty-state treatments: an icon in a raised
 * tile, a bare icon at 30% opacity, a bare icon at 40%, text with no icon, and
 * text set in two classes no stylesheet defines. These surfaces now share one
 * component; each test names the surface and the copy it has to keep.
 */

describe('empty states share one treatment', () => {
  beforeEach(() => {
    useAppStore.setState(useAppStore.getInitialState(), true);
  });

  afterEach(cleanup);

  const expectSharedEmptyState = (title: string) => {
    const states = screen.getAllByTestId('empty-state');
    expect(states).toHaveLength(1);
    expect(within(states[0]).getByText(title)).toHaveClass('type-section');
    expect(states[0].querySelector('.raised-control > svg')).not.toBeNull();
    return states[0];
  };

  it('gallery dock', () => {
    render(<WorkbenchGalleryDock />);
    expectSharedEmptyState('Review captures will appear here.');
  });

  it('boards dock with no boards', () => {
    render(<WorkbenchBoardsDock />);
    const state = expectSharedEmptyState('Boards keep approved ideas together.');
    expect(within(state).getByRole('button', { name: 'New Board' })).toBeInTheDocument();
  });

  it('viewer with nothing to review', () => {
    render(<WorkbenchViewer />);
    expectSharedEmptyState('Outputs will appear here.');
  });

  it('history with no iterations', () => {
    render(<IterationTreePanel />);
    expectSharedEmptyState('No iterations yet');
  });

  it('collections with none created', () => {
    render(<CollectionsPage />);
    const state = expectSharedEmptyState('No collections yet');
    // The page header directly above carries New Collection, once.
    expect(within(state).queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'New Collection' })).toHaveLength(1);
  });

  it('timeline preview with no sequence', () => {
    render(<TimelinePlaybackPreview />);
    expectSharedEmptyState('Sequence preview unavailable');
  });

  it('timeline preview with an empty sequence', () => {
    const state = useAppStore.getState();
    const project = state.createProject('Empty timeline');
    const sequence = state.ensureTimelineSequenceForProject(project.id, { fps: 24 });
    state.setActiveTimelineSequence(sequence!.id);

    render(<TimelinePlaybackPreview />);
    expectSharedEmptyState('No active program output');
  });

  it('assets with nothing in the library', () => {
    render(<AssetsPanel />);
    const state = expectSharedEmptyState('No assets yet');
    expect(within(state).getAllByRole('button').map((button) => button.textContent)).toEqual(['Import media']);
  });

  it('storyboard with no project open', () => {
    render(<StoryboardPanel />);
    const state = expectSharedEmptyState('No Project Open');
    expect(within(state).getAllByRole('button').map((button) => button.textContent)).toEqual(['New Project']);
  });

  it('templates when a search matches nothing', () => {
    render(<TemplatesPanel />);
    fireEvent.change(screen.getByPlaceholderText('Search templates...'), {
      target: { value: 'no template is called this' },
    });
    expectSharedEmptyState('No templates found');
  });

  it('model discovery before a search', () => {
    render(<DiscoverSection />);
    expectSharedEmptyState('Search for a model');
  });
});
