/**
 * HuggingFace Inference client (M6, S6). Runs in the Electron main process and
 * mirrors openRouter.ts so hosted secrets never reach the renderer. Full surface:
 * key info, model listing (image / text / video), LLM prompt-assist
 * (OpenAI-compatible chat), text-to-image, and text-to-video - every generation
 * path normalizes remote bytes via magic-byte sniffing.
 *
 * Deliberately NO ControlNet / inpaint client: the Inference Providers task API
 * documents no control_image parameter on text-to-image and no mask_image /
 * mask parameter on image-to-image, so there is no provable hosted contract for
 * either. Those passes stay Local (diffusers on the user's GPU) - we do not ship
 * a client for a payload shape we cannot stand behind (Codex M6 gate).
 *
 * All generation posts to the Inference Providers router
 * (https://router.huggingface.co/hf-inference/models/<model>) returning raw
 * bytes; chat posts to the OpenAI-compatible router (.../v1/chat/completions).
 *
 * #42 exception: single-LoRA still-image jobs dispatch adapter-by-model-id via
 * the official @huggingface/inference client - the Hub LoRA repo id is passed
 * AS the model and the client resolves the live provider mapping (fal-ai /
 * replicate / wavespeed) plus per-provider payload shape. That resolution
 * logic is exactly what the client documents and we will not hand-roll an
 * undocumented raw contract for it. Eligibility is enforced upstream by
 * shared/hostedLoraRouting.ts; this layer revalidates the repo id shape.
 *
 * Security (Codex gate): the token is used per-request, never logged, never
 * echoed into errors; remote bytes are validated before any caller writes them.
 */
import axios from 'axios';
import { createKeyConcurrencyLimit, retryHostedCall } from './hostedHttp';

const DEFAULT_ROUTER_BASE_URL = 'https://router.huggingface.co/v1';
const DEFAULT_HUB_BASE_URL = 'https://huggingface.co';
// Inference Providers router (hf-inference). Text-to-image posts { inputs, parameters }
// and returns raw image bytes. See https://huggingface.co/docs/inference-providers.
const DEFAULT_INFERENCE_BASE_URL = 'https://router.huggingface.co/hf-inference/models';
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
  modality: 'image' | 'video' | 'text';
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

export interface HuggingFaceVideoGenerationResult {
  model: string | null;
  dataUrl: string;
  mimeType: string;
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

/** #42: the official-client call shape for adapter-by-model-id dispatch. */
type AdapterTextToImageArgs = {
  accessToken: string;
  /** The Hub LoRA repo id - on this contract the adapter IS the model. */
  model: string;
  /** 'auto' = first live provider mapping, resolved by the official client. */
  provider: 'auto';
  inputs: string;
  parameters: { negative_prompt?: string; width: number; height: number; seed?: number };
};

type AdapterTextToImage = (
  args: AdapterTextToImageArgs,
  options: { signal?: AbortSignal; retry_on_error: boolean },
) => Promise<Blob | ArrayBuffer | Uint8Array>;

/**
 * Default #42 adapter dispatch: the official @huggingface/inference client.
 * Loaded lazily so the Electron main startup path never pays for it; injected
 * in tests. retry_on_error stays false - retryHostedCall owns retry policy.
 */
const defaultAdapterTextToImage: AdapterTextToImage = async (args, options) => {
  const { textToImage } = await import('@huggingface/inference');
  return textToImage(args, { ...options, outputType: 'blob' });
};

type CreateHuggingFaceInferenceServiceOptions = {
  axiosInstance?: AxiosLike;
  routerBaseUrl?: string;
  hubBaseUrl?: string;
  inferenceBaseUrl?: string;
  retryBaseDelayMs?: number;
  maxRetryAttempts?: number;
  maxConcurrentPerKey?: number;
  logger?: Logger;
  adapterTextToImage?: AdapterTextToImage;
};

/** Curated v1 defaults; users may also type any model id in Settings. */
const CURATED_IMAGE_MODELS: HuggingFaceModelSummary[] = [
  { id: 'black-forest-labs/FLUX.1-schnell', name: 'FLUX.1 schnell', modality: 'image' },
  { id: 'stabilityai/stable-diffusion-xl-base-1.0', name: 'SDXL 1.0', modality: 'image' },
];
const CURATED_TEXT_MODELS: HuggingFaceModelSummary[] = [
  { id: 'meta-llama/Llama-3.1-8B-Instruct', name: 'Llama 3.1 8B Instruct', modality: 'text' },
];
const CURATED_VIDEO_MODELS: HuggingFaceModelSummary[] = [
  { id: 'Lightricks/LTX-Video', name: 'LTX-Video', modality: 'video' },
];

// A user-typed model id is interpolated into the inference URL path. The host
// stays pinned (axios treats this as a path, not a new origin), but validate
// the shape - an "org/model" (or single) slug - to reject stray slashes and
// traversal-ish input before the URL is built.
const HF_MODEL_ID = /^[A-Za-z0-9][\w.-]*(?:\/[A-Za-z0-9][\w.-]*)?$/;

function assertValidHfModelId(model: string): void {
  if (!HF_MODEL_ID.test(model)) {
    throw new Error('Invalid HuggingFace model id.');
  }
}

// #42: Hub LoRA adapter repos are always namespaced ("org/name"). Stricter
// than HF_MODEL_ID on purpose - a single-segment adapter id is malformed and
// must never reach the official client's provider-mapping resolution.
const HF_ADAPTER_REPO_ID = /^[A-Za-z0-9][\w.-]*\/[A-Za-z0-9][\w.-]*$/;

function assertValidHfAdapterRepoId(adapterRepoId: string): void {
  if (!HF_ADAPTER_REPO_ID.test(adapterRepoId)) {
    throw new Error('Invalid HuggingFace LoRA adapter repo id.');
  }
}

const PROMPT_ENHANCEMENT_SYSTEM_PROMPT =
  'You refine image-generation prompts. Reply ONLY with compact JSON of shape {"prompt": string, "variations": string[]}. Preserve intent; improve clarity and visual specificity.';
const NEGATIVE_PROMPT_SYSTEM_PROMPT =
  'You suggest negative prompts for image generation. Reply ONLY with compact JSON of shape {"negativePrompt": string, "suggestions": string[]}.';

const IMAGE_MAGIC: Array<{ mime: string; test: (buffer: Buffer) => boolean }> = [
  // PNG signature.
  {
    mime: 'image/png',
    test: (buffer) =>
      buffer.length >= 4 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47,
  },
  // JPEG: start-of-image marker.
  {
    mime: 'image/jpeg',
    test: (buffer) => buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff,
  },
  // WebP: 'RIFF' container at bytes 0-3 AND 'WEBP' form type at bytes 8-11. A
  // bare RIFF is insufficient - WAV/AVI share the RIFF container - so the form
  // type must also match (mirrors the asset reader's WebP detection).
  {
    mime: 'image/webp',
    test: (buffer) =>
      buffer.length >= 12 &&
      buffer.slice(0, 4).toString('ascii') === 'RIFF' &&
      buffer.slice(8, 12).toString('ascii') === 'WEBP',
  },
  // GIF87a / GIF89a share the 'GIF8' prefix.
  {
    mime: 'image/gif',
    test: (buffer) =>
      buffer.length >= 4 && buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38,
  },
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
  // Axios errors carry response.status; the official client's
  // InferenceClientProviderApiError carries httpResponse.status (#42). Both
  // must sanitize identically - never echo the token or raw upstream body.
  const shaped = error as
    | { response?: { status?: number }; httpResponse?: { status?: number } }
    | null;
  const status = shaped?.response?.status ?? shaped?.httpResponse?.status;
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
    if (candidate.test(buffer)) {
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

/** #42: normalize the official client's Blob (or raw bytes) for magic sniffing. */
async function adapterPayloadToBuffer(payload: Blob | ArrayBuffer | Uint8Array): Promise<Buffer> {
  if (typeof Blob !== 'undefined' && payload instanceof Blob) {
    return Buffer.from(await payload.arrayBuffer());
  }
  if (payload instanceof Uint8Array) {
    return Buffer.from(payload);
  }
  return Buffer.from(payload as ArrayBuffer);
}

const VIDEO_MAGIC: Array<{ mime: string; test: (buffer: Buffer) => boolean }> = [
  // ISO-BMFF (mp4): bytes 4-8 spell the 'ftyp' box type.
  { mime: 'video/mp4', test: (buffer) => buffer.length >= 8 && buffer.slice(4, 8).toString('ascii') === 'ftyp' },
  // Matroska / WebM EBML header.
  {
    mime: 'video/webm',
    test: (buffer) =>
      buffer.length >= 4 && buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3,
  },
];

function toVideoResult(model: string, data: unknown): HuggingFaceVideoGenerationResult {
  const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer);
  const match = VIDEO_MAGIC.find((candidate) => candidate.test(buffer));
  if (!match) {
    throw new Error('HuggingFace did not return a valid video payload.');
  }
  return { model, dataUrl: `data:${match.mime};base64,${buffer.toString('base64')}`, mimeType: match.mime };
}

export function createHuggingFaceInferenceService({
  axiosInstance = axios as unknown as AxiosLike,
  routerBaseUrl = DEFAULT_ROUTER_BASE_URL,
  hubBaseUrl = DEFAULT_HUB_BASE_URL,
  inferenceBaseUrl = DEFAULT_INFERENCE_BASE_URL,
  retryBaseDelayMs = DEFAULT_RETRY_BASE_DELAY_MS,
  maxRetryAttempts = DEFAULT_MAX_RETRY_ATTEMPTS,
  maxConcurrentPerKey = DEFAULT_MAX_CONCURRENT_PER_KEY,
  logger = console,
  adapterTextToImage = defaultAdapterTextToImage,
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

  async function listVideoModels(_token: string): Promise<HuggingFaceModelSummary[]> {
    return CURATED_VIDEO_MODELS;
  }

  async function enhancePrompt({
    token,
    prompt,
    mode,
    model,
    signal,
    context,
  }: {
    token: string;
    prompt: string;
    mode: HuggingFacePromptMode;
    model?: string;
    signal?: AbortSignal;
    /** M7: retrieved reference context, injected into the user message JSON. */
    context?: string;
  }): Promise<HuggingFacePromptEnhancementResult> {
    const normalized = prompt.trim();
    if (!normalized) throw new Error('Prompt cannot be empty.');
    assertPromptLength(normalized, 'Prompt');
    try {
      const { parsed, usage } = await chatJson(
        token,
        model,
        PROMPT_ENHANCEMENT_SYSTEM_PROMPT,
        JSON.stringify({ mode, prompt: normalized, ...(context ? { referenceContext: context } : {}) }),
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
    context,
  }: {
    token: string;
    prompt: string;
    negativePrompt?: string;
    model?: string;
    signal?: AbortSignal;
    /** M7: retrieved reference context, injected into the user message JSON. */
    context?: string;
  }): Promise<HuggingFaceNegativePromptSuggestionResult> {
    const normalized = prompt.trim();
    if (!normalized) throw new Error('Prompt cannot be empty.');
    assertPromptLength(normalized, 'Prompt');
    try {
      const { parsed, usage } = await chatJson(
        token,
        model,
        NEGATIVE_PROMPT_SYSTEM_PROMPT,
        JSON.stringify({ prompt: normalized, current: negativePrompt ?? '', ...(context ? { referenceContext: context } : {}) }),
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
    adapterRepoId,
    prompt,
    negativePrompt,
    width,
    height,
    seed,
    signal,
  }: {
    token: string;
    model: string;
    /** #42: Hub LoRA repo id for adapter-by-model-id dispatch (single flux LoRA at weight 1.0). */
    adapterRepoId?: string;
    prompt: string;
    negativePrompt?: string;
    width: number;
    height: number;
    seed?: number;
    signal?: AbortSignal;
  }): Promise<HuggingFaceImageGenerationResult> {
    const normalizedPrompt = prompt.trim();
    if (!normalizedPrompt) throw new Error('Prompt cannot be empty.');
    assertPromptLength(normalizedPrompt, 'Prompt');

    // #42: adapter-by-model-id dispatch. The adapter IS the model on this
    // contract (its base is implied by the adapter's Hub metadata), so the
    // account's selected image model deliberately does not participate.
    if (adapterRepoId) {
      const normalizedAdapter = adapterRepoId.trim();
      assertValidHfAdapterRepoId(normalizedAdapter);
      try {
        const payload = await withRetry(
          token,
          () =>
            adapterTextToImage(
              {
                accessToken: token,
                model: normalizedAdapter,
                provider: 'auto',
                inputs: normalizedPrompt,
                parameters: {
                  ...(negativePrompt?.trim() ? { negative_prompt: negativePrompt.trim() } : {}),
                  width,
                  height,
                  ...(typeof seed === 'number' ? { seed } : {}),
                },
              },
              { signal, retry_on_error: false },
            ),
          signal,
        );
        const buffer = await adapterPayloadToBuffer(payload);
        return { model: normalizedAdapter, images: [toImageResult(buffer)], usage: null };
      } catch (error) {
        throw createHuggingFaceError(error, 'HuggingFace LoRA image generation failed.');
      }
    }

    const normalizedModel = model.trim();
    if (!normalizedModel) throw new Error('HuggingFace image model is required.');
    assertValidHfModelId(normalizedModel);
    try {
      const response = await withRetry(
        token,
        () =>
          axiosInstance.post(
            `${inferenceBaseUrl}/${normalizedModel}`,
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

  async function generateVideo({
    token,
    model,
    prompt,
    durationSeconds,
    signal,
  }: {
    token: string;
    model: string;
    prompt: string;
    durationSeconds?: number;
    signal?: AbortSignal;
  }): Promise<HuggingFaceVideoGenerationResult> {
    const normalizedPrompt = prompt.trim();
    const normalizedModel = model.trim();
    if (!normalizedPrompt) throw new Error('Prompt cannot be empty.');
    if (!normalizedModel) throw new Error('HuggingFace video model is required.');
    assertValidHfModelId(normalizedModel);
    assertPromptLength(normalizedPrompt, 'Prompt');
    try {
      const response = await withRetry(
        token,
        () =>
          axiosInstance.post(
            `${inferenceBaseUrl}/${normalizedModel}`,
            {
              inputs: normalizedPrompt,
              parameters: { ...(durationSeconds ? { num_frames: Math.round(durationSeconds * 24) } : {}) },
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
      return toVideoResult(normalizedModel, (response as { data: unknown }).data);
    } catch (error) {
      throw createHuggingFaceError(error, 'HuggingFace video generation failed.');
    }
  }

  return {
    getKeyInfo,
    listImageModels,
    listTextModels,
    listVideoModels,
    enhancePrompt,
    suggestNegativePrompt,
    generateImage,
    generateVideo,
  };
}
