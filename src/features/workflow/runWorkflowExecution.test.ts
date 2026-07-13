import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAppStore } from '@/store/appStore';
import { runWorkflowExecution } from './runWorkflowExecution';

/** Seed the installed library with the baseline checkpoint + one flux LoRA. */
function seedInstalledLoraModels({ loraRepoId = null as string | null } = {}) {
  useAppStore.setState({
    availableModels: [
      {
        id: 'flux-dev',
        name: 'FLUX.1 dev',
        artifact_type: 'checkpoint',
        capability: 'image',
        base_architecture: 'flux',
        source: 'local',
        repo_id: null,
        revision: null,
        aux_repo_id: null,
        size: '23 GB',
        status: 'ready',
        tier: 'verified',
        quality: 'pro',
        runtime: 'local',
        hardware_class: 'workstation',
        vram: '24 GB',
        description: '',
        license: null,
        gated: false,
        locations: ['C:/models/checkpoints/flux-dev.safetensors'],
      },
      {
        id: 'flux-ink',
        name: 'Flux Ink',
        artifact_type: 'lora',
        capability: 'image',
        base_architecture: 'flux',
        source: loraRepoId ? 'huggingface' : 'local',
        repo_id: loraRepoId,
        revision: null,
        aux_repo_id: null,
        size: '200 MB',
        status: 'ready',
        tier: 'verified',
        quality: 'balanced',
        runtime: 'local',
        hardware_class: 'creator',
        vram: '0 GB',
        description: '',
        license: null,
        gated: false,
        locations: ['C:/models/loras/flux-ink.safetensors'],
      },
    ],
  });
}

/** Splice a LoraLoader between the baseline checkpoint and sampler. */
function seedWorkflowLoraChain(loraName: string, strength: number) {
  const state = useAppStore.getState();
  const workflow = state.workflowRecords[0];
  const loraNode = state.addWorkflowNode(workflow.id, {
    classType: 'LoraLoader',
    label: 'LoRA Loader',
    position: { x: 200, y: 300 },
    inputs: {
      model: { kind: 'link', nodeId: 'model', output: 'MODEL' },
      lora_name: { kind: 'literal', value: loraName },
      strength_model: { kind: 'literal', value: strength },
    },
  });
  if (!loraNode) throw new Error('failed to seed LoraLoader node');
  state.connectWorkflowNodes(workflow.id, {
    sourceNodeId: loraNode.id,
    sourceOutput: 'MODEL',
    targetNodeId: 'sampler',
    targetInput: 'model',
  });
}

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

  it('forwards resolved LoRA selections to the local generation request (#43)', async () => {
    seedInstalledLoraModels();
    seedWorkflowLoraChain('flux-ink.safetensors', 0.8);

    const electron = makeElectronGenerationMock({
      submit: { success: true, jobId: 'job-lora-1' },
      statuses: [
        {
          job_id: 'job-lora-1',
          status: 'completed',
          type: 'image',
          created_at: '2026-07-12T20:00:00.000Z',
          completed_at: '2026-07-12T20:00:05.000Z',
          progress: 100,
          result: {
            images: ['/outputs/job-lora-1/image-1.png'],
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
        loras: [{ id: 'flux-ink', weight: 0.8 }],
      }),
    );
    expect(useAppStore.getState().workflowRecords[0].runHistory[0]).toMatchObject({
      status: 'complete',
    });
  });

  it('declines LoRA-bearing runs on OpenRouter permanently, naming the missing contract (#42)', async () => {
    seedInstalledLoraModels();
    seedWorkflowLoraChain('flux-ink.safetensors', 1);

    const electron = makeElectronGenerationMock({
      openRouterImageEnabled: true,
      submit: { success: true, jobId: 'job-should-not-run' },
    });

    await runWorkflowExecution({
      workflowId: 'image-generation-baseline',
      electron,
      store: useAppStore,
      pollIntervalMs: 0,
    });

    expect(electron.generation.generateImage).not.toHaveBeenCalled();
    const runtime = useAppStore.getState().workflowRuntimeById['image-generation-baseline'];
    expect(
      runtime?.issues.some(
        (issue) =>
          issue.severity === 'error' &&
          issue.code === 'provider-config' &&
          /no LoRA contract/.test(issue.message),
      ),
    ).toBe(true);
  });

  it('routes an eligible single flux Hub LoRA chain to HuggingFace with the adapter (#42)', async () => {
    seedInstalledLoraModels({ loraRepoId: 'XLabs-AI/flux-RealismLora' });
    seedWorkflowLoraChain('flux-ink.safetensors', 1);

    const electron = makeElectronGenerationMock({
      huggingFaceImageEnabled: true,
      huggingFaceImageModel: 'black-forest-labs/FLUX.1-schnell',
      submit: { success: true, jobId: 'job-hf-lora-1' },
      statuses: [
        {
          job_id: 'job-hf-lora-1',
          status: 'completed',
          type: 'image',
          created_at: '2026-07-12T20:00:00.000Z',
          completed_at: '2026-07-12T20:00:05.000Z',
          progress: 100,
          result: {
            images: ['/outputs/job-hf-lora-1/image-1.png'],
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
        loras: [{ id: 'flux-ink', weight: 1 }],
        __huggingFaceLoraAdapter: 'XLabs-AI/flux-RealismLora',
      }),
    );
    expect(useAppStore.getState().workflowRecords[0].runHistory[0]).toMatchObject({
      status: 'complete',
    });
  });

  it('declines an ineligible LoRA strength on HuggingFace, naming the weight condition (#42)', async () => {
    seedInstalledLoraModels({ loraRepoId: 'XLabs-AI/flux-RealismLora' });
    seedWorkflowLoraChain('flux-ink.safetensors', 0.8);

    const electron = makeElectronGenerationMock({
      huggingFaceImageEnabled: true,
      huggingFaceImageModel: 'black-forest-labs/FLUX.1-schnell',
      submit: { success: true, jobId: 'job-should-not-run' },
    });

    await runWorkflowExecution({
      workflowId: 'image-generation-baseline',
      electron,
      store: useAppStore,
      pollIntervalMs: 0,
    });

    expect(electron.generation.generateImage).not.toHaveBeenCalled();
    const runtime = useAppStore.getState().workflowRuntimeById['image-generation-baseline'];
    expect(
      runtime?.issues.some(
        (issue) =>
          issue.severity === 'error' &&
          issue.code === 'provider-config' &&
          /weight 1\.0/.test(issue.message),
      ),
    ).toBe(true);
  });

  it('declines a LoRA with no Hub repo on HuggingFace, naming the Hub-hosted condition (#42)', async () => {
    seedInstalledLoraModels();
    seedWorkflowLoraChain('flux-ink.safetensors', 1);

    const electron = makeElectronGenerationMock({
      huggingFaceImageEnabled: true,
      huggingFaceImageModel: 'black-forest-labs/FLUX.1-schnell',
      submit: { success: true, jobId: 'job-should-not-run' },
    });

    await runWorkflowExecution({
      workflowId: 'image-generation-baseline',
      electron,
      store: useAppStore,
      pollIntervalMs: 0,
    });

    expect(electron.generation.generateImage).not.toHaveBeenCalled();
    const runtime = useAppStore.getState().workflowRuntimeById['image-generation-baseline'];
    expect(
      runtime?.issues.some(
        (issue) =>
          issue.severity === 'error' &&
          issue.code === 'provider-config' &&
          /Hub-hosted/.test(issue.message),
      ),
    ).toBe(true);
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

  it('routes still-image workflow execution through the HuggingFace image model while offline', async () => {
    useAppStore.setState((state) => ({
      systemInfo: {
        ...state.systemInfo,
        backendConnected: false,
      },
    }));

    const electron = makeElectronGenerationMock({
      huggingFaceImageEnabled: true,
      huggingFaceImageModel: 'black-forest-labs/FLUX.1-schnell',
      submit: { success: true, jobId: 'job-hf-1' },
      statuses: [
        {
          job_id: 'job-hf-1',
          status: 'completed',
          type: 'image',
          created_at: '2026-04-24T20:00:00.000Z',
          completed_at: '2026-04-24T20:00:05.000Z',
          progress: 100,
          result: {
            images: ['/outputs/job-hf-1/image-1.png'],
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

    // The local checkpoint id must be replaced by the account's HuggingFace
    // image model so the main handler never forwards a local id into HF.
    expect(electron.generation.generateImage).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'black-forest-labs/FLUX.1-schnell',
      }),
    );
    expect(useAppStore.getState().workflowRecords[0].runHistory[0]).toMatchObject({
      status: 'complete',
    });
  });

  it('blocks workflow execution with a config error when HuggingFace is selected but no token is stored', async () => {
    useAppStore.setState((state) => ({
      systemInfo: {
        ...state.systemInfo,
        backendConnected: false,
      },
    }));

    const electron = makeElectronGenerationMock({
      huggingFaceImageEnabled: true,
      huggingFaceTokenStored: false,
      huggingFaceImageModel: 'black-forest-labs/FLUX.1-schnell',
    });

    await runWorkflowExecution({
      workflowId: 'image-generation-baseline',
      electron,
      store: useAppStore,
      pollIntervalMs: 0,
    });

    // A hosted route bypasses the backend-offline error; a missing token must
    // surface as a provider-config error, not a false backend-unavailable one.
    expect(electron.generation.generateImage).not.toHaveBeenCalled();
    const runtime = useAppStore.getState().workflowRuntimeById['image-generation-baseline'];
    expect(runtime?.issues.some((issue) => issue.code === 'provider-config')).toBe(true);
    expect(runtime?.issues.some((issue) => issue.code === 'backend-unavailable')).toBe(false);
  });

  it('polls beyond 120 attempts when on the OpenRouter still-image route', async () => {
    useAppStore.setState((state) => ({
      systemInfo: {
        ...state.systemInfo,
        backendConnected: false,
      },
    }));

    const processingStatuses: Array<Record<string, unknown>> = Array.from({ length: 130 }, () => ({
      job_id: 'job-openrouter-slow',
      status: 'processing',
      type: 'image',
      created_at: '2026-04-24T20:00:00.000Z',
      progress: 40,
    }));
    const completedStatus: Record<string, unknown> = {
      job_id: 'job-openrouter-slow',
      status: 'completed',
      type: 'image',
      created_at: '2026-04-24T20:00:00.000Z',
      completed_at: '2026-04-24T20:02:30.000Z',
      progress: 100,
      result: {
        images: ['/outputs/job-openrouter-slow/image-1.png'],
      },
    };

    const electron = makeElectronGenerationMock({
      openRouterImageEnabled: true,
      submit: { success: true, jobId: 'job-openrouter-slow' },
      statuses: [...processingStatuses, completedStatus],
    });

    await runWorkflowExecution({
      workflowId: 'image-generation-baseline',
      electron,
      store: useAppStore,
      pollIntervalMs: 0,
    });

    expect(electron.generation.getStatus).toHaveBeenCalledTimes(131);
    expect(useAppStore.getState().workflowRecords[0].runHistory[0]).toMatchObject({
      status: 'complete',
    });
  });

  it('bails before submitting any HTTP call when the signal is pre-aborted', async () => {
    const electron = makeElectronGenerationMock({
      submit: { success: true, jobId: 'never-submitted' },
      statuses: [],
    });
    const controller = new AbortController();
    controller.abort();

    await runWorkflowExecution({
      workflowId: 'image-generation-baseline',
      electron,
      store: useAppStore,
      pollIntervalMs: 0,
      signal: controller.signal,
    });

    expect(electron.generation.generateImage).not.toHaveBeenCalled();
    expect(electron.generation.getStatus).not.toHaveBeenCalled();
    const runtime = useAppStore.getState().workflowRuntimeById['image-generation-baseline'];
    expect(runtime?.lastFailureMessage).toMatch(/cancel|abort/i);
  });

  it('stops polling when the signal aborts mid-flight', async () => {
    const processingStatuses: Array<Record<string, unknown>> = Array.from({ length: 200 }, () => ({
      job_id: 'job-aborted',
      status: 'processing',
      type: 'image',
      created_at: '2026-04-24T20:00:00.000Z',
      progress: 40,
    }));

    const controller = new AbortController();
    let getStatusCalls = 0;
    const electron = makeElectronGenerationMock({
      submit: { success: true, jobId: 'job-aborted' },
      statuses: processingStatuses,
    });
    // Override getStatus to abort after the third call
    const baseGetStatus = electron.generation.getStatus;
    electron.generation.getStatus = vi.fn().mockImplementation(async (jobId: string) => {
      getStatusCalls += 1;
      if (getStatusCalls === 3) {
        controller.abort();
      }
      return baseGetStatus(jobId);
    });

    await runWorkflowExecution({
      workflowId: 'image-generation-baseline',
      electron,
      store: useAppStore,
      pollIntervalMs: 0,
      signal: controller.signal,
    });

    // Should stop within a poll iteration of the abort - well below 200
    expect(electron.generation.getStatus.mock.calls.length).toBeLessThan(10);
    const runtime = useAppStore.getState().workflowRuntimeById['image-generation-baseline'];
    expect(runtime?.lastFailureMessage).toMatch(/cancel|abort/i);
  });

  it('calls electron.generation.cancel(jobId) when signal aborts mid-poll', async () => {
    const processingStatuses: Array<Record<string, unknown>> = Array.from({ length: 200 }, () => ({
      job_id: 'job-cancel-mid',
      status: 'processing',
      type: 'image',
      created_at: '2026-04-24T20:00:00.000Z',
      progress: 40,
    }));

    const controller = new AbortController();
    let getStatusCalls = 0;
    const electron = makeElectronGenerationMock({
      submit: { success: true, jobId: 'job-cancel-mid' },
      statuses: processingStatuses,
    });
    const baseGetStatus = electron.generation.getStatus;
    electron.generation.getStatus = vi.fn().mockImplementation(async (jobId: string) => {
      getStatusCalls += 1;
      if (getStatusCalls === 2) {
        controller.abort();
      }
      return baseGetStatus(jobId);
    });

    await runWorkflowExecution({
      workflowId: 'image-generation-baseline',
      electron,
      store: useAppStore,
      pollIntervalMs: 0,
      signal: controller.signal,
    });

    expect(electron.generation.cancel).toHaveBeenCalledWith('job-cancel-mid');
  });

  it('does not let a notify throw shadow the original failure message', async () => {
    const electron = makeElectronGenerationMock({
      submitError: new Error('Backend offline'),
    });
    // Notification service throws (e.g., toast layer down, perms denied).
    electron.notifications.notify = vi.fn().mockRejectedValue(new Error('notify exploded'));

    // Should resolve cleanly (no thrown 'notify exploded'), and the runtime
    // state should hold the ORIGINAL failure -- not the notify error.
    await expect(
      runWorkflowExecution({
        workflowId: 'image-generation-baseline',
        electron,
        store: useAppStore,
        pollIntervalMs: 0,
      }),
    ).resolves.toBeUndefined();

    const runtime = useAppStore.getState().workflowRuntimeById['image-generation-baseline'];
    expect(runtime?.lastFailureMessage).toBe('Backend offline');
  });

  it('drops unknown statuses from getStatus rather than writing them to the store', async () => {
    // A future-version backend returning a status outside the JobStatus enum
    // must not corrupt the store. Runner should keep going and reach the
    // real terminal status without ever writing 'paused' to the job record.
    const electron = makeElectronGenerationMock({
      submit: { success: true, jobId: 'job-unknown-status' },
      statuses: [
        {
          job_id: 'job-unknown-status',
          status: 'paused' as unknown as 'processing',
          type: 'image',
          created_at: '2026-04-24T20:00:00.000Z',
          progress: 33,
        },
        {
          job_id: 'job-unknown-status',
          status: 'completed',
          type: 'image',
          created_at: '2026-04-24T20:00:00.000Z',
          completed_at: '2026-04-24T20:00:05.000Z',
          progress: 100,
          result: {
            images: ['/outputs/job-unknown-status/image-1.png'],
          },
        },
      ],
    });
    // Capture every status the store held during the run so we can assert
    // 'paused' never appeared on its way to the terminal state.
    const seenStatuses = new Set<string>();
    const baseGetStatus = electron.generation.getStatus;
    electron.generation.getStatus = vi.fn().mockImplementation(async (jobId: string) => {
      const before = useAppStore.getState().activeJobs.find((entry) => entry.id === jobId);
      if (before) seenStatuses.add(before.status);
      const next = await baseGetStatus(jobId);
      const after = useAppStore.getState().activeJobs.find((entry) => entry.id === jobId);
      if (after) seenStatuses.add(after.status);
      return next;
    });

    await runWorkflowExecution({
      workflowId: 'image-generation-baseline',
      electron,
      store: useAppStore,
      pollIntervalMs: 0,
    });

    expect(seenStatuses.has('paused')).toBe(false);
    const job = useAppStore.getState().completedJobs.find((entry) => entry.id === 'job-unknown-status');
    expect(job?.status).toBe('completed');
  });

  it('does NOT call cancel when signal is pre-aborted (no jobId yet)', async () => {
    const electron = makeElectronGenerationMock({
      submit: { success: true, jobId: 'never-submitted' },
      statuses: [],
    });
    const controller = new AbortController();
    controller.abort();

    await runWorkflowExecution({
      workflowId: 'image-generation-baseline',
      electron,
      store: useAppStore,
      pollIntervalMs: 0,
      signal: controller.signal,
    });

    // Pre-abort bails before submit, so we have no jobId to cancel.
    expect(electron.generation.cancel).not.toHaveBeenCalled();
  });
});

function makeElectronGenerationMock(options: {
  submit?: { success: boolean; jobId?: string; error?: string };
  submitError?: Error;
  statuses?: Array<Record<string, unknown>>;
  openRouterImageEnabled?: boolean;
  huggingFaceImageEnabled?: boolean;
  huggingFaceImageModel?: string;
  huggingFaceTokenStored?: boolean;
}) {
  const imageGenerationProvider = options.huggingFaceImageEnabled
    ? 'huggingface'
    : options.openRouterImageEnabled
      ? 'openrouter'
      : 'local';
  const huggingFaceImageModel = options.huggingFaceImageEnabled
    ? options.huggingFaceImageModel ?? 'black-forest-labs/FLUX.1-schnell'
    : '';
  const huggingFaceTokenStored =
    options.huggingFaceTokenStored ?? options.huggingFaceImageEnabled ?? false;
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
              imageGenerationProvider,
              videoGenerationProvider: 'local',
              openRouterImageModel: options.openRouterImageEnabled ? 'google/gemini-2.5-flash-image' : '',
              huggingFaceModel: '',
              huggingFaceImageModel,
              huggingFaceVideoModel: '',
              fallbackProvider: null,
            },
            openRouter: {
              apiKeyStored: options.openRouterImageEnabled ?? false,
              keyLabel: options.openRouterImageEnabled ? 'Primary Key' : null,
              lastValidatedAt: options.openRouterImageEnabled ? '2026-04-24T00:00:00.000Z' : null,
            },
            huggingFace: {
              tokenStored: huggingFaceTokenStored,
              keyLabel: huggingFaceTokenStored ? 'HF Key' : null,
              lastValidatedAt: null,
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
      cancel: vi.fn().mockResolvedValue({ success: true }),
    },
    notifications: {
      notify,
    },
  };
}
