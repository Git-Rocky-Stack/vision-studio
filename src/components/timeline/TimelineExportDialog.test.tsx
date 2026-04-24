import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { useAppStore } from '@/store/appStore';

import { TimelineExportDialog } from './TimelineExportDialog';
import { exportTimelineSequence } from '@/features/timeline/exportTimelineSequence';

vi.mock('@/features/timeline/exportTimelineSequence', () => ({
  exportTimelineSequence: vi.fn(),
}));

function resetStore() {
  useAppStore.setState(useAppStore.getInitialState(), true);
}

function seedTimelineSequence() {
  const state = useAppStore.getState();
  const project = state.createProject('Timeline Export Dialog', { width: 1280, height: 720 });
  const sequence = state.ensureTimelineSequenceForProject(project.id, {
    name: 'Launch Edit',
    fps: 24,
  })!;
  state.setTimelineSequencePlayRange(sequence.id, {
    startMs: 1000,
    endMs: 2500,
  });
  return { project, sequence };
}

describe('TimelineExportDialog', () => {
  beforeEach(() => {
    resetStore();
    window.electron = {
      app: {
        openPath: vi.fn().mockResolvedValue({ success: true }),
      },
      assets: {
        reveal: vi.fn().mockResolvedValue({ success: true }),
      },
    } as unknown as typeof window.electron;
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders the active play range summary and starts an export', async () => {
    const user = userEvent.setup();
    const { sequence } = seedTimelineSequence();
    vi.mocked(exportTimelineSequence).mockImplementation(async ({ onStatusChange }) => {
      onStatusChange?.({
        status: 'exporting',
        isExporting: true,
        progress: 42,
        activeJobId: 'timeline-export-job-1',
      });
      onStatusChange?.({
        status: 'success',
        isExporting: false,
        progress: 100,
        outputPath: 'D:/Exports/launch-edit.mp4',
        activeJobId: null,
      });
      return {
        cancelled: false,
        jobId: 'timeline-export-job-1',
        outputPath: 'D:/Exports/launch-edit.mp4',
      };
    });

    render(
      <TimelineExportDialog
        open
        sequenceId={sequence.id}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText('Active Range')).toBeInTheDocument();
    expect(screen.getByText('Silent MP4 at 24 fps')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Export MP4' }));

    await waitFor(() => {
      expect(screen.getByText('Export complete')).toBeInTheDocument();
    });

    expect(exportTimelineSequence).toHaveBeenCalledWith(
      expect.objectContaining({
        sequenceId: sequence.id,
      }),
    );
  });

  it('offers open and reveal actions after a successful export', async () => {
    const user = userEvent.setup();
    const { sequence } = seedTimelineSequence();
    vi.mocked(exportTimelineSequence).mockResolvedValue({
      cancelled: false,
      jobId: 'timeline-export-job-2',
      outputPath: 'D:/Exports/launch-edit.mp4',
    });

    render(
      <TimelineExportDialog
        open
        sequenceId={sequence.id}
        onClose={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Export MP4' }));

    await waitFor(() => {
      expect(screen.getByText('Export complete')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Open MP4' }));
    await user.click(screen.getByRole('button', { name: 'Show In Folder' }));

    expect(window.electron.app.openPath).toHaveBeenCalledWith('D:/Exports/launch-edit.mp4');
    expect(window.electron.assets.reveal).toHaveBeenCalledWith('D:/Exports/launch-edit.mp4');
  });

  it('shows a visible failure state when export throws', async () => {
    const user = userEvent.setup();
    const { sequence } = seedTimelineSequence();
    vi.mocked(exportTimelineSequence).mockRejectedValue(new Error('Backend export failed.'));

    render(
      <TimelineExportDialog
        open
        sequenceId={sequence.id}
        onClose={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Export MP4' }));

    await waitFor(() => {
      expect(screen.getByText('Export failed')).toBeInTheDocument();
    });

    expect(screen.getByText('Backend export failed.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry Export' })).toBeInTheDocument();
  });
});
