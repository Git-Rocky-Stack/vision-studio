import crypto from 'node:crypto';
import { ipcMain, BrowserWindow } from 'electron';
import axios from 'axios';
import WebSocket from 'ws';
import {
  getBackendAuthToken,
  backendAuthHeaders,
  hfTokenHeaders,
  civitaiTokenHeaders,
} from '../services/backendAuth';
import { toSafeRendererError } from '../services/security';
import type { createOpenRouterService } from '../services/openRouter';
import type { createHuggingFaceInferenceService } from '../services/huggingfaceInference';
import type { createOutputRootService } from '../services/outputRoots';
import type { createUserAccountsService } from '../services/userAccounts';
import { submitBatch } from './submitBatch';
import { toOpenRouterRendererMessage } from './openRouterError';
import { buildPromptContext } from '../services/promptAugmentation';
import { createRetrievalClient } from '../services/retrievalClient';
import { mergeJobsByCreatedAtDesc } from './jobListing';
import { routeBackendWsMessage } from './backendWsRouting';
import { BACKEND_DOWN_MESSAGE as _BACKEND_DOWN_MESSAGE, requestBackend } from './backendRequest';
import {
  OPENROUTER_IMAGE_UNSUPPORTED_MESSAGE,
  OPENROUTER_JOB_PREFIX,
  hasUnsupportedOpenRouterImageInputs,
  isTerminalJobStatus,
} from './openRouterImageRouting';
import { createOpenRouterImageJobStore } from './openRouterImageJobs';
import { suggestNegativePromptFromHeuristics } from './negativePromptHeuristics';
import { runOpenRouterImageJob } from './runOpenRouterImageJob';
import { createHuggingFaceImageJobStore } from './huggingfaceImageJobs';
import { runHuggingFaceImageJob } from './runHuggingFaceImageJob';
import { createHuggingFaceVideoJobStore } from './huggingfaceVideoJobs';
import { runHuggingFaceVideoJob } from './runHuggingFaceVideoJob';
import {
  HUGGINGFACE_JOB_PREFIX,
  HUGGINGFACE_VIDEO_JOB_PREFIX,
  hasUnsupportedHuggingFaceImageInputs,
  isHuggingFaceVideoJobId,
  routedJobProvider,
} from './hostedImageRouting';

void _BACKEND_DOWN_MESSAGE; // Re-exported by callers via './backendRequest'.

const BACKEND_URL = 'http://127.0.0.1:8000';

// M7: AI Director retrieval client. The prompt-assist seam queries it for
// reference context; all calls degrade gracefully (buildPromptContext swallows
// failures) so the assist proceeds un-augmented when the backend is unreachable.
const retrievalClient = createRetrievalClient({ baseUrl: BACKEND_URL, authHeaders: backendAuthHeaders });
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

type HuggingFaceService = ReturnType<typeof createHuggingFaceInferenceService>;
let huggingFaceService: HuggingFaceService | null = null;

const huggingFaceImageJobStore = createHuggingFaceImageJobStore({
  emit: (channel, payload) => mainWindow?.webContents.send(channel, payload),
});

function dispatchHuggingFaceImageJob(jobId: string, params: Record<string, unknown>) {
  if (!userAccountsService || !huggingFaceService || !outputRootService) {
    huggingFaceImageJobStore.patch(jobId, {
      status: 'failed',
      progress: 100,
      completed_at: new Date().toISOString(),
      error: 'HuggingFace is selected, but the active account is not fully configured.',
    });
    return;
  }
  void runHuggingFaceImageJob(jobId, params, {
    store: huggingFaceImageJobStore,
    userAccounts: userAccountsService,
    huggingFace: huggingFaceService,
    outputRoots: outputRootService,
  });
}

const huggingFaceVideoJobStore = createHuggingFaceVideoJobStore({
  emit: (channel, payload) => mainWindow?.webContents.send(channel, payload),
});

function dispatchHuggingFaceVideoJob(jobId: string, params: Record<string, unknown>) {
  if (!userAccountsService || !huggingFaceService || !outputRootService) {
    huggingFaceVideoJobStore.patch(jobId, {
      status: 'failed',
      progress: 100,
      completed_at: new Date().toISOString(),
      error: 'HuggingFace is selected for video, but the active account is not fully configured.',
    });
    return;
  }
  void runHuggingFaceVideoJob(jobId, params, {
    store: huggingFaceVideoJobStore,
    userAccounts: userAccountsService,
    huggingFace: huggingFaceService,
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
  huggingFace,
  outputRoots,
}: {
  userAccounts: UserAccountsService;
  openRouter: OpenRouterService;
  huggingFace: HuggingFaceService;
  outputRoots: OutputRootService;
}) {
  userAccountsService = userAccounts;
  openRouterService = openRouter;
  huggingFaceService = huggingFace;
  outputRootService = outputRoots;
}

function connectWebSocket() {
  ws = new WebSocket(`${WS_URL}?token=${encodeURIComponent(getBackendAuthToken())}`);

  ws.on('open', () => {
    wsReconnectAttempts = 0;
    console.log('Connected to Python backend WebSocket');
  });

  ws.on('message', (data) => {
    routeBackendWsMessage(data.toString(), (channel, payload) => {
      mainWindow?.webContents.send(channel, payload);
    });
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

ipcMain.handle(
  'workflow:run-graph',
  async (_event, params: { graph: unknown; generationType: 'image' | 'video' }) => {
    const response = await requestBackend(() =>
      axios.post(
        `${BACKEND_URL}/api/v1/comfy/run-graph`,
        { graph: params.graph, generation_type: params.generationType },
        { headers: backendAuthHeaders() }
      )
    );
    return response.data;
  }
);

ipcMain.handle('generation:generate-image', async (_event, params) => {
  const activeAccount = userAccountsService?.getActiveAccount();
  const providerOverride =
    params?.__providerOverride === 'openrouter' || params?.__providerOverride === 'huggingface'
      ? (params.__providerOverride as 'openrouter' | 'huggingface')
      : null;
  const effectiveImageProvider = providerOverride ?? activeAccount?.preferences.imageGenerationProvider;
  if (activeAccount && effectiveImageProvider === 'openrouter') {
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

  if (activeAccount && effectiveImageProvider === 'huggingface') {
    if (hasUnsupportedHuggingFaceImageInputs(params)) {
      return {
        success: false,
        error:
          'HuggingFace still-image routing supports prompt-only generations. Switch the active account back to Local for ControlNet, inpaint, or reference-image passes.',
      };
    }

    if (!activeAccount.huggingFace.tokenStored) {
      return {
        success: false,
        error: 'HuggingFace is selected for still images, but no token is stored for the active account.',
      };
    }

    const requestedModel =
      (typeof params?.model === 'string' && params.model.trim()) ||
      activeAccount.preferences.huggingFaceImageModel.trim();
    if (!requestedModel) {
      return {
        success: false,
        error: 'Select a HuggingFace image model for the active account before generating.',
      };
    }

    const jobId = `${HUGGINGFACE_JOB_PREFIX}-${crypto.randomUUID()}`;
    huggingFaceImageJobStore.set({
      job_id: jobId,
      status: 'pending',
      progress: 0,
      type: 'image',
      created_at: new Date().toISOString(),
      params,
    });
    dispatchHuggingFaceImageJob(jobId, {
      ...params,
      model: requestedModel,
      __huggingFaceAccountId: activeAccount.id,
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
  const activeAccount = userAccountsService?.getActiveAccount();
  const providerOverride = params?.__providerOverride === 'huggingface' ? 'huggingface' : null;
  const effectiveVideoProvider = providerOverride ?? activeAccount?.preferences.videoGenerationProvider;
  if (activeAccount && effectiveVideoProvider === 'huggingface') {
    if (!activeAccount.huggingFace.tokenStored) {
      return {
        success: false,
        error: 'HuggingFace is selected for video, but no token is stored for the active account.',
      };
    }

    const requestedModel =
      (typeof params?.model === 'string' && params.model.trim()) ||
      activeAccount.preferences.huggingFaceVideoModel.trim();
    if (!requestedModel) {
      return {
        success: false,
        error: 'Select a HuggingFace video model for the active account before generating.',
      };
    }

    const jobId = `${HUGGINGFACE_VIDEO_JOB_PREFIX}-${crypto.randomUUID()}`;
    huggingFaceVideoJobStore.set({
      job_id: jobId,
      status: 'pending',
      progress: 0,
      type: 'video',
      created_at: new Date().toISOString(),
      params,
    });
    dispatchHuggingFaceVideoJob(jobId, {
      ...params,
      model: requestedModel,
      __huggingFaceAccountId: activeAccount.id,
    });

    return {
      success: true,
      jobId,
    };
  }

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
      const promptCtx = await buildPromptContext({ prompt: params.prompt, directive: params.augment, retrievalClient });
      const result = await openRouterService.enhancePrompt({
        apiKey,
        prompt: params.prompt,
        mode: params.mode ?? 'clarify',
        model: activeAccount.preferences.openRouterModel || undefined,
        context: promptCtx.context,
      });
      return {
        success: true,
        ...result,
        provenance: promptCtx.provenance,
        contextMode: promptCtx.mode,
      };
    } catch (error: any) {
      return {
        success: false,
        error: toOpenRouterRendererMessage(error, 'Prompt enhancement failed'),
      };
    }
  }

  if (activeAccount?.preferences.promptEnhancementProvider === 'huggingface') {
    const token = userAccountsService?.getHuggingFaceToken(activeAccount.id);
    if (!token || !huggingFaceService) {
      return {
        success: false,
        error: 'HuggingFace is selected for prompt enhancement, but no token is configured for the active account.',
      };
    }

    try {
      const promptCtx = await buildPromptContext({ prompt: params.prompt, directive: params.augment, retrievalClient });
      const result = await huggingFaceService.enhancePrompt({
        token,
        prompt: params.prompt,
        mode: params.mode ?? 'clarify',
        model: activeAccount.preferences.huggingFaceModel || undefined,
        context: promptCtx.context,
      });
      return {
        success: true,
        ...result,
        provenance: promptCtx.provenance,
        contextMode: promptCtx.mode,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Prompt enhancement failed',
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
      const promptCtx = await buildPromptContext({ prompt: params.prompt, directive: params.augment, retrievalClient });
      const result = await openRouterService.suggestNegativePrompt({
        apiKey,
        prompt: params.prompt,
        negativePrompt: params.negativePrompt,
        model: activeAccount.preferences.openRouterModel || undefined,
        context: promptCtx.context,
      });
      return {
        success: true,
        ...result,
        source: 'openrouter' as const,
        provenance: promptCtx.provenance,
        contextMode: promptCtx.mode,
      };
    } catch (error: any) {
      return {
        success: false,
        error: toOpenRouterRendererMessage(error, 'Negative prompt suggestion failed'),
      };
    }
  }

  if (activeAccount?.preferences.promptEnhancementProvider === 'huggingface') {
    const token = userAccountsService?.getHuggingFaceToken(activeAccount.id);
    if (!token || !huggingFaceService) {
      return {
        success: false,
        error: 'HuggingFace is selected for prompt enhancement, but no token is configured for the active account.',
      };
    }

    try {
      const promptCtx = await buildPromptContext({ prompt: params.prompt, directive: params.augment, retrievalClient });
      const result = await huggingFaceService.suggestNegativePrompt({
        token,
        prompt: params.prompt,
        negativePrompt: params.negativePrompt,
        model: activeAccount.preferences.huggingFaceModel || undefined,
        context: promptCtx.context,
      });
      return {
        success: true,
        ...result,
        source: 'huggingface' as const,
        provenance: promptCtx.provenance,
        contextMode: promptCtx.mode,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Negative prompt suggestion failed',
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

// M7 AI Director index management. Non-fatal: a retrieval failure must never
// break the renderer, so every handler returns a safe shape on error.
ipcMain.handle('director:sync-corpus', async (_event, records) => {
  try {
    return await retrievalClient.ingest(records);
  } catch (error) {
    return { ingested: 0, skipped: 0, total: 0, error: error instanceof Error ? error.message : 'sync failed' };
  }
});

ipcMain.handle('director:ingest-record', async (_event, record) => {
  try {
    return await retrievalClient.ingest([record]);
  } catch {
    return { ingested: 0, skipped: 0, total: 0 };
  }
});

ipcMain.handle('director:clear-index', async () => {
  try {
    await retrievalClient.clearIndex();
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'clear failed' };
  }
});

ipcMain.handle('director:index-stats', async () => {
  try {
    return await retrievalClient.stats();
  } catch {
    return { count: 0, mode: 'lexical' as const };
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

    const jobIds = prompts.map((prompt: string) => {
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

  if (activeAccount?.preferences.imageGenerationProvider === 'huggingface') {
    if (hasUnsupportedHuggingFaceImageInputs(params)) {
      return {
        success: false,
        error:
          'HuggingFace still-image routing currently supports prompt-only generations. Switch the active account back to Local for ControlNet, inpaint, or reference-image passes.',
      };
    }

    if (!activeAccount.huggingFace.tokenStored) {
      return {
        success: false,
        error: 'HuggingFace is selected for still images, but no token is stored for the active account.',
      };
    }

    const requestedModel =
      (typeof params?.model === 'string' && params.model.trim()) ||
      activeAccount.preferences.huggingFaceImageModel.trim();
    if (!requestedModel) {
      return {
        success: false,
        error: 'Select a HuggingFace still-image model for the active account before generating.',
      };
    }

    const jobIds = prompts.map((prompt: string) => {
      const jobId = `${HUGGINGFACE_JOB_PREFIX}-${crypto.randomUUID()}`;
      const jobParams = {
        ...baseParams,
        prompt,
        model: requestedModel,
      };
      huggingFaceImageJobStore.set({
        job_id: jobId,
        status: 'pending',
        progress: 0,
        type: 'image',
        created_at: new Date().toISOString(),
        params: jobParams,
      });
      dispatchHuggingFaceImageJob(jobId, {
        ...jobParams,
        __huggingFaceAccountId: activeAccount.id,
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
  const provider = routedJobProvider(jobId);
  if (provider === 'openrouter') {
    const status = openRouterImageJobStore.getStatus(jobId);
    if (status) {
      return status;
    }
  }
  if (provider === 'huggingface') {
    const status = isHuggingFaceVideoJobId(jobId)
      ? huggingFaceVideoJobStore.getStatus(jobId)
      : huggingFaceImageJobStore.getStatus(jobId);
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
  const provider = routedJobProvider(jobId);
  if (provider === 'openrouter') {
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

  if (provider === 'huggingface') {
    if (isHuggingFaceVideoJobId(jobId)) {
      const currentJob = huggingFaceVideoJobStore.get(jobId);
      if (!currentJob) {
        return {
          success: false,
          error: 'HuggingFace generation job not found.',
        };
      }

      if (!isTerminalJobStatus(currentJob.status)) {
        currentJob.abortController?.abort();
        huggingFaceVideoJobStore.patch(jobId, {
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

    const currentJob = huggingFaceImageJobStore.get(jobId);
    if (!currentJob) {
      return {
        success: false,
        error: 'HuggingFace generation job not found.',
      };
    }

    if (!isTerminalJobStatus(currentJob.status)) {
      currentJob.abortController?.abort();
      huggingFaceImageJobStore.patch(jobId, {
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
  const localJobs = [
    ...openRouterImageJobStore.values(),
    ...huggingFaceImageJobStore.values(),
    ...huggingFaceVideoJobStore.values(),
  ].filter((job) => !status || job.status === status);

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

ipcMain.handle('models:get', async (_event, modelId: string) => {
  try {
    const response = await requestBackend(() =>
      axios.get(`${BACKEND_URL}/api/models/${modelId}`, { headers: backendAuthHeaders() }),
    );
    return response.data;
  } catch (error) {
    console.error('Failed to get model record:', error);
    return null;
  }
});

ipcMain.handle('models:download', async (_event, modelId: string) => {
  try {
    const response = await requestBackend(() =>
      axios.post(`${BACKEND_URL}/api/models/${modelId}/download`, undefined, {
        // The backend routes X-HF-Token to HF downloads and X-Civitai-Token to
        // CivitAI direct-URL downloads based on the model record's source.
        headers: { ...backendAuthHeaders(), ...hfTokenHeaders(), ...civitaiTokenHeaders() },
      }),
    );
    return response.data;
  } catch (error: any) {
    console.error('Download model error:', error instanceof Error ? error.message : error);
    return {
      success: false,
      error: toSafeRendererError(error, 'Model download failed'),
    };
  }
});

ipcMain.handle('models:download:pause', async (_event, modelId: string) => {
  try {
    const response = await requestBackend(() =>
      axios.post(`${BACKEND_URL}/api/models/${modelId}/download/pause`, undefined, {
        headers: backendAuthHeaders(),
      }),
    );
    return response.data;
  } catch (error: any) {
    console.error('Pause download error:', error instanceof Error ? error.message : error);
    return { success: false, error: toSafeRendererError(error, 'Pause failed') };
  }
});

ipcMain.handle('models:download:resume', async (_event, modelId: string) => {
  try {
    const response = await requestBackend(() =>
      axios.post(`${BACKEND_URL}/api/models/${modelId}/download/resume`, undefined, {
        headers: { ...backendAuthHeaders(), ...hfTokenHeaders(), ...civitaiTokenHeaders() },
      }),
    );
    return response.data;
  } catch (error: any) {
    console.error('Resume download error:', error instanceof Error ? error.message : error);
    return { success: false, error: toSafeRendererError(error, 'Resume failed') };
  }
});

ipcMain.handle('models:download:cancel', async (_event, modelId: string) => {
  try {
    const response = await requestBackend(() =>
      axios.post(`${BACKEND_URL}/api/models/${modelId}/download/cancel`, undefined, {
        headers: backendAuthHeaders(),
      }),
    );
    return response.data;
  } catch (error: any) {
    console.error('Cancel download error:', error instanceof Error ? error.message : error);
    return { success: false, error: toSafeRendererError(error, 'Cancel failed') };
  }
});

ipcMain.handle('models:downloads:list', async () => {
  try {
    const response = await requestBackend(() =>
      axios.get(`${BACKEND_URL}/api/models/downloads`, { headers: backendAuthHeaders() }),
    );
    return response.data;
  } catch (error: any) {
    console.error('List downloads error:', error instanceof Error ? error.message : error);
    return [];
  }
});

// Poll-based subscribe (mirrors the generation job-poll model): the renderer
// calls this on an interval to get the current queue snapshot. A push channel
// can replace this later without changing the renderer contract.
ipcMain.handle('models:downloads:subscribe', async () => {
  try {
    const response = await requestBackend(() =>
      axios.get(`${BACKEND_URL}/api/models/downloads`, { headers: backendAuthHeaders() }),
    );
    return response.data;
  } catch (error: any) {
    console.error('Subscribe downloads error:', error instanceof Error ? error.message : error);
    return [];
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

ipcMain.handle('models:import', async (_event, path: string, layoutHint: string) => {
  try {
    const response = await requestBackend(() =>
      axios.post(`${BACKEND_URL}/api/models/import`, { path, layout_hint: layoutHint }, {
        headers: backendAuthHeaders(),
      }),
    );
    return response.data;
  } catch (error: any) {
    console.error('Import library root error:', error);
    return {
      success: false,
      error: toSafeRendererError(error, 'Library root import failed'),
    };
  }
});

ipcMain.handle('models:scan', async () => {
  try {
    const response = await requestBackend(() =>
      axios.post(`${BACKEND_URL}/api/models/scan`, undefined, { headers: backendAuthHeaders() }),
    );
    return response.data;
  } catch (error: any) {
    console.error('Library scan error:', error);
    return {
      success: false,
      error: toSafeRendererError(error, 'Library scan failed'),
    };
  }
});

ipcMain.handle('models:libraries:list', async () => {
  try {
    const response = await requestBackend(() =>
      axios.get(`${BACKEND_URL}/api/models/libraries`, { headers: backendAuthHeaders() }),
    );
    return response.data;
  } catch (error: any) {
    console.error('List library roots error:', error);
    return [];
  }
});

ipcMain.handle('models:libraries:remove', async (_event, rootId: string) => {
  try {
    const response = await requestBackend(() =>
      axios.delete(`${BACKEND_URL}/api/models/libraries/${encodeURIComponent(rootId)}`, {
        headers: backendAuthHeaders(),
      }),
    );
    return response.data;
  } catch (error: any) {
    console.error('Remove library root error:', error);
    return {
      success: false,
      error: toSafeRendererError(error, 'Library root removal failed'),
    };
  }
});

ipcMain.handle(
  'models:search',
  async (_event, query: string, source: 'hf' | 'civitai', page: number, nsfw: boolean) => {
    try {
      const response = await requestBackend(() =>
        axios.get(`${BACKEND_URL}/api/models/search`, {
          params: { q: query, source, page, nsfw },
          headers: { ...backendAuthHeaders(), ...hfTokenHeaders(), ...civitaiTokenHeaders() },
        }),
      );
      return response.data;
    } catch (error: any) {
      // Message only: the raw AxiosError carries token-bearing request
      // headers in config.headers and must never reach the log.
      console.error('Model search error:', error instanceof Error ? error.message : error);
      return {
        source,
        query,
        page,
        results: [],
        offline: true,
        warning: toSafeRendererError(error, 'Model search failed'),
      };
    }
  },
);

ipcMain.handle(
  'models:consent',
  async (_event, modelId: string, kind: 'pickle' | 'trust_remote_code', granted: boolean) => {
    try {
      const response = await requestBackend(() =>
        axios.post(
          `${BACKEND_URL}/api/models/consent`,
          { model_id: modelId, kind, granted },
          { headers: backendAuthHeaders() },
        ),
      );
      return response.data;
    } catch (error: any) {
      console.error('Model consent error:', error instanceof Error ? error.message : error);
      return { success: false, error: toSafeRendererError(error, 'Consent update failed') };
    }
  },
);

ipcMain.handle('models:convert', async (_event, modelId: string) => {
  try {
    const response = await requestBackend(() =>
      axios.post(
        `${BACKEND_URL}/api/models/${encodeURIComponent(modelId)}/convert-safetensors`,
        undefined,
        { headers: backendAuthHeaders() },
      ),
    );
    return response.data;
  } catch (error: any) {
    console.error('Model convert error:', error instanceof Error ? error.message : error);
    return { success: false, error: toSafeRendererError(error, 'Conversion failed') };
  }
});

ipcMain.handle('models:libraries:detect', async () => {
  try {
    const response = await requestBackend(() =>
      axios.get(`${BACKEND_URL}/api/models/libraries/detect`, { headers: backendAuthHeaders() }),
    );
    return response.data;
  } catch (error: any) {
    console.error('Detect library roots error:', error);
    return [];
  }
});

ipcMain.handle('hardware:get', async () => {
  try {
    const response = await requestBackend(() =>
      axios.get(`${BACKEND_URL}/api/hardware`, { headers: backendAuthHeaders() }),
    );
    return response.data;
  } catch (error: any) {
    console.error('Hardware profile error:', error instanceof Error ? error.message : error);
    return { success: false, error: toSafeRendererError(error, 'Could not fetch hardware profile') };
  }
});

ipcMain.handle('models:resolveRuntime', async (_event, modelId: string) => {
  try {
    const response = await requestBackend(() =>
      axios.post(
        `${BACKEND_URL}/api/models/${encodeURIComponent(modelId)}/resolve-runtime`,
        undefined,
        { headers: backendAuthHeaders() },
      ),
    );
    return response.data;
  } catch (error: any) {
    console.error('Resolve runtime error:', error instanceof Error ? error.message : error);
    return { success: false, error: toSafeRendererError(error, 'Runtime resolution failed') };
  }
});
