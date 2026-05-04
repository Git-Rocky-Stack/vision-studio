import axios from 'axios';
import { z, type ZodError } from 'zod';

type AxiosLike = Pick<typeof axios, 'get' | 'post'>;

export type PromptEnhancementMode = 'clarify' | 'cinematic' | 'concise' | 'expand' | 'variations';

export interface OpenRouterKeyInfo {
  label: string | null;
  limit: number | null;
  limitRemaining: number | null;
  usage: number | null;
  usageDaily: number | null;
  usageWeekly: number | null;
  usageMonthly: number | null;
  byokUsage: number | null;
  includeByokInLimit: boolean | null;
  isFreeTier: boolean | null;
  expiresAt: string | null;
}

export interface OpenRouterModelSummary {
  id: string;
  name: string;
  description: string;
  contextLength: number | null;
  outputModalities: string[];
  supportedParameters: string[];
  pricing: {
    prompt: string;
    completion: string;
    image: string;
  };
}

export interface OpenRouterUsage {
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  cost: number | null;
}

export interface OpenRouterPromptEnhancementResult {
  mode: PromptEnhancementMode;
  prompt: string;
  variations: string[];
  usage: OpenRouterUsage | null;
}

export interface OpenRouterNegativePromptSuggestionResult {
  negativePrompt: string;
  suggestions: string[];
  usage: OpenRouterUsage | null;
}

export interface OpenRouterImageResult {
  dataUrl: string;
  mimeType: string;
}

export interface OpenRouterImageGenerationResult {
  responseId: string | null;
  model: string | null;
  content: string;
  images: OpenRouterImageResult[];
  usage: OpenRouterUsage | null;
}

type CreateOpenRouterServiceOptions = {
  axiosInstance?: AxiosLike;
  baseUrl?: string;
  appReferer?: string;
  appTitle?: string;
  /**
   * Base delay (ms) for exponential backoff between retries. Doubled each attempt.
   * Tests pass 0 to skip waits. Production callers should leave the default.
   */
  retryBaseDelayMs?: number;
  /**
   * Maximum total attempts (initial + retries). Defaults to 3.
   */
  maxRetryAttempts?: number;
  /**
   * Time-to-live (ms) for the in-process model catalog cache. Defaults to 5 minutes.
   * Pass 0 to disable caching.
   */
  modelCacheTtlMs?: number;
  /**
   * Clock function for cache freshness checks. Tests can swap in a fake clock.
   */
  now?: () => number;
};

const DEFAULT_BASE_URL = 'https://openrouter.ai/api/v1';
const DEFAULT_REFERER = 'https://visionstudio.app';
const DEFAULT_TITLE = 'Vision Studio';

/**
 * Hoisted as a module constant so the byte-identical prefix can be cached
 * by OpenRouter / Anthropic when sent with `cache_control: { type: 'ephemeral' }`.
 * Update with care — any byte change invalidates the cache for all users.
 *
 * Includes few-shot exemplars for cinematic and concise modes (the two
 * highest-variance modes per audit) so the model has anchored examples of
 * the desired transformation style before seeing the live request.
 */
export const PROMPT_ENHANCEMENT_SYSTEM_PROMPT =
  'You improve prompts for image and video generation. Return valid JSON only with keys mode, prompt, and variations. Keep the user intent and important constraints intact. clarify should tighten structure and fidelity. cinematic should lean into film language. concise should keep only the most important details. expand should add richer descriptive detail without changing subject. variations should keep prompt as a cleaned base prompt and return 4 strong alternatives in variations. For every non-variations mode, return an enhanced prompt and an empty variations array.\n\nExamples:\n\nMode: cinematic\nInput: a city at night\nOutput: {"mode":"cinematic","prompt":"city skyline at night, neon-lit streets, anamorphic lens flare, shallow depth of field, color-graded teal and orange, 35mm film grain","variations":[]}\n\nMode: concise\nInput: a beautiful flowing waterfall in the forest with mist and lush green plants surrounding it on all sides\nOutput: {"mode":"concise","prompt":"forest waterfall, mist, lush greenery","variations":[]}';

/**
 * Hoisted for the same prompt-caching reason as PROMPT_ENHANCEMENT_SYSTEM_PROMPT.
 */
export const NEGATIVE_PROMPT_SYSTEM_PROMPT =
  'You write concise negative prompts for image and video generation. Return valid JSON only with keys negativePrompt and suggestions. Preserve helpful existing negative terms, remove duplicates, and add artifact-prevention terms that fit the user prompt. suggestions must be a short array of phrases that are included in negativePrompt.';

function buildCachedSystemMessage(text: string) {
  return {
    role: 'system' as const,
    content: [
      {
        type: 'text' as const,
        text,
        cache_control: { type: 'ephemeral' as const },
      },
    ],
  };
}

/**
 * Wrap user-message text in OpenRouter's multipart `content` array form.
 * Mirrors the system-message shape so all messages we send share the same
 * structure — and leaves room to append `image_url` parts in the future
 * (e.g., reference-image guided enhance / negative suggestion / image gen)
 * without restructuring the call sites.
 */
function buildUserTextMessage(text: string) {
  return {
    role: 'user' as const,
    content: [{ type: 'text' as const, text }],
  };
}

const METADATA_TIMEOUT_MS = 10_000;
const TEXT_COMPLETION_TIMEOUT_MS = 30_000;
const IMAGE_GENERATION_TIMEOUT_MS = 120_000;

/**
 * Maximum per-field character count for user-supplied prompts. Generous
 * upper bound that comfortably exceeds any realistic human-authored prompt
 * while still catching paste-the-entire-novel mistakes before we burn an
 * OpenRouter call on them.
 */
export const MAX_PROMPT_CHARS = 8000;

function assertPromptLength(value: string, fieldName: string) {
  if (value.length > MAX_PROMPT_CHARS) {
    throw new Error(
      `${fieldName} is too long (${value.length} chars). Maximum is ${MAX_PROMPT_CHARS}.`,
    );
  }
}

function isTimeoutError(error: unknown) {
  const code = (error as { code?: unknown })?.code;
  if (code === 'ECONNABORTED' || code === 'ETIMEDOUT') {
    return true;
  }
  const name = (error as { name?: unknown })?.name;
  return name === 'TimeoutError';
}

const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504]);
const DEFAULT_RETRY_BASE_DELAY_MS = 250;
const DEFAULT_MAX_RETRY_ATTEMPTS = 3;
const DEFAULT_MODEL_CACHE_TTL_MS = 5 * 60 * 1000;

function isAbortError(error: unknown) {
  const name = (error as { name?: unknown })?.name;
  if (name === 'AbortError' || name === 'CanceledError') {
    return true;
  }
  const code = (error as { code?: unknown })?.code;
  return code === 'ERR_CANCELED';
}

function getResponseStatus(error: unknown): number | null {
  const status = (error as { response?: { status?: unknown } })?.response?.status;
  return typeof status === 'number' ? status : null;
}

function isRetryableError(error: unknown): boolean {
  if (isAbortError(error) || isTimeoutError(error)) {
    return false;
  }
  const status = getResponseStatus(error);
  if (status === null) {
    // Network-level failure with no HTTP response (e.g. ECONNRESET, EAI_AGAIN) — retry.
    const code = (error as { code?: unknown })?.code;
    if (code === 'ECONNRESET' || code === 'ECONNREFUSED' || code === 'EAI_AGAIN' || code === 'ENOTFOUND') {
      return true;
    }
    return false;
  }
  return RETRYABLE_STATUS_CODES.has(status);
}

function getRetryAfterMs(error: unknown): number | null {
  const headers = (error as { response?: { headers?: Record<string, unknown> } })?.response?.headers;
  if (!headers) {
    return null;
  }
  const raw = headers['retry-after'] ?? headers['Retry-After'];
  if (typeof raw !== 'string' || !raw.trim()) {
    return null;
  }
  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.round(seconds * 1000);
  }
  // Retry-After can also be an HTTP date.
  const dateMs = Date.parse(raw);
  if (!Number.isNaN(dateMs)) {
    return Math.max(0, dateMs - Date.now());
  }
  return null;
}

function delay(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

async function retryOpenRouterCall<T>(
  operation: () => Promise<T>,
  {
    maxAttempts,
    baseDelayMs,
    signal,
  }: { maxAttempts: number; baseDelayMs: number; signal?: AbortSignal },
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt === maxAttempts || !isRetryableError(error)) {
        throw error;
      }
      const retryAfter = getRetryAfterMs(error);
      const backoff = retryAfter ?? baseDelayMs * Math.pow(2, attempt - 1);
      await delay(backoff, signal);
    }
  }
  throw lastError;
}

function asNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function extractUsage(payload: unknown): OpenRouterUsage | null {
  const usage = (payload as { usage?: unknown })?.usage;
  if (typeof usage !== 'object' || usage === null) {
    return null;
  }
  const data = usage as {
    prompt_tokens?: unknown;
    completion_tokens?: unknown;
    total_tokens?: unknown;
    cost?: unknown;
  };
  return {
    promptTokens: asNumber(data.prompt_tokens),
    completionTokens: asNumber(data.completion_tokens),
    totalTokens: asNumber(data.total_tokens),
    cost: asNumber(data.cost),
  };
}

function toOpenRouterError(error: unknown, fallbackMessage: string) {
  if (isTimeoutError(error)) {
    return `${fallbackMessage} (request timed out)`;
  }

  const providerMessage = (error as any)?.response?.data?.error?.message;
  if (typeof providerMessage === 'string' && providerMessage.trim()) {
    return providerMessage;
  }

  const directMessage = (error as any)?.message;
  if (typeof directMessage === 'string' && directMessage.trim()) {
    return directMessage;
  }

  return fallbackMessage;
}

function createOpenRouterError(error: unknown, fallbackMessage: string) {
  return new Error(toOpenRouterError(error, fallbackMessage), { cause: error });
}

function extractMessageContent(content: unknown) {
  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .flatMap((part) => {
        if (typeof part === 'string') {
          return [part];
        }

        if (
          typeof part === 'object' &&
          part !== null &&
          'type' in part &&
          (part as { type?: unknown }).type === 'text' &&
          'text' in part &&
          typeof (part as { text?: unknown }).text === 'string'
        ) {
          return [(part as { text: string }).text];
        }

        return [];
      })
      .join('');
  }

  return '';
}

/**
 * Zod schemas validating LLM-generated JSON payloads. We use `.passthrough()`
 * so additional/unknown keys don't fail the parse — LLMs sometimes add chatter
 * we want to ignore — but required fields and array element types are enforced
 * strictly (catches model misbehavior immediately rather than silently coercing).
 */
const promptEnhancementContentSchema = z
  .object({
    prompt: z.string(),
    mode: z
      .enum(['clarify', 'cinematic', 'concise', 'expand', 'variations'])
      .optional(),
    variations: z.array(z.string()).optional(),
  })
  .passthrough();

const negativePromptContentSchema = z
  .object({
    negativePrompt: z.string().optional(),
    negative_prompt: z.string().optional(),
    suggestions: z.array(z.string()).optional(),
  })
  .passthrough();

function formatZodError(error: ZodError, prefix: string) {
  const first = error.issues[0];
  if (!first) {
    return prefix;
  }
  const path = first.path.length > 0 ? first.path.join('.') : 'root';
  return `${prefix} at '${path}': ${first.message}`;
}

function parsePromptEnhancementContent(
  payload: unknown,
  fallbackMode: PromptEnhancementMode,
): Omit<OpenRouterPromptEnhancementResult, 'usage'> {
  const result = promptEnhancementContentSchema.safeParse(payload);
  if (!result.success) {
    throw new Error(
      formatZodError(result.error, 'Invalid OpenRouter prompt enhancement payload'),
      { cause: result.error },
    );
  }

  const prompt = result.data.prompt.trim();
  if (!prompt) {
    throw new Error('OpenRouter returned an empty prompt enhancement.');
  }
  const variations = (result.data.variations ?? [])
    .map((entry) => entry.trim())
    .filter(Boolean);

  return {
    mode: result.data.mode ?? fallbackMode,
    prompt,
    variations,
  };
}

function parseNegativePromptContent(
  payload: unknown,
): Omit<OpenRouterNegativePromptSuggestionResult, 'usage'> {
  const result = negativePromptContentSchema.safeParse(payload);
  if (!result.success) {
    throw new Error(
      formatZodError(result.error, 'Invalid OpenRouter negative prompt payload'),
      { cause: result.error },
    );
  }

  const negativePrompt = (result.data.negativePrompt ?? result.data.negative_prompt ?? '').trim();
  if (!negativePrompt) {
    throw new Error('OpenRouter returned an empty negative prompt suggestion.');
  }

  const suggestions = (result.data.suggestions ?? [])
    .map((entry) => entry.trim())
    .filter(Boolean);

  return {
    negativePrompt,
    suggestions,
  };
}

function normalizeModelSummary(model: any): OpenRouterModelSummary | null {
  if (typeof model?.id !== 'string' || typeof model?.name !== 'string') {
    return null;
  }

  return {
    id: model.id,
    name: model.name,
    description: typeof model.description === 'string' ? model.description : '',
    contextLength: asNumber(model.context_length),
    outputModalities: Array.isArray(model.architecture?.output_modalities)
      ? model.architecture.output_modalities.filter((entry: unknown): entry is string => typeof entry === 'string')
      : [],
    supportedParameters: Array.isArray(model.supported_parameters)
      ? model.supported_parameters.filter((entry: unknown): entry is string => typeof entry === 'string')
      : [],
    pricing: {
      prompt: typeof model.pricing?.prompt === 'string' ? model.pricing.prompt : '0',
      completion: typeof model.pricing?.completion === 'string' ? model.pricing.completion : '0',
      image: typeof model.pricing?.image === 'string' ? model.pricing.image : '0',
    },
  };
}

const SUPPORTED_IMAGE_ASPECT_RATIOS = [
  { label: '1:1', ratio: 1 },
  { label: '2:3', ratio: 2 / 3 },
  { label: '3:2', ratio: 3 / 2 },
  { label: '3:4', ratio: 3 / 4 },
  { label: '4:3', ratio: 4 / 3 },
  { label: '4:5', ratio: 4 / 5 },
  { label: '5:4', ratio: 5 / 4 },
  { label: '9:16', ratio: 9 / 16 },
  { label: '16:9', ratio: 16 / 9 },
  { label: '21:9', ratio: 21 / 9 },
] as const;

function toAspectRatio(width: number, height: number) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null;
  }

  const targetRatio = width / height;
  const nearest = SUPPORTED_IMAGE_ASPECT_RATIOS.reduce(
    (best, candidate) => {
      const distance = Math.abs(candidate.ratio - targetRatio);
      return distance < best.distance ? { label: candidate.label, distance } : best;
    },
    { label: null as string | null, distance: Number.POSITIVE_INFINITY },
  );
  const tolerance = targetRatio * 0.04;

  return nearest.label && nearest.distance <= tolerance ? nearest.label : null;
}

function extractImageDataUrl(image: unknown) {
  const dataUrl =
    typeof (image as { image_url?: { url?: unknown } })?.image_url?.url === 'string'
      ? (image as { image_url: { url: string } }).image_url.url
      : typeof (image as { imageUrl?: { url?: unknown } })?.imageUrl?.url === 'string'
        ? (image as { imageUrl: { url: string } }).imageUrl.url
        : null;

  if (!dataUrl || !dataUrl.startsWith('data:image/')) {
    return null;
  }

  const mimeTypeMatch = /^data:([^;]+);base64,/.exec(dataUrl);
  return {
    dataUrl,
    mimeType: mimeTypeMatch?.[1] ?? 'image/png',
  };
}

function buildHeaders(apiKey: string, appReferer: string, appTitle: string) {
  return {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    'HTTP-Referer': appReferer,
    'X-Title': appTitle,
  };
}

export function createOpenRouterService({
  axiosInstance = axios,
  baseUrl = DEFAULT_BASE_URL,
  appReferer = DEFAULT_REFERER,
  appTitle = DEFAULT_TITLE,
  retryBaseDelayMs = DEFAULT_RETRY_BASE_DELAY_MS,
  maxRetryAttempts = DEFAULT_MAX_RETRY_ATTEMPTS,
  modelCacheTtlMs = DEFAULT_MODEL_CACHE_TTL_MS,
  now = Date.now,
}: CreateOpenRouterServiceOptions = {}) {
  type ModelCacheEntry = { fetchedAt: number; models: OpenRouterModelSummary[] };
  const imageModelCache = new Map<string, ModelCacheEntry>();

  function getCachedImageModels(apiKey: string): OpenRouterModelSummary[] | null {
    if (modelCacheTtlMs <= 0) {
      return null;
    }
    const entry = imageModelCache.get(apiKey);
    if (!entry) {
      return null;
    }
    if (now() - entry.fetchedAt > modelCacheTtlMs) {
      imageModelCache.delete(apiKey);
      return null;
    }
    return entry.models;
  }

  function setCachedImageModels(apiKey: string, models: OpenRouterModelSummary[]) {
    if (modelCacheTtlMs <= 0) {
      return;
    }
    imageModelCache.set(apiKey, { fetchedAt: now(), models });
  }

  function withRetry<T>(operation: () => Promise<T>, signal?: AbortSignal) {
    return retryOpenRouterCall(operation, {
      maxAttempts: maxRetryAttempts,
      baseDelayMs: retryBaseDelayMs,
      signal,
    });
  }

  async function listModels(
    apiKey: string,
    params?: Record<string, string>,
  ): Promise<OpenRouterModelSummary[]> {
    const response = await withRetry(() =>
      axiosInstance.get(`${baseUrl}/models`, {
        headers: buildHeaders(apiKey, appReferer, appTitle),
        params,
        timeout: METADATA_TIMEOUT_MS,
      }),
    );

    const rawModels = Array.isArray(response.data?.data) ? response.data.data : [];
    return rawModels
      .map((model: any): OpenRouterModelSummary | null => normalizeModelSummary(model))
      .filter((model): model is OpenRouterModelSummary => Boolean(model))
      .sort((left, right) => left.name.localeCompare(right.name));
  }

  async function getKeyInfo(apiKey: string): Promise<OpenRouterKeyInfo> {
    try {
      const response = await withRetry(() =>
        axiosInstance.get(`${baseUrl}/key`, {
          headers: buildHeaders(apiKey, appReferer, appTitle),
          timeout: METADATA_TIMEOUT_MS,
        }),
      );
      const data = response.data?.data ?? {};

      return {
        label: typeof data.label === 'string' ? data.label : null,
        limit: asNumber(data.limit),
        limitRemaining: asNumber(data.limit_remaining),
        usage: asNumber(data.usage),
        usageDaily: asNumber(data.usage_daily),
        usageWeekly: asNumber(data.usage_weekly),
        usageMonthly: asNumber(data.usage_monthly),
        byokUsage: asNumber(data.byok_usage),
        includeByokInLimit:
          typeof data.include_byok_in_limit === 'boolean' ? data.include_byok_in_limit : null,
        isFreeTier: typeof data.is_free_tier === 'boolean' ? data.is_free_tier : null,
        expiresAt: typeof data.expires_at === 'string' ? data.expires_at : null,
      };
    } catch (error) {
      throw createOpenRouterError(error, 'OpenRouter connection failed.');
    }
  }

  async function listTextModels(apiKey: string): Promise<OpenRouterModelSummary[]> {
    try {
      return await listModels(apiKey, {
        output_modalities: 'text',
        supported_parameters: 'response_format',
      });
    } catch (error) {
      throw createOpenRouterError(error, 'Could not load OpenRouter models.');
    }
  }

  async function listImageModels(apiKey: string): Promise<OpenRouterModelSummary[]> {
    const cached = getCachedImageModels(apiKey);
    if (cached) {
      return cached;
    }
    try {
      const models = await listModels(apiKey, {
        output_modalities: 'image',
      });
      setCachedImageModels(apiKey, models);
      return models;
    } catch (error) {
      throw createOpenRouterError(error, 'Could not load OpenRouter image models.');
    }
  }

  async function enhancePrompt({
    apiKey,
    prompt,
    mode,
    model,
    signal,
  }: {
    apiKey: string;
    prompt: string;
    mode: PromptEnhancementMode;
    model?: string;
    signal?: AbortSignal;
  }): Promise<OpenRouterPromptEnhancementResult> {
    const normalizedPrompt = prompt.trim();
    if (!normalizedPrompt) {
      throw new Error('Prompt cannot be empty.');
    }
    assertPromptLength(normalizedPrompt, 'Prompt');

    let response: Awaited<ReturnType<typeof axiosInstance.post>>;
    try {
      response = await withRetry(
        () =>
          axiosInstance.post(
            `${baseUrl}/chat/completions`,
            {
              ...(model?.trim() ? { model: model.trim() } : {}),
              temperature: 0.3,
              response_format: { type: 'json_object' },
              plugins: [{ id: 'response-healing' }],
              messages: [
                buildCachedSystemMessage(PROMPT_ENHANCEMENT_SYSTEM_PROMPT),
                buildUserTextMessage(JSON.stringify({ mode, prompt: normalizedPrompt })),
              ],
            },
            {
              headers: buildHeaders(apiKey, appReferer, appTitle),
              timeout: TEXT_COMPLETION_TIMEOUT_MS,
              ...(signal ? { signal } : {}),
            },
          ),
        signal,
      );
    } catch (error) {
      throw createOpenRouterError(error, 'OpenRouter prompt enhancement failed.');
    }

    const content = extractMessageContent(response.data?.choices?.[0]?.message?.content);
    const usage = extractUsage(response.data);
    try {
      const parsed = JSON.parse(content);
      return {
        ...parsePromptEnhancementContent(parsed, mode),
        usage,
      };
    } catch (parseError) {
      // API call succeeded, but the LLM ignored response_format or returned a
      // shape we don't recognize. Fall back to the user's original prompt so
      // the workflow keeps moving — surface usage so cost is still tracked.
      console.warn(
        '[openRouter] enhancePrompt: parse failed, returning original prompt unchanged',
        parseError instanceof Error ? parseError.message : parseError,
      );
      return {
        mode,
        prompt: normalizedPrompt,
        variations: [],
        usage,
      };
    }
  }

  async function suggestNegativePrompt({
    apiKey,
    prompt,
    negativePrompt,
    model,
    signal,
  }: {
    apiKey: string;
    prompt: string;
    negativePrompt?: string;
    model?: string;
    signal?: AbortSignal;
  }): Promise<OpenRouterNegativePromptSuggestionResult> {
    const normalizedPrompt = prompt.trim();
    const normalizedNegativePrompt = negativePrompt?.trim() ?? '';
    if (!normalizedPrompt) {
      throw new Error('Prompt cannot be empty.');
    }
    assertPromptLength(normalizedPrompt, 'Prompt');
    assertPromptLength(normalizedNegativePrompt, 'Negative prompt');

    try {
      const response = await withRetry(
        () =>
          axiosInstance.post(
            `${baseUrl}/chat/completions`,
            {
              ...(model?.trim() ? { model: model.trim() } : {}),
              temperature: 0.2,
              response_format: { type: 'json_object' },
              plugins: [{ id: 'response-healing' }],
              messages: [
                buildCachedSystemMessage(NEGATIVE_PROMPT_SYSTEM_PROMPT),
                buildUserTextMessage(
                  JSON.stringify({
                    prompt: normalizedPrompt,
                    negativePrompt: normalizedNegativePrompt,
                  }),
                ),
              ],
            },
            {
              headers: buildHeaders(apiKey, appReferer, appTitle),
              timeout: TEXT_COMPLETION_TIMEOUT_MS,
              ...(signal ? { signal } : {}),
            },
          ),
        signal,
      );

      const content = extractMessageContent(response.data?.choices?.[0]?.message?.content);
      const parsed = JSON.parse(content);
      return {
        ...parseNegativePromptContent(parsed),
        usage: extractUsage(response.data),
      };
    } catch (error) {
      throw createOpenRouterError(error, 'OpenRouter negative prompt suggestion failed.');
    }
  }

  async function generateImage({
    apiKey,
    model,
    prompt,
    negativePrompt,
    width,
    height,
    seed,
    signal,
  }: {
    apiKey: string;
    model: string;
    prompt: string;
    negativePrompt?: string;
    width: number;
    height: number;
    seed?: number;
    signal?: AbortSignal;
  }): Promise<OpenRouterImageGenerationResult> {
    const normalizedPrompt = prompt.trim();
    const normalizedModel = model.trim();
    const normalizedNegativePrompt = negativePrompt?.trim() ?? '';
    if (!normalizedPrompt) {
      throw new Error('Prompt cannot be empty.');
    }
    if (!normalizedModel) {
      throw new Error('OpenRouter image model is required.');
    }
    assertPromptLength(normalizedPrompt, 'Prompt');
    assertPromptLength(normalizedNegativePrompt, 'Negative prompt');

    try {
      const imageModels = await listImageModels(apiKey);
      const selectedModel = imageModels.find((candidate) => candidate.id === normalizedModel);
      const aspectRatio = toAspectRatio(width, height);
      const modalities = selectedModel?.outputModalities.includes('text')
        ? ['image', 'text']
        : ['image'];

      const response = await withRetry(
        () =>
          axiosInstance.post(
            `${baseUrl}/chat/completions`,
            {
              model: normalizedModel,
              modalities,
              stream: false,
              ...(typeof seed === 'number' ? { seed } : {}),
              ...(aspectRatio ? { image_config: { aspect_ratio: aspectRatio } } : {}),
              messages: [
                buildUserTextMessage(
                  normalizedNegativePrompt
                    ? `Generate an image.\nPrompt: ${normalizedPrompt}\nNegative prompt: ${normalizedNegativePrompt}`
                    : normalizedPrompt,
                ),
              ],
            },
            {
              headers: buildHeaders(apiKey, appReferer, appTitle),
              timeout: IMAGE_GENERATION_TIMEOUT_MS,
              signal,
            },
          ),
        signal,
      );

      const message = response.data?.choices?.[0]?.message ?? {};
      const images = Array.isArray(message.images)
        ? message.images
            .map((image: unknown) => extractImageDataUrl(image))
            .filter((image): image is OpenRouterImageResult => Boolean(image))
        : [];

      if (images.length === 0) {
        throw new Error('OpenRouter did not return any images.');
      }

      return {
        responseId: typeof response.data?.id === 'string' ? response.data.id : null,
        model: typeof response.data?.model === 'string' ? response.data.model : normalizedModel,
        content: extractMessageContent(message.content),
        images,
        usage: extractUsage(response.data),
      };
    } catch (error) {
      throw createOpenRouterError(error, 'OpenRouter image generation failed.');
    }
  }

  return {
    getKeyInfo,
    listTextModels,
    listImageModels,
    enhancePrompt,
    suggestNegativePrompt,
    generateImage,
  };
}
