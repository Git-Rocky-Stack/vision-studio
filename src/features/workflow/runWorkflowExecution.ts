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
import {
  OPENROUTER_LORA_UNSUPPORTED_MESSAGE,
  resolveHuggingFaceLoraAdapter,
  type HostedLoraRecordLike,
} from '../../../shared/hostedLoraRouting';
import { resolveWorkflowGenerationRequest } from './resolveWorkflowGenerationRequest';
import { validateWorkflowExecution } from './validateWorkflowExecution';
import { delay as delayWithAbort, watchJob } from '@/features/jobs/watchJob';

type WorkflowStore = UseBoundStore<StoreApi<AppState>>;

/**
 * The run follows its job until the backend reports a terminal status (#J1);
 * it ends early only when the backend stops answering (error budget) or the
 * job stops reporting progress for the watch's stall window.
 */
export const WORKFLOW_JOB_LOST_MESSAGE =
  'Lost connection to the AI backend while the workflow job was running. Please retry.';
export const WORKFLOW_JOB_STALLED_MESSAGE =
  'The workflow job stopped reporting progress and was given up on. Please retry.';

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
    availableModels: state.availableModels,
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
    availableModels: state.availableModels,
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

    // The shared job watch (#J1): push first, polling as the fallback, a
    // status error budget and a stall guard instead of a wall-clock ceiling.
    const watch = await watchJob({
      jobId,
      getStatus: (id) => electron.generation.getStatus(id),
      signal,
      pollIntervalMs,
      maxPollIntervalMs: pollIntervalMs,
      onUpdate: (update) => {
        state.updateJob(jobId, { status: update.status, progress: update.progress });
      },
    });

    if (watch.kind === 'aborted') {
      throw new Error('Workflow execution was cancelled.');
    }
    if (watch.kind === 'lost') {
      throw new Error(WORKFLOW_JOB_LOST_MESSAGE);
    }
    if (watch.kind === 'stalled') {
      throw new Error(WORKFLOW_JOB_STALLED_MESSAGE);
    }
    const finalStatus: JobStatus = watch.status;

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

/** Abort-aware delay; kept here for the modules that import it from this file. */
export const delay = delayWithAbort;

function applyWorkflowExecutionRoute({
  issues,
  request,
  summary,
  stillImageRoute,
  backendConnected,
  availableModels,
}: {
  issues: WorkflowExecutionIssue[];
  request?: WorkflowGenerationRequest | null;
  summary?: WorkflowExecutionSummary | null;
  stillImageRoute: ReturnType<typeof resolveStillImageRoute>;
  backendConnected: boolean;
  availableModels: HostedLoraRecordLike[];
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
    if (nextRequest?.loras?.length) {
      if (stillImageRoute.provider === 'openrouter') {
        // #42: OpenRouter's documented image API has no adapter key - the
        // LoRA decline is permanent (M6 gate).
        nextIssues = appendWorkflowIssue(nextIssues, {
          severity: 'error',
          code: 'provider-config',
          message: OPENROUTER_LORA_UNSUPPORTED_MESSAGE,
        });
      } else {
        // #42: HuggingFace runs the narrow adapter-by-model-id slice -
        // exactly one flux Hub-hosted LoRA at strength 1.0 - and everything
        // else declines with the specific unmet condition.
        const decision = resolveHuggingFaceLoraAdapter(nextRequest.loras, availableModels);
        if (decision.ok) {
          nextRequest = {
            ...nextRequest,
            __huggingFaceLoraAdapter: decision.adapterRepoId,
          };
        } else {
          nextIssues = appendWorkflowIssue(nextIssues, {
            severity: 'error',
            code: 'provider-config',
            message: decision.reason,
          });
        }
      }
    }
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
