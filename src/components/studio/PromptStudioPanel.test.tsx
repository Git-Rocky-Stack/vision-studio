import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAppStore } from '@/store/appStore';
import type { ElectronAPI } from '@/types/electron';

import { PromptStudioPanel } from './PromptStudioPanel';

function resetStore() {
  useAppStore.setState(useAppStore.getInitialState());
}

function installElectronMock() {
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
    generation: {
      enhancePrompt: vi.fn().mockResolvedValue({
        success: true,
        prompt: 'enhanced prompt from service',
        variations: [],
      }),
      suggestNegativePrompt: vi.fn().mockResolvedValue({
        success: true,
        negativePrompt: 'blurry, low quality',
        suggestions: ['blurry', 'low quality'],
        source: 'heuristic',
      }),
    },
  } as unknown as ElectronAPI;
}

describe('PromptStudioPanel', () => {
  beforeEach(() => {
    resetStore();
    installElectronMock();
  });

  afterEach(() => {
    cleanup();
    Reflect.deleteProperty(window, 'electron');
  });

  it('renders all three collapsible sections and the prompt route summary', async () => {
    render(<PromptStudioPanel />);

    expect(screen.getByText('Prompt Editor')).toBeInTheDocument();
    expect(screen.getByText('Enhancement')).toBeInTheDocument();
    expect(screen.getByText('Templates')).toBeInTheDocument();
    expect(await screen.findByText('Local Prompt Tools')).toBeInTheDocument();
  });

  it('keeps the editors bound to the shared generation draft', async () => {
    const user = userEvent.setup();
    render(<PromptStudioPanel />);

    const positiveTextarea = screen.getByPlaceholderText('Describe what you want to generate...');
    const negativeTextarea = screen.getByPlaceholderText('What to avoid in the generation...');

    await user.type(positiveTextarea, 'a beautiful landscape');
    await user.type(negativeTextarea, 'blurry, low quality');

    expect(positiveTextarea).toHaveValue('a beautiful landscape');
    expect(negativeTextarea).toHaveValue('blurry, low quality');
    expect(useAppStore.getState().generationDraft).toMatchObject({
      prompt: 'a beautiful landscape',
      negativePrompt: 'blurry, low quality',
    });
  });

  it('renders enhancement toolkit buttons when the section is opened', async () => {
    const user = userEvent.setup();
    render(<PromptStudioPanel />);

    await user.click(screen.getByRole('button', { name: /Enhancement/ }));

    expect(screen.getByTitle('Automatically improve prompt quality with AI')).toBeInTheDocument();
    expect(screen.getByTitle('Apply artistic style modifiers to prompt')).toBeInTheDocument();
    expect(screen.getByTitle('Expand prompt with additional detail keywords')).toBeInTheDocument();
    expect(screen.getByTitle('Generate smart negative prompt suggestions')).toBeInTheDocument();
  });

  it('runs AI Enhance through the shared generation seam', async () => {
    const user = userEvent.setup();
    render(<PromptStudioPanel />);

    await user.type(screen.getByPlaceholderText('Describe what you want to generate...'), 'hero portrait');
    await user.click(screen.getByRole('button', { name: /Enhancement/ }));
    await user.click(screen.getByTitle('Automatically improve prompt quality with AI'));

    await waitFor(() => {
      expect(window.electron.generation.enhancePrompt).toHaveBeenCalledWith(
        expect.objectContaining({ prompt: 'hero portrait', mode: 'clarify' }),
      );
      expect(screen.getByPlaceholderText('Describe what you want to generate...')).toHaveValue(
        'enhanced prompt from service',
      );
    });
  });

  it('runs Expand through the prompt enhancement seam with expand mode', async () => {
    const user = userEvent.setup();
    window.electron.generation.enhancePrompt = vi.fn().mockResolvedValue({
      success: true,
      prompt: 'expanded hero portrait with layered wardrobe detail',
      variations: [],
    });

    render(<PromptStudioPanel />);

    await user.type(screen.getByPlaceholderText('Describe what you want to generate...'), 'hero portrait');
    await user.click(screen.getByRole('button', { name: /Enhancement/ }));
    await user.click(screen.getByTitle('Expand prompt with additional detail keywords'));

    await waitFor(() => {
      expect(window.electron.generation.enhancePrompt).toHaveBeenCalledWith(
        expect.objectContaining({ prompt: 'hero portrait', mode: 'expand' }),
      );
      expect(screen.getByPlaceholderText('Describe what you want to generate...')).toHaveValue(
        'expanded hero portrait with layered wardrobe detail',
      );
    });
  });

  it('updates the negative prompt with suggested terms', async () => {
    const user = userEvent.setup();
    render(<PromptStudioPanel />);

    await user.type(screen.getByPlaceholderText('Describe what you want to generate...'), 'hero portrait');
    await user.click(screen.getByRole('button', { name: /Enhancement/ }));
    await user.click(screen.getByTitle('Generate smart negative prompt suggestions'));

    await waitFor(() => {
      expect(window.electron.generation.suggestNegativePrompt).toHaveBeenCalledWith(
        expect.objectContaining({ prompt: 'hero portrait', negativePrompt: '' }),
      );
      expect(screen.getByPlaceholderText('What to avoid in the generation...')).toHaveValue(
        'blurry, low quality',
      );
    });
  });

  it('reveals style presets and applies a selected style modifier', async () => {
    const user = userEvent.setup();
    render(<PromptStudioPanel />);

    await user.type(screen.getByPlaceholderText('Describe what you want to generate...'), 'hero portrait');
    await user.click(screen.getByRole('button', { name: /Enhancement/ }));
    await user.click(screen.getByTitle('Apply artistic style modifiers to prompt'));
    await user.click(await screen.findByRole('button', { name: 'Cinematic' }));

    const promptInput = screen.getByPlaceholderText(
      'Describe what you want to generate...',
    ) as HTMLTextAreaElement;
    expect(promptInput.value).toContain('cinematic lighting');
  });

  it('renders the template library when Templates is expanded', async () => {
    const user = userEvent.setup();
    render(<PromptStudioPanel />);

    await user.click(screen.getByRole('button', { name: /Templates/ }));

    expect(screen.getByPlaceholderText('Search templates...')).toBeInTheDocument();
  });

  it('shows the OpenRouter prompt route summary when the active account uses BYOK prompt tooling', async () => {
    window.electron.accounts.list = vi.fn().mockResolvedValue({
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
            imageGenerationProvider: 'local',
            openRouterImageModel: '',
          },
          openRouter: {
            apiKeyStored: true,
            keyLabel: 'Primary Key',
            lastValidatedAt: '2026-04-24T00:00:00.000Z',
          },
        },
      ],
    });

    render(<PromptStudioPanel />);

    expect(await screen.findByText('OpenRouter Prompt Route')).toBeInTheDocument();
    expect(screen.getByText(/openai\/gpt-4o-mini/)).toBeInTheDocument();
  });
});
