import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Header } from './Header';
import { useAppStore } from '@/store/appStore';

vi.mock('@/store/appStore', () => ({
  useAppStore: vi.fn(),
}));

vi.mock('@/../public/s2.png', () => ({
  default: '/s2.png',
}));

vi.mock('./ProjectDropdown', () => ({
  ProjectDropdown: () => <button type="button">Project</button>,
}));

const baseStore = {
  activeTab: 'generate',
  activeProjectId: null as string | null,
  projects: [] as Array<{ id: string; name: string; modified: string }>,
  systemInfo: {
    gpuAvailable: false,
    comfyuiConnected: false,
    modelsCount: 0,
    backendConnected: false,
    backendRunning: false,
    bundledBackend: false,
  },
  availableModels: [] as { id: string; status: string }[],
  activeJobs: [] as Array<{ id: string; status?: string }>,
};

function mockStore(overrides: Partial<typeof baseStore> = {}) {
  const state = {
    ...baseStore,
    ...overrides,
  };
  vi.mocked(useAppStore).mockImplementation((selector) =>
    (selector as (s: typeof state) => unknown)(state),
  );
}

describe('Header', () => {
  afterEach(cleanup);

  it('renders GPU ready status with model detail', () => {
    mockStore({
      activeProjectId: 'project-1',
      projects: [{ id: 'project-1', name: 'Project', modified: '2026-04-22T12:34:00.000Z' }],
      systemInfo: {
        ...baseStore.systemInfo,
        gpuAvailable: true,
        modelsCount: 3,
        backendConnected: true,
        backendRunning: true,
      },
    });

    render(<Header />);

    expect(screen.getByRole('button', { name: 'Project' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Strategia-X' })).toBeInTheDocument();
    expect(screen.getByTestId('header-right-actions')).toBeInTheDocument();
    expect(screen.getByTestId('app-header')).toHaveClass('app-region-drag', 'h-14', 'pr-36');
    expect(screen.getByTestId('header-right-actions')).toHaveClass('app-region-no-drag');
    expect(screen.getByLabelText('GPU backend ready')).toBeInTheDocument();
    expect(screen.getByText('GPU ready: 3 models online')).toBeInTheDocument();
  });

  it('surfaces warming state while the backend process is starting', () => {
    mockStore({
      systemInfo: {
        ...baseStore.systemInfo,
        backendRunning: true,
        bundledBackend: true,
      },
    });

    render(<Header />);

    expect(screen.getByLabelText('Backend is warming up')).toBeInTheDocument();
    expect(screen.getByText('Backend warming: bundled')).toBeInTheDocument();
  });

  it('shows queue activity ahead of steady ready state', () => {
    mockStore({
      systemInfo: {
        ...baseStore.systemInfo,
        gpuAvailable: true,
        modelsCount: 2,
        backendConnected: true,
        backendRunning: true,
      },
      activeJobs: [
        { id: 'job-1', status: 'processing' },
        { id: 'job-2', status: 'pending' },
        { id: 'job-3', status: 'pending' },
        // Finished jobs stay in activeJobs but are neither running nor queued.
        { id: 'job-4', status: 'completed' },
        { id: 'job-5', status: 'failed' },
      ],
    });

    render(<Header />);

    expect(screen.getByLabelText('Generation queue active')).toBeInTheDocument();
    expect(screen.getByText('Queue active: 1 running job, 2 queued items')).toBeInTheDocument();
  });

  it('does not report a queue when every job has finished', () => {
    mockStore({
      systemInfo: {
        ...baseStore.systemInfo,
        gpuAvailable: true,
        modelsCount: 2,
        backendConnected: true,
        backendRunning: true,
      },
      activeJobs: [{ id: 'job-1', status: 'completed' }],
    });

    render(<Header />);

    expect(screen.queryByLabelText('Generation queue active')).toBeNull();
  });

  it('marks the backend as not ready when neither process nor health are available', () => {
    mockStore();

    render(<Header />);

    expect(screen.getByLabelText('Backend not ready')).toBeInTheDocument();
    expect(screen.getByText('Backend offline')).toBeInTheDocument();
  });

  // The nav rail is icons only, so the header is where the current workspace
  // is named. It used to read "Workspace" on every tab.
  it.each([
    ['generate', 'Generate'],
    ['canvas', 'Canvas'],
    ['story', 'Story'],
    ['workflows', 'Workflows'],
    ['assets', 'Assets'],
    ['collections', 'Collections'],
    ['foundry', 'Foundry'],
    ['settings', 'Settings'],
  ])('titles the bar with the active workspace (%s)', (activeTab, label) => {
    mockStore({ activeTab });

    render(<Header />);

    expect(screen.getByTestId('header-workspace-title')).toHaveTextContent(label);
    expect(screen.queryByText('Workspace')).not.toBeInTheDocument();
  });

  // The status line read a legacy field nothing sets when a project is opened,
  // so an open project showed the no-project tagline.
  it('reads the status line from the project that is actually open', () => {
    mockStore({
      activeProjectId: 'project-2',
      projects: [
        { id: 'project-1', name: 'Other', modified: '2026-04-20T09:00:00.000Z' },
        { id: 'project-2', name: 'Open one', modified: '2026-04-22T12:34:00.000Z' },
      ],
    });

    render(<Header />);

    const expected = new Date('2026-04-22T12:34:00.000Z').toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
    expect(screen.getByTestId('header-project-status')).toHaveTextContent(`Edited ${expected}`);
  });

  it('says no project is open rather than showing a tagline', () => {
    mockStore();

    render(<Header />);

    expect(screen.getByTestId('header-project-status')).toHaveTextContent('No project open');
    expect(screen.queryByText(/Build images, scenes, and workflows/)).not.toBeInTheDocument();
  });

  // The wordmark is light silver. Hardware surfaces stay carbon in both themes
  // (DESIGN.md, Theme policy), so framing it on one keeps it readable when the
  // header itself turns light.
  it('frames the wordmark on a hardware surface so it reads in both themes', () => {
    mockStore();

    render(<Header />);

    const frame = screen.getByRole('img', { name: 'Strategia-X' }).closest('.recessed-well');
    expect(frame).not.toBeNull();
    expect(frame).toHaveTextContent('Vision Studio');
  });

  // The header is a row above the workspace; nothing scrolls behind it.
  it('does not blur a backdrop it has nothing behind', () => {
    mockStore();

    render(<Header />);

    expect(screen.getByTestId('app-header').className).not.toContain('backdrop-blur');
  });
});
