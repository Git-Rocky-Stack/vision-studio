import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Header } from './Header';
import { useAppStore } from '@/store/appStore';

vi.mock('@/store/appStore', () => ({
  useAppStore: vi.fn(),
}));

vi.mock('./ProjectDropdown', () => ({
  ProjectDropdown: () => <button type="button">Project</button>,
}));

const baseStore = {
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
      systemInfo: {
        ...baseStore.systemInfo,
        backendConnected: true,
      },
    });

    render(<Header />);

    expect(screen.getByRole('button', { name: 'Project' })).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: 'Vision Studio' })).not.toBeInTheDocument();
    expect(screen.getByTestId('header-right-actions')).toBeInTheDocument();
    expect(screen.getByTestId('app-header')).toHaveClass('h-12', 'px-4');
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
