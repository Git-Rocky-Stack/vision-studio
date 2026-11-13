import crypto from 'node:crypto';
import { app, ipcMain, BrowserWindow } from 'electron';
import WebSocket from 'ws';
import {
  backendHttp,
  BACKEND_LONG_OPERATION_TIMEOUT_MS,
} from '../services/backendHttp';
import {
  BACKEND_AUTH_HEADER,
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
import { routeBackendWsMessage } from './backendWsRouting';
import {
  SUBMIT_ONCE,
  describeBackendError,
  requestBackend,
} from './backendRequest';
import {
  OPENROUTER_IMAGE_UNSUPPORTED_MESSAGE,
  OPENROUTER_JOB_PREFIX,
  hasUnsupportedOpenRouterImageInputs,
  isTerminalJobStatus,
} from './openRouterImageRouting';
import { createOpenRouterImageJobStore } from './openRouterImageJobs';
import { suggestNegativePromptFromHeuristics } from './negativePromptHeuristics';
import { toLocalPromptEnhanceResult } from '../../shared/localPromptEnhance';
import { runOpenRouterImageJob } from './runOpenRouterImageJob';
import { createHuggingFaceImageJobStore } from './huggingfaceImageJobs';
import { runHuggingFaceImageJob } from './runHuggingFaceImageJob';
import {
  OPENROUTER_LORA_UNSUPPORTED_MESSAGE,
  validateHuggingFaceLoraDispatch,
} from '../../shared/hostedLoraRouting';
import { createHuggingFaceVideoJobStore } from './huggingfaceVideoJobs';
import { runHuggingFaceVideoJob } from './runHuggingFaceVideoJob';
import {
  HUGGINGFACE_JOB_PREFIX,
  HUGGINGFACE_VIDEO_JOB_PREFIX,
  hasUnsupportedHuggingFaceImageInputs,
  isHuggingFaceVideoJobId,
  routedJobProvider,
} from './hostedImageRouting';
import { handleIpc, type IpcHandler } from './ipcHandle';
import { assertBackendIdentityVerified, isBackendIdentityVerified } from './backendIdentityGate';
import type { EditOperation, IpcChannel } from '../../shared/ipcContract';

const BACKEND_URL = 'http://127.0.0.1:8000';

// M7: AI Director retrieval client. The prompt-assist seam queries it for
// reference context; all calls degrade gracefully (buildPromptContext swallows
// failures) so the assist proceeds un-augmented when the backend is unreachable.
const retrievalClient = createRetrievalClient({ baseUrl: BACKEND_URL, authHeaders: verifiedAuthHeaders });
// K2: the session token travels in the upgrade request's header, never in the
// URL (a query string lands in proxy, crash and access logs).
const WS_URL = 'ws://127.0.0.1:8000/ws';
const BATCH_SUBMISSION_CONCURRENCY = 4;

let ws: WebSocket | null = null;
let mainWindow: BrowserWindow | null = null;
let wsReconnectAttempts = 0;
let wsReconnectTimer: ReturnType<typeof setTimeout> | null = null;
let wsDisposed = false;
let quitHookRegistered = false;
const WS_BASE_DELAY = 1000; // 1s initial delay, doubles each attempt up to 30s

/** How often an unverified backend is re-checked before the WebSocket connects. */
const WS_IDENTITY_POLL_MS = 1000;

/** A backend path segment built from a renderer-supplied id. */
function segment(value: string) {
  return encodeURIComponent(value);
}

/**
 * The session-token header, only once the backend proved its identity (K1).
 * Called inside each request thunk, so an unverified backend fails the call
 * immediately (requestBackend never retries BACKEND_UNVERIFIED) without the
 * token - or a forwarded HF / CivitAI token - leaving the process.
 */
function verifiedAuthHeaders(): Record<string, string> {
  assertBackendIdentityVerified();
  return backendAuthHeaders();
}

/**
 * The rejection a handler throws for a failed backend call: a renderer-safe
 * message only. Deliberately without `cause` - the caught AxiosError carries
 * the token-bearing request headers and must not travel or be logged.
 */
function backendFailure(error: unknown, fallbackMessage: string): Error {
  return new Error(toSafeRendererError(error, fallbackMessage));
}

/** Register a contract handler on the real ipcMain (sender-checked, validated). */
function on<C extends IpcChannel>(channel: C, handler: IpcHandler<C>) {
  handleIpc(ipcMain, channel, handler);
}

/**
 * Renderer sink for job and progress events. The target window is swapped
 * on macOS re-activate, and a closed window must not throw on send.
 */
function sendToRenderer(channel: string, payload: unknown) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

type UserAccountsService = ReturnType<typeof createUserAccountsService>;
type OpenRouterService = ReturnType<typeof createOpenRouterService>;
type OutputRootService = ReturnType<typeof createOutputRootService>;

let userAccountsService: UserAccountsService | null = null;
let openRouterService: OpenRouterService | null = null;
let outputRootService: OutputRootService | null = null;

const openRouterImageJobStore = createOpenRouterImageJobStore({
  emit: sendToRenderer,
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
  emit: sendToRenderer,
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
  emit: sendToRenderer,
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
  if (!quitHookRegistered) {
    quitHookRegistered = true;
    // Close the socket and cancel any pending reconnect when the app quits, so
    // neither keeps the event loop alive nor reconnects during shutdown.
    app.on('will-quit', disposeBackendWebSocket);
  }
  // One socket per app session. macOS re-activate creates a new window and
  // calls this again; only the event target changes. Opening a second socket
  // here left the first one connected too, so every progress event reached
  // the renderer twice.
  if (!ws) {
    connectWebSocket();
  }
}

/**
 * Reconnect now instead of waiting out the backoff. The socket starts
 * connecting before the backend has started, so by the time the backend is
 * ready the backoff can have grown to 30s of missed progress. Called when the
 * backend reports ready; a no-op while a socket is open or connecting.
 */
export function kickBackendWebSocket() {
  if (wsDisposed) {
    return;
  }
  wsReconnectAttempts = 0;
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
    return;
  }
  connectWebSocket();
}

/** Tear down the progress socket for good (app 'will-quit'). */
export function disposeBackendWebSocket() {
  wsDisposed = true;
  if (wsReconnectTimer) {
    clearTimeout(wsReconnectTimer);
    wsReconnectTimer = null;
  }
  retireSocket();
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

/**
 * Retire the current socket so it can neither deliver duplicate events nor
 * schedule a second reconnect loop. Keeps a no-op error listener: terminating
 * a socket mid-handshake emits 'error'.
 */
function retireSocket() {
  if (!ws) {
    return;
  }
  const previous = ws;
  ws = null;
  previous.removeAllListeners();
  previous.on('error', () => undefined);
  previous.terminate();
}

function connectWebSocket() {
  if (wsDisposed) {
    return;
  }
  if (wsReconnectTimer) {
    clearTimeout(wsReconnectTimer);
    wsReconnectTimer = null;
  }
  retireSocket();

  // Never hand the session token to whatever listens on :8000 before the K1
  // handshake has verified it is our backend. Re-check shortly (no network
  // cost); kickBackendWebSocket() connects at once when the backend reports ready.
  if (!isBackendIdentityVerified()) {
    wsReconnectTimer = setTimeout(connectWebSocket, WS_IDENTITY_POLL_MS);
    return;
  }

  const socket = new WebSocket(WS_URL, {
    headers: { [BACKEND_AUTH_HEADER]: getBackendAuthToken() },
  });
  ws = socket;

  socket.on('open', () => {
    wsReconnectAttempts = 0;
    console.log('Connected to Python backend WebSocket');
  });

  socket.on('message', (data) => {
    routeBackendWsMessage(data.toString(), sendToRenderer);
  });

  socket.on('close', () => {
    if (ws !== socket || wsDisposed) {
      return;
    }
    const delay = Math.min(WS_BASE_DELAY * Math.pow(2, wsReconnectAttempts), 30000);
    wsReconnectAttempts += 1;
    console.log(`WebSocket closed, reconnecting in ${delay}ms (attempt ${wsReconnectAttempts})...`);
    wsReconnectTimer = setTimeout(connectWebSocket, delay);
  });

  socket.on('error', (err) => {
    console.error('WebSocket error:', err instanceof Error ? err.message : String(err));
  });
}

on('workflow:run-graph', async (_event, params) => {
  try {
    const response = await requestBackend(() =>
      backendHttp.post(
        `${BACKEND_URL}/api/v1/comfy/run-graph`,
        { graph: params.graph, generation_type: params.generationType },
        { headers: verifiedAuthHeaders() }
      ),
      SUBMIT_ONCE,
    );
    const data = response.data as { job_id?: unknown; status?: unknown; message?: unknown };
    if (typeof data?.job_id !== 'string') {
      return { success: false as const, error: 'The backend did not accept the graph.' };
    }
    return {
      success: true as const,
      job_id: data.job_id,
      status: typeof data.status === 'string' ? data.status : 'pending',
      message: typeof data.message === 'string' ? data.message : '',
    };
  } catch (error) {
    // Message only: the raw AxiosError carries the token-bearing request headers.
    console.error('Run graph error:', describeBackendError(error));
    return { success: false as const, error: toSafeRendererError(error, 'Could not run the graph on the backend.') };
  }
});

on('generation:generate-image', async (_event, params) => {
  const activeAccount = userAccountsService?.getActiveAccount();
  const providerOverride = params.__providerOverride ?? null;
  const effectiveImageProvider = providerOverride ?? activeAccount?.preferences.imageGenerationProvider;
  if (activeAccount && effectiveImageProvider === 'openrouter') {
    if (hasUnsupportedOpenRouterImageInputs(params)) {
      return {
        success: false,
        error: OPENROUTER_IMAGE_UNSUPPORTED_MESSAGE,
      };
    }

    // #42: OpenRouter's documented image API has no adapter key - the LoRA
    // decline is permanent, and the request must never be silently degraded.
    if (Array.isArray(params.loras) && params.loras.length > 0) {
      return { success: false, error: OPENROUTER_LORA_UNSUPPORTED_MESSAGE };
    }

    if (!activeAccount.openRouter.apiKeyStored) {
      return {
        success: false,
        error: 'OpenRouter is selected for still images, but no API key is stored for the active account.',
      };
    }

    const requestedModel =
      (typeof params.model === 'string' && params.model.trim()) ||
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

    // #42: LoRA-bearing jobs must satisfy the narrow adapter contract
    // (exactly one selection, weight 1.0, renderer-resolved Hub repo id) -
    // refused here with the specific unmet condition, never silently dropped.
    const loraDispatch = validateHuggingFaceLoraDispatch(
      params.loras,
      params.__huggingFaceLoraAdapter,
    );
    if (!loraDispatch.ok) {
      return { success: false, error: loraDispatch.reason };
    }

    if (!activeAccount.huggingFace.tokenStored) {
      return {
        success: false,
        error: 'HuggingFace is selected for still images, but no token is stored for the active account.',
      };
    }

    const requestedModel =
      (typeof params.model === 'string' && params.model.trim()) ||
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
      backendHttp.post(`${BACKEND_URL}/api/generate/image`, params, { headers: verifiedAuthHeaders() }),
      SUBMIT_ONCE,
    );
    return {
      success: true,
      jobId: response.data.job_id,
    };
  } catch (error) {
    console.error('Image generation error:', describeBackendError(error));
    return {
      success: false,
      error: toSafeRendererError(error, 'Image generation failed'),
    };
  }
});

on('generation:generate-video', async (_event, params) => {
  const activeAccount = userAccountsService?.getActiveAccount();
  const providerOverride = params.__providerOverride ?? null;
  const effectiveVideoProvider = providerOverride ?? activeAccount?.preferences.videoGenerationProvider;
  if (activeAccount && effectiveVideoProvider === 'huggingface') {
    if (!activeAccount.huggingFace.tokenStored) {
      return {
        success: false,
        error: 'HuggingFace is selected for video, but no token is stored for the active account.',
      };
    }

    const requestedModel =
      (typeof params.model === 'string' && params.model.trim()) ||
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
      backendHttp.post(`${BACKEND_URL}/api/generate/video`, params, { headers: verifiedAuthHeaders() }),
      SUBMIT_ONCE,
    );
    return {
      success: true,
      jobId: response.data.job_id,
    };
  } catch (error) {
    console.error('Video generation error:', describeBackendError(error));
    return {
      success: false,
      error: toSafeRendererError(error, 'Video generation failed'),
    };
  }
});

on('generation:enhance-prompt', async (_event, params) => {
  const activeAccount = userAccountsService?.getActiveAccount();
  if (activeAccount?.preferences.promptEnhancementProvider === 'openrouter') {
    const apiKey = await userAccountsService?.getOpenRouterApiKey(activeAccount.id);

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
    } catch (error) {
      return {
        success: false,
        error: toOpenRouterRendererMessage(error, 'Prompt enhancement failed'),
      };
    }
  }

  if (activeAccount?.preferences.promptEnhancementProvider === 'huggingface') {
    const token = await userAccountsService?.getHuggingFaceToken(activeAccount.id);
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
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Prompt enhancement failed',
      };
    }
  }

  try {
    const response = await requestBackend(() =>
      backendHttp.post(`${BACKEND_URL}/api/prompts/enhance`, params, { headers: verifiedAuthHeaders() }),
    );
    return toLocalPromptEnhanceResult(response.data);
  } catch (error) {
    return {
      success: false,
      error: toSafeRendererError(error, 'Prompt enhancement failed'),
    };
  }
});

on('generation:suggest-negative-prompt', async (_event, params) => {
  const activeAccount = userAccountsService?.getActiveAccount();
  if (activeAccount?.preferences.promptEnhancementProvider === 'openrouter') {
    const apiKey = await userAccountsService?.getOpenRouterApiKey(activeAccount.id);

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
    } catch (error) {
      return {
        success: false,
        error: toOpenRouterRendererMessage(error, 'Negative prompt suggestion failed'),
      };
    }
  }

  if (activeAccount?.preferences.promptEnhancementProvider === 'huggingface') {
    const token = await userAccountsService?.getHuggingFaceToken(activeAccount.id);
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
    } catch (error) {
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
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Negative prompt suggestion failed',
    };
  }
});

// M7 AI Director index management. Non-fatal: a retrieval failure must never
// break the renderer, so every handler returns a safe shape on error.
on('director:sync-corpus', async (_event, records) => {
  try {
    return await retrievalClient.ingest(records);
  } catch (error) {
    return { ingested: 0, skipped: 0, total: 0, error: error instanceof Error ? error.message : 'sync failed' };
  }
});

on('director:clear-index', async () => {
  try {
    await retrievalClient.clearIndex();
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'clear failed' };
  }
});

on('director:index-stats', async () => {
  try {
    return await retrievalClient.stats();
  } catch {
    return { count: 0, mode: 'lexical' as const };
  }
});

on('generation:crop-image', async (_event, params) => {
  try {
    const response = await requestBackend(() =>
      backendHttp.post(`${BACKEND_URL}/api/images/crop`, params, { headers: verifiedAuthHeaders() }),
    );
    return response.data;
  } catch (error) {
    console.error('Image crop error:', describeBackendError(error));
    throw backendFailure(error, 'Image crop failed');
  }
});

/** Backend route per edit operation; the contract only admits these keys. */
const EDIT_ROUTES: Record<EditOperation, string> = {
  'remove-background': '/api/v1/edit/remove-background',
  upscale: '/api/v1/edit/upscale',
  'restore-faces': '/api/v1/edit/restore-faces',
};

on('generation:edit-image', async (_event, params) => {
  const { operation, ...body } = params;
  const route = EDIT_ROUTES[operation];
  if (!route) {
    return { success: false, error: 'Unknown edit operation.' };
  }
  try {
    const response = await requestBackend(() =>
      backendHttp.post(`${BACKEND_URL}${route}`, body, { headers: verifiedAuthHeaders() }),
      SUBMIT_ONCE,
    );
    return { success: true, jobId: response.data.job_id };
  } catch (error) {
    console.error('Edit operation error:', describeBackendError(error));
    return {
      success: false,
      error: toSafeRendererError(error, 'Edit operation failed'),
    };
  }
});

on('generation:extract-video-frame', async (_event, params) => {
  try {
    const response = await requestBackend(() =>
      backendHttp.post(`${BACKEND_URL}/api/videos/extract-frame`, params, { headers: verifiedAuthHeaders() }),
    );
    return response.data;
  } catch (error) {
    console.error('Video frame extraction error:', describeBackendError(error));
    throw backendFailure(error, 'Video frame extraction failed');
  }
});

on('generation:export-timeline-sequence', async (_event, params) => {
  try {
    const response = await requestBackend(() =>
      backendHttp.post(`${BACKEND_URL}/api/timeline/export`, params, { headers: verifiedAuthHeaders() }),
      SUBMIT_ONCE,
    );
    return {
      success: true,
      jobId: response.data.job_id,
    };
  } catch (error) {
    console.error('Timeline export error:', describeBackendError(error));
    return {
      success: false,
      error: toSafeRendererError(error, 'Timeline export failed'),
    };
  }
});

on('generation:batch', async (_event, params) => {
  const prompts = params.prompts.map((prompt) => prompt.trim()).filter(Boolean);

  if (prompts.length === 0) {
    return {
      success: false,
      error: 'Add at least one prompt before starting a batch.',
    };
  }

  const { prompts: _prompts, ...baseParams } = params;

  const activeAccount = userAccountsService?.getActiveAccount();
  if (activeAccount?.preferences.imageGenerationProvider === 'openrouter') {
    if (hasUnsupportedOpenRouterImageInputs(params)) {
      return {
        success: false,
        error: OPENROUTER_IMAGE_UNSUPPORTED_MESSAGE,
      };
    }

    // #42: same permanent OpenRouter LoRA decline as the single-image handler.
    if (Array.isArray(params.loras) && params.loras.length > 0) {
      return { success: false, error: OPENROUTER_LORA_UNSUPPORTED_MESSAGE };
    }

    if (!activeAccount.openRouter.apiKeyStored) {
      return {
        success: false,
        error: 'OpenRouter is selected for still images, but no API key is stored for the active account.',
      };
    }

    const requestedModel =
      (typeof params.model === 'string' && params.model.trim()) ||
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

  if (activeAccount?.preferences.imageGenerationProvider === 'huggingface') {
    if (hasUnsupportedHuggingFaceImageInputs(params)) {
      return {
        success: false,
        error:
          'HuggingFace still-image routing currently supports prompt-only generations. Switch the active account back to Local for ControlNet, inpaint, or reference-image passes.',
      };
    }

    // #42: same narrow adapter contract as the single-image handler above.
    const loraDispatch = validateHuggingFaceLoraDispatch(
      params.loras,
      params.__huggingFaceLoraAdapter,
    );
    if (!loraDispatch.ok) {
      return { success: false, error: loraDispatch.reason };
    }

    if (!activeAccount.huggingFace.tokenStored) {
      return {
        success: false,
        error: 'HuggingFace is selected for still images, but no token is stored for the active account.',
      };
    }

    const requestedModel =
      (typeof params.model === 'string' && params.model.trim()) ||
      activeAccount.preferences.huggingFaceImageModel.trim();
    if (!requestedModel) {
      return {
        success: false,
        error: 'Select a HuggingFace still-image model for the active account before generating.',
      };
    }

    const jobIds = prompts.map((prompt) => {
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
          backendHttp.post(
            `${BACKEND_URL}/api/generate/image`,
            {
              ...baseParams,
              prompt,
            },
            { headers: verifiedAuthHeaders() },
          ),
          SUBMIT_ONCE,
        );
        return response.data.job_id as string;
      },
      { concurrency: BATCH_SUBMISSION_CONCURRENCY },
    );

    return {
      success: true,
      jobIds,
    };
  } catch (error) {
    console.error('Batch generation error:', describeBackendError(error));
    return {
      success: false,
      error: toSafeRendererError(error, 'Batch generation failed'),
    };
  }
});

on('generation:get-status', async (_event, jobId) => {
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
      backendHttp.get(`${BACKEND_URL}/api/jobs/${segment(jobId)}`, { headers: verifiedAuthHeaders() }),
    );
    return response.data;
  } catch (error) {
    // Rejects (via the IPC envelope) rather than resolving a failure body the
    // renderer would read as a JobStatus; every poller budgets these errors.
    console.error('Get status error:', describeBackendError(error));
    throw backendFailure(error, 'Could not get generation status');
  }
});

on('generation:cancel', async (_event, jobId) => {
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
      backendHttp.post(`${BACKEND_URL}/api/jobs/${segment(jobId)}/cancel`, undefined, { headers: verifiedAuthHeaders() }),
    );
    return response.data;
  } catch (error) {
    console.error('Cancel job error:', describeBackendError(error));
    return {
      success: false,
      error: toSafeRendererError(error, 'Could not cancel generation'),
    };
  }
});

// Foundry queue and library calls below reject (through the IPC envelope) on
// a backend failure: their results are typed records the renderer merges
// into state, so a `{ success: false }` body must never stand in for one.

on('models:list', async () => {
  try {
    const response = await requestBackend(() =>
      backendHttp.get(`${BACKEND_URL}/api/models`, { headers: verifiedAuthHeaders() }),
    );
    return response.data;
  } catch (error) {
    console.error('List models error:', describeBackendError(error));
    return [];
  }
});

on('models:download', async (_event, modelId) => {
  try {
    const response = await requestBackend(() =>
      backendHttp.post(`${BACKEND_URL}/api/models/${segment(modelId)}/download`, undefined, {
        // The backend routes X-HF-Token to HF downloads and X-Civitai-Token to
        // CivitAI direct-URL downloads based on the model record's source.
        headers: { ...verifiedAuthHeaders(), ...hfTokenHeaders(), ...civitaiTokenHeaders() },
      }),
      // Enqueues a download: a retried timeout could queue it twice.
      SUBMIT_ONCE,
    );
    return response.data;
  } catch (error) {
    console.error('Download model error:', describeBackendError(error));
    throw backendFailure(error, 'Model download failed');
  }
});

on('models:download:pause', async (_event, modelId) => {
  try {
    const response = await requestBackend(() =>
      backendHttp.post(`${BACKEND_URL}/api/models/${segment(modelId)}/download/pause`, undefined, {
        headers: verifiedAuthHeaders(),
      }),
    );
    return response.data;
  } catch (error) {
    console.error('Pause download error:', describeBackendError(error));
    throw backendFailure(error, 'Pause failed');
  }
});

on('models:download:resume', async (_event, modelId) => {
  try {
    const response = await requestBackend(() =>
      backendHttp.post(`${BACKEND_URL}/api/models/${segment(modelId)}/download/resume`, undefined, {
        headers: { ...verifiedAuthHeaders(), ...hfTokenHeaders(), ...civitaiTokenHeaders() },
      }),
    );
    return response.data;
  } catch (error) {
    console.error('Resume download error:', describeBackendError(error));
    throw backendFailure(error, 'Resume failed');
  }
});

on('models:download:cancel', async (_event, modelId) => {
  try {
    const response = await requestBackend(() =>
      backendHttp.post(`${BACKEND_URL}/api/models/${segment(modelId)}/download/cancel`, undefined, {
        headers: verifiedAuthHeaders(),
      }),
    );
    return response.data;
  } catch (error) {
    console.error('Cancel download error:', describeBackendError(error));
    throw backendFailure(error, 'Cancel failed');
  }
});

on('models:downloads:list', async () => {
  try {
    const response = await requestBackend(() =>
      backendHttp.get(`${BACKEND_URL}/api/models/downloads`, { headers: verifiedAuthHeaders() }),
    );
    return response.data;
  } catch (error) {
    console.error('List downloads error:', describeBackendError(error));
    return [];
  }
});

// #34 installer PR2: first-run comprehensive auto-provisioning. Forwards to the
// backend orchestrator, which drives the manifest's auto-set through the same
// consent-gated download queue the manual "Download" button uses.
on('provision:status', async () => {
  try {
    const response = await requestBackend(() =>
      backendHttp.get(`${BACKEND_URL}/api/models/provision/status`, { headers: verifiedAuthHeaders() }),
    );
    return response.data;
  } catch (error) {
    console.error('Provision status error:', describeBackendError(error));
    return { success: false, error: toSafeRendererError(error, 'Provision status failed') };
  }
});

on('provision:start', async (_event, options) => {
  // K3: an explicit subset installs just those models; omitted = the whole auto-set.
  const body = options?.modelIds ? { model_ids: options.modelIds } : undefined;
  try {
    const response = await requestBackend(() =>
      backendHttp.post(`${BACKEND_URL}/api/models/provision/start`, body, {
        // X-HF-Token is forwarded for the gated SD3.5 pipelines in the auto-set.
        headers: { ...verifiedAuthHeaders(), ...hfTokenHeaders() },
      }),
      // Starts downloads: a retried timeout could enqueue the set twice.
      SUBMIT_ONCE,
    );
    return response.data;
  } catch (error) {
    console.error('Provision start error:', describeBackendError(error));
    return { success: false, error: toSafeRendererError(error, 'Provisioning could not start') };
  }
});

on('provision:pause', async () => {
  try {
    const response = await requestBackend(() =>
      backendHttp.post(`${BACKEND_URL}/api/models/provision/pause`, undefined, {
        headers: verifiedAuthHeaders(),
      }),
    );
    return response.data;
  } catch (error) {
    console.error('Provision pause error:', describeBackendError(error));
    return { success: false, error: toSafeRendererError(error, 'Provision pause failed') };
  }
});

on('provision:resume', async () => {
  try {
    const response = await requestBackend(() =>
      backendHttp.post(`${BACKEND_URL}/api/models/provision/resume`, undefined, {
        headers: { ...verifiedAuthHeaders(), ...hfTokenHeaders() },
      }),
    );
    return response.data;
  } catch (error) {
    console.error('Provision resume error:', describeBackendError(error));
    return { success: false, error: toSafeRendererError(error, 'Provision resume failed') };
  }
});

on('provision:cancel', async () => {
  try {
    const response = await requestBackend(() =>
      backendHttp.post(`${BACKEND_URL}/api/models/provision/cancel`, undefined, {
        headers: verifiedAuthHeaders(),
      }),
    );
    return response.data;
  } catch (error) {
    console.error('Provision cancel error:', describeBackendError(error));
    return { success: false, error: toSafeRendererError(error, 'Provision cancel failed') };
  }
});

on('provision:reverify', async () => {
  try {
    const response = await requestBackend(() =>
      backendHttp.post(`${BACKEND_URL}/api/models/provision/reverify`, undefined, {
        // Reverify re-runs start(): the HF token is forwarded for any gated
        // auto-set model a repair re-fetch may need.
        headers: { ...verifiedAuthHeaders(), ...hfTokenHeaders() },
      }),
    );
    return response.data;
  } catch (error) {
    console.error('Provision reverify error:', describeBackendError(error));
    return { success: false, error: toSafeRendererError(error, 'Provision verify failed') };
  }
});

on('models:delete', async (_event, modelId) => {
  try {
    const response = await requestBackend(() =>
      backendHttp.delete(`${BACKEND_URL}/api/models/${segment(modelId)}`, { headers: verifiedAuthHeaders() }),
    );
    return response.data;
  } catch (error) {
    console.error('Delete model error:', describeBackendError(error));
    return {
      success: false,
      error: toSafeRendererError(error, 'Model delete failed'),
    };
  }
});

on('models:import', async (_event, path, layoutHint) => {
  try {
    const response = await requestBackend(() =>
      backendHttp.post(`${BACKEND_URL}/api/models/import`, { path, layout_hint: layoutHint }, {
        headers: verifiedAuthHeaders(),
        // Registers the root, then rescans every library synchronously.
        timeout: BACKEND_LONG_OPERATION_TIMEOUT_MS,
      }),
      // Registers a library root: a retry after a slow first attempt would
      // re-register and rescan it.
      SUBMIT_ONCE,
    );
    return response.data;
  } catch (error) {
    console.error('Import library root error:', describeBackendError(error));
    throw backendFailure(error, 'Library root import failed');
  }
});

on('models:scan', async () => {
  try {
    const response = await requestBackend(() =>
      backendHttp.post(`${BACKEND_URL}/api/models/scan`, undefined, {
        headers: verifiedAuthHeaders(),
        timeout: BACKEND_LONG_OPERATION_TIMEOUT_MS,
      }),
    );
    return response.data;
  } catch (error) {
    console.error('Library scan error:', describeBackendError(error));
    throw backendFailure(error, 'Library scan failed');
  }
});

on('models:libraries:list', async () => {
  try {
    const response = await requestBackend(() =>
      backendHttp.get(`${BACKEND_URL}/api/models/libraries`, { headers: verifiedAuthHeaders() }),
    );
    return response.data;
  } catch (error) {
    console.error('List library roots error:', describeBackendError(error));
    return [];
  }
});

on('models:libraries:remove', async (_event, rootId) => {
  try {
    const response = await requestBackend(() =>
      backendHttp.delete(`${BACKEND_URL}/api/models/libraries/${segment(rootId)}`, {
        headers: verifiedAuthHeaders(),
      }),
    );
    return response.data;
  } catch (error) {
    console.error('Remove library root error:', describeBackendError(error));
    throw backendFailure(error, 'Library root removal failed');
  }
});

on('models:search', async (_event, query, source, page, nsfw) => {
  try {
    const response = await requestBackend(() =>
      backendHttp.get(`${BACKEND_URL}/api/models/search`, {
        params: { q: query, source, page, nsfw },
        headers: { ...verifiedAuthHeaders(), ...hfTokenHeaders(), ...civitaiTokenHeaders() },
      }),
    );
    return response.data;
  } catch (error) {
    // Message only: the raw AxiosError carries token-bearing request
    // headers in config.headers and must never reach the log.
    console.error('Model search error:', describeBackendError(error));
    return {
      source,
      query,
      page,
      results: [],
      offline: true,
      warning: toSafeRendererError(error, 'Model search failed'),
    };
  }
});

on('models:consent', async (_event, modelId, kind, granted) => {
  try {
    const response = await requestBackend(() =>
      backendHttp.post(
        `${BACKEND_URL}/api/models/consent`,
        { model_id: modelId, kind, granted },
        { headers: verifiedAuthHeaders() },
      ),
    );
    return response.data;
  } catch (error) {
    console.error('Model consent error:', describeBackendError(error));
    return { success: false, error: toSafeRendererError(error, 'Consent update failed') };
  }
});

on('models:convert', async (_event, modelId) => {
  try {
    const response = await requestBackend(() =>
      backendHttp.post(
        `${BACKEND_URL}/api/models/${segment(modelId)}/convert-safetensors`,
        undefined,
        { headers: verifiedAuthHeaders(), timeout: BACKEND_LONG_OPERATION_TIMEOUT_MS },
      ),
      SUBMIT_ONCE,
    );
    return response.data;
  } catch (error) {
    console.error('Model convert error:', describeBackendError(error));
    return { success: false, error: toSafeRendererError(error, 'Conversion failed') };
  }
});

on('models:libraries:detect', async () => {
  try {
    const response = await requestBackend(() =>
      backendHttp.get(`${BACKEND_URL}/api/models/libraries/detect`, { headers: verifiedAuthHeaders() }),
    );
    return response.data;
  } catch (error) {
    console.error('Detect library roots error:', describeBackendError(error));
    return [];
  }
});

on('hardware:get', async () => {
  try {
    const response = await requestBackend(() =>
      backendHttp.get(`${BACKEND_URL}/api/hardware`, { headers: verifiedAuthHeaders() }),
    );
    return response.data;
  } catch (error) {
    console.error('Hardware profile error:', describeBackendError(error));
    return { success: false, error: toSafeRendererError(error, 'Could not fetch hardware profile') };
  }
});

on('models:resolveRuntime', async (_event, modelId) => {
  try {
    const response = await requestBackend(() =>
      backendHttp.post(
        `${BACKEND_URL}/api/models/${segment(modelId)}/resolve-runtime`,
        undefined,
        { headers: verifiedAuthHeaders(), timeout: BACKEND_LONG_OPERATION_TIMEOUT_MS },
      ),
    );
    return response.data;
  } catch (error) {
    console.error('Resolve runtime error:', describeBackendError(error));
    return { success: false, error: toSafeRendererError(error, 'Runtime resolution failed') };
  }
});
