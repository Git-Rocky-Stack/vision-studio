import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { useAppStore } from '@/store/appStore';
import type { Project, Scene } from '@/types/project';
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

  it('renders board metadata from project details', () => {
    const board = makeProject({
      name: 'Campaign Boards',
      modified: '2026-04-17T16:24:00.000Z',
      dimensions: { width: 1280, height: 720 },
      fps: 30,
      scenes: [
        makeScene({ id: 'scene-1', name: 'Opening frame' }),
        makeScene({ id: 'scene-2', name: 'Closing frame' }),
      ],
    });
    useAppStore.setState({ projects: [board], activeProjectId: board.id });

    render(<WorkbenchBoardsDock />);

    expect(screen.getByText('2 scenes')).toBeInTheDocument();
    expect(screen.getByText('1280 x 720')).toBeInTheDocument();
    expect(screen.getByText('30 fps')).toBeInTheDocument();
    expect(screen.getByText('Updated Apr 17, 2026')).toBeInTheDocument();
  });

  it('renders recently modified boards first without mutating store order', () => {
    const olderBoard = makeProject({
      id: 'older-board',
      name: 'Older Board',
      created: '2026-04-15T09:00:00.000Z',
      modified: '2026-04-15T09:00:00.000Z',
    });
    const freshBoard = makeProject({
      id: 'fresh-board',
      name: 'Fresh Board',
      created: '2026-04-16T09:00:00.000Z',
      modified: '2026-04-17T09:00:00.000Z',
    });
    useAppStore.setState({ projects: [olderBoard, freshBoard], activeProjectId: freshBoard.id });

    render(<WorkbenchBoardsDock />);

    const freshName = screen.getByText('Fresh Board');
    const olderName = screen.getByText('Older Board');
    expect(freshName.compareDocumentPosition(olderName) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(useAppStore.getState().projects.map((project) => project.name)).toEqual(['Older Board', 'Fresh Board']);
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

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: 'board-1',
    name: 'Board',
    created: '2026-04-17T12:00:00.000Z',
    modified: '2026-04-17T12:00:00.000Z',
    dimensions: { width: 1024, height: 1024 },
    fps: 24,
    characters: [],
    scenes: [],
    metadata: {},
    ...overrides,
  };
}

function makeScene(overrides: Partial<Scene> = {}): Scene {
  return {
    id: 'scene-1',
    orderIndex: 0,
    name: 'Scene',
    prompt: '',
    negativePrompt: '',
    generationConfig: {
      model: 'stable-diffusion-xl',
      steps: 25,
      cfgScale: 7.5,
      scheduler: 'euler_a',
      seed: -1,
      width: 1024,
      height: 1024,
      clipSkip: 1,
      lora: [],
      controlNet: [],
    },
    referenceImages: [],
    frames: [],
    regionLocks: [],
    transitions: { type: 'cut', duration: 0 },
    camera: [],
    metadata: {
      created: '2026-04-17T12:00:00.000Z',
      modified: '2026-04-17T12:00:00.000Z',
      duration: 0,
      fps: 24,
      notes: '',
    },
    status: 'draft',
    characterRefs: [],
    ...overrides,
  };
}
