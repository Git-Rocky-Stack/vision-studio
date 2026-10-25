import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAppStore } from '@/store/appStore';

import { BatchPromptQueue } from './BatchPanel';

function installElectronMock(options?: {
  backendConnected?: boolean;
  openRouterEnabled?: boolean;
  openRouterImageModel?: string;
  apiKeyStored?: boolean;
}) {
  const {
    backendConnected = true,
    openRouterEnabled = false,
    openRouterImageModel = '',
    apiKeyStored = false,
  } = options ?? {};

  useAppStore.setState({
    ...useAppStore.getInitialState(),
    systemInfo: {
      ...useAppStore.getInitialState().systemInfo,
      backendConnected,
    },
  });

  window.electron = {
    accounts: {
      list: vi.fn().mockResolvedValue({
        activeAccountId: 'account-primary',
        accounts: [
          {
            id: 'account-primary',
            name: 'Primary',
            createdAt: '2026-04-24T00:00:00.000Z',
            updatedAt: '2026-04-24T00:00:00.000Z',
            preferences: {
              promptEnhancementProvider: 'local',
              openRouterModel: '',
              imageGenerationProvider: openRouterEnabled ? 'openrouter' : 'local',
              openRouterImageModel,
            },
            openRouter: {
              apiKeyStored,
              keyLabel: apiKeyStored ? 'Primary Key' : null,
              lastValidatedAt: apiKeyStored ? '2026-04-24T00:00:00.000Z' : null,
            },
          },
        ],
      }),
    },
    app: {
      getPath: vi.fn().mockResolvedValue('C:/Users/User/AppData/Roaming/VisionStudio'),
    },
    settings: {
      get: vi.fn().mockResolvedValue({
        defaultOutputPath: '',
      }),
    },
    generation: {
      batch: vi.fn().mockResolvedValue({ success: true, jobIds: ['job-batch-1'] }),
      getStatus: vi.fn().mockResolvedValue({
        job_id: 'job-batch-1',
        status: 'pending',
        progress: 0,
      }),
      cancel: vi.fn().mockResolvedValue({ success: true }),
    },
    assets: {
      exportMany: vi.fn().mockResolvedValue({ success: true, exportedCount: 0 }),
      delete: vi.fn().mockResolvedValue({ success: true }),
    },
    dialog: {
      selectFolder: vi.fn().mockResolvedValue(null),
    },
  } as unknown as typeof window.electron;
}

describe('BatchPromptQueue', () => {
  beforeEach(() => {
    installElectronMock();
  });

  afterEach(cleanup);

  it('shows the hosted route summary when the active account uses OpenRouter for still images', async () => {
    installElectronMock({
      openRouterEnabled: true,
      openRouterImageModel: 'google/gemini-2.5-flash-image',
      apiKeyStored: true,
    });

    render(<BatchPromptQueue />);

    expect(await screen.findByText('OpenRouter Batch Route')).toBeInTheDocument();
    expect(screen.getByText(/google\/gemini-2.5-flash-image/)).toBeInTheDocument();
  });

  // Export and Start Batch do not fit side by side in the dock with both
  // labels spelled out, which is what broke "START BATCH (0)" onto two lines.
  // The secondary action yields: an icon button that still has its name.
  it('keeps Export reachable by name without spending the footer on its label', () => {
    installElectronMock({});

    render(<BatchPromptQueue />);

    const exportButton = screen.getByRole('button', { name: 'Export batch' });
    expect(exportButton).toHaveAttribute('title', 'Export batch');
    expect(exportButton.textContent?.trim()).toBe('');
    expect(screen.getByRole('button', { name: /Start Batch/i })).toBeInTheDocument();
  });

  it('allows OpenRouter batches to start while the local backend is offline', async () => {
    installElectronMock({
      backendConnected: false,
      openRouterEnabled: true,
      openRouterImageModel: 'google/gemini-2.5-flash-image',
      apiKeyStored: true,
    });
    window.electron.generation.batch = vi.fn().mockResolvedValue({
      success: false,
      error: 'Provider unavailable',
    });

    render(<BatchPromptQueue />);

    fireEvent.change(screen.getByPlaceholderText('Enter prompt...'), {
      target: { value: 'hero portrait in warm light' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Start Batch/i }));

    await waitFor(() => {
      expect(window.electron.generation.batch).toHaveBeenCalledWith(
        expect.objectContaining({
          prompts: ['hero portrait in warm light'],
          model: 'google/gemini-2.5-flash-image',
        }),
      );
    });
    expect(await screen.findByText('Provider unavailable')).toBeInTheDocument();
  });

  describe('status polling', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    async function flush() {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
    }

    async function startBatch(jobIds: string[]) {
      vi.useFakeTimers();
      window.electron.generation.batch = vi.fn().mockResolvedValue({ success: true, jobIds });
      render(<BatchPromptQueue />);
      await flush();
      for (let i = 1; i < jobIds.length; i++) {
        fireEvent.click(screen.getByRole('button', { name: /Add Prompt/i }));
      }
      screen.getAllByPlaceholderText('Enter prompt...').forEach((input, index) => {
        fireEvent.change(input, { target: { value: `prompt ${index}` } });
      });
      fireEvent.click(screen.getByRole('button', { name: /Start Batch/i }));
      for (let i = 0; i < 5; i++) await flush();
      expect(window.electron.generation.batch).toHaveBeenCalled();
    }

    async function advance(ms: number) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(ms);
      });
    }

    it('records a finished job once and stops polling it', async () => {
      const getStatus = vi.fn(async (jobId: string) =>
        jobId === 'job-a'
          ? { job_id: jobId, status: 'completed', progress: 100, result: { images: ['/outputs/a.png'], seed: 1 } }
          : { job_id: jobId, status: 'pending', progress: 0 },
      );
      window.electron.generation.getStatus = getStatus as unknown as typeof window.electron.generation.getStatus;
      await startBatch(['job-a', 'job-b']);

      await advance(2000);
      await advance(2000);
      await advance(2000);

      expect(getStatus.mock.calls.filter(([id]) => id === 'job-a')).toHaveLength(1);
      expect(getStatus.mock.calls.filter(([id]) => id === 'job-b')).toHaveLength(3);
      expect(useAppStore.getState().batchResults.map((result) => result.id)).toEqual(['job-a']);
    });

    it('stops polling when the batch is cancelled', async () => {
      const getStatus = vi.fn().mockResolvedValue({ job_id: 'job-a', status: 'pending', progress: 0 });
      window.electron.generation.getStatus = getStatus;
      await startBatch(['job-a']);

      await advance(2000);
      expect(getStatus).toHaveBeenCalledTimes(1);

      fireEvent.click(screen.getByRole('button', { name: /Cancel Batch/i }));
      await advance(10000);
      expect(getStatus).toHaveBeenCalledTimes(1);
    });

    it('cancels every submitted job, queued ones included, and clears their spinners', async () => {
      window.electron.generation.getStatus = vi.fn().mockResolvedValue({ status: 'pending', progress: 0 });
      const cancel = vi.fn().mockResolvedValue({ success: true });
      window.electron.generation.cancel = cancel;
      await startBatch(['job-a', 'job-b', 'job-c']);

      fireEvent.click(screen.getByRole('button', { name: /Cancel Batch/i }));
      for (let i = 0; i < 3; i++) await flush();

      expect(cancel.mock.calls.map(([id]) => id).sort()).toEqual(['job-a', 'job-b', 'job-c']);
      expect(screen.getByText('Batch cancelled (3 prompts).')).toBeInTheDocument();
      expect(document.querySelectorAll('.animate-spin')).toHaveLength(0);
    });

    it('says which prompts could not be cancelled', async () => {
      window.electron.generation.getStatus = vi.fn().mockResolvedValue({ status: 'pending', progress: 0 });
      window.electron.generation.cancel = vi
        .fn()
        .mockResolvedValueOnce({ success: true })
        .mockResolvedValueOnce({ success: false });
      await startBatch(['job-a', 'job-b']);

      fireEvent.click(screen.getByRole('button', { name: /Cancel Batch/i }));
      for (let i = 0; i < 3; i++) await flush();

      expect(screen.getByText(/Cancelled 1 of 2 prompts; 1 could not be cancelled/)).toBeInTheDocument();
    });
  });
});
