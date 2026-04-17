import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { useAppStore } from '@/store/appStore';
import { WorkbenchBoardsDock } from './WorkbenchBoardsDock';

describe('WorkbenchBoardsDock', () => {
  beforeEach(() => {
    useAppStore.setState({
      projects: [],
      activeProjectId: null,
    });
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
});
