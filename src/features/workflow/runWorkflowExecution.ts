import type { StoreApi, UseBoundStore } from 'zustand';

import type { AppState } from '@/store/appStore.types';
import { useAppStore } from '@/store/appStore';
import type { JobStatus, GenerationParams, UserAccountsSnapshot } from '@/types/electron';
import {
  getActiveUserAccount,
  isHostedStillImageRoute,
  resolveStillImageRoute,
} from '@/features/accounts/providerRouting';
import type { WorkflowExecutionIssue, WorkflowExecutionSummary, WorkflowGenerationRequest } from '@/types/workflow';
import { resolveWorkflowGenerationRequest } from './resolveWorkflowGenerationRequest';
import { validateWorkflowExecution } from './validateWorkflowExecution';

type WorkflowStore = UseBoundStore<StoreApi<AppState>>;

/**
 * Poll budgets: max wall time before the runner gives up waiting on the
 * job. Multiplied against pollIntervalMs (default 500ms) inside the poll
 * loop, so the local-backend budget is ~60s and the hosted budget is
 * ~120s. Hosted routes (OpenRouter, HuggingFace) get the longer ceiling
 * because off-device image generation has higher tail latency than the
 * local CUDA path.
 */
const MAX_POLL_ATTEMPTS_LOCAL_BACKEND = 120;
const MAX_POLL_ATTEMPTS_HOSTED = 240;

interface WorkflowExecutionElectronApi {
  app: {
    getPath: (name: 'userData') => Promise<string>;
  };
  settings: {
    get: () => Promise<{
      defaultOutputPath: string;
    }>;
  };
  accounts: {
    list: () => Promise<UserAccountsSnapshot>;
  };
  generation: {
    generateImage: (params: GenerationParams) => Promise<{ success: boolean; jobId?: string; error?: string }>;
    getStatus: (jobId: string) => Promise<JobStatus>;
    cancel: (jobId: string) => Promise<{ success: boolean; error?: string }>;
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
  /**
   * Optional AbortSignal. When fired, polling stops promptly and the run is
   * recorded as a failure with a cancellation message. Pre-aborted signals
   * bail before any HTTP submission.
   */
  signal?: AbortSignal;
}

export async function runWorkflowExecution({
  workflowId,
  electron = window.electron,
  store = useAppStore,
  pollIntervalMs = 500,
  signal,
}: RunWorkflowExecutionOptions) {
  const state = store.getState();
  const workflow = state.workflowRecords.find((entry) => entry.id === workflowId);
  if (!workflow) {
    return;
  }

  // Pre-aborted signal: skip everything and record the cancellation so the
  // workflow runtime reflects the user's intent immediately.
  if (signal?.aborted) {
    state.setWorkflowRuntimeState(workflowId, {
      activeJobId: null,
      lastFailureMessage: 'Workflow execution was cancelled.',
    });
    return;
  }

  const accountSnapshot = await electron.accounts.list().catch(() => null);
  const stillImageRoute = resolveStillImageRoute(getActiveUserAccount(accountSnapshot));

  const context = buildWorkflowExecutionContext(state);
  const validation = validateWorkflowExecution(workflow, context);
  const routedValidation = applyWorkflowExecutionRoute({
    issues: validation.issues,
    summary: validation.summary,
    stillImageRoute,
    backendConnected: state.systemInfo.backendConnected,
  });

  state.setWorkflowRuntimeState(workflowId, {
    issues: routedValidation.issues,
    lastResolvedRequest: routedValidation.summary,
    lastFailureMessage: null,
  });

  if (routedValidation.issues.some((issue) => issue.severity === 'error') || !routedValidation.summary) {
    state.setWorkflowStatus(workflowId, 'ready');
    return;
  }

  const resolution = resolveWorkflowGenerationRequest(workflow, context);
  const routedResolution = applyWorkflowExecutionRoute({
    issues: resolution.issues,
    request: resolution.request,
    summary: resolution.summary,
    stillImageRoute,
    backendConnected: state.systemInfo.backendConnected,
  });

  if (!routedResolution.request || routedResolution.issues.some((issue) => issue.severity === 'error')) {
    state.setWorkflowRuntimeState(workflowId, {
      issues: routedResolution.issues,
      lastResolvedRequest: routedResolution.summary,
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
    lastResolvedRequest: routedResolution.summary,
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
      ...routedResolution.request,
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
        ...routedResolution.request,
        ...(scheduler ? { scheduler } : {}),
        output_root: outputRoot,
        workflowId,
        source: 'workflow',
      },
      createdAt: new Date(),
    });
    state.setWorkflowRuntimeState(workflowId, { activeJobId: jobId });

    const maxPollAttempts = isHostedStillImageRoute(stillImageRoute)
      ? MAX_POLL_ATTEMPTS_HOSTED
      : MAX_POLL_ATTEMPTS_LOCAL_BACKEND;

    let finalStatus: JobStatus | null = null;
    for (let attempt = 0; attempt < maxPollAttempts; attempt += 1) {
      if (signal?.aborted) {
        throw new Error('Workflow execution was cancelled.');
      }
      const nextStatus = await electron.generation.getStatus(jobId);
      if (!nextStatus) {
        throw new Error('Workflow execution returned no job status.');
      }

      if (nextStatus.status === 'completed' || nextStatus.status === 'failed' || nextStatus.status === 'cancelled') {
        finalStatus = nextStatus;
        break;
      }

      // Defensive enum guard: a future-version backend could return a status
      // outside the JobStatus union. Coerce anything other than the two
      // expected non-terminal values to 'processing' so the store never holds
      // an unknown literal that downstream code does not handle.
      const safeStatus: 'pending' | 'processing' =
        nextStatus.status === 'pending' || nextStatus.status === 'processing'
          ? nextStatus.status
          : 'processing';
      state.updateJob(jobId, {
        status: safeStatus,
        progress: nextStatus.progress ?? 0,
      });

      if (pollIntervalMs > 0) {
        await delay(pollIntervalMs, signal);
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

      // Swallow notify errors so a failing toast layer cannot turn a
      // successful run into a thrown rejection at the end of the function.
      await electron.notifications
        .notify('generation_complete', {
          title: 'Workflow Ready',
          body: routedResolution.summary?.prompt.slice(0, 120) || 'Workflow completed successfully.',
        })
        .catch(() => undefined);

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
      // Tell the backend to stop work when the renderer aborted mid-poll;
      // otherwise the job keeps running and consumes GPU until it completes
      // on its own. Swallow cancel errors so the original failure surfaces.
      if (signal?.aborted) {
        await electron.generation.cancel(activeJobId).catch(() => undefined);
      }
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

    // Swallow notify errors so a failing toast layer cannot replace the
    // real failureMessage on its way out of this function.
    await electron.notifications
      .notify('generation_failed', {
        title: 'Workflow Failed',
        body: message,
      })
      .catch(() => undefined);
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

export function resolveOutputRoot(defaultOutputPath: string, userDataPath: string) {
  return (defaultOutputPath || `${userDataPath.replace(/\\/g, '/')}/outputs`).replace(/\\/g, '/');
}

export function getOutputAssetId(status: JobStatus) {
  const outputPath =
    status.type === 'video' ? status.result?.video : status.result?.images?.[0];

  return outputPath ? `${status.job_id}::${outputPath}` : null;
}

export function buildCompletionSummary(status: JobStatus) {
  const imageCount = status.result?.images?.length ?? 0;
  if (imageCount > 0) {
    return `Generated ${imageCount} image${imageCount === 1 ? '' : 's'}`;
  }

  if (status.result?.video) {
    return 'Generated 1 video';
  }

  return 'Workflow completed successfully.';
}

export function delay(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('delay aborted'));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new Error('delay aborted'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function applyWorkflowExecutionRoute({
  issues,
  request,
  summary,
  stillImageRoute,
  backendConnected,
}: {
  issues: WorkflowExecutionIssue[];
  request?: WorkflowGenerationRequest | null;
  summary?: WorkflowExecutionSummary | null;
  stillImageRoute: ReturnType<typeof resolveStillImageRoute>;
  backendConnected: boolean;
}) {
  let nextIssues = [...issues];
  let nextRequest = request ?? null;
  let nextSummary = summary ?? null;

  // Only local routes need the backend. Hosted routes (OpenRouter, HuggingFace)
  // run off-device, so a backend-offline state must not block them.
  const hostedRoute = isHostedStillImageRoute(stillImageRoute);

  if (!backendConnected && !hostedRoute) {
    nextIssues = appendWorkflowIssue(nextIssues, {
      severity: 'error',
      code: 'backend-unavailable',
      message: 'The AI backend is not running.',
    });
  }

  if (hostedRoute) {
    if (stillImageRoute.error) {
      // Misconfigured hosted route: surface the config error instead of
      // letting an unresolved/local model id reach the hosted dispatcher.
      nextIssues = appendWorkflowIssue(nextIssues, {
        severity: 'error',
        code: 'provider-config',
        message: stillImageRoute.error,
      });
    } else if (stillImageRoute.model) {
      // Override the request model with the account's hosted model so the main
      // handler does not forward a local checkpoint id into the hosted route.
      if (nextRequest) {
        nextRequest = {
          ...nextRequest,
          model: stillImageRoute.model,
        };
      }
      if (nextSummary) {
        nextSummary = {
          ...nextSummary,
          model: stillImageRoute.model,
        };
      }
    }
  }

  return {
    issues: nextIssues,
    request: nextRequest,
    summary: nextSummary,
  };
}

function appendWorkflowIssue(issues: WorkflowExecutionIssue[], issue: WorkflowExecutionIssue) {
  const exists = issues.some(
    (entry) =>
      entry.code === issue.code &&
      entry.message === issue.message &&
      entry.nodeId === issue.nodeId,
  );
  return exists ? issues : [...issues, issue];
}
