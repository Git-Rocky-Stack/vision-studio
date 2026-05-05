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
  currentProject: null as null | {
    id: string;
    name: string;
    updatedAt?: string;
  },
  systemInfo: {
    gpuAvailable: false,
    comfyuiConnected: false,
    modelsCount: 0,
    backendConnected: false,
    backendRunning: false,
    bundledBackend: false,
  },
  availableModels: [] as { id: string; status: string }[],
  activeJobs: [] as Array<{ id: string }>,
  generationQueue: [] as Array<{ id: string }>,
};

function mockStore(overrides: Partial<typeof baseStore> = {}) {
  const state = {
    ...baseStore,
    ...overrides,
  };
  vi.mocked(useAppStore).mockImplementation((selector: (s: typeof state) => unknown) => selector(state));
}

describe('Header', () => {
  afterEach(cleanup);

  it('renders GPU ready status with model detail', () => {
    mockStore({
      currentProject: {
        id: 'project-1',
        name: 'Project',
        updatedAt: '2026-04-22T12:34:00.000Z',
      },
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
    expect(screen.getByRole('img', { name: 'Vision Studio' })).toBeInTheDocument();
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
      activeJobs: [{ id: 'job-1' }],
      generationQueue: [{ id: 'queue-1' }, { id: 'queue-2' }],
    });

    render(<Header />);

    expect(screen.getByLabelText('Generation queue active')).toBeInTheDocument();
    expect(screen.getByText('Queue active: 1 running job, 2 queued items')).toBeInTheDocument();
  });

  it('marks the backend as not ready when neither process nor health are available', () => {
    mockStore();

    render(<Header />);

    expect(screen.getByLabelText('Backend not ready')).toBeInTheDocument();
    expect(screen.getByText('Backend offline')).toBeInTheDocument();
  });
});
