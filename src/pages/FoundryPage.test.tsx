import { act, cleanup, render, screen, fireEvent } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAppStore } from '@/store/appStore';
import type { DownloadJob } from '@/types/model';

import { FoundryPage } from './FoundryPage';

function resetStore() {
  useAppStore.setState(useAppStore.getInitialState());
}

function makeJob(overrides: Partial<DownloadJob> = {}): DownloadJob {
  return {
    model_id: 'm1',
    status: 'downloading',
    progress: 42,
    speed: 0,
    eta: null,
    total_bytes: 0,
    error: null,
    gate_url: null,
    ...overrides,
  };
}

describe('FoundryPage', () => {
  beforeEach(() => {
    resetStore();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('renders the Foundry heading and three section tabs', () => {
    render(<FoundryPage />);
    expect(screen.getByRole('heading', { name: /foundry/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /discover/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /library/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /hardware/i })).toBeInTheDocument();
  });

  it('switches sections when a section tab is clicked', () => {
    render(<FoundryPage />);
    fireEvent.click(screen.getByRole('tab', { name: /library/i }));
    expect(screen.getByTestId('foundry-section-library')).toBeInTheDocument();
  });

  it('warms the model/download/library/hardware loaders on mount', () => {
    const loadModels = vi.fn();
    const refreshDownloads = vi.fn();
    const loadLibraryRoots = vi.fn();
    const loadHardwareProfile = vi.fn();
    useAppStore.setState({
      loadModels,
      refreshDownloads,
      loadLibraryRoots,
      loadHardwareProfile,
    } as never);

    render(<FoundryPage />);

    expect(loadModels).toHaveBeenCalledTimes(1);
    expect(refreshDownloads).toHaveBeenCalledTimes(1);
    expect(loadLibraryRoots).toHaveBeenCalledTimes(1);
    expect(loadHardwareProfile).toHaveBeenCalledTimes(1);
  });

  it('polls the download queue while a job is in flight', () => {
    vi.useFakeTimers();
    const refreshDownloads = vi.fn();
    useAppStore.setState({
      loadModels: vi.fn(),
      refreshDownloads,
      loadLibraryRoots: vi.fn(),
      loadHardwareProfile: vi.fn(),
      downloads: { m1: makeJob({ status: 'downloading' }) },
    } as never);

    render(<FoundryPage />);
    // One immediate call from the mount warm-up.
    expect(refreshDownloads).toHaveBeenCalledTimes(1);

    act(() => {
      vi.advanceTimersByTime(2500);
    });
    expect(refreshDownloads).toHaveBeenCalledTimes(2);
  });

  it('does not poll when no download is active', () => {
    vi.useFakeTimers();
    const refreshDownloads = vi.fn();
    useAppStore.setState({
      loadModels: vi.fn(),
      refreshDownloads,
      loadLibraryRoots: vi.fn(),
      loadHardwareProfile: vi.fn(),
      downloads: { m1: makeJob({ status: 'ready' }) },
    } as never);

    render(<FoundryPage />);
    expect(refreshDownloads).toHaveBeenCalledTimes(1);

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    // Still just the mount call - no polling for a terminal job.
    expect(refreshDownloads).toHaveBeenCalledTimes(1);
  });
});
