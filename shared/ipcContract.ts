/**
 * The renderer <-> main IPC contract: the single source of truth for every
 * `ipcRenderer.invoke` channel the preload exposes and every `ipcMain.handle`
 * listener the main process registers.
 *
 *   channel -> { request: zod schema of the positional args, result type }
 *
 * - The main process registers each handler through `handleIpc`
 *   (electron/ipc-handlers/ipcHandle.ts), which parses the args with
 *   `request`, refuses frames other than the app's own top frame, and types
 *   the handler's return against the channel's result.
 * - The preload builds `window.electron` from IPC_BRIDGE, so a method can only
 *   reach the channel the contract names, with the args the contract types.
 * - src/types/electron.d.ts re-exports ElectronAPI from here; there is no
 *   second hand-written declaration to drift.
 *
 * Push channels (main -> renderer) are declared in IPC_PUSH_SCHEMAS and
 * validated in the preload before a renderer callback sees them.
 *
 * Dependency-free apart from zod and the alias-free shared/ipcTypes.ts.
 */

import { z } from 'zod';

import type {
  BackendStatus,
  BackendStatusChangedEvent,
  BridgeFailure,
  DerivedImageResult,
  DirectorIndexStats,
  DirectorIngestResult,
  DownloadTokenSetResult,
  EnhancePromptResult,
  ExportAssetResult,
  ExportManyResult,
  ExtractedFrameResult,
  GenerationProgressEvent,
  ImportFilesResult,
  JobResponse,
  JobStatus,
  NotifyResult,
  OpenRouterKeyInfoResult,
  OpenRouterModelListResult,
  ProvisionStatusSnapshot,
  ReadDataUrlResult,
  ResolvedAppSettings,
  RunGraphResult,
  SaveDataUrlResult,
  StepImageEvent,
  SuccessResult,
  SuggestNegativePromptResult,
  SystemInfo,
  UpdaterDownloadReply,
  UpdaterStatus,
  UserAccountsSnapshot,
} from './ipcTypes';
import type {
  DetectedRoot,
  DownloadJob,
  HardwareProfile,
  LibraryRoot,
  ModelRecord,
  RuntimePlan,
  ScanResult,
  SearchResponse,
} from '../src/types/model';

// -- Contract plumbing ------------------------------------------------------

/** One invoke channel: a runtime request schema plus a type-only result. */
export interface IpcChannelSpec<Request extends z.ZodType, Result> {
  readonly request: Request;
  /** Type-level only; never set at runtime. */
  readonly result?: Result;
}

function channel<Result>() {
  return <Request extends z.ZodType>(request: Request): IpcChannelSpec<Request, Result> => ({ request });
}

/**
 * Loose (pass-through) object schemas infer `{ ... } & { [k: string]: unknown }`,
 * which an `interface` payload is not assignable to. Strip index signatures
 * from the renderer-facing arg types; the runtime schema still forwards the
 * unknown keys to the backend, which validates them itself.
 */
export type StripIndexSignatures<T> = T extends readonly unknown[]
  ? { [K in keyof T]: StripIndexSignatures<T[K]> }
  : T extends (...args: never[]) => unknown
    ? T
    : T extends object
      ? { [K in keyof T as string extends K ? never : number extends K ? never : K]: StripIndexSignatures<T[K]> }
      : T;

// -- Shared primitives --------------------------------------------------------

const MAX_PATH_CHARS = 4096;
const MAX_PROMPT_CHARS = 20_000;
const MAX_ID_CHARS = 512;

const noNul = (value: string) => !value.includes('\0');

/** A filesystem path or file:// URL. Containment is enforced by the handler. */
const pathArg = z.string().min(1).max(MAX_PATH_CHARS).refine(noNul, 'Path contains a NUL byte.');
/** Job / model / root / account id. Always URL-encoded by the handler before use in a path. */
const idArg = z.string().min(1).max(MAX_ID_CHARS).refine(noNul, 'Id contains a NUL byte.');
const promptText = z.string().max(MAX_PROMPT_CHARS);
const finite = z.number();
const nonNegative = z.number().nonnegative();

// -- Generation payload schemas ----------------------------------------------

const pointSchema = z.object({ x: finite, y: finite });
const boundsSchema = z.object({ x: finite, y: finite, width: finite, height: finite });
const maskSchema = z.looseObject({
  type: z.enum(['rectangle', 'polygon', 'brush', 'erase']),
  points: z.array(pointSchema).max(100_000),
  bounds: boundsSchema,
  brush_size: finite.optional(),
});

const controlNetLayerSchema = z.looseObject({
  layer_id: z.string().max(MAX_ID_CHARS),
  layer_name: z.string().max(1024),
  source_path: pathArg,
  preprocessor: z.string().max(128),
  strength: finite,
  start_step: finite,
  end_step: finite,
  mask: maskSchema,
  prompt: promptText.optional(),
  negative_prompt: promptText.optional(),
});

const referenceImageLayerSchema = z.looseObject({
  layer_id: z.string().max(MAX_ID_CHARS),
  layer_name: z.string().max(1024),
  source_path: pathArg,
  mask: maskSchema,
  strength: finite.optional(),
});

const inpaintSchema = z.looseObject({
  layer_id: z.string().max(MAX_ID_CHARS),
  layer_name: z.string().max(1024),
  image_path: pathArg,
  mask: maskSchema,
  prompt: promptText.optional(),
  negative_prompt: promptText.optional(),
});

const outpaintSchema = z.looseObject({
  image_path: pathArg,
  directions: z.array(z.enum(['up', 'down', 'left', 'right'])).max(4),
  pixels: nonNegative,
  prompt: promptText.optional(),
  negative_prompt: promptText.optional(),
});

const accelerationSchema = z.looseObject({
  master_enable: z.boolean(),
  sdpa: z.string().max(32),
  channels_last: z.string().max(32),
  compile: z.string().max(32),
  quantization: z.string().max(32),
  attention_slicing: z.string().max(32),
  tensorrt: z.string().max(32),
});

const loraSelectionSchema = z.looseObject({
  id: idArg,
  weight: finite,
});

export const imageGenerationRequestSchema = z.looseObject({
  prompt: promptText,
  negative_prompt: promptText.optional(),
  width: nonNegative,
  height: nonNegative,
  steps: nonNegative,
  cfg_scale: finite,
  seed: finite.optional(),
  model: z.string().max(MAX_ID_CHARS).optional(),
  scheduler: z.string().max(128).optional(),
  controlnet: z.array(controlNetLayerSchema).max(64).optional(),
  reference_images: z.array(referenceImageLayerSchema).max(64).optional(),
  image_path: pathArg.optional(),
  mask: maskSchema.optional(),
  inpaint: inpaintSchema.optional(),
  outpaint: outpaintSchema.optional(),
  background_replace: z.looseObject({ image_path: pathArg }).optional(),
  denoising_strength: finite.optional(),
  /** M6: per-request hosted provider override for over-budget fallback routing. */
  __providerOverride: z.enum(['openrouter', 'huggingface']).optional(),
  acceleration_settings: accelerationSchema.optional(),
  loras: z.array(loraSelectionSchema).max(64).optional(),
  /** #42: renderer-resolved Hub repo id for HuggingFace adapter dispatch. */
  __huggingFaceLoraAdapter: z.string().max(MAX_ID_CHARS).optional(),
});

export const videoGenerationRequestSchema = z.looseObject({
  prompt: promptText,
  image_path: pathArg.optional(),
  width: nonNegative,
  height: nonNegative,
  duration: nonNegative,
  fps: nonNegative,
  steps: nonNegative.optional(),
  model: z.string().max(MAX_ID_CHARS).optional(),
  seed: finite.optional(),
  /** M9: optional per-request acceleration toggles (local generation only). */
  acceleration_settings: accelerationSchema.optional(),
  /** #136: local-only LoRA adapters to stack. */
  loras: z.array(loraSelectionSchema).max(64).optional(),
  /** Per-request hosted override: video routes only to HuggingFace. */
  __providerOverride: z.literal('huggingface').optional(),
});

const timelineLayerSchema = z.looseObject({
  source_path: pathArg,
  media_type: z.enum(['image', 'video']),
  source_time_ms: nonNegative,
  opacity: finite,
});

const timelineAudioLayerSchema = z.looseObject({
  source_path: pathArg,
  source_time_ms: nonNegative,
  timeline_offset_ms: nonNegative,
  duration_ms: nonNegative,
  clip_offset_ms: nonNegative,
  clip_duration_ms: nonNegative,
  gain: finite,
  fade_in_ms: nonNegative,
  fade_out_ms: nonNegative,
});

export const timelineExportRequestSchema = z.looseObject({
  sequence_name: z.string().max(1024),
  width: nonNegative,
  height: nonNegative,
  fps: nonNegative,
  output_path: pathArg,
  frames: z.array(
    z.looseObject({
      time_ms: nonNegative,
      layers: z.array(timelineLayerSchema).max(256),
    }),
  ),
  audio_layers: z.array(timelineAudioLayerSchema).max(256),
});

export const batchRequestSchema = z.looseObject({
  prompts: z.array(promptText).min(1).max(500),
  negative_prompt: promptText.optional(),
  width: nonNegative,
  height: nonNegative,
  steps: nonNegative,
  cfg_scale: finite,
  model: z.string().max(MAX_ID_CHARS).optional(),
});

const retrievalSourceSchema = z.enum(['prompt-history', 'assets', 'knowledge-base']);
const augmentSchema = z.strictObject({
  sources: z.array(retrievalSourceSchema).max(3),
  modelFamily: z.string().max(128).nullable(),
});

const enhancePromptRequestSchema = z.strictObject({
  prompt: promptText,
  mode: z.enum(['clarify', 'cinematic', 'concise', 'expand', 'variations']).optional(),
  augment: augmentSchema.optional(),
});

const suggestNegativePromptRequestSchema = z.strictObject({
  prompt: promptText,
  negativePrompt: promptText.optional(),
  augment: augmentSchema.optional(),
});

const cropImageRequestSchema = z.strictObject({
  source_path: pathArg,
  crop_box: z
    .strictObject({ left: nonNegative, top: nonNegative, width: nonNegative, height: nonNegative })
    .optional(),
  rotation: finite.optional(),
  flip_horizontal: z.boolean().optional(),
  flip_vertical: z.boolean().optional(),
});

const extractVideoFrameRequestSchema = z.strictObject({
  source_path: pathArg,
  time_ms: nonNegative.optional(),
});

/** The backend's three edit routes; anything else never reaches a URL path. */
export const EDIT_OPERATIONS = ['remove-background', 'upscale', 'restore-faces'] as const;
export type EditOperation = (typeof EDIT_OPERATIONS)[number];

const editImageRequestSchema = z.strictObject({
  operation: z.enum(EDIT_OPERATIONS),
  source_path: pathArg,
  edge_refinement: finite.optional(),
  scale: z.union([z.literal(2), z.literal(4)]).optional(),
  model: z.enum(['general', 'anime']).optional(),
  face_enhance: z.boolean().optional(),
  strength: finite.optional(),
});

/** ComfyUI API-format prompt (mirrors src/features/workflow/comfyExport.ts ComfyPrompt). */
const comfyInputValueSchema = z.union([
  z.string().max(MAX_PROMPT_CHARS),
  finite,
  z.boolean(),
  z.null(),
  z.tuple([z.string().max(MAX_ID_CHARS), z.union([z.string().max(MAX_ID_CHARS), finite])]),
]);
export const comfyPromptSchema = z.record(
  z.string().max(MAX_ID_CHARS),
  z.strictObject({
    class_type: z.string().min(1).max(256),
    inputs: z.record(z.string().max(256), comfyInputValueSchema),
    _meta: z.strictObject({ title: z.string().max(1024).optional() }).optional(),
  }),
);

const ingestRecordSchema = z.strictObject({
  source: retrievalSourceSchema,
  text: z.string().max(MAX_PROMPT_CHARS),
  boosted: z.boolean(),
  label: z.string().max(1024),
});

// -- Settings / accounts schemas ------------------------------------------------

export const aiDirectorSettingsSchema = z.strictObject({
  enabled: z.boolean(),
  sources: z.strictObject({
    promptHistory: z.boolean(),
    assets: z.boolean(),
    knowledgeBase: z.boolean(),
  }),
});

/**
 * settings:update patch. Strict: an unknown key (or the retired `autoSave`)
 * is refused instead of being merged into the persisted settings, as is the
 * retired `pythonPath`. The output-folder rules need the filesystem and are
 * enforced by the handler.
 */
export const settingsPatchSchema = z.strictObject({
  theme: z.enum(['dark', 'light', 'system']).optional(),
  defaultOutputPath: z.string().max(MAX_PATH_CHARS).refine(noNul, 'Path contains a NUL byte.').optional(),
  backendAutostart: z.boolean().optional(),
  notifyOnGenerationComplete: z.boolean().optional(),
  notifyOnGenerationFailed: z.boolean().optional(),
  notifyOnModelDownloads: z.boolean().optional(),
  autoRouteOnOverBudget: z.boolean().optional(),
  aiDirector: aiDirectorSettingsSchema.optional(),
});
export type SettingsPatch = z.infer<typeof settingsPatchSchema>;

const providerSchema = z.enum(['local', 'openrouter', 'huggingface']);
const modelNameSchema = z.string().max(MAX_ID_CHARS);

export const accountPatchSchema = z.strictObject({
  name: z.string().max(200).optional(),
  promptEnhancementProvider: providerSchema.optional(),
  openRouterModel: modelNameSchema.optional(),
  imageGenerationProvider: providerSchema.optional(),
  videoGenerationProvider: providerSchema.optional(),
  openRouterImageModel: modelNameSchema.optional(),
  huggingFaceModel: modelNameSchema.optional(),
  huggingFaceImageModel: modelNameSchema.optional(),
  huggingFaceVideoModel: modelNameSchema.optional(),
  fallbackProvider: z.enum(['openrouter', 'huggingface']).nullable().optional(),
});
export type AccountPatch = z.infer<typeof accountPatchSchema>;

const secretSchema = z.string().min(1).max(4096);

const fileFilterSchema = z.strictObject({
  name: z.string().max(256),
  extensions: z.array(z.string().max(32)).max(64),
});

const getPathNameSchema = z.enum(['userData', 'documents', 'downloads', 'pictures']);

// -- The contract -------------------------------------------------------------

const none = z.tuple([]);
const optionalAccountId = z.tuple([idArg.optional()]);

export const IPC_CONTRACT = {
  // App
  'app:get-version': channel<string>()(none),
  'app:open-external': channel<void>()(z.tuple([z.string().min(1).max(MAX_PATH_CHARS)])),
  'app:get-path': channel<string>()(z.tuple([getPathNameSchema])),
  'app:open-path': channel<SuccessResult>()(z.tuple([pathArg])),

  // Auto-update (#34 installer PR4)
  'updater:get-status': channel<UpdaterStatus>()(none),
  'updater:check': channel<UpdaterStatus>()(none),
  /** Starts the download of the available update; answers with the `downloading` status. */
  'updater:download': channel<UpdaterDownloadReply>()(none),
  'updater:install': channel<void>()(none),

  // Native dialogs
  'dialog:select-folder': channel<string | null>()(none),
  'dialog:select-media-files': channel<string[]>()(none),
  'dialog:save-file': channel<string | null>()(
    z.tuple([
      z
        .strictObject({
          defaultPath: z.string().max(MAX_PATH_CHARS).refine(noNul).optional(),
          filters: z.array(fileFilterSchema).max(32).optional(),
        })
        .optional(),
    ]),
  ),

  // Settings
  'settings:get': channel<ResolvedAppSettings>()(none),
  'settings:update': channel<ResolvedAppSettings>()(z.tuple([settingsPatchSchema])),

  // M7 AI Director index
  'director:sync-corpus': channel<DirectorIngestResult>()(z.tuple([z.array(ingestRecordSchema).max(10_000)])),
  'director:clear-index': channel<SuccessResult>()(none),
  'director:index-stats': channel<DirectorIndexStats>()(none),

  // Accounts
  'accounts:list': channel<UserAccountsSnapshot>()(none),
  'accounts:create': channel<UserAccountsSnapshot>()(
    z.tuple([z.strictObject({ name: z.string().max(200).optional() }).optional()]),
  ),
  'accounts:update': channel<UserAccountsSnapshot>()(z.tuple([idArg, accountPatchSchema])),
  'accounts:delete': channel<UserAccountsSnapshot>()(z.tuple([idArg])),
  'accounts:set-active': channel<UserAccountsSnapshot>()(z.tuple([idArg])),
  'accounts:set-openrouter-api-key': channel<UserAccountsSnapshot>()(
    z.tuple([z.strictObject({ accountId: idArg, apiKey: secretSchema })]),
  ),
  'accounts:clear-openrouter-api-key': channel<UserAccountsSnapshot>()(z.tuple([idArg])),
  'accounts:set-huggingface-token': channel<UserAccountsSnapshot>()(
    z.tuple([z.strictObject({ accountId: idArg, token: secretSchema })]),
  ),
  'accounts:clear-huggingface-token': channel<UserAccountsSnapshot>()(z.tuple([idArg])),

  // OpenRouter
  'openrouter:test-connection': channel<OpenRouterKeyInfoResult>()(optionalAccountId),
  'openrouter:get-key-info': channel<OpenRouterKeyInfoResult>()(optionalAccountId),
  'openrouter:list-models': channel<OpenRouterModelListResult>()(optionalAccountId),
  'openrouter:list-image-models': channel<OpenRouterModelListResult>()(optionalAccountId),

  // Assets
  'assets:import-files': channel<ImportFilesResult>()(z.tuple([z.array(pathArg).max(1000)])),
  'assets:read-data-url': channel<ReadDataUrlResult>()(z.tuple([pathArg])),
  'assets:save-data-url': channel<SaveDataUrlResult>()(
    z.tuple([
      z.strictObject({
        // Base64 of at most MAX_DATA_URL_ASSET_BYTES (200 MB) plus the prefix.
        dataUrl: z.string().max(280 * 1024 * 1024),
        fileName: z.string().max(1024),
      }),
    ]),
  ),
  'assets:export': channel<ExportAssetResult>()(z.tuple([pathArg, pathArg])),
  'assets:export-many': channel<ExportManyResult>()(z.tuple([z.array(pathArg).max(10_000), pathArg])),
  'assets:delete': channel<SuccessResult>()(z.tuple([pathArg])),
  'assets:reveal': channel<SuccessResult>()(z.tuple([pathArg])),
  'assets:clear-cache': channel<SuccessResult>()(none),

  // Generation
  'generation:generate-image': channel<JobResponse>()(z.tuple([imageGenerationRequestSchema])),
  'generation:generate-video': channel<JobResponse>()(z.tuple([videoGenerationRequestSchema])),
  'generation:export-timeline-sequence': channel<JobResponse>()(z.tuple([timelineExportRequestSchema])),
  'generation:batch': channel<JobResponse>()(z.tuple([batchRequestSchema])),
  'generation:enhance-prompt': channel<EnhancePromptResult>()(z.tuple([enhancePromptRequestSchema])),
  'generation:suggest-negative-prompt': channel<SuggestNegativePromptResult>()(
    z.tuple([suggestNegativePromptRequestSchema]),
  ),
  /** Crop / extract reject on failure: their result always carries the derived image. */
  'generation:crop-image': channel<DerivedImageResult>()(z.tuple([cropImageRequestSchema])),
  'generation:extract-video-frame': channel<ExtractedFrameResult>()(z.tuple([extractVideoFrameRequestSchema])),
  'generation:edit-image': channel<JobResponse>()(z.tuple([editImageRequestSchema])),
  /** Rejects (instead of resolving a failure envelope) when the status cannot be read. */
  'generation:get-status': channel<JobStatus>()(z.tuple([idArg])),
  'generation:cancel': channel<SuccessResult>()(z.tuple([idArg])),

  // Workflow (M8)
  // Image graphs only: the backend's ComfyUI node allow-list has no vetted
  // video nodes, so it refuses `video` (backend/api/comfy_graph.py). Rejecting
  // it here fails fast instead of round-tripping a guaranteed 422.
  'workflow:run-graph': channel<RunGraphResult>()(
    z.tuple([z.strictObject({ graph: comfyPromptSchema, generationType: z.literal('image') })]),
  ),

  // System / backend
  'system:get-info': channel<SystemInfo>()(none),
  'backend:start': channel<SuccessResult>()(none),
  'backend:status': channel<BackendStatus>()(none),

  // Models (Foundry). Queue / library calls reject on a backend failure so a
  // failure body is never merged into the renderer's typed state.
  'models:list': channel<ModelRecord[]>()(none),
  'models:download': channel<DownloadJob>()(z.tuple([idArg])),
  'models:download:pause': channel<DownloadJob>()(z.tuple([idArg])),
  'models:download:resume': channel<DownloadJob>()(z.tuple([idArg])),
  'models:download:cancel': channel<DownloadJob>()(z.tuple([idArg])),
  'models:downloads:list': channel<DownloadJob[]>()(none),
  'models:delete': channel<SuccessResult>()(z.tuple([idArg])),
  'models:import': channel<LibraryRoot>()(z.tuple([pathArg, z.enum(['comfyui', 'a1111', 'generic'])])),
  'models:scan': channel<ScanResult>()(none),
  'models:libraries:list': channel<LibraryRoot[]>()(none),
  'models:libraries:remove': channel<{ removed: boolean; records_dropped: number }>()(z.tuple([idArg])),
  'models:libraries:detect': channel<DetectedRoot[]>()(none),
  'models:search': channel<SearchResponse>()(
    z.tuple([z.string().max(512), z.enum(['hf', 'civitai']), z.number().int().min(1).max(10_000), z.boolean()]),
  ),
  'models:consent': channel<SuccessResult & { [key: string]: unknown }>()(
    z.tuple([idArg, z.enum(['pickle', 'trust_remote_code']), z.boolean()]),
  ),
  'models:convert': channel<SuccessResult & { [key: string]: unknown }>()(z.tuple([idArg])),
  'models:resolveRuntime': channel<RuntimePlan | BridgeFailure>()(z.tuple([idArg])),

  // #34 installer PR2/PR3: first-run auto-provisioning (K3 subset start)
  'provision:status': channel<ProvisionStatusSnapshot | BridgeFailure>()(none),
  'provision:start': channel<ProvisionStatusSnapshot | BridgeFailure>()(
    z.tuple([z.strictObject({ modelIds: z.array(idArg).min(1).max(500).optional() }).optional()]),
  ),
  'provision:pause': channel<ProvisionStatusSnapshot | BridgeFailure>()(none),
  'provision:resume': channel<ProvisionStatusSnapshot | BridgeFailure>()(none),
  'provision:cancel': channel<ProvisionStatusSnapshot | BridgeFailure>()(none),
  'provision:reverify': channel<ProvisionStatusSnapshot | BridgeFailure>()(none),

  'hardware:get': channel<HardwareProfile | BridgeFailure>()(none),

  // Foundry download tokens (set / clear only; never read back)
  'auth:setHfToken': channel<DownloadTokenSetResult>()(z.tuple([z.string().max(4096)])),
  'auth:setCivitaiToken': channel<DownloadTokenSetResult>()(z.tuple([z.string().max(4096)])),

  'notifications:notify': channel<NotifyResult>()(
    z.tuple([
      z.enum(['generation_complete', 'generation_failed', 'model_download']),
      z.strictObject({ title: z.string().max(256), body: z.string().max(2048) }),
    ]),
  ),
} as const;

export type IpcContract = typeof IPC_CONTRACT;
export type IpcChannel = keyof IpcContract;

/** Positional args the renderer passes (schema input, index signatures stripped). */
export type IpcArgs<C extends IpcChannel> = StripIndexSignatures<z.input<IpcContract[C]['request']>>;
/** Positional args the handler receives (schema output, after parsing). */
export type IpcParsedArgs<C extends IpcChannel> = z.output<IpcContract[C]['request']>;
export type IpcResult<C extends IpcChannel> =
  IpcContract[C] extends IpcChannelSpec<z.ZodType, infer Result> ? Result : never;

export function isIpcChannel(value: string): value is IpcChannel {
  return Object.prototype.hasOwnProperty.call(IPC_CONTRACT, value);
}

// -- Named request types (renderer-facing) -----------------------------------

export type ImageGenerationRequest = IpcArgs<'generation:generate-image'>[0];
export type VideoGenerationRequest = IpcArgs<'generation:generate-video'>[0];
export type TimelineExportRequest = IpcArgs<'generation:export-timeline-sequence'>[0];
export type BatchRequest = IpcArgs<'generation:batch'>[0];
export type ComfyPromptPayload = IpcArgs<'workflow:run-graph'>[0]['graph'];

// -- Push channels (main -> renderer) ------------------------------------------

const jobStatusSchema = z.enum(['pending', 'processing', 'completed', 'failed', 'cancelled']);

export const IPC_PUSH_SCHEMAS = {
  'generation:progress': z.looseObject({
    type: z.literal('job_update'),
    job_id: z.string().min(1).max(MAX_ID_CHARS),
    status: jobStatusSchema,
    progress: z.number(),
  }),
  'generation:step-image': z.looseObject({
    type: z.literal('step_image'),
    job_id: z.string().min(1).max(MAX_ID_CHARS),
    step: z.number(),
    total_steps: z.number(),
    image: z.string(),
  }),
  'backend:status-changed': z.looseObject({
    running: z.boolean(),
    pid: z.number().int().nullable().optional(),
    error: z.string().max(4096).optional(),
  }),
  'updater:status': z.looseObject({
    state: z.enum([
      'disabled',
      'idle',
      'checking',
      'available',
      'not-available',
      'downloading',
      'downloaded',
      'error',
    ]),
    version: z.string().optional(),
    percent: z.number().optional(),
    bytesPerSecond: z.number().optional(),
    transferred: z.number().optional(),
    total: z.number().optional(),
    message: z.string().optional(),
  }),
} as const;

export interface IpcPushPayloads {
  'generation:progress': GenerationProgressEvent;
  'generation:step-image': StepImageEvent;
  'backend:status-changed': BackendStatusChangedEvent;
  'updater:status': UpdaterStatus;
}
export type IpcPushChannel = keyof IpcPushPayloads;

// -- The bridge: window.electron method -> channel ----------------------------

export const IPC_BRIDGE = {
  app: {
    getVersion: 'app:get-version',
    openExternal: 'app:open-external',
    getPath: 'app:get-path',
    openPath: 'app:open-path',
  },
  dialog: {
    selectFolder: 'dialog:select-folder',
    selectMediaFiles: 'dialog:select-media-files',
    saveFile: 'dialog:save-file',
  },
  settings: {
    get: 'settings:get',
    update: 'settings:update',
  },
  director: {
    syncCorpus: 'director:sync-corpus',
    clearIndex: 'director:clear-index',
    indexStats: 'director:index-stats',
  },
  accounts: {
    list: 'accounts:list',
    create: 'accounts:create',
    update: 'accounts:update',
    delete: 'accounts:delete',
    setActive: 'accounts:set-active',
    setOpenRouterApiKey: 'accounts:set-openrouter-api-key',
    clearOpenRouterApiKey: 'accounts:clear-openrouter-api-key',
    setHuggingFaceToken: 'accounts:set-huggingface-token',
    clearHuggingFaceToken: 'accounts:clear-huggingface-token',
  },
  openrouter: {
    testConnection: 'openrouter:test-connection',
    getKeyInfo: 'openrouter:get-key-info',
    listModels: 'openrouter:list-models',
    listImageModels: 'openrouter:list-image-models',
  },
  assets: {
    importFiles: 'assets:import-files',
    readDataUrl: 'assets:read-data-url',
    saveDataUrl: 'assets:save-data-url',
    export: 'assets:export',
    exportMany: 'assets:export-many',
    delete: 'assets:delete',
    reveal: 'assets:reveal',
    clearCache: 'assets:clear-cache',
  },
  generation: {
    generateImage: 'generation:generate-image',
    generateVideo: 'generation:generate-video',
    exportTimelineSequence: 'generation:export-timeline-sequence',
    batch: 'generation:batch',
    enhancePrompt: 'generation:enhance-prompt',
    suggestNegativePrompt: 'generation:suggest-negative-prompt',
    cropImage: 'generation:crop-image',
    extractVideoFrame: 'generation:extract-video-frame',
    editImage: 'generation:edit-image',
    getStatus: 'generation:get-status',
    cancel: 'generation:cancel',
  },
  workflow: {
    runGraph: 'workflow:run-graph',
  },
  system: {
    getInfo: 'system:get-info',
  },
  models: {
    list: 'models:list',
    download: 'models:download',
    downloadPause: 'models:download:pause',
    downloadResume: 'models:download:resume',
    downloadCancel: 'models:download:cancel',
    downloadsList: 'models:downloads:list',
    delete: 'models:delete',
    importRoot: 'models:import',
    scan: 'models:scan',
    librariesList: 'models:libraries:list',
    librariesRemove: 'models:libraries:remove',
    librariesDetect: 'models:libraries:detect',
    search: 'models:search',
    consent: 'models:consent',
    convert: 'models:convert',
    resolveRuntime: 'models:resolveRuntime',
  },
  provisioning: {
    status: 'provision:status',
    start: 'provision:start',
    pause: 'provision:pause',
    resume: 'provision:resume',
    cancel: 'provision:cancel',
    reverify: 'provision:reverify',
  },
  hardware: {
    get: 'hardware:get',
  },
  auth: {
    setHfToken: 'auth:setHfToken',
    setCivitaiToken: 'auth:setCivitaiToken',
  },
  notifications: {
    notify: 'notifications:notify',
  },
  backend: {
    start: 'backend:start',
    getStatus: 'backend:status',
  },
  updater: {
    getStatus: 'updater:get-status',
    check: 'updater:check',
    download: 'updater:download',
    install: 'updater:install',
  },
} as const satisfies Record<string, Record<string, IpcChannel>>;

/** Push subscriptions: window.electron method -> push channel. */
export const IPC_PUSH_BRIDGE = {
  generation: {
    onProgress: 'generation:progress',
    onStepImage: 'generation:step-image',
  },
  backend: {
    onStatusChange: 'backend:status-changed',
  },
  updater: {
    onStatus: 'updater:status',
  },
} as const satisfies Record<string, Record<string, IpcPushChannel>>;

type Bridge = typeof IPC_BRIDGE;
type PushBridge = typeof IPC_PUSH_BRIDGE;

// `-readonly`: the `as const` maps are readonly, but the API object is a
// plain mutable one (renderer tests stub individual methods).
type InvokeNamespace<NS extends keyof Bridge> = {
  -readonly [M in keyof Bridge[NS]]: Bridge[NS][M] extends IpcChannel
    ? (...args: IpcArgs<Bridge[NS][M]>) => Promise<IpcResult<Bridge[NS][M]>>
    : never;
};

type PushNamespace<NS extends keyof PushBridge> = {
  -readonly [M in keyof PushBridge[NS]]: PushBridge[NS][M] extends IpcPushChannel
    ? (callback: (payload: IpcPushPayloads[PushBridge[NS][M]]) => void) => () => void
    : never;
};

/** The API the preload exposes as `window.electron`. */
export type ElectronAPI = {
  -readonly [NS in keyof Bridge]: InvokeNamespace<NS> & (NS extends keyof PushBridge ? PushNamespace<NS> : unknown);
};
