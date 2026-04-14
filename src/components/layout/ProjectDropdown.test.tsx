import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProjectDropdown } from './ProjectDropdown';
import { useAppStore } from '@/store/appStore';

// Mock the store
vi.mock('@/store/appStore', () => ({
  useAppStore: vi.fn(),
}));

const mockProjects = [
  {
    id: 'proj-1',
    name: 'Sci-Fi Short Film',
    created: '2026-04-10T00:00:00.000Z',
    modified: '2026-04-13T00:00:00.000Z',
    dimensions: { width: 1920, height: 1080 },
    fps: 24,
    characters: [
      { id: 'char-1', name: 'Hero' },
      { id: 'char-2', name: 'Villain' },
    ],
    scenes: [
      { id: 'scene-1', name: 'Opening' },
      { id: 'scene-2', name: 'Chase' },
      { id: 'scene-3', name: 'Finale' },
    ],
    metadata: {},
  },
  {
    id: 'proj-2',
    name: 'Product Demo',
    created: '2026-04-11T00:00:00.000Z',
    modified: '2026-04-12T00:00:00.000Z',
    dimensions: { width: 1080, height: 1920 },
    fps: 30,
    characters: [],
    scenes: [
      { id: 'scene-4', name: 'Intro' },
    ],
    metadata: {},
  },
];

const mockStoreValue = {
  projects: mockProjects,
  activeProjectId: 'proj-1',
  setActiveProject: vi.fn(),
  createProject: vi.fn(() => ({
    id: 'proj-new',
    name: 'Untitled Project',
    characters: [],
    scenes: [],
  })),
};

describe('ProjectDropdown', () => {
  beforeEach(() => {
    cleanup();
    vi.mocked(useAppStore).mockReturnValue(mockStoreValue);
    mockStoreValue.setActiveProject.mockClear();
    mockStoreValue.createProject.mockClear();
  });

  describe('rendering', () => {
    it('renders the active project name', () => {
      render(<ProjectDropdown />);
      expect(screen.getByText('Sci-Fi Short Film')).toBeInTheDocument();
    });

    it('renders "No Project" when no active project', () => {
      vi.mocked(useAppStore).mockReturnValue({
        ...mockStoreValue,
        activeProjectId: null,
      });
      render(<ProjectDropdown />);
      expect(screen.getByText('No Project')).toBeInTheDocument();
    });

    it('renders dropdown trigger button', () => {
      render(<ProjectDropdown />);
      expect(screen.getByRole('button', { name: /select project/i })).toBeInTheDocument();
    });
  });

  describe('dropdown interaction', () => {
    it('opens dropdown when trigger is clicked', async () => {
      const user = userEvent.setup();
      render(<ProjectDropdown />);
      const trigger = screen.getByRole('button', { name: /select project/i });
      await user.click(trigger);
      expect(screen.getByRole('listbox', { name: /project list/i })).toBeInTheDocument();
    });

    it('lists all projects', async () => {
      const user = userEvent.setup();
      render(<ProjectDropdown />);
      await user.click(screen.getByRole('button', { name: /select project/i }));
      // Project names appear in both trigger and dropdown, so use getAllByText
      expect(screen.getAllByText('Sci-Fi Short Film').length).toBeGreaterThanOrEqual(2);
      expect(screen.getByText('Product Demo')).toBeInTheDocument();
    });

    it('shows project metadata (scenes, characters)', async () => {
      const user = userEvent.setup();
      render(<ProjectDropdown />);
      await user.click(screen.getByRole('button', { name: /select project/i }));
      expect(screen.getByText(/3 scenes/)).toBeInTheDocument();
      expect(screen.getByText(/2 characters/)).toBeInTheDocument();
    });

    it('calls setActiveProject when project is selected', async () => {
      const user = userEvent.setup();
      render(<ProjectDropdown />);
      await user.click(screen.getByRole('button', { name: /select project/i }));
      await user.click(screen.getByText('Product Demo'));
      expect(mockStoreValue.setActiveProject).toHaveBeenCalledWith('proj-2');
    });

    it('calls createProject when New Project is clicked', async () => {
      const user = userEvent.setup();
      render(<ProjectDropdown />);
      await user.click(screen.getByRole('button', { name: /select project/i }));
      await user.click(screen.getByText('New Project'));
      expect(mockStoreValue.createProject).toHaveBeenCalledWith('Untitled Project');
    });

    it('closes dropdown after selecting a project', async () => {
      const user = userEvent.setup();
      render(<ProjectDropdown />);
      await user.click(screen.getByRole('button', { name: /select project/i }));
      expect(screen.getByRole('listbox')).toBeInTheDocument();
      await user.click(screen.getByText('Product Demo'));
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });
  });

  describe('empty state', () => {
    it('shows empty state when no projects exist', async () => {
      vi.mocked(useAppStore).mockReturnValue({
        ...mockStoreValue,
        projects: [],
        activeProjectId: null,
      });
      const user = userEvent.setup();
      render(<ProjectDropdown />);
      await user.click(screen.getByRole('button', { name: /select project/i }));
      expect(screen.getByText('No projects yet')).toBeInTheDocument();
    });
  });

  describe('accessibility', () => {
    it('trigger has aria-expanded attribute', () => {
      render(<ProjectDropdown />);
      const trigger = screen.getByRole('button', { name: /select project/i });
      expect(trigger).toHaveAttribute('aria-expanded', 'false');
      expect(trigger).toHaveAttribute('aria-haspopup', 'listbox');
    });

    it('active project has aria-selected', async () => {
      const user = userEvent.setup();
      render(<ProjectDropdown />);
      await user.click(screen.getByRole('button', { name: /select project/i }));
      const activeOption = screen.getByRole('option', { name: /sci-fi short film/i });
      expect(activeOption).toHaveAttribute('aria-selected', 'true');
    });
  });
});