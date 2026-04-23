import type { StoreApi, UseBoundStore } from 'zustand';

import type { AppState } from '@/store/appStore.types';
import { useAppStore } from '@/store/appStore';
import type { JobStatus, GenerationParams } from '@/types/electron';
import { resolveWorkflowGenerationRequest } from './resolveWorkflowGenerationRequest';
import { validateWorkflowExecution } from './validateWorkflowExecution';

type WorkflowStore = UseBoundStore<StoreApi<AppState>>;

interface WorkflowExecutionElectronApi {
  app: {
    getPath: (name: 'userData') => Promise<string>;
  };
  settings: {
    get: () => Promise<{
      defaultOutputPath: string;
    }>;
  };
  generation: {
    generateImage: (params: GenerationParams) => Promise<{ success: boolean; jobId?: string; error?: string }>;
    getStatus: (jobId: string) => Promise<JobStatus>;
  };
  notifications: {
    notify: (
      type: 'generation_complete' | 'generation_failed',
      payload: { title: string; body: string }
    ) => Promise<{ success: boolean; skipped?: boolean }>;
  };
}

interface RunWorkflowExecutionOptions {
  workflowId: string;
  electron?: WorkflowExecutionElectronApi;
  store?: WorkflowStore;
  pollIntervalMs?: number;
}

export async function runWorkflowExecution({
  workflowId,
  electron = window.electron,
  store = useAppStore,
  pollIntervalMs = 500,
}: RunWorkflowExecutionOptions) {
  const state = store.getState();
  const workflow = state.workflowRecords.find((entry) => entry.id === workflowId);
  if (!workflow) {
    return;
  }

  const context = buildWorkflowExecutionContext(state);
  const validation = validateWorkflowExecution(workflow, context);

  if (!state.systemInfo.backendConnected) {
    validation.issues = [
      ...validation.issues,
      {
        severity: 'error',
        code: 'backend-unavailable',
        message: 'The AI backend is not running.',
      },
    ];
  }

  state.setWorkflowRuntimeState(workflowId, {
    issues: validation.issues,
    lastResolvedRequest: validation.summary,
    lastFailureMessage: null,
  });

  if (validation.issues.some((issue) => issue.severity === 'error') || !validation.summary) {
    state.setWorkflowStatus(workflowId, 'ready');
    return;
  }

  const resolution = resolveWorkflowGenerationRequest(workflow, context);
  if (!resolution.request || resolution.issues.some((issue) => issue.severity === 'error')) {
    state.setWorkflowRuntimeState(workflowId, {
      issues: resolution.issues,
      lastResolvedRequest: resolution.summary,
    });
    state.setWorkflowStatus(workflowId, 'ready');
    return;
  }

  const runId = `run-${crypto.randomUUID()}`;
  state.setWorkflowStatus(workflowId, 'running');
  state.setWorkflowRuntimeState(workflowId, {
    activeJobId: null,
    lastRunId: runId,
    lastFailureMessage: null,
    lastResolvedRequest: resolution.summary,
  });
  state.recordWorkflowRun(workflowId, {
    id: runId,
    status: 'queued',
    summary: 'Queued workflow run.',
  });

  try {
    const appSettings = await electron.settings.get();
    const userDataPath = await electron.app.getPath('userData');
    const outputRoot = resolveOutputRoot(appSettings.defaultOutputPath, userDataPath);
    const scheduler = context.generationDraft?.scheduler ?? state.advancedGeneration.scheduler;

    const submitResult = await electron.generation.generateImage({
      ...resolution.request,
      ...(scheduler ? { scheduler } : {}),
    });

    if (!submitResult.success || !submitResult.jobId) {
      throw new Error(submitResult.error || 'Workflow execution failed to start.');
    }

    const jobId = submitResult.jobId;
    state.addJob({
      id: jobId,
      type: 'image',
      status: 'pending',
      progress: 0,
      params: {
        ...resolution.request,
        ...(scheduler ? { scheduler } : {}),
        output_root: outputRoot,
        workflowId,
        source: 'workflow',
      },
      createdAt: new Date(),
    });
    state.setWorkflowRuntimeState(workflowId, { activeJobId: jobId });

    let finalStatus: JobStatus | null = null;
    for (let attempt = 0; attempt < 120; attempt += 1) {
      const nextStatus = await electron.generation.getStatus(jobId);
      if (!nextStatus) {
        throw new Error('Workflow execution returned no job status.');
      }

      if (nextStatus.status === 'completed' || nextStatus.status === 'failed' || nextStatus.status === 'cancelled') {
        finalStatus = nextStatus;
        break;
      }

      state.updateJob(jobId, {
        status: nextStatus.status,
        progress: nextStatus.progress ?? 0,
      });

      if (pollIntervalMs > 0) {
        await delay(pollIntervalMs);
      }
    }

    if (!finalStatus) {
      throw new Error('Workflow execution timed out while waiting for the generation job.');
    }

    if (finalStatus.status === 'completed') {
      const completedAt = finalStatus.completed_at ? new Date(finalStatus.completed_at) : new Date();

      state.updateJob(jobId, {
        status: 'completed',
        progress: finalStatus.progress ?? 100,
        result: finalStatus.result,
        error: finalStatus.error,
        completedAt,
      });

      const job = store.getState().completedJobs.find((entry) => entry.id === jobId);
      const params = {
        ...(job?.params ?? {}),
        output_root: outputRoot,
      };

      state.syncAssetsFromJobStatus({
        ...finalStatus,
        params,
      });

      const outputAssetId = getOutputAssetId(finalStatus);
      if (outputAssetId) {
        state.setActiveViewerItemId(outputAssetId);
        state.setCenterView('viewer');
      }

      await electron.notifications.notify('generation_complete', {
        title: 'Workflow Ready',
        body: resolution.summary.prompt.slice(0, 120) || 'Workflow completed successfully.',
      });

      state.recordWorkflowRun(workflowId, {
        id: runId,
        status: 'complete',
        summary: buildCompletionSummary(finalStatus),
        ...(outputAssetId ? { outputAssetId } : {}),
      });
      state.setWorkflowStatus(workflowId, 'complete');
      state.setWorkflowRuntimeState(workflowId, {
        activeJobId: null,
        lastFailureMessage: null,
      });
      return;
    }

    const failureMessage =
      finalStatus.error ||
      (finalStatus.status === 'cancelled' ? 'Workflow generation was cancelled.' : 'Workflow generation failed.');
    throw new Error(failureMessage);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Workflow execution failed.';
    const activeJobId = store.getState().workflowRuntimeById[workflowId]?.activeJobId;
    if (activeJobId) {
      state.updateJob(activeJobId, {
        status: 'failed',
        error: message,
        completedAt: new Date(),
      });
    }
    state.recordWorkflowRun(workflowId, {
      id: runId,
      status: 'failed',
      summary: message,
    });
    state.setWorkflowStatus(workflowId, 'ready');
    state.setWorkflowRuntimeState(workflowId, {
      activeJobId: null,
      lastFailureMessage: message,
    });

    await electron.notifications.notify('generation_failed', {
      title: 'Workflow Failed',
      body: message,
    });
  }
}

function buildWorkflowExecutionContext(state: AppState) {
  const activeProject = state.projects.find((project) => project.id === state.activeProjectId);
  const activeScene = activeProject?.scenes.find((scene) => scene.id === state.activeSceneId);

  return {
    activeScenePrompt: activeScene?.prompt ?? null,
    activeSceneNegativePrompt: activeScene?.negativePrompt ?? null,
    generationDraft: state.generationDraft,
    availableModels: state.availableModels,
  };
}

function resolveOutputRoot(defaultOutputPath: string, userDataPath: string) {
  return (defaultOutputPath || `${userDataPath.replace(/\\/g, '/')}/outputs`).replace(/\\/g, '/');
}

function getOutputAssetId(status: JobStatus) {
  const outputPath =
    status.type === 'video' ? status.result?.video : status.result?.images?.[0];

  return outputPath ? `${status.job_id}::${outputPath}` : null;
}

function buildCompletionSummary(status: JobStatus) {
  const imageCount = status.result?.images?.length ?? 0;
  if (imageCount > 0) {
    return `Generated ${imageCount} image${imageCount === 1 ? '' : 's'}`;
  }

  if (status.result?.video) {
    return 'Generated 1 video';
  }

  return 'Workflow completed successfully.';
}

function delay(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
