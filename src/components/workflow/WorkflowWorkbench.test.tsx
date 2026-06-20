import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAppStore } from '@/store/appStore';
import type { ElectronAPI } from '@/types/electron';
import type { WorkflowExecutionValidationResult } from '@/types/workflow';

const { validateWorkflowExecutionMock, runWorkflowExecutionMock } = vi.hoisted(() => ({
  validateWorkflowExecutionMock: vi.fn<
    (a: unknown, b: unknown) => WorkflowExecutionValidationResult
  >(),
  runWorkflowExecutionMock: vi.fn(),
}));

vi.mock('@/features/workflow/validateWorkflowExecution', () => ({
  validateWorkflowExecution: validateWorkflowExecutionMock,
}));

vi.mock('@/features/workflow/runWorkflowExecution', () => ({
  runWorkflowExecution: runWorkflowExecutionMock,
}));

import { WorkflowWorkbench } from './WorkflowWorkbench';

const legacyPrimarySelector = [
  '.text-red-primary',
  '.bg-red-aura',
  '.border-red-primary',
  '.ring-red-primary',
  '.glow-red',
  '.glow-red-subtle',
  '.shadow-red-glow',
].join(', ');

describe('WorkflowWorkbench', () => {
  beforeEach(() => {
    useAppStore.setState(useAppStore.getInitialState(), true);
    useAppStore.setState((state) => ({
      ...state,
      systemInfo: {
        ...state.systemInfo,
        backendConnected: true,
      },
      generationDraft: {
        generationType: 'image',
        prompt: 'workflow prompt from draft',
        negativePrompt: 'workflow negative',
        width: 1024,
        height: 1024,
        steps: 25,
        cfgScale: 7.5,
        model: 'flux-dev',
        scheduler: 'Euler a',
        seed: 42,
      },
    }));
    validateWorkflowExecutionMock.mockReset();
    validateWorkflowExecutionMock.mockReturnValue({
      issues: [],
      summary: {
        prompt: 'workflow prompt from draft',
        negativePrompt: 'workflow negative',
        model: 'flux-dev.safetensors',
        width: 1024,
        height: 1024,
        steps: 25,
        cfgScale: 7.5,
        seed: 1,
      },
    });
    runWorkflowExecutionMock.mockReset();
    runWorkflowExecutionMock.mockResolvedValue(undefined);
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
    } as unknown as ElectronAPI;
  });

  afterEach(() => {
    cleanup();
    Reflect.deleteProperty(window, 'electron');
  });

  it('renders workflow metadata instead of placeholder copy', () => {
    render(<WorkflowWorkbench />);

    expect(screen.getByRole('heading', { name: 'Workflow' })).toBeInTheDocument();
    expect(screen.getAllByText('Image generation baseline').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Draft').length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText('Node workflows are coming to this workbench.')).not.toBeInTheDocument();
  });

  it('renders active workflow description, tags, and notes', () => {
    render(<WorkflowWorkbench />);

    expect(
      screen.getByText('Reusable text-to-image pass for current prompt and reference context.')
    ).toBeInTheDocument();
    expect(screen.getByText('image')).toBeInTheDocument();
    expect(screen.getByText('baseline')).toBeInTheDocument();
    expect(
      screen.getByText('Use this path before branching accepted output into Viewer, Boards, or Gallery.')
    ).toBeInTheDocument();
  });

  it('renders the editable workflow graph in the center work surface', () => {
    render(<WorkflowWorkbench />);

    expect(screen.getByRole('region', { name: 'Workflow graph editor' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Prompt Encode node' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sampler node' })).toBeInTheDocument();
  });

  it('renders workflow library records and run output context', () => {
    render(<WorkflowWorkbench />);

    expect(screen.getByRole('heading', { name: 'Workflow Library' })).toBeInTheDocument();
    expect(screen.getAllByText('Image generation baseline')).toHaveLength(2);
    expect(screen.getByText('Storyboard frame')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Run Output' })).toBeInTheDocument();
    expect(screen.getByText('No run output yet.')).toBeInTheDocument();
  });

  it('renders recent workflow run history', () => {
    useAppStore.getState().recordWorkflowRun('image-generation-baseline', {
      id: 'run-1',
      status: 'complete',
      summary: 'Generated 2 images',
      createdAt: '2026-04-17T12:00:00.000Z',
    });

    render(<WorkflowWorkbench />);

    expect(screen.getByText('Generated 2 images')).toBeInTheDocument();
    expect(screen.getByText('Complete')).toBeInTheDocument();
  });

  it('selects a workflow from the library', async () => {
    const user = userEvent.setup();

    render(<WorkflowWorkbench />);
    await user.click(screen.getByRole('button', { name: 'Storyboard frame' }));

    expect(useAppStore.getState().activeWorkflowId).toBe('storyboard-frame');
    expect(screen.getByText('Scene continuity run')).toBeInTheDocument();
  });

  it('updates rendered metadata when selecting another workflow', async () => {
    const user = userEvent.setup();

    render(<WorkflowWorkbench />);
    await user.click(screen.getByRole('button', { name: 'Storyboard frame' }));

    expect(
      screen.getByText('Creates a scene-aligned frame while preserving character and board context.')
    ).toBeInTheDocument();
    expect(screen.getByText('storyboard')).toBeInTheDocument();
    expect(screen.getByText('scene')).toBeInTheDocument();
    expect(screen.getByText('Use this path when a single board frame needs continuity before review.')).toBeInTheDocument();
  });

  it('exports the active graph as ComfyUI API JSON', async () => {
    const user = userEvent.setup();

    render(<WorkflowWorkbench />);
    await user.click(screen.getByRole('button', { name: 'Export ComfyUI JSON' }));

    expect(screen.getByRole('region', { name: 'ComfyUI API JSON export' })).toHaveTextContent(
      '"class_type": "KSampler"'
    );
    expect(screen.getByRole('region', { name: 'ComfyUI API JSON export' })).toHaveTextContent('"positive"');
  });

  it('clears exported JSON when switching workflows', async () => {
    const user = userEvent.setup();

    render(<WorkflowWorkbench />);
    await user.click(screen.getByRole('button', { name: 'Export ComfyUI JSON' }));
    await user.click(screen.getByRole('button', { name: 'Storyboard frame' }));

    expect(screen.queryByRole('region', { name: 'ComfyUI API JSON export' })).not.toBeInTheDocument();
  });

  it('uses Carbon Pro accent tokens instead of legacy primary red chrome', () => {
    const { container } = render(<WorkflowWorkbench />);

    expect(screen.getAllByText('Draft')[0]).toHaveClass('border-accent-primary-border');
    expect(container.querySelector(legacyPrimarySelector)).not.toBeInTheDocument();
  });

  it('shows validation issues after clicking Validate', async () => {
    const user = userEvent.setup();
    validateWorkflowExecutionMock.mockReturnValueOnce({
      issues: [{ severity: 'error', code: 'missing-prompt', message: 'Prompt is required.' }],
      summary: null,
    });

    render(<WorkflowWorkbench />);
    await user.click(screen.getByRole('button', { name: 'Validate' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Prompt is required.');
  });

  it('disables Run Workflow while the active workflow has blocking errors', () => {
    useAppStore.getState().setWorkflowRuntimeState('image-generation-baseline', {
      issues: [{ severity: 'error', code: 'missing-prompt', message: 'Prompt is required.' }],
    });

    render(<WorkflowWorkbench />);

    expect(screen.getByRole('button', { name: 'Run Workflow' })).toBeDisabled();
  });

  it('allows workflow runs when OpenRouter still-image routing is configured and the backend is offline', async () => {
    useAppStore.setState((state) => ({
      systemInfo: {
        ...state.systemInfo,
        backendConnected: false,
      },
    }));
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

    render(<WorkflowWorkbench />);

    expect(await screen.findByText('OpenRouter Still Image Route')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Run Workflow' })).not.toBeDisabled();
  });

  it('invokes the runner when Run Workflow is clicked', async () => {
    const user = userEvent.setup();

    render(<WorkflowWorkbench />);
    await user.click(screen.getByRole('button', { name: 'Run Workflow' }));

    expect(runWorkflowExecutionMock).toHaveBeenCalledWith(
      expect.objectContaining({ workflowId: 'image-generation-baseline' })
    );
  });

  it('imports a pasted Comfy graph and surfaces the fidelity report', async () => {
    render(<WorkflowWorkbench />);
    const json = JSON.stringify({
      '1': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: 'flux1-dev.safetensors' } },
      '2': { class_type: 'WeirdCustomNode', inputs: {} },
    });
    fireEvent.change(screen.getByLabelText(/comfy graph json/i), { target: { value: json } });
    fireEvent.click(screen.getByRole('button', { name: /import graph/i }));
    // "not executable" is the unique report headline; the opaque node also renders
    // in the now-active imported graph, so assert at least one occurrence.
    await waitFor(() => expect(screen.getByText(/not executable/i)).toBeInTheDocument());
    expect(screen.getAllByText('WeirdCustomNode').length).toBeGreaterThanOrEqual(1);
  });

  it('disables Run on ComfyUI when the active graph is not executable', async () => {
    render(<WorkflowWorkbench />);
    const json = JSON.stringify({ '1': { class_type: 'WeirdCustomNode', inputs: {} } });
    fireEvent.change(screen.getByLabelText(/comfy graph json/i), { target: { value: json } });
    fireEvent.click(screen.getByRole('button', { name: /import graph/i }));
    await waitFor(() => expect(screen.getByText(/not executable/i)).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /run on comfyui/i })).toBeDisabled();
  });
});
