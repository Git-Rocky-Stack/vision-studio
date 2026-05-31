import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAppStore } from '@/store/appStore';

import { AssetsPanel } from './AssetsPanel';
import { BatchPromptQueue } from './BatchPanel';
import { SettingsPanel } from './SettingsPanel';
import { TemplatesPanel } from './TemplatesPanel';

const legacyPrimarySelector = [
  '.text-red-primary',
  '.bg-red-aura',
  '.border-red-primary',
  '.ring-red-primary',
  '.glow-red',
  '.glow-red-subtle',
  '.shadow-red-glow',
].join(', ');

function mockElectron() {
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
      update: vi.fn().mockImplementation(async (patch) => ({
        theme: 'dark',
        autoSave: true,
        defaultOutputPath: '',
        backendAutostart: true,
        notifyOnGenerationComplete: true,
        notifyOnGenerationFailed: true,
        notifyOnModelDownloads: true,
        pythonPath: '',
        ...patch,
      })),
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
              promptEnhancementProvider: 'local',
              openRouterModel: '',
              imageGenerationProvider: 'local',
              openRouterImageModel: '',
            },
            openRouter: {
              apiKeyStored: false,
              keyLabel: null,
              lastValidatedAt: null,
            },
          },
        ],
      }),
    },
    openrouter: {
      getKeyInfo: vi.fn().mockResolvedValue({ success: false }),
      listModels: vi.fn().mockResolvedValue({ success: true, models: [] }),
      listImageModels: vi.fn().mockResolvedValue({ success: true, models: [] }),
      testConnection: vi.fn().mockResolvedValue({ success: false }),
    },
    dialog: {
      selectFolder: vi.fn().mockResolvedValue(null),
      saveFile: vi.fn().mockResolvedValue(null),
    },
    assets: {
      export: vi.fn().mockResolvedValue(undefined),
      exportMany: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue({ success: true }),
      clearCache: vi.fn().mockResolvedValue({ success: true }),
    },
    app: {
      openPath: vi.fn().mockResolvedValue(undefined),
      getPath: vi.fn().mockResolvedValue('/tmp/vision-studio'),
    },
    generation: {
      batch: vi.fn().mockResolvedValue({ success: false }),
      getStatus: vi.fn().mockResolvedValue({ status: 'pending', progress: 0 }),
      cancel: vi.fn().mockResolvedValue(undefined),
    },
    models: {
      list: vi.fn().mockResolvedValue([]),
      getStatus: vi.fn().mockResolvedValue(null),
      download: vi.fn().mockResolvedValue({ success: false }),
      delete: vi.fn().mockResolvedValue({ success: true }),
    },
    backend: {
      start: vi.fn().mockResolvedValue({ success: true }),
    },
    system: {
      getInfo: vi.fn().mockResolvedValue({
        gpu_available: true,
        gpu_name: 'NVIDIA RTX',
        gpu_vram: '12 GB',
        cuda_version: '12.4',
        comfyui_connected: false,
        models_count: 0,
        backendConnected: true,
      }),
    },
    notifications: {
      notify: vi.fn().mockResolvedValue(undefined),
    },
  } as unknown as typeof window.electron;
}

describe('Carbon Pro secondary panels', () => {
  beforeEach(() => {
    mockElectron();
    useAppStore.setState({
      ...useAppStore.getInitialState(),
      systemInfo: {
        gpuAvailable: true,
        gpuName: 'NVIDIA RTX',
        gpuVram: '12 GB',
        cudaVersion: '12.4',
        comfyuiConnected: false,
        modelsCount: 0,
        backendConnected: true,
      },
    });
  });

  afterEach(cleanup);

  it('renders Assets idle controls with accent focus and no legacy primary red', () => {
    const { container } = render(<AssetsPanel />);

    expect(screen.getByPlaceholderText('Search assets...')).toHaveClass('focus:border-accent-primary');
    expect(container.querySelector(legacyPrimarySelector)).not.toBeInTheDocument();
  });

  it('renders Batch idle controls with accent selection and no legacy primary red', () => {
    const { container } = render(<BatchPromptQueue />);

    expect(screen.getByLabelText('Grid view')).toHaveClass('bg-accent-primary-muted');
    expect(screen.getByDisplayValue('Creation Time')).toHaveClass('focus:border-accent-primary');
    expect(container.querySelector(legacyPrimarySelector)).not.toBeInTheDocument();
  });

  it('renders Templates idle controls with accent selection and no legacy primary red', () => {
    const { container } = render(<TemplatesPanel />);

    // Search now lives in a recessed slot with a chrome focus-within ring on the
    // wrapper; the input itself is borderless. Assert it renders.
    expect(screen.getByPlaceholderText('Search templates...')).toBeInTheDocument();
    // The active category renders as a selected pad (chrome ring via aria-pressed),
    // never a legacy red primary fill.
    const allTemplates = screen.getByRole('button', { name: /All Templates/i });
    expect(allTemplates).toHaveAttribute('aria-pressed', 'true');
    expect(container.querySelector(legacyPrimarySelector)).not.toBeInTheDocument();
  });

  it('renders Settings idle controls with accent selection and no legacy primary red', async () => {
    const { container } = render(<SettingsPanel />);

    expect(screen.getByRole('button', { name: /General/i })).toHaveClass('bg-accent-primary-muted');
    expect(screen.getByRole('switch', { name: 'Toggle auto save' })).toHaveClass('bg-accent-primary');
    expect(container.querySelector(legacyPrimarySelector)).not.toBeInTheDocument();
  });
});
