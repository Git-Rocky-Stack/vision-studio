import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
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
import { deleteOrphanedFiles } from './orphanFileCleanup';

const BACKEND_URL = 'http://127.0.0.1:8000';
const WS_URL = 'ws://127.0.0.1:8000/ws';
const OPENROUTER_JOB_PREFIX = 'openrouter-image';
const BATCH_SUBMISSION_CONCURRENCY = 4;

let ws: WebSocket | null = null;
let mainWindow: BrowserWindow | null = null;
let wsReconnectAttempts = 0;
const WS_BASE_DELAY = 1000; // 1s initial delay, doubles each attempt up to 30s

type UserAccountsService = ReturnType<typeof createUserAccountsService>;
type OpenRouterService = ReturnType<typeof createOpenRouterService>;
type OutputRootService = ReturnType<typeof createOutputRootService>;

type OpenRouterImageJob = {
  job_id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  type: 'image';
  created_at: string;
  completed_at?: string;
  error?: string;
  result?: {
    images?: string[];
    seed?: number;
    provider?: 'openrouter';
    provider_response_id?: string | null;
    provider_message?: string;
    model?: string | null;
  };
  params?: Record<string, unknown>;
  abortController?: AbortController;
};

let userAccountsService: UserAccountsService | null = null;
let openRouterService: OpenRouterService | null = null;
let outputRootService: OutputRootService | null = null;

const openRouterImageJobs = new Map<string, OpenRouterImageJob>();

function isBackendDownError(error: any) {
  const msg = typeof error?.message === 'string' ? error.message : '';
  return msg.includes('ECONNREFUSED') || error?.code === 'ECONNREFUSED';
}

const BACKEND_DOWN_MESSAGE =
  'The AI backend is not running. Please restart the app or start the backend manually from Settings.';

async function requestBackend<T>(request: () => Promise<T>, attempts: number = 3, delayMs: number = 1000): Promise<T> {
  let lastError: any;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await request();
    } catch (error: any) {
      lastError = error;
      if (isBackendDownError(error)) {
        const friendly = new Error(BACKEND_DOWN_MESSAGE);
        (friendly as any).code = 'BACKEND_DOWN';
        throw friendly;
      }
      if (attempt === attempts) {
        throw error;
      }

      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  throw lastError;
}

function isTerminalJobStatus(status: OpenRouterImageJob['status']) {
  return status === 'completed' || status === 'failed' || status === 'cancelled';
}

function isOpenRouterJobId(jobId: string) {
  return jobId.startsWith(`${OPENROUTER_JOB_PREFIX}-`);
}

function emitJobProgress(job: OpenRouterImageJob) {
  mainWindow?.webContents.send('generation:progress', {
    type: 'job_update',
    job_id: job.job_id,
    status: job.status,
    progress: job.progress,
  });
}

function getOpenRouterJob(jobId: string) {
  return openRouterImageJobs.get(jobId) ?? null;
}

function getOpenRouterJobStatus(jobId: string) {
  const job = getOpenRouterJob(jobId);
  if (!job) {
    return null;
  }

  const { abortController: _abortController, ...status } = job;
  return status;
}

function setOpenRouterJob(job: OpenRouterImageJob) {
  openRouterImageJobs.set(job.job_id, job);
  emitJobProgress(job);
  return job;
}

function patchOpenRouterJob(jobId: string, patch: Partial<OpenRouterImageJob>) {
  const current = getOpenRouterJob(jobId);
  if (!current) {
    return null;
  }

  const nextJob: OpenRouterImageJob = {
    ...current,
    ...patch,
    result: patch.result ? { ...current.result, ...patch.result } : current.result,
  };
  openRouterImageJobs.set(jobId, nextJob);
  emitJobProgress(nextJob);
  return nextJob;
}

function resolveOpenRouterFailureMessage(error: unknown) {
  if ((error as { name?: string })?.name === 'AbortError') {
    return 'OpenRouter image generation was cancelled.';
  }

  return toOpenRouterRendererMessage(error, 'OpenRouter image generation failed.');
}

function hasUnsupportedOpenRouterImageInputs(params: any) {
  return Boolean(
    params?.controlnet?.length ||
      params?.reference_images?.length ||
      params?.image_path ||
      params?.mask ||
      params?.inpaint,
  );
}

function getOpenRouterImageUnsupportedMessage() {
  return 'OpenRouter still-image routing currently supports prompt-only generations. Switch this account back to Local for ControlNet, inpaint, or reference-image passes.';
}

function splitPromptTerms(value: string) {
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function mergePromptTerms(existingTerms: string[], nextTerms: string[]) {
  const normalized = new Set(existingTerms.map((term) => term.toLowerCase()));
  const merged = [...existingTerms];

  for (const term of nextTerms) {
    const key = term.toLowerCase();
    if (!normalized.has(key)) {
      normalized.add(key);
      merged.push(term);
    }
  }

  return merged;
}

function suggestNegativePromptFromHeuristics({
  prompt,
  negativePrompt,
}: {
  prompt: string;
  negativePrompt?: string;
}) {
  const normalizedPrompt = typeof prompt === 'string' ? prompt.trim() : '';
  if (!normalizedPrompt) {
    throw new Error('Prompt cannot be empty.');
  }

  const existingTerms = splitPromptTerms(negativePrompt ?? '');
  const baseTerms = ['blurry', 'low quality', 'compression artifacts', 'distorted', 'overexposed'];
  const keywordRules = [
    {
      test: /\b(portrait|face|person|character|fashion|selfie)\b/i,
      terms: ['extra fingers', 'deformed hands', 'bad anatomy', 'cross-eye'],
    },
    {
      test: /\b(photo|photograph|dslr|realistic|cinematic)\b/i,
      terms: ['cgi', 'plastic skin', 'oversmoothed skin'],
    },
    {
      test: /\b(text|logo|poster|typography|lettering|title)\b/i,
      terms: ['illegible text', 'misspelled text', 'warped letters'],
    },
    {
      test: /\b(product|packaging|device|bottle|mockup)\b/i,
      terms: ['cropped product', 'duplicate objects', 'floating object'],
    },
    {
      test: /\b(landscape|city|architecture|interior|building|room)\b/i,
      terms: ['tilted horizon', 'warped perspective', 'cluttered background'],
    },
    {
      test: /\b(anime|illustration|painting|watercolor|comic|sketch)\b/i,
      terms: ['muddy colors', 'unfinished lines', 'off-model details'],
    },
  ];

  const suggestedTerms = keywordRules.reduce<string[]>((terms, rule) => {
    if (rule.test.test(normalizedPrompt)) {
      return mergePromptTerms(terms, rule.terms);
    }
    return terms;
  }, baseTerms);

  const mergedTerms = mergePromptTerms(existingTerms, suggestedTerms);
  const newSuggestions = mergedTerms.filter(
    (term) => !existingTerms.some((existing) => existing.toLowerCase() === term.toLowerCase()),
  );

  return {
    negativePrompt: mergedTerms.join(', '),
    suggestions: newSuggestions,
    source: 'heuristic' as const,
  };
}

function toNormalizedFilePath(filePath: string) {
  return filePath.replace(/\\/g, '/');
}

function extensionForMimeType(mimeType: string) {
  const normalized = mimeType.toLowerCase();
  if (normalized.includes('jpeg') || normalized.includes('jpg')) {
    return 'jpg';
  }
  if (normalized.includes('webp')) {
    return 'webp';
  }
  if (normalized.includes('gif')) {
    return 'gif';
  }
  return 'png';
}

async function writeOpenRouterImageDataUrl({
  dataUrl,
  mimeType,
  jobId,
  index,
  outputRoot,
}: {
  dataUrl: string;
  mimeType: string;
  jobId: string;
  index: number;
  outputRoot: string;
}) {
  const base64Payload = dataUrl.replace(/^data:[^;]+;base64,/, '');
  const directory = path.join(outputRoot, 'openrouter', new Date().toISOString().slice(0, 10));
  await fs.promises.mkdir(directory, { recursive: true });

  const extension = extensionForMimeType(mimeType);
  const filePath = path.join(directory, `${jobId}-${index + 1}.${extension}`);
  await fs.promises.writeFile(filePath, Buffer.from(base64Payload, 'base64'));
  return toNormalizedFilePath(filePath);
}

async function runOpenRouterImageJob(jobId: string, params: any) {
  const activeAccount = userAccountsService?.getAccount(
    typeof params?.__openrouterAccountId === 'string' ? params.__openrouterAccountId : null,
  );
  if (!activeAccount) {
    patchOpenRouterJob(jobId, {
      status: 'failed',
      progress: 100,
      completed_at: new Date().toISOString(),
      error: 'No active OpenRouter image account is available.',
    });
    return;
  }

  const apiKey = userAccountsService?.getOpenRouterApiKey(activeAccount.id);
  const model =
    (typeof params?.model === 'string' && params.model.trim()) ||
    activeAccount.preferences.openRouterImageModel.trim();

  if (!apiKey || !openRouterService || !outputRootService) {
    patchOpenRouterJob(jobId, {
      status: 'failed',
      progress: 100,
      completed_at: new Date().toISOString(),
      error: 'OpenRouter is selected for still images, but the active account is not fully configured.',
    });
    return;
  }

  if (!model) {
    patchOpenRouterJob(jobId, {
      status: 'failed',
      progress: 100,
      completed_at: new Date().toISOString(),
      error: 'Select an OpenRouter image model for the active account before generating.',
    });
    return;
  }

  const abortController = new AbortController();
  patchOpenRouterJob(jobId, {
    status: 'processing',
    progress: 12,
    abortController,
  });

  try {
    const response = await openRouterService.generateImage({
      apiKey,
      model,
      prompt: params.prompt,
      negativePrompt: params.negative_prompt,
      width: params.width,
      height: params.height,
      seed: typeof params.seed === 'number' ? params.seed : undefined,
      signal: abortController.signal,
    });

    const jobAfterResponse = getOpenRouterJob(jobId);
    if (!jobAfterResponse || jobAfterResponse.status === 'cancelled') {
      return;
    }

    patchOpenRouterJob(jobId, {
      progress: 72,
    });

    const outputRoot = outputRootService.getResolvedOutputDirectory();
    outputRootService.rememberOutputRoot(outputRoot);
    const imagePaths = await Promise.all(
      response.images.map((image, index) =>
        writeOpenRouterImageDataUrl({
          dataUrl: image.dataUrl,
          mimeType: image.mimeType,
          jobId,
          index,
          outputRoot,
        }),
      ),
    );

    const jobAfterWrite = getOpenRouterJob(jobId);
    if (!jobAfterWrite || jobAfterWrite.status === 'cancelled') {
      // The user cancelled after the files had already landed on disk but
      // before we could mark the job complete. Delete the orphans so we do
      // not accumulate cancelled-job output in the user's outputs/openrouter
      // directory across sessions.
      await deleteOrphanedFiles(imagePaths, console);
      return;
    }

    patchOpenRouterJob(jobId, {
      status: 'completed',
      progress: 100,
      completed_at: new Date().toISOString(),
      result: {
        images: imagePaths,
        seed: typeof params.seed === 'number' ? params.seed : undefined,
        provider: 'openrouter',
        provider_response_id: response.responseId,
        provider_message: response.content || undefined,
        model: response.model ?? model,
        usage: response.usage,
      },
      abortController: undefined,
    });
  } catch (error) {
    const currentJob = getOpenRouterJob(jobId);
    if (currentJob?.status === 'cancelled') {
      return;
    }

    patchOpenRouterJob(jobId, {
      status: 'failed',
      progress: 100,
      completed_at: new Date().toISOString(),
      error: resolveOpenRouterFailureMessage(error),
      abortController: undefined,
    });
  }
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
        error: getOpenRouterImageUnsupportedMessage(),
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
    setOpenRouterJob({
      job_id: jobId,
      status: 'pending',
      progress: 0,
      type: 'image',
      created_at: new Date().toISOString(),
      params,
    });
    void runOpenRouterImageJob(jobId, {
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
        error: getOpenRouterImageUnsupportedMessage(),
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
      setOpenRouterJob({
        job_id: jobId,
        status: 'pending',
        progress: 0,
        type: 'image',
        created_at: new Date().toISOString(),
        params: jobParams,
      });
      void runOpenRouterImageJob(jobId, {
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
    const status = getOpenRouterJobStatus(jobId);
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
    const currentJob = getOpenRouterJob(jobId);
    if (!currentJob) {
      return {
        success: false,
        error: 'OpenRouter generation job not found.',
      };
    }

    if (!isTerminalJobStatus(currentJob.status)) {
      currentJob.abortController?.abort();
      patchOpenRouterJob(jobId, {
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
  const localJobs = Array.from(openRouterImageJobs.values())
    .filter((job) => !status || job.status === status)
    .map(({ abortController: _abortController, ...job }) => job)
    .sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime())
    .slice(0, limit);

  try {
    let url = `${BACKEND_URL}/api/jobs?limit=${limit}`;
    if (status) {
      url += `&status=${status}`;
    }

    const response = await requestBackend(() => axios.get(url, { headers: backendAuthHeaders() }));
    const backendJobs = Array.isArray(response.data?.jobs) ? response.data.jobs : [];
    return {
      ...response.data,
      jobs: [...localJobs, ...backendJobs].slice(0, limit),
    };
  } catch (error: any) {
    if (localJobs.length > 0) {
      return {
        jobs: localJobs,
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
