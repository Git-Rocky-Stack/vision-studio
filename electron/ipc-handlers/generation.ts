import crypto from 'node:crypto';
import { ipcMain, BrowserWindow } from 'electron';
import axios from 'axios';
import WebSocket from 'ws';
import { getBackendAuthToken, backendAuthHeaders } from '../services/backendAuth';
import { toSafeRendererError } from '../services/security';
import type { createOpenRouterService } from '../services/openRouter';
import type { createOutputRootService } from '../services/outputRoots';
import type { createUserAccountsService } from '../services/userAccounts';
import { submitBatch } from './submitBatch';
import { toOpenRouterRendererMessage } from './openRouterError';
import { mergeJobsByCreatedAtDesc } from './jobListing';
import { BACKEND_DOWN_MESSAGE as _BACKEND_DOWN_MESSAGE, requestBackend } from './backendRequest';
import {
  OPENROUTER_IMAGE_UNSUPPORTED_MESSAGE,
  OPENROUTER_JOB_PREFIX,
  hasUnsupportedOpenRouterImageInputs,
  isOpenRouterJobId,
  isTerminalJobStatus,
} from './openRouterImageRouting';
import { createOpenRouterImageJobStore } from './openRouterImageJobs';
import { suggestNegativePromptFromHeuristics } from './negativePromptHeuristics';
import { runOpenRouterImageJob } from './runOpenRouterImageJob';

void _BACKEND_DOWN_MESSAGE; // Re-exported by callers via './backendRequest'.

const BACKEND_URL = 'http://127.0.0.1:8000';
const WS_URL = 'ws://127.0.0.1:8000/ws';
const BATCH_SUBMISSION_CONCURRENCY = 4;

let ws: WebSocket | null = null;
let mainWindow: BrowserWindow | null = null;
let wsReconnectAttempts = 0;
const WS_BASE_DELAY = 1000; // 1s initial delay, doubles each attempt up to 30s

type UserAccountsService = ReturnType<typeof createUserAccountsService>;
type OpenRouterService = ReturnType<typeof createOpenRouterService>;
type OutputRootService = ReturnType<typeof createOutputRootService>;

let userAccountsService: UserAccountsService | null = null;
let openRouterService: OpenRouterService | null = null;
let outputRootService: OutputRootService | null = null;

const openRouterImageJobStore = createOpenRouterImageJobStore({
  emit: (channel, payload) => mainWindow?.webContents.send(channel, payload),
});

function dispatchOpenRouterImageJob(jobId: string, params: Record<string, unknown>) {
  if (!userAccountsService || !openRouterService || !outputRootService) {
    openRouterImageJobStore.patch(jobId, {
      status: 'failed',
      progress: 100,
      completed_at: new Date().toISOString(),
      error: 'OpenRouter is selected for still images, but the active account is not fully configured.',
    });
    return;
  }
  void runOpenRouterImageJob(jobId, params, {
    store: openRouterImageJobStore,
    userAccounts: userAccountsService,
    openRouter: openRouterService,
    outputRoots: outputRootService,
  });
}

export function setupGenerationHandlers(window: BrowserWindow) {
  mainWindow = window;
  connectWebSocket();
}

export function configureGenerationHandlerServices({
  userAccounts,
  openRouter,
  outputRoots,
}: {
  userAccounts: UserAccountsService;
  openRouter: OpenRouterService;
  outputRoots: OutputRootService;
}) {
  userAccountsService = userAccounts;
  openRouterService = openRouter;
  outputRootService = outputRoots;
}

function connectWebSocket() {
  ws = new WebSocket(`${WS_URL}?token=${encodeURIComponent(getBackendAuthToken())}`);

  ws.on('open', () => {
    wsReconnectAttempts = 0;
    console.log('Connected to Python backend WebSocket');
  });

  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());

      if (message.type === 'job_update') {
        mainWindow?.webContents.send('generation:progress', message);
      }
    } catch (e) {
      console.error('Failed to parse WebSocket message:', e);
    }
  });

  ws.on('close', () => {
    const delay = Math.min(WS_BASE_DELAY * Math.pow(2, wsReconnectAttempts), 30000);
    wsReconnectAttempts += 1;
    console.log(`WebSocket closed, reconnecting in ${delay}ms (attempt ${wsReconnectAttempts})...`);
    setTimeout(connectWebSocket, delay);
  });

  ws.on('error', (err) => {
    console.error('WebSocket error:', err);
  });
}

ipcMain.handle('generation:generate-image', async (_event, params) => {
  const activeAccount = userAccountsService?.getActiveAccount();
  if (activeAccount?.preferences.imageGenerationProvider === 'openrouter') {
    if (hasUnsupportedOpenRouterImageInputs(params)) {
      return {
        success: false,
        error: OPENROUTER_IMAGE_UNSUPPORTED_MESSAGE,
      };
    }

    if (!activeAccount.openRouter.apiKeyStored) {
      return {
        success: false,
        error: 'OpenRouter is selected for still images, but no API key is stored for the active account.',
      };
    }

    const requestedModel =
      (typeof params?.model === 'string' && params.model.trim()) ||
      activeAccount.preferences.openRouterImageModel.trim();
    if (!requestedModel) {
      return {
        success: false,
        error: 'Select an OpenRouter image model for the active account before generating.',
      };
    }

    const jobId = `${OPENROUTER_JOB_PREFIX}-${crypto.randomUUID()}`;
    openRouterImageJobStore.set({
      job_id: jobId,
      status: 'pending',
      progress: 0,
      type: 'image',
      created_at: new Date().toISOString(),
      params,
    });
    dispatchOpenRouterImageJob(jobId, {
      ...params,
      model: requestedModel,
      __openrouterAccountId: activeAccount.id,
    });

    return {
      success: true,
      jobId,
    };
  }

  try {
    const response = await requestBackend(() =>
      axios.post(`${BACKEND_URL}/api/generate/image`, params, { headers: backendAuthHeaders() }),
    );
    return {
      success: true,
      jobId: response.data.job_id,
    };
  } catch (error: any) {
    console.error('Image generation error:', error);
    return {
      success: false,
      error: toSafeRendererError(error, 'Image generation failed'),
    };
  }
});

ipcMain.handle('generation:generate-video', async (_event, params) => {
  try {
    const response = await requestBackend(() =>
      axios.post(`${BACKEND_URL}/api/generate/video`, params, { headers: backendAuthHeaders() }),
    );
    return {
      success: true,
      jobId: response.data.job_id,
    };
  } catch (error: any) {
    console.error('Video generation error:', error);
    return {
      success: false,
      error: toSafeRendererError(error, 'Video generation failed'),
    };
  }
});

ipcMain.handle('generation:enhance-prompt', async (_event, params) => {
  const activeAccount = userAccountsService?.getActiveAccount();
  if (activeAccount?.preferences.promptEnhancementProvider === 'openrouter') {
    const apiKey = userAccountsService?.getOpenRouterApiKey(activeAccount.id);

    if (!apiKey || !openRouterService) {
      return {
        success: false,
        error: 'OpenRouter is selected for prompt enhancement, but no API key is configured for the active account.',
      };
    }

    try {
      const result = await openRouterService.enhancePrompt({
        apiKey,
        prompt: params.prompt,
        mode: params.mode ?? 'clarify',
        model: activeAccount.preferences.openRouterModel || undefined,
      });
      return {
        success: true,
        ...result,
      };
    } catch (error: any) {
      return {
        success: false,
        error: toOpenRouterRendererMessage(error, 'Prompt enhancement failed'),
      };
    }
  }

  try {
    const response = await requestBackend(() =>
      axios.post(`${BACKEND_URL}/api/prompts/enhance`, params, { headers: backendAuthHeaders() }),
    );
    return response.data;
  } catch (error: any) {
    return {
      success: false,
      error: toSafeRendererError(error, 'Prompt enhancement failed'),
    };
  }
});

ipcMain.handle('generation:suggest-negative-prompt', async (_event, params) => {
  const activeAccount = userAccountsService?.getActiveAccount();
  if (activeAccount?.preferences.promptEnhancementProvider === 'openrouter') {
    const apiKey = userAccountsService?.getOpenRouterApiKey(activeAccount.id);

    if (!apiKey || !openRouterService) {
      return {
        success: false,
        error: 'OpenRouter is selected for prompt enhancement, but no API key is configured for the active account.',
      };
    }

    try {
      const result = await openRouterService.suggestNegativePrompt({
        apiKey,
        prompt: params.prompt,
        negativePrompt: params.negativePrompt,
        model: activeAccount.preferences.openRouterModel || undefined,
      });
      return {
        success: true,
        ...result,
        source: 'openrouter' as const,
      };
    } catch (error: any) {
      return {
        success: false,
        error: toOpenRouterRendererMessage(error, 'Negative prompt suggestion failed'),
      };
    }
  }

  try {
    return {
      success: true,
      ...suggestNegativePromptFromHeuristics({
        prompt: params.prompt,
        negativePrompt: params.negativePrompt,
      }),
    };
  } catch (error: any) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Negative prompt suggestion failed',
    };
  }
});

ipcMain.handle('generation:crop-image', async (_event, params) => {
  try {
    const response = await requestBackend(() =>
      axios.post(`${BACKEND_URL}/api/images/crop`, params, { headers: backendAuthHeaders() }),
    );
    return response.data;
  } catch (error: any) {
    return {
      success: false,
      error: toSafeRendererError(error, 'Image crop failed'),
    };
  }
});

ipcMain.handle('generation:upscale-image', async (_event, params) => {
  try {
    const response = await requestBackend(() =>
      axios.post(`${BACKEND_URL}/api/images/upscale`, params, { headers: backendAuthHeaders() }),
    );
    return response.data;
  } catch (error: any) {
    return {
      success: false,
      error: toSafeRendererError(error, 'Image upscale failed'),
    };
  }
});

ipcMain.handle('generation:extract-video-frame', async (_event, params) => {
  try {
    const response = await requestBackend(() =>
      axios.post(`${BACKEND_URL}/api/videos/extract-frame`, params, { headers: backendAuthHeaders() }),
    );
    return response.data;
  } catch (error: any) {
    return {
      success: false,
      error: toSafeRendererError(error, 'Video frame extraction failed'),
    };
  }
});

ipcMain.handle('generation:export-timeline-sequence', async (_event, params) => {
  try {
    const response = await requestBackend(() =>
      axios.post(`${BACKEND_URL}/api/timeline/export`, params, { headers: backendAuthHeaders() }),
    );
    return {
      success: true,
      jobId: response.data.job_id,
    };
  } catch (error: any) {
    console.error('Timeline export error:', error);
    return {
      success: false,
      error: toSafeRendererError(error, 'Timeline export failed'),
    };
  }
});

ipcMain.handle('generation:batch', async (_event, params) => {
  const prompts = Array.isArray(params?.prompts)
    ? params.prompts
        .filter((prompt: unknown): prompt is string => typeof prompt === 'string')
        .map((prompt: string) => prompt.trim())
        .filter(Boolean)
    : [];

  if (prompts.length === 0) {
    return {
      success: false,
      error: 'Add at least one prompt before starting a batch.',
    };
  }

  const { prompts: _prompts, ...baseParams } = params ?? {};

  const activeAccount = userAccountsService?.getActiveAccount();
  if (activeAccount?.preferences.imageGenerationProvider === 'openrouter') {
    if (hasUnsupportedOpenRouterImageInputs(params)) {
      return {
        success: false,
        error: OPENROUTER_IMAGE_UNSUPPORTED_MESSAGE,
      };
    }

    if (!activeAccount.openRouter.apiKeyStored) {
      return {
        success: false,
        error: 'OpenRouter is selected for still images, but no API key is stored for the active account.',
      };
    }

    const requestedModel =
      (typeof params?.model === 'string' && params.model.trim()) ||
      activeAccount.preferences.openRouterImageModel.trim();
    if (!requestedModel) {
      return {
        success: false,
        error: 'Select an OpenRouter still-image model for the active account before generating.',
      };
    }

    const jobIds = prompts.map((prompt) => {
      const jobId = `${OPENROUTER_JOB_PREFIX}-${crypto.randomUUID()}`;
      const jobParams = {
        ...baseParams,
        prompt,
        model: requestedModel,
      };
      openRouterImageJobStore.set({
        job_id: jobId,
        status: 'pending',
        progress: 0,
        type: 'image',
        created_at: new Date().toISOString(),
        params: jobParams,
      });
      dispatchOpenRouterImageJob(jobId, {
        ...jobParams,
        __openrouterAccountId: activeAccount.id,
      });
      return jobId;
    });

    return {
      success: true,
      jobIds,
    };
  }

  try {
    const jobIds = await submitBatch(
      prompts,
      async (prompt: string) => {
        const response = await requestBackend(() =>
          axios.post(
            `${BACKEND_URL}/api/generate/image`,
            {
              ...baseParams,
              prompt,
            },
            { headers: backendAuthHeaders() },
          ),
        );
        return response.data.job_id as string;
      },
      { concurrency: BATCH_SUBMISSION_CONCURRENCY },
    );

    return {
      success: true,
      jobIds,
    };
  } catch (error: any) {
    console.error('Batch generation error:', error);
    return {
      success: false,
      error: toSafeRendererError(error, 'Batch generation failed'),
    };
  }
});

ipcMain.handle('generation:get-status', async (_event, jobId: string) => {
  if (isOpenRouterJobId(jobId)) {
    const status = openRouterImageJobStore.getStatus(jobId);
    if (status) {
      return status;
    }
  }

  try {
    const response = await requestBackend(() =>
      axios.get(`${BACKEND_URL}/api/jobs/${jobId}`, { headers: backendAuthHeaders() }),
    );
    return response.data;
  } catch (error: any) {
    console.error('Get status error:', error);
    return {
      success: false,
      error: toSafeRendererError(error, 'Could not get generation status'),
    };
  }
});

ipcMain.handle('generation:cancel', async (_event, jobId: string) => {
  if (isOpenRouterJobId(jobId)) {
    const currentJob = openRouterImageJobStore.get(jobId);
    if (!currentJob) {
      return {
        success: false,
        error: 'OpenRouter generation job not found.',
      };
    }

    if (!isTerminalJobStatus(currentJob.status)) {
      currentJob.abortController?.abort();
      openRouterImageJobStore.patch(jobId, {
        status: 'cancelled',
        progress: currentJob.progress,
        completed_at: new Date().toISOString(),
        abortController: undefined,
      });
    }

    return {
      success: true,
    };
  }

  try {
    const response = await requestBackend(() =>
      axios.post(`${BACKEND_URL}/api/jobs/${jobId}/cancel`, undefined, { headers: backendAuthHeaders() }),
    );
    return response.data;
  } catch (error: any) {
    console.error('Cancel job error:', error);
    return {
      success: false,
      error: toSafeRendererError(error, 'Could not cancel generation'),
    };
  }
});

ipcMain.handle('generation:list-jobs', async (_event, options = {}) => {
  const { status, limit = 50 } = options as { status?: string; limit?: number };
  const localJobs = openRouterImageJobStore
    .values()
    .filter((job) => !status || job.status === status);

  try {
    let url = `${BACKEND_URL}/api/jobs?limit=${limit}`;
    if (status) {
      url += `&status=${status}`;
    }

    const response = await requestBackend(() => axios.get(url, { headers: backendAuthHeaders() }));
    const backendJobs = Array.isArray(response.data?.jobs) ? response.data.jobs : [];
    return {
      ...response.data,
      jobs: mergeJobsByCreatedAtDesc(localJobs, backendJobs, limit),
    };
  } catch (error: any) {
    if (localJobs.length > 0) {
      return {
        jobs: mergeJobsByCreatedAtDesc(localJobs, [], limit),
      };
    }

    console.error('List jobs error:', error);
    return {
      success: false,
      error: toSafeRendererError(error, 'Could not list jobs'),
    };
  }
});

// Note: 'system:get-info' is registered in electron/main.ts with richer backend-liveness handling.

ipcMain.handle('models:list', async () => {
  try {
    const response = await requestBackend(() =>
      axios.get(`${BACKEND_URL}/api/models`, { headers: backendAuthHeaders() }),
    );
    return response.data;
  } catch (error: any) {
    console.error('List models error:', error);
    return [];
  }
});

ipcMain.handle('models:download', async (_event, modelId: string) => {
  try {
    const response = await requestBackend(() =>
      axios.post(`${BACKEND_URL}/api/models/${modelId}/download`, undefined, { headers: backendAuthHeaders() }),
    );
    return response.data;
  } catch (error: any) {
    console.error('Download model error:', error);
    return {
      success: false,
      error: toSafeRendererError(error, 'Model download failed'),
    };
  }
});

ipcMain.handle('models:get-status', async (_event, modelId: string) => {
  try {
    const response = await requestBackend(() =>
      axios.get(`${BACKEND_URL}/api/models/${modelId}/status`, { headers: backendAuthHeaders() }),
    );
    return response.data;
  } catch (error: any) {
    console.error('Get model status error:', error);
    return null;
  }
});

ipcMain.handle('models:delete', async (_event, modelId: string) => {
  try {
    const response = await requestBackend(() =>
      axios.delete(`${BACKEND_URL}/api/models/${modelId}`, { headers: backendAuthHeaders() }),
    );
    return response.data;
  } catch (error: any) {
    console.error('Delete model error:', error);
    return {
      success: false,
      error: toSafeRendererError(error, 'Model delete failed'),
    };
  }
});
