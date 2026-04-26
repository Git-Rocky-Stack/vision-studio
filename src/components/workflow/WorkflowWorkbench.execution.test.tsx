import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAppStore } from '@/store/appStore';
import type { ElectronAPI, JobStatus } from '@/types/electron';
import { WorkflowWorkbench } from './WorkflowWorkbench';

describe('WorkflowWorkbench execution', () => {
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
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    Reflect.deleteProperty(window, 'electron');
  });

  it('shows the resolved request summary and routes a completed workflow run to Viewer', async () => {
    const user = userEvent.setup();
    const completedStatus: JobStatus = {
      job_id: 'job-1',
      status: 'completed',
      type: 'image',
      created_at: '2026-04-22T20:00:00.000Z',
      completed_at: '2026-04-22T20:00:05.000Z',
      progress: 100,
      result: {
        images: ['/outputs/job-1/image-1.png'],
        seed: 1,
      },
    };
    const { generateImageMock, getStatusMock, notifyMock } = installElectronMock([completedStatus]);

    render(<WorkflowWorkbench />);

    await user.click(screen.getByRole('button', { name: 'Validate' }));

    expect(await screen.findByText('workflow prompt from draft')).toBeInTheDocument();
    expect(screen.getByText('flux-dev.safetensors')).toBeInTheDocument();
    expect(
      useAppStore.getState().workflowRuntimeById['image-generation-baseline']?.lastResolvedRequest
    ).toMatchObject({
      prompt: 'workflow prompt from draft',
      negativePrompt: 'workflow negative',
      model: 'flux-dev.safetensors',
      width: 1024,
      height: 1024,
      steps: 25,
      cfgScale: 7.5,
      seed: 1,
    });

    await user.click(screen.getByRole('button', { name: 'Run Workflow' }));

    await waitFor(() => {
      expect(generateImageMock).toHaveBeenCalledWith({
        prompt: 'workflow prompt from draft',
        negative_prompt: 'workflow negative',
        model: 'flux-dev.safetensors',
        width: 1024,
        height: 1024,
        steps: 25,
        cfg_scale: 7.5,
        seed: 1,
        scheduler: 'Euler a',
      });
    });

    await waitFor(() => {
      const state = useAppStore.getState();
      expect(state.centerView).toBe('viewer');
      expect(state.activeViewerItemId).toBe('job-1::/outputs/job-1/image-1.png');
    });

    expect(getStatusMock).toHaveBeenCalledWith('job-1');
    expect(notifyMock).toHaveBeenCalledWith(
      'generation_complete',
      expect.objectContaining({
        title: 'Workflow Ready',
      })
    );
  });
});

function installElectronMock(statuses: JobStatus[]) {
  const fallbackStatus = statuses[statuses.length - 1];
  const generateImageMock = vi.fn().mockResolvedValue({ success: true, jobId: 'job-1' });
  const getStatusMock = vi.fn().mockImplementation(async () => {
    const nextStatus = statuses.shift() ?? fallbackStatus;
    if (!nextStatus) {
      throw new Error('No mocked workflow job status was provided.');
    }
    return nextStatus;
  });
  const notifyMock = vi.fn().mockResolvedValue({ success: true });

  window.electron = {
    app: {
      getPath: vi.fn().mockResolvedValue('C:/Users/User/AppData/Roaming/VisionStudio'),
    },
    settings: {
      get: vi.fn().mockResolvedValue({
        theme: 'system',
        autoSave: true,
        defaultOutputPath: '',
        backendAutostart: true,
        notifyOnGenerationComplete: true,
        notifyOnGenerationFailed: true,
        notifyOnModelDownloads: true,
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
      generateImage: generateImageMock,
      getStatus: getStatusMock,
    },
    notifications: {
      notify: notifyMock,
    },
  } as unknown as ElectronAPI;

  return {
    generateImageMock,
    getStatusMock,
    notifyMock,
  };
}
