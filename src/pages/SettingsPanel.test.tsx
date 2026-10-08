import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAppStore } from '@/store/appStore';
import type { ModelRecord } from '@/types/model';

import { skippedHeadingLevels } from '../../tests/support/headingOrder';
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

  it('says what AI Director sends when prompt assist runs on a cloud route', async () => {
    // generation.ts passes the retrieved context to OpenRouter / Hugging Face
    // prompt enhancement, so "nothing leaves your machine" was false there.
    render(<SettingsPanel />);
    fireEvent.click(screen.getByRole('button', { name: /AI & Models/i }));

    expect(await screen.findByText(/retrieved excerpts are sent to that provider/i)).toBeInTheDocument();
    expect(screen.queryByText(/nothing leaves your machine/i)).toBeNull();
  });

  it('exposes the Performance acceleration panel', async () => {
    render(<SettingsPanel />);

    fireEvent.click(screen.getByRole('button', { name: /^Performance$/ }));

    // The dedicated panel renders its tri-state optimization controls.
    expect(await screen.findByText('Compile')).toBeInTheDocument();
    expect(screen.getByText('Quantization')).toBeInTheDocument();
    expect(screen.getByLabelText('Master Enable')).toBeInTheDocument();
  });

  it('names the cache folder without raw markdown backticks', async () => {
    render(<SettingsPanel />);

    const note = await screen.findByText(/App cache folder/);
    expect(note).toHaveTextContent('/outputs');
    expect(note.textContent).not.toContain('`');
  });

  // The storage bar is the only graphic on the General tab. A filled segment
  // beside "0 tracked assets" says something is stored when nothing is.
  it('draws no fill on the storage bar when nothing is tracked', async () => {
    useAppStore.setState({ assetLibrary: [] });
    render(<SettingsPanel />);

    expect(await screen.findByText('0 tracked assets')).toBeInTheDocument();
    expect(screen.getByTestId('storage-usage-fill')).toHaveStyle({ width: '0%' });
  });

  it('fills the storage bar once assets are tracked', async () => {
    useAppStore.setState({
      assetLibrary: [{ id: 'asset-1' }, { id: 'asset-2' }],
    } as never);
    render(<SettingsPanel />);

    expect(await screen.findByText('2 tracked assets')).toBeInTheDocument();
    expect(screen.getByTestId('storage-usage-fill')).toHaveStyle({ width: '16%' });
  });

  // A check mark means "confirmed". Beside "GPU not detected" it said the
  // opposite of the label it sat next to.
  it('marks an undetected GPU with a warning icon, not a check', async () => {
    useAppStore.setState({
      systemInfo: { ...useAppStore.getState().systemInfo, gpuAvailable: false, gpuName: '' },
    });
    render(<SettingsPanel />);
    fireEvent.click(screen.getByRole('button', { name: /AI & Models/i }));

    const card = (await screen.findByText('GPU not detected')).closest('.raised-panel');
    expect(card?.querySelector('svg.lucide-triangle-alert')).not.toBeNull();
    expect(card?.querySelector('svg.lucide-check')).toBeNull();
  });

  it('keeps the check for a GPU that was detected', async () => {
    useAppStore.setState({
      systemInfo: {
        ...useAppStore.getState().systemInfo,
        gpuAvailable: true,
        gpuName: 'RTX 4090',
      },
    });
    render(<SettingsPanel />);
    fireEvent.click(screen.getByRole('button', { name: /AI & Models/i }));

    const card = (await screen.findByText('RTX 4090')).closest('.raised-panel');
    expect(card?.querySelector('svg.lucide-check')).not.toBeNull();
    expect(card?.querySelector('svg.lucide-triangle-alert')).toBeNull();
  });

  it('keeps an unbroken heading order on AI & Models', async () => {
    render(<SettingsPanel />);
    fireEvent.click(screen.getByRole('button', { name: /AI & Models/i }));

    await screen.findByText('Key Usage');
    expect(skippedHeadingLevels()).toEqual([]);
  });

  // The guide is a Settings tab, so it sits under the Settings h1 like every
  // other tab. Its own h1 gave the page two top-level headings.
  it('nests the User Guide under the single Settings h1', async () => {
    render(<SettingsPanel />);
    fireEvent.click(screen.getByRole('button', { name: /User Guide/i }));

    await screen.findByRole('heading', { name: 'User Guide' });
    expect(document.querySelectorAll('h1')).toHaveLength(1);
    expect(skippedHeadingLevels()).toEqual([]);
  });

  // Tab -> the title that tab shows. Found by name, because the outgoing tab
  // stays mounted while it animates out and its title would match "any h2".
  it.each([
    ['General', 'General Settings'],
    ['AI & Models', 'AI & Models'],
    ['Performance', 'Performance'],
    ['Appearance', 'Appearance'],
    ['Notifications', 'Notifications'],
    ['User Guide', 'User Guide'],
    ['About', 'Vision Studio'],
  ])('titles the %s tab with the shared page-title treatment', async (tab, title) => {
    render(<SettingsPanel />);
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${tab}`) }));

    const heading = await screen.findByRole('heading', { level: 2, name: title });
    expect(heading).toHaveClass('type-title');
  });

  // The 70ch cap is for Settings descriptions. About sets its own measures,
  // and under the cap each licence entry (12px type) broke onto two lines.
  it('caps the measure of Settings copy but leaves About to its own', async () => {
    render(<SettingsPanel />);

    const general = (await screen.findByText(/Changing the output folder/)).closest('.max-w-2xl');
    expect(general?.className).toContain('[&_p]:max-w-[70ch]');

    fireEvent.click(screen.getByRole('button', { name: /^About/ }));
    const about = (await screen.findByTestId('settings-about')).closest('.max-w-2xl');
    expect(about).not.toBeNull();
    expect(about?.className).not.toContain('[&_p]:max-w-[70ch]');
  });

  it('links model management to the Foundry', async () => {
    // Model discovery/download/management moved to the Foundry; Settings now shows a
    // count summary plus a button that navigates to the Foundry tab.
    useAppStore.setState({
      availableModels: [makeModelRecord({ status: 'ready' })],
      activeTab: 'generate',
    });

    render(<SettingsPanel />);
    fireEvent.click(screen.getByRole('button', { name: /AI & Models/i }));

    const manageButton = await screen.findByRole(
      'button',
      { name: /manage in foundry/i },
      { timeout: 15000 },
    );
    fireEvent.click(manageButton);
    expect(useAppStore.getState().activeTab).toBe('foundry');
  });
});

/**
 * The renderer is loaded outside Electron in two places that matter: the
 * `vite preview` bundle the performance suite measures, and the dev server used
 * for headless design review. There is no preload there, so `window.electron`
 * is undefined despite `src/types/electron.d.ts:509` declaring it required.
 *
 * This panel's mount effects called `window.electron.settings.get()` and
 * `window.electron.accounts.list()` with no guard, so it threw
 * "Cannot read properties of undefined (reading 'settings')" before first paint
 * and rendered its ErrorBoundary instead - measured as the single pageerror in
 * a browser run, and the reason tests/e2e/performance/performance.spec.ts had
 * to exclude `settings` from its panel matrix.
 */
describe('SettingsPanel outside Electron', () => {
  const original = Reflect.getOwnPropertyDescriptor(window, 'electron');

  beforeEach(() => {
    useAppStore.setState(useAppStore.getInitialState(), true);
    Reflect.deleteProperty(window, 'electron');
  });

  afterEach(() => {
    cleanup();
    if (original) {
      Object.defineProperty(window, 'electron', original);
    } else {
      Reflect.deleteProperty(window, 'electron');
    }
  });

  it('mounts without throwing when the preload bridge is absent', () => {
    expect(() => render(<SettingsPanel />)).not.toThrow();
  });

  it('renders the panel surface rather than an error boundary', async () => {
    render(<SettingsPanel />);

    await waitFor(() => {
      expect(screen.getByTestId('settings-panel')).toBeInTheDocument();
    });
  });

  it('raises no unhandled rejection from its mount effects', async () => {
    const rejections: unknown[] = [];
    const onRejection = (event: PromiseRejectionEvent) => {
      rejections.push(event.reason);
      event.preventDefault();
    };
    window.addEventListener('unhandledrejection', onRejection);

    try {
      render(<SettingsPanel />);
      // Let every mount effect's promise chain settle.
      await new Promise((resolve) => setTimeout(resolve, 0));
      await waitFor(() => {
        expect(screen.getByTestId('settings-panel')).toBeInTheDocument();
      });
      expect(rejections).toEqual([]);
    } finally {
      window.removeEventListener('unhandledrejection', onRejection);
    }
  });
});
