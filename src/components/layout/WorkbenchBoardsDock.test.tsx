import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { useAppStore } from '@/store/appStore';
import { WorkbenchBoardsDock } from './WorkbenchBoardsDock';

describe('WorkbenchBoardsDock', () => {
  beforeEach(() => {
    useAppStore.setState(useAppStore.getInitialState(), true);
  });

  afterEach(cleanup);

  it('renders a Quick Captures empty state when no projects exist', () => {
    render(<WorkbenchBoardsDock />);

    expect(screen.getByText('Quick Captures')).toBeInTheDocument();
    expect(screen.getByText('No scenes captured yet.')).toBeInTheDocument();
  });

  it('renders existing storyboard projects as boards', () => {
    const project = useAppStore.getState().createProject('Campaign Boards', { width: 1024, height: 1024 });

    render(<WorkbenchBoardsDock />);

    expect(screen.getByText('Campaign Boards')).toBeInTheDocument();
    expect(screen.getByText('0 scenes')).toBeInTheDocument();
    expect(screen.getByText(project.name)).toBeInTheDocument();
  });

  it('creates and selects a new board from the empty state', async () => {
    const user = userEvent.setup();

    render(<WorkbenchBoardsDock />);
    await user.click(screen.getByRole('button', { name: 'New Board' }));

    const state = useAppStore.getState();
    expect(state.projects).toHaveLength(1);
    expect(state.projects[0].name).toBe('Untitled Board');
    expect(state.activeProjectId).toBe(state.projects[0].id);
  });

  it('creates and selects another board from the project list', async () => {
    const user = userEvent.setup();
    const existing = useAppStore.getState().createProject('Campaign Boards', { width: 1024, height: 1024 });
    useAppStore.getState().setActiveProject(existing.id);

    render(<WorkbenchBoardsDock />);
    await user.click(screen.getByRole('button', { name: 'New Board' }));

    const state = useAppStore.getState();
    expect(state.projects.map((project) => project.name)).toEqual(['Campaign Boards', 'Untitled Board 2']);
    expect(state.activeProjectId).toBe(state.projects[1].id);
  });

  it('opens the selected board in Storyboard', async () => {
    const user = userEvent.setup();
    const existing = useAppStore.getState().createProject('Campaign Boards', { width: 1024, height: 1024 });
    useAppStore.getState().setActiveProject(existing.id);
    useAppStore.getState().setActivePanel('generate');

    render(<WorkbenchBoardsDock />);
    await user.click(screen.getByRole('button', { name: 'Open Storyboard' }));

    const state = useAppStore.getState();
    expect(state.activeProjectId).toBe(existing.id);
    expect(state.activePanel).toBe('storyboard');
  });

  it('adds and selects a scene on the active board', async () => {
    const user = userEvent.setup();
    const existing = useAppStore.getState().createProject('Campaign Boards', { width: 1024, height: 1024 });
    useAppStore.getState().setActiveProject(existing.id);

    render(<WorkbenchBoardsDock />);
    await user.click(screen.getByRole('button', { name: 'Add Scene' }));

    const state = useAppStore.getState();
    const board = state.projects.find((project) => project.id === existing.id);
    expect(board?.scenes).toHaveLength(1);
    expect(board?.scenes[0].name).toBe('Scene 1');
    expect(state.activeSceneId).toBe(board?.scenes[0].id);
    expect(screen.getByText('1 scenes')).toBeInTheDocument();
  });

  it('shows scenes for the active board and selects a scene', async () => {
    const user = userEvent.setup();
    const existing = useAppStore.getState().createProject('Campaign Boards', { width: 1024, height: 1024 });
    const firstScene = useAppStore.getState().addScene(existing.id, { name: 'Opening frame' });
    const secondScene = useAppStore.getState().addScene(existing.id, { name: 'Closing frame' });
    useAppStore.getState().setActiveProject(existing.id);
    useAppStore.getState().setActiveScene(firstScene.id);

    render(<WorkbenchBoardsDock />);

    expect(screen.getByRole('button', { name: 'Opening frame' })).toHaveAttribute('aria-pressed', 'true');

    await user.click(screen.getByRole('button', { name: 'Closing frame' }));

    expect(useAppStore.getState().activeSceneId).toBe(secondScene.id);
  });

  it('renders active board scene thumbnails when available', () => {
    const existing = useAppStore.getState().createProject('Campaign Boards', { width: 1024, height: 1024 });
    useAppStore.getState().addScene(existing.id, {
      name: 'Opening frame',
      thumbnail: '/outputs/opening.png',
    });
    useAppStore.getState().setActiveProject(existing.id);

    render(<WorkbenchBoardsDock />);

    expect(screen.getByRole('img', { name: 'Opening frame thumbnail' })).toHaveAttribute(
      'src',
      '/outputs/opening.png'
    );
  });
});
