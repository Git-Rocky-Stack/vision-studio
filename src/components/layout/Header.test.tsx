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

const baseStore: {
  currentProject: null | {
    id: string;
    name: string;
    updatedAt?: string;
  };
  systemInfo: {
    gpuAvailable: false,
    comfyuiConnected: false,
    modelsCount: 0,
    backendConnected: false,
  },
} = {
  currentProject: null,
  systemInfo: {
    gpuAvailable: false,
    comfyuiConnected: false,
    modelsCount: 0,
    backendConnected: false,
  },
};

function mockStore(overrides: Partial<typeof baseStore> = {}) {
  const state = { ...baseStore, ...overrides };
  vi.mocked(useAppStore).mockImplementation((selector: (s: typeof state) => unknown) => selector(state));
}

describe('Header', () => {
  afterEach(cleanup);

  it('renders quiet production chrome without oversized branding', () => {
    mockStore({
      currentProject: {
        id: 'project-1',
        name: 'Project',
        updatedAt: '2026-04-22T12:34:00.000Z',
      },
      systemInfo: {
        ...baseStore.systemInfo,
        backendConnected: true,
      },
    });

    render(<Header />);

    expect(screen.getByRole('button', { name: 'Project' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Vision Studio' })).toBeInTheDocument();
    expect(screen.getByTestId('header-right-actions')).toBeInTheDocument();
    expect(screen.getByTestId('app-header')).toHaveClass('app-region-drag', 'h-14', 'pr-36');
    expect(screen.getByTestId('header-right-actions')).toHaveClass('app-region-no-drag');
    expect(screen.getByLabelText('Backend ready')).toBeInTheDocument();
    expect(screen.getByText('Ready')).toBeInTheDocument();
  });

  it('marks the backend as not ready when generation is unavailable', () => {
    mockStore();

    render(<Header />);

    expect(screen.getByLabelText('Backend not ready')).toBeInTheDocument();
    expect(screen.getByText('Not ready')).toBeInTheDocument();
  });
});
