import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAppStore } from '@/store/appStore';
import type { DownloadJob, ModelRecord } from '@/types/model';

import { SettingsPanel } from './SettingsPanel';

function makeModelRecord(overrides: Partial<ModelRecord> = {}): ModelRecord {
  return {
    id: 'flux-dev',
    name: 'FLUX.1 dev',
    artifact_type: 'checkpoint',
    capability: 'image',
    base_architecture: 'flux',
    source: 'huggingface',
    repo_id: 'black-forest-labs/FLUX.1-dev',
    revision: 'main',
    aux_repo_id: null,
    size: '23 GB',
    status: 'not_found',
    tier: 'verified',
    quality: 'pro',
    runtime: 'local',
    hardware_class: 'workstation',
    vram: '24 GB',
    description: 'Test image model.',
    license: 'flux-1-dev-non-commercial',
    gated: false,
    ...overrides,
  };
}

function installElectronMock() {
  useAppStore.setState({
    ...useAppStore.getInitialState(),
    systemInfo: {
      ...useAppStore.getInitialState().systemInfo,
      backendConnected: true,
    },
  });

  window.electron = {
    settings: {
      get: vi.fn().mockResolvedValue({
        theme: 'dark',
        autoSave: true,
        defaultOutputPath: '',
        backendAutostart: true,
        notifyOnGenerationComplete: true,
        notifyOnGenerationFailed: true,
        notifyOnModelDownloads: true,
        pythonPath: '',
      }),
      update: vi.fn().mockResolvedValue({
        theme: 'dark',
        autoSave: true,
        defaultOutputPath: '',
        backendAutostart: true,
        notifyOnGenerationComplete: true,
        notifyOnGenerationFailed: true,
        notifyOnModelDownloads: true,
        pythonPath: '',
      }),
    },
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
              promptEnhancementProvider: 'openrouter',
              openRouterModel: 'openai/gpt-4o-mini',
              imageGenerationProvider: 'openrouter',
              videoGenerationProvider: 'local',
              openRouterImageModel: 'google/gemini-2.5-flash-image',
              huggingFaceModel: '',
              huggingFaceImageModel: '',
              huggingFaceVideoModel: '',
              fallbackProvider: null,
            },
            openRouter: {
              apiKeyStored: true,
              keyLabel: 'Primary Key',
              lastValidatedAt: '2026-04-24T00:00:00.000Z',
            },
            huggingFace: {
              tokenStored: false,
              keyLabel: null,
              lastValidatedAt: null,
            },
          },
        ],
      }),
      update: vi.fn().mockImplementation(async () => ({
        activeAccountId: 'account-primary',
        accounts: [
          {
            id: 'account-primary',
            name: 'Primary',
            createdAt: '2026-04-24T00:00:00.000Z',
            updatedAt: '2026-04-24T00:00:00.000Z',
            preferences: {
              promptEnhancementProvider: 'openrouter',
              openRouterModel: 'openai/gpt-4o-mini',
              imageGenerationProvider: 'openrouter',
              videoGenerationProvider: 'local',
              openRouterImageModel: 'google/gemini-2.5-flash-image',
              huggingFaceModel: '',
              huggingFaceImageModel: '',
              huggingFaceVideoModel: '',
              fallbackProvider: null,
            },
            openRouter: {
              apiKeyStored: true,
              keyLabel: 'Primary Key',
              lastValidatedAt: '2026-04-24T00:00:00.000Z',
            },
            huggingFace: {
              tokenStored: false,
              keyLabel: null,
              lastValidatedAt: null,
            },
          },
        ],
      })),
      create: vi.fn(),
      delete: vi.fn(),
      setActive: vi.fn(),
      setOpenRouterApiKey: vi.fn(),
      clearOpenRouterApiKey: vi.fn(),
      setHuggingFaceToken: vi.fn(),
      clearHuggingFaceToken: vi.fn(),
    },
    openrouter: {
      getKeyInfo: vi.fn().mockResolvedValue({
        success: true,
        keyInfo: {
          label: 'Primary Key',
          limit: 25,
          limitRemaining: 18.5,
          usage: 6.5,
          usageDaily: 1.2,
          usageWeekly: 3.1,
          usageMonthly: 6.5,
          byokUsage: 0.4,
          includeByokInLimit: false,
          isFreeTier: false,
          expiresAt: '2027-12-31T23:59:59Z',
        },
      }),
      listModels: vi.fn().mockResolvedValue({ success: true, models: [] }),
      listImageModels: vi.fn().mockResolvedValue({ success: true, models: [] }),
      testConnection: vi.fn().mockResolvedValue({
        success: true,
        keyInfo: {
          label: 'Primary Key',
          limit: 25,
          limitRemaining: 18.5,
          usage: 6.5,
          usageDaily: 1.2,
          usageWeekly: 3.1,
          usageMonthly: 6.5,
          byokUsage: 0.4,
          includeByokInLimit: false,
          isFreeTier: false,
          expiresAt: '2027-12-31T23:59:59Z',
        },
      }),
    },
    dialog: {
      selectFolder: vi.fn().mockResolvedValue(null),
      saveFile: vi.fn().mockResolvedValue(null),
    },
    app: {
      getPath: vi.fn().mockResolvedValue('C:/Users/User/AppData/Roaming/VisionStudio'),
    },
    assets: {
      clearCache: vi.fn().mockResolvedValue({ success: true }),
    },
    backend: {
      start: vi.fn().mockResolvedValue({ success: true }),
      getStatus: vi.fn().mockResolvedValue({ running: true, bundled: true }),
    },
    system: {
      getInfo: vi.fn().mockResolvedValue({
        gpu_available: true,
        gpu_name: 'NVIDIA RTX',
        gpu_vram: '12 GB',
        cuda_version: '12.4',
        comfyui_connected: true,
        models_count: 3,
        backendConnected: true,
      }),
    },
    models: {
      list: vi.fn().mockResolvedValue([]),
      download: vi.fn().mockResolvedValue({
        model_id: 'flux-dev',
        status: 'downloading',
        progress: 0,
        speed: 0,
        eta: null,
        total_bytes: 0,
        error: null,
        gate_url: null,
      }),
      downloadPause: vi.fn(),
      downloadResume: vi.fn(),
      downloadCancel: vi.fn(),
      downloadsList: vi.fn().mockResolvedValue([]),
      subscribeDownloads: vi.fn().mockResolvedValue([]),
      getStatus: vi.fn().mockResolvedValue(null),
      delete: vi.fn().mockResolvedValue({ success: true }),
    },
    notifications: {
      notify: vi.fn().mockResolvedValue({ success: true }),
    },
  } as unknown as typeof window.electron;
}

describe('SettingsPanel', () => {
  beforeEach(() => {
    installElectronMock();
  });

  afterEach(cleanup);

  it('shows live OpenRouter key usage data for the active account', async () => {
    render(<SettingsPanel />);

    fireEvent.click(screen.getByRole('button', { name: /AI & Models/i }));

    expect(await screen.findByText('Key Usage')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText('Credit Remaining')).toBeInTheDocument();
      expect(screen.getByText('$18.50 / $25.00')).toBeInTheDocument();
      expect(screen.getByText('$6.50')).toBeInTheDocument();
      expect(screen.getByText('$0.40')).toBeInTheDocument();
    });
  });

  it('exposes the Performance acceleration panel', async () => {
    render(<SettingsPanel />);

    fireEvent.click(screen.getByRole('button', { name: /^Performance$/ }));

    // The dedicated panel renders its tri-state optimization controls.
    expect(await screen.findByText('Compile')).toBeInTheDocument();
    expect(screen.getByText('Quantization')).toBeInTheDocument();
    expect(screen.getByLabelText('Master Enable')).toBeInTheDocument();
  });

  it('enqueues a model download through the store and shows live job progress', async () => {
    const job: DownloadJob = {
      model_id: 'flux-dev',
      status: 'downloading',
      progress: 42,
      speed: 1024,
      eta: 120,
      total_bytes: 1_000_000,
      error: null,
      gate_url: null,
    };
    const models = window.electron.models as unknown as Record<string, ReturnType<typeof vi.fn>>;
    // The catalog keeps reporting the model so any background refresh keeps the row.
    models.list.mockResolvedValue([makeModelRecord({ status: 'not_found' })]);
    models.download.mockResolvedValue(job);
    // Mount hydrate sees nothing in flight; later polls see the active download,
    // so the live-queue effect cannot revert the row mid-assertion under load.
    models.downloadsList.mockReset();
    models.downloadsList.mockResolvedValueOnce([]).mockResolvedValue([job]);
    useAppStore.setState({ availableModels: [makeModelRecord({ status: 'not_found' })] });

    render(<SettingsPanel />);
    fireEvent.click(screen.getByRole('button', { name: /AI & Models/i }));

    // Wait for the Installed Models row to mount (AnimatePresence tab transition).
    await screen.findByText('FLUX.1 dev', {}, { timeout: 15000 });
    const downloadButton = screen.getByRole('button', { name: /^Download$/ });
    fireEvent.click(downloadButton);

    // The slice path enqueues via the IPC bridge, and the row reflects live job state.
    expect(
      await screen.findByRole('button', { name: /Downloading/i }, { timeout: 15000 }),
    ).toBeInTheDocument();
    expect(models.download).toHaveBeenCalledWith('flux-dev');
    expect(screen.getByText(/42%/)).toBeInTheDocument();
  });
});
