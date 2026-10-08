import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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
});
