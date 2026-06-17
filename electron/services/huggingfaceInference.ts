/**
 * HuggingFace Inference client (M6, S6). Runs in the Electron main process and
 * mirrors openRouter.ts so hosted secrets never reach the renderer. PR1 surface:
 * key info, model listing, LLM prompt-assist (OpenAI-compatible chat), and
 * text-to-image with magic-byte sanitization. Video / ControlNet / inpaint land
 * in PR2.
 *
 * Security (Codex gate): the token is used per-request, never logged, never
 * echoed into errors; remote bytes are validated before any caller writes them.
 */
import axios from 'axios';
import { createKeyConcurrencyLimit, retryHostedCall } from './hostedHttp';

const DEFAULT_ROUTER_BASE_URL = 'https://router.huggingface.co/v1';
const DEFAULT_HUB_BASE_URL = 'https://huggingface.co';
const DEFAULT_MAX_RETRY_ATTEMPTS = 3;
const DEFAULT_RETRY_BASE_DELAY_MS = 250;
const DEFAULT_MAX_CONCURRENT_PER_KEY = 4;
const METADATA_TIMEOUT_MS = 15_000;
const GENERATION_TIMEOUT_MS = 120_000;
export const HF_MAX_PROMPT_CHARS = 8_000;

export type HuggingFacePromptMode = 'clarify' | 'cinematic' | 'concise' | 'expand' | 'variations';

export interface HuggingFaceKeyInfo {
  label: string | null;
  fullName: string | null;
  tokenDisplayName: string | null;
}

export interface HuggingFaceModelSummary {
  id: string;
  name: string;
  modality: 'image' | 'video' | 'text' | 'controlnet' | 'inpaint';
}

export interface HuggingFaceUsage {
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  cost: number | null;
}

export interface HuggingFaceImageResult {
  dataUrl: string;
  mimeType: string;
}

export interface HuggingFaceImageGenerationResult {
  model: string | null;
  images: HuggingFaceImageResult[];
  usage: HuggingFaceUsage | null;
}

export interface HuggingFacePromptEnhancementResult {
  prompt: string;
  variations: string[];
  usage: HuggingFaceUsage | null;
}

export interface HuggingFaceNegativePromptSuggestionResult {
  negativePrompt: string;
  suggestions: string[];
  usage: HuggingFaceUsage | null;
}

type AxiosLike = {
  get: (url: string, config?: unknown) => Promise<{ data: unknown }>;
  post: (url: string, body?: unknown, config?: unknown) => Promise<{ data: unknown }>;
};

type Logger = { warn: (...args: unknown[]) => void };

type CreateHuggingFaceInferenceServiceOptions = {
  axiosInstance?: AxiosLike;
  routerBaseUrl?: string;
  hubBaseUrl?: string;
  retryBaseDelayMs?: number;
  maxRetryAttempts?: number;
  maxConcurrentPerKey?: number;
  logger?: Logger;
};

/** Curated v1 defaults; users may also type any model id in Settings. */
const CURATED_IMAGE_MODELS: HuggingFaceModelSummary[] = [
  { id: 'black-forest-labs/FLUX.1-schnell', name: 'FLUX.1 schnell', modality: 'image' },
  { id: 'stabilityai/stable-diffusion-xl-base-1.0', name: 'SDXL 1.0', modality: 'image' },
];
const CURATED_TEXT_MODELS: HuggingFaceModelSummary[] = [
  { id: 'meta-llama/Llama-3.1-8B-Instruct', name: 'Llama 3.1 8B Instruct', modality: 'text' },
];

const PROMPT_ENHANCEMENT_SYSTEM_PROMPT =
  'You refine image-generation prompts. Reply ONLY with compact JSON of shape {"prompt": string, "variations": string[]}. Preserve intent; improve clarity and visual specificity.';
const NEGATIVE_PROMPT_SYSTEM_PROMPT =
  'You suggest negative prompts for image generation. Reply ONLY with compact JSON of shape {"negativePrompt": string, "suggestions": string[]}.';

const IMAGE_MAGIC: Array<{ mime: string; bytes: number[] }> = [
  { mime: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47] },
  { mime: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] },
  { mime: 'image/webp', bytes: [0x52, 0x49, 0x46, 0x46] },
  { mime: 'image/gif', bytes: [0x47, 0x49, 0x46, 0x38] },
];

function buildHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  } as const;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function assertPromptLength(value: string, label: string) {
  if (value.length > HF_MAX_PROMPT_CHARS) {
    throw new Error(`${label} exceeds the ${HF_MAX_PROMPT_CHARS}-character limit.`);
  }
}

/**
 * Sanitize a thrown transport error into a renderer-safe message. NEVER include
 * the token or raw upstream body verbatim (Codex gate).
 */
function createHuggingFaceError(error: unknown, fallback: string): Error {
  if ((error as { name?: string } | null)?.name === 'AbortError') {
    return new Error('HuggingFace request was cancelled.');
  }
  const status = (error as { response?: { status?: number } } | null)?.response?.status;
  if (status === 401 || status === 403) {
    return new Error('HuggingFace rejected the token. Check the BYOK token in Settings.');
  }
  if (status === 404) {
    return new Error('HuggingFace could not find that model for the requested task.');
  }
  if (typeof status === 'number') {
    return new Error(`HuggingFace request failed (HTTP ${status}).`);
  }
  return new Error(fallback);
}

function extractMessageContent(message: unknown): string {
  const content = (message as { content?: unknown } | null)?.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => (typeof (part as { text?: unknown }).text === 'string' ? (part as { text: string }).text : ''))
      .join('');
  }
  return '';
}

function extractUsage(data: unknown): HuggingFaceUsage | null {
  const usage = (data as { usage?: Record<string, unknown> } | null)?.usage;
  if (!usage) return null;
  const num = (value: unknown) => (typeof value === 'number' ? value : null);
  return {
    promptTokens: num(usage.prompt_tokens),
    completionTokens: num(usage.completion_tokens),
    totalTokens: num(usage.total_tokens),
    cost: num(usage.cost),
  };
}

function sniffImageMime(buffer: Buffer): string | null {
  for (const candidate of IMAGE_MAGIC) {
    if (candidate.bytes.every((byte, index) => buffer[index] === byte)) {
      return candidate.mime;
    }
  }
  return null;
}

function toImageResult(data: unknown): HuggingFaceImageResult {
  const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer);
  const mime = sniffImageMime(buffer);
  if (!mime) {
    throw new Error('HuggingFace did not return a valid image payload.');
  }
  return { dataUrl: `data:${mime};base64,${buffer.toString('base64')}`, mimeType: mime };
}

export function createHuggingFaceInferenceService({
  axiosInstance = axios as unknown as AxiosLike,
  routerBaseUrl = DEFAULT_ROUTER_BASE_URL,
  hubBaseUrl = DEFAULT_HUB_BASE_URL,
  retryBaseDelayMs = DEFAULT_RETRY_BASE_DELAY_MS,
  maxRetryAttempts = DEFAULT_MAX_RETRY_ATTEMPTS,
  maxConcurrentPerKey = DEFAULT_MAX_CONCURRENT_PER_KEY,
  logger = console,
}: CreateHuggingFaceInferenceServiceOptions = {}) {
  const limit = createKeyConcurrencyLimit(maxConcurrentPerKey);

  function withRetry<T>(token: string, operation: () => Promise<T>, signal?: AbortSignal) {
    return limit(token, () =>
      retryHostedCall(operation, { maxAttempts: maxRetryAttempts, baseDelayMs: retryBaseDelayMs, signal }),
    );
  }

  function parseJsonObject(raw: string): Record<string, unknown> {
    const trimmed = raw.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    try {
      const parsed = JSON.parse(trimmed);
      return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
    } catch {
      logger.warn('[HuggingFace] Could not parse JSON content; returning raw text.');
      return {};
    }
  }

  async function chatJson(token: string, model: string | undefined, system: string, user: string, signal?: AbortSignal) {
    const response = await withRetry(
      token,
      () =>
        axiosInstance.post(
          `${routerBaseUrl}/chat/completions`,
          {
            ...(model ? { model } : {}),
            temperature: 0.3,
            response_format: { type: 'json_object' },
            messages: [
              { role: 'system', content: system },
              { role: 'user', content: user },
            ],
          },
          { headers: buildHeaders(token), timeout: GENERATION_TIMEOUT_MS, signal },
        ),
      signal,
    );
    const data = response.data as { choices?: Array<{ message?: unknown }> };
    const content = extractMessageContent(data.choices?.[0]?.message);
    return { parsed: parseJsonObject(content), usage: extractUsage(data) };
  }

  async function getKeyInfo(token: string): Promise<HuggingFaceKeyInfo> {
    try {
      const response = await withRetry(token, () =>
        axiosInstance.get(`${hubBaseUrl}/api/whoami-v2`, {
          headers: buildHeaders(token),
          timeout: METADATA_TIMEOUT_MS,
        }),
      );
      const data = (response.data ?? {}) as {
        name?: unknown;
        fullname?: unknown;
        auth?: { accessToken?: { displayName?: unknown } };
      };
      return {
        label: asString(data.name),
        fullName: asString(data.fullname),
        tokenDisplayName: asString(data.auth?.accessToken?.displayName),
      };
    } catch (error) {
      throw createHuggingFaceError(error, 'HuggingFace connection failed.');
    }
  }

  async function listImageModels(_token: string): Promise<HuggingFaceModelSummary[]> {
    return CURATED_IMAGE_MODELS;
  }

  async function listTextModels(_token: string): Promise<HuggingFaceModelSummary[]> {
    return CURATED_TEXT_MODELS;
  }

  async function enhancePrompt({
    token,
    prompt,
    mode,
    model,
    signal,
  }: {
    token: string;
    prompt: string;
    mode: HuggingFacePromptMode;
    model?: string;
    signal?: AbortSignal;
  }): Promise<HuggingFacePromptEnhancementResult> {
    const normalized = prompt.trim();
    if (!normalized) throw new Error('Prompt cannot be empty.');
    assertPromptLength(normalized, 'Prompt');
    try {
      const { parsed, usage } = await chatJson(
        token,
        model,
        PROMPT_ENHANCEMENT_SYSTEM_PROMPT,
        JSON.stringify({ mode, prompt: normalized }),
        signal,
      );
      return {
        prompt: typeof parsed.prompt === 'string' && parsed.prompt.trim() ? parsed.prompt : normalized,
        variations: Array.isArray(parsed.variations)
          ? (parsed.variations.filter((value) => typeof value === 'string') as string[])
          : [],
        usage,
      };
    } catch (error) {
      throw createHuggingFaceError(error, 'HuggingFace prompt enhancement failed.');
    }
  }

  async function suggestNegativePrompt({
    token,
    prompt,
    negativePrompt,
    model,
    signal,
  }: {
    token: string;
    prompt: string;
    negativePrompt?: string;
    model?: string;
    signal?: AbortSignal;
  }): Promise<HuggingFaceNegativePromptSuggestionResult> {
    const normalized = prompt.trim();
    if (!normalized) throw new Error('Prompt cannot be empty.');
    assertPromptLength(normalized, 'Prompt');
    try {
      const { parsed, usage } = await chatJson(
        token,
        model,
        NEGATIVE_PROMPT_SYSTEM_PROMPT,
        JSON.stringify({ prompt: normalized, current: negativePrompt ?? '' }),
        signal,
      );
      return {
        negativePrompt: typeof parsed.negativePrompt === 'string' ? parsed.negativePrompt : '',
        suggestions: Array.isArray(parsed.suggestions)
          ? (parsed.suggestions.filter((value) => typeof value === 'string') as string[])
          : [],
        usage,
      };
    } catch (error) {
      throw createHuggingFaceError(error, 'HuggingFace negative-prompt suggestion failed.');
    }
  }

  async function generateImage({
    token,
    model,
    prompt,
    negativePrompt,
    width,
    height,
    seed,
    signal,
  }: {
    token: string;
    model: string;
    prompt: string;
    negativePrompt?: string;
    width: number;
    height: number;
    seed?: number;
    signal?: AbortSignal;
  }): Promise<HuggingFaceImageGenerationResult> {
    const normalizedPrompt = prompt.trim();
    const normalizedModel = model.trim();
    if (!normalizedPrompt) throw new Error('Prompt cannot be empty.');
    if (!normalizedModel) throw new Error('HuggingFace image model is required.');
    assertPromptLength(normalizedPrompt, 'Prompt');
    try {
      const response = await withRetry(
        token,
        () =>
          axiosInstance.post(
            `${hubBaseUrl}/api/inference-proxy/models/${normalizedModel}`,
            {
              inputs: normalizedPrompt,
              parameters: {
                ...(negativePrompt?.trim() ? { negative_prompt: negativePrompt.trim() } : {}),
                width,
                height,
                ...(typeof seed === 'number' ? { seed } : {}),
              },
            },
            {
              headers: buildHeaders(token),
              timeout: GENERATION_TIMEOUT_MS,
              responseType: 'arraybuffer',
              signal,
            },
          ),
        signal,
      );
      return { model: normalizedModel, images: [toImageResult((response as { data: unknown }).data)], usage: null };
    } catch (error) {
      throw createHuggingFaceError(error, 'HuggingFace image generation failed.');
    }
  }

  return {
    getKeyInfo,
    listImageModels,
    listTextModels,
    enhancePrompt,
    suggestNegativePrompt,
    generateImage,
  };
}
