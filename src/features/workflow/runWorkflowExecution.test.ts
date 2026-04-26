import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAppStore } from '@/store/appStore';
import { runWorkflowExecution } from './runWorkflowExecution';

describe('runWorkflowExecution', () => {
  beforeEach(() => {
    useAppStore.setState(useAppStore.getInitialState(), true);
    useAppStore.setState((state) => ({
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

  it('queues a real workflow job and records a completed run', async () => {
    const electron = makeElectronGenerationMock({
      submit: { success: true, jobId: 'job-1' },
      statuses: [
        {
          job_id: 'job-1',
          status: 'processing',
          type: 'image',
          created_at: '2026-04-22T20:00:00.000Z',
          progress: 40,
          params: {},
        },
        {
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
          params: {},
        },
      ],
    });

    await runWorkflowExecution({
      workflowId: 'image-generation-baseline',
      electron,
      store: useAppStore,
      pollIntervalMs: 0,
    });

    const state = useAppStore.getState();
    expect(state.workflowRecords[0].runHistory[0]).toMatchObject({ status: 'complete' });
    expect(state.activeViewerItemId).toBe('job-1::/outputs/job-1/image-1.png');
    expect(state.centerView).toBe('viewer');
  });

  it('records a failed run when submit throws', async () => {
    const electron = makeElectronGenerationMock({
      submitError: new Error('Backend offline'),
    });

    await runWorkflowExecution({
      workflowId: 'image-generation-baseline',
      electron,
      store: useAppStore,
      pollIntervalMs: 0,
    });

    const runtime = useAppStore.getState().workflowRuntimeById['image-generation-baseline'];
    expect(runtime?.lastFailureMessage).toBe('Backend offline');
    expect(useAppStore.getState().workflowRecords[0].runHistory[0]?.status).toBe('failed');
  });

  it('allows hosted still-image workflow execution when the backend is offline', async () => {
    useAppStore.setState((state) => ({
      systemInfo: {
        ...state.systemInfo,
        backendConnected: false,
      },
    }));

    const electron = makeElectronGenerationMock({
      openRouterImageEnabled: true,
      submit: { success: true, jobId: 'job-openrouter-1' },
      statuses: [
        {
          job_id: 'job-openrouter-1',
          status: 'completed',
          type: 'image',
          created_at: '2026-04-24T20:00:00.000Z',
          completed_at: '2026-04-24T20:00:05.000Z',
          progress: 100,
          result: {
            images: ['/outputs/job-openrouter-1/image-1.png'],
          },
        },
      ],
    });

    await runWorkflowExecution({
      workflowId: 'image-generation-baseline',
      electron,
      store: useAppStore,
      pollIntervalMs: 0,
    });

    expect(electron.generation.generateImage).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'google/gemini-2.5-flash-image',
      }),
    );
    expect(useAppStore.getState().workflowRecords[0].runHistory[0]).toMatchObject({
      status: 'complete',
    });
  });
});

function makeElectronGenerationMock(options: {
  submit?: { success: boolean; jobId?: string; error?: string };
  submitError?: Error;
  statuses?: Array<Record<string, unknown>>;
  openRouterImageEnabled?: boolean;
}) {
  const statuses = [...(options.statuses ?? [])];
  const notify = vi.fn().mockResolvedValue({ success: true });

  return {
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
              imageGenerationProvider: options.openRouterImageEnabled ? 'openrouter' : 'local',
              openRouterImageModel: options.openRouterImageEnabled ? 'google/gemini-2.5-flash-image' : '',
            },
            openRouter: {
              apiKeyStored: options.openRouterImageEnabled ?? false,
              keyLabel: options.openRouterImageEnabled ? 'Primary Key' : null,
              lastValidatedAt: options.openRouterImageEnabled ? '2026-04-24T00:00:00.000Z' : null,
            },
          },
        ],
      }),
    },
    generation: {
      generateImage: options.submitError
        ? vi.fn().mockRejectedValue(options.submitError)
        : vi.fn().mockResolvedValue(options.submit ?? { success: true, jobId: 'job-1' }),
      getStatus: vi.fn().mockImplementation(async () => statuses.shift()),
    },
    notifications: {
      notify,
    },
  };
}
