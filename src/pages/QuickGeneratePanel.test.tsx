import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAppStore } from '@/store/appStore';

import { QuickGeneratePanel } from './QuickGeneratePanel';

describe('QuickGeneratePanel', () => {
  beforeEach(() => {
    useAppStore.setState(useAppStore.getInitialState());
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
      app: {
        getPath: vi.fn().mockResolvedValue('C:/Users/User/AppData/Roaming/VisionStudio'),
      },
      settings: {
        get: vi.fn().mockResolvedValue({
          defaultOutputPath: '',
        }),
      },
      generation: {
        generateImage: vi.fn().mockResolvedValue({ success: true, jobId: 'job-quick-1' }),
        getStatus: vi.fn().mockResolvedValue({
          job_id: 'job-quick-1',
          status: 'completed',
          type: 'image',
          created_at: '2026-04-24T00:00:00.000Z',
          completed_at: '2026-04-24T00:00:01.000Z',
          progress: 100,
          result: {
            images: ['/outputs/job-quick-1/image.png'],
          },
        }),
        cancel: vi.fn().mockResolvedValue({ success: true }),
        onProgress: vi.fn().mockReturnValue(() => undefined),
      },
      notifications: {
        notify: vi.fn().mockResolvedValue({ success: true }),
      },
    } as unknown as typeof window.electron;
  });

  afterEach(cleanup);

  it('renders as a Carbon Pro inspector without legacy red primary chrome', () => {
    const { container } = render(<QuickGeneratePanel />);

    expect(screen.getByRole('heading', { level: 2, name: 'Quick Generate' })).toBeInTheDocument();
    expect(screen.getByLabelText('Prompt')).toHaveClass('focus:border-accent-primary');
    expect(screen.getByText('Model Router')).toBeInTheDocument();
    expect(container.querySelector('.text-red-primary, .bg-red-aura')).not.toBeInTheDocument();
  });

  it('shows the hosted route summary when the active account uses OpenRouter for still images', async () => {
    window.electron.accounts.list = vi.fn().mockResolvedValue({
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
            imageGenerationProvider: 'openrouter',
            openRouterImageModel: 'google/gemini-2.5-flash-image',
          },
          openRouter: {
            apiKeyStored: true,
            keyLabel: 'Primary Key',
            lastValidatedAt: '2026-04-24T00:00:00.000Z',
          },
        },
      ],
    });

    render(<QuickGeneratePanel />);

    expect(await screen.findByText('OpenRouter Still Image Route')).toBeInTheDocument();
    expect(screen.getByText(/google\/gemini-2.5-flash-image/)).toBeInTheDocument();
  });
});
