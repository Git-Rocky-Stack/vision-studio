import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAppStore } from '@/store/appStore';
import type { DownloadJob } from '@/types/model';

import { DownloadRow } from './DownloadRow';

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

describe('DownloadRow', () => {
  beforeEach(resetStore);

  afterEach(() => {
    cleanup();
    delete (window as unknown as { electron?: unknown }).electron;
  });

  it('shows progress and cancels via the store action', () => {
    const cancelDownload = vi.fn();
    useAppStore.setState({
      cancelDownload,
      pauseDownload: vi.fn(),
      resumeDownload: vi.fn(),
    } as never);
    render(<DownloadRow job={makeJob({ status: 'downloading', progress: 42 })} modelName="X" />);

    expect(screen.getByText(/42%/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(cancelDownload).toHaveBeenCalledWith('m1');
  });

  it('pauses an active download', () => {
    const pauseDownload = vi.fn();
    useAppStore.setState({
      pauseDownload,
      resumeDownload: vi.fn(),
      cancelDownload: vi.fn(),
    } as never);
    render(<DownloadRow job={makeJob({ status: 'downloading' })} modelName="X" />);

    fireEvent.click(screen.getByRole('button', { name: /pause/i }));
    expect(pauseDownload).toHaveBeenCalledWith('m1');
  });

  it('resumes a paused download', () => {
    const resumeDownload = vi.fn();
    useAppStore.setState({
      resumeDownload,
      pauseDownload: vi.fn(),
      cancelDownload: vi.fn(),
    } as never);
    render(<DownloadRow job={makeJob({ status: 'paused' })} modelName="X" />);

    fireEvent.click(screen.getByRole('button', { name: /resume/i }));
    expect(resumeDownload).toHaveBeenCalledWith('m1');
  });

  it('opens the gate URL for a license-gated job', () => {
    const openExternal = vi.fn();
    window.electron = { app: { openExternal } } as unknown as typeof window.electron;
    render(
      <DownloadRow
        job={makeJob({ status: 'queued', gate_url: 'https://hf.co/gate' })}
        modelName="X"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /accept license/i }));
    expect(openExternal).toHaveBeenCalledWith('https://hf.co/gate');
  });

  it('renders the model name and an error state', () => {
    render(
      <DownloadRow job={makeJob({ status: 'error', error: 'Disk full' })} modelName="My Model" />,
    );
    expect(screen.getByText('My Model')).toBeInTheDocument();
    expect(screen.getByText(/disk full/i)).toBeInTheDocument();
  });
});
