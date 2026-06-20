# Vision Studio — API Reference

> Companion docs: [`ARCHITECTURE.md`](./ARCHITECTURE.md), [`DATABASE_SCHEMA.md`](./DATABASE_SCHEMA.md), machine-readable [`api/openapi.json`](./api/openapi.json).
> Live, interactive Swagger UI is exposed by the running backend at `http://127.0.0.1:8000/api/docs` (ReDoc at `/api/redoc`, raw JSON at `/api/openapi.json`).

This document describes **three** API surfaces, in the order you typically encounter them:

1. **Electron IPC** — what the renderer calls. Every channel is typed by `ElectronAPI` in `electron/preload.ts`.
2. **Backend REST + WebSocket** — what the Main process calls (and what the IPC handlers proxy to). This is the source of truth for everything the AI subsystem can do.
3. **Hosted provider integrations (BYO)** — OpenRouter and HuggingFace Inference for prompt enhancement and still-image generation, behind one routing fabric.

Conventions used throughout:

- **Auth** — backend HTTP/WS requests must carry `x-vision-studio-token: <token>` if `VISION_STUDIO_BACKEND_AUTH_TOKEN` is set in the backend env. The token is per-launch and is passed by the Main process automatically; manual callers (curl, Postman) need to set it themselves. Exempt paths: `/`, `/api/health`, `/api/docs`, `/api/redoc`, `/api/openapi.json`, `/outputs/*`. WebSocket exposes the token via `?token=…`.
- **Rate limits** — see the per-endpoint annotations. All limits are per-IP and enforced by `slowapi`.
- **Errors** — backend errors have shape `{ "detail": { "error": "...", "error_code": "..." } }` for routers under `/api/v1/*`, and `{ "detail": "..." }` for the legacy top-level endpoints. IPC handlers return `{ success: false, error: "..." }` with the renderer-safe message stripped of paths/stacks by `toSafeRendererError`.
- **Time** — all timestamps are ISO 8601 UTC.
- **Paths** — `/outputs/...` is a server-relative URL served by `StaticFiles` (HTTP) AND a renderer-friendly relative path (used directly in `<img src>` against the backend). Absolute filesystem paths are used only inside Pydantic request bodies for ops that need the original on disk.

---

## Part 1 — Electron IPC (`window.electron.*`)

The renderer never talks to the backend directly. It calls `window.electron.<namespace>.<method>(args)` which is exposed by `electron/preload.ts` via `contextBridge.exposeInMainWorld('electron', electronAPI)`.

Every IPC method below corresponds to one `ipcMain.handle('<channel>', ...)` registration in `electron/services/mainIpc.ts`, `electron/ipc-handlers/generation.ts`, or (for the `auth:*` channels) `electron/main.ts`. The push channels (`generation:progress`, `backend:status`) use `ipcRenderer.on(...)` — `onProgress(cb)` and `onStatusChange(cb)` return an unsubscribe function.

### 1.1 `electron.app`

| Method | IPC channel | Returns | Notes |
|--------|-------------|---------|-------|
| `getVersion()` | `app:get-version` | `Promise<string>` | `app.getVersion()` |
| `openExternal(url)` | `app:open-external` | `Promise<void>` | URL must pass `isSafeExternalUrl` (http(s)/mailto). Unsafe URLs are silently logged and dropped. |
| `getPath(name)` | `app:get-path` | `Promise<string>` | `name` ∈ `'userData' \| 'documents' \| 'downloads' \| 'pictures'` |
| `openPath(filePath)` | `app:open-path` | `Promise<{ success, error? }>` | Resolves through `outputRoots.resolveManagedAssetPath` first; falls back to absolute resolution if that throws. |

### 1.2 `electron.dialog`

| Method | IPC channel | Returns | Notes |
|--------|-------------|---------|-------|
| `selectFolder()` | `dialog:select-folder` | `Promise<string \| null>` | OS folder picker |
| `selectMediaFiles()` | `dialog:select-media-files` | `Promise<string[]>` | Multi-select; image/video/audio filters; paths normalized to forward slashes |
| `saveFile(options)` | `dialog:save-file` | `Promise<string \| null>` | `options: { defaultPath?, filters? }` |

### 1.3 `electron.store`

Generic key/value over `electron-store`. Allowed keys are whitelisted by `isAllowedStoreKey`: `recentProjects`, `settings`, `firstRun`, `modelsDownloaded`, `managedOutputRoots`, `userAccounts`. Unknown keys are silently dropped (with a warning log).

| Method | IPC channel | Returns |
|--------|-------------|---------|
| `get(key)` | `store:get` | `Promise<any>` |
| `set(key, value)` | `store:set` | `Promise<void>` |
| `reset()` | `store:reset` | `Promise<void>` (clears the entire store) |

### 1.4 `electron.settings`

Typed `AppSettings` over the `settings` store key. The Main process triggers a backend restart if `shouldRestartBackend(prev, next)` returns true (e.g. `pythonPath` or `defaultOutputPath` changes).

```ts
type AppSettings = {
  theme: 'dark' | 'light' | 'system';
  autoSave: boolean;
  defaultOutputPath: string;
  backendAutostart: boolean;
  notifyOnGenerationComplete: boolean;
  notifyOnGenerationFailed: boolean;
  notifyOnModelDownloads: boolean;
  pythonPath?: string;
};
```

| Method | IPC channel | Returns |
|--------|-------------|---------|
| `get()` | `settings:get` | `Promise<AppSettings>` |
| `update(patch)` | `settings:update` | `Promise<AppSettings>` (the merged result) |
| `reset()` | `settings:reset` | `Promise<AppSettings>` (defaults) |

### 1.5 `electron.accounts` & `electron.openrouter`

Multi-account preferences (e.g. for routing image generation to OpenRouter or local). The active account drives provider routing in `ipc-handlers/generation.ts`. API keys are encrypted at rest via `safeStorage.encryptString` and never returned to the renderer.

```ts
type AccountPreferences = {
  promptEnhancementProvider: 'local' | 'openrouter';
  openRouterModel: string;
  imageGenerationProvider: 'local' | 'openrouter';
  openRouterImageModel: string;
};
```

| Method | IPC channel | Notes |
|--------|-------------|-------|
| `accounts.list()` | `accounts:list` | Returns `{ activeAccountId, accounts[] }` |
| `accounts.create(payload?)` | `accounts:create` | `payload?: { name? }` |
| `accounts.update(accountId, patch)` | `accounts:update` | Partial of `AccountPreferences` + `name?` |
| `accounts.delete(accountId)` | `accounts:delete` | |
| `accounts.setActive(accountId)` | `accounts:set-active` | |
| `accounts.setOpenRouterApiKey({ accountId, apiKey })` | `accounts:set-openrouter-api-key` | Encrypted via `safeStorage` |
| `accounts.clearOpenRouterApiKey(accountId)` | `accounts:clear-openrouter-api-key` | |
| `openrouter.testConnection(accountId?)` | `openrouter:test-connection` | Round-trips OpenRouter `GET /api/v1/key`; returns `keyInfo` summary |
| `openrouter.getKeyInfo(accountId?)` | `openrouter:get-key-info` | Same call, no validation marker |
| `openrouter.listModels(accountId?)` | `openrouter:list-models` | Text models for prompt enhancement |
| `openrouter.listImageModels(accountId?)` | `openrouter:list-image-models` | Image-output models |

### 1.6 `electron.assets`

All asset I/O passes through path validation: reads via `outputRoots.resolveManagedAssetPath` (must be inside managed roots), writes via `resolveSafeExportDestination` (must be inside `home/desktop/documents/downloads/pictures/videos`).

| Method | IPC channel | Returns | Notes |
|--------|-------------|---------|-------|
| `importFiles(sourcePaths)` | `assets:import-files` | `Promise<{ success, files?: ImportedFile[], error? }>` | Accepts `.png/.jpg/.jpeg/.webp/.mp4/.webm/.mov/.m4v/.avi/.gif/.wav/.mp3/.m4a/.flac`. Copies to `<outputRoot>/imports/<safeName>` with collision-safe renaming. |
| `export(sourcePath, destinationPath)` | `assets:export` | `Promise<{ success, destinationPath?, error? }>` | Single-file copy with mkdir-p of parent. |
| `exportMany(sourcePaths, destinationDir)` | `assets:export-many` | `Promise<{ success, exportedCount?, error? }>` | Collision-safe naming inside `destinationDir`. |
| `delete(sourcePath)` | `assets:delete` | `Promise<{ success, error? }>` | `fs.rm(..., { force: true })` |
| `reveal(sourcePath)` | `assets:reveal` | `Promise<{ success, error? }>` | `shell.showItemInFolder(...)` |
| `clearCache()` | `assets:clear-cache` | `Promise<{ success, error? }>` | Wipes the internal output dir, recreates it empty |

```ts
type ImportedFile = {
  originalPath: string;
  importedPath: string;
  name: string;
  type: 'image' | 'video' | 'audio';
  importedAt: string;            // ISO 8601 UTC
};
```

### 1.7 `electron.generation`

Generation IPC is the densest namespace. It is **provider-aware**: when the active account's `imageGenerationProvider === 'openrouter'`, `generateImage` and `batch` route to the OpenRouter fan-out in the Main process (writing results to `<outputRoot>/openrouter/YYYY-MM-DD/`). Otherwise they proxy to the Python backend over HTTP.

| Method | IPC channel | Backend call (local path) | Notes |
|--------|-------------|---------------------------|-------|
| `generateImage(params)` | `generation:generate-image` | `POST /api/generate/image` | Returns `{ success, jobId? }`. Provider-aware. |
| `generateVideo(params)` | `generation:generate-video` | `POST /api/generate/video` | Provider-aware: routes to HuggingFace when `videoGenerationProvider === 'huggingface'`, else the local backend. |
| `exportTimelineSequence(params)` | `generation:export-timeline-sequence` | `POST /api/timeline/export` | Returns `{ success, jobId? }`. |
| `batch(params)` | `generation:batch` | Multiple `POST /api/generate/image` (one per prompt) | Provider-aware. Returns `{ success, jobIds? }`. |
| `enhancePrompt(params)` | `generation:enhance-prompt` | `POST /api/prompts/enhance` OR OpenRouter/HF | Returns `{ mode, prompt, variations[]? }`. M7: accepts `augment` and returns `provenance[]` + `contextMode` on LLM routes (see 1.14). |
| `suggestNegativePrompt(params)` | `generation:suggest-negative-prompt` | OpenRouter/HF OR built-in heuristic | Returns `{ negativePrompt, suggestions[], source }`. M7: accepts `augment`, returns `provenance[]` + `contextMode` on LLM routes. |
| `cropImage(params)` | `generation:crop-image` | `POST /api/images/crop` | |
| `extractVideoFrame(params)` | `generation:extract-video-frame` | `POST /api/videos/extract-frame` | |
| `upscaleImage(params)` | `generation:upscale-image` | `POST /api/images/upscale` | |
| `getStatus(jobId)` | `generation:get-status` | `GET /api/jobs/{id}` (local) or local lookup (OpenRouter jobs are prefixed `openrouter-image-`) | |
| `cancel(jobId)` | `generation:cancel` | `POST /api/jobs/{id}/cancel` (local) or AbortController (OpenRouter) | |
| `listJobs(options?)` | `generation:list-jobs` | `GET /api/jobs?status=&limit=` merged with local OpenRouter jobs | |
| `onProgress(cb)` | `generation:progress` (event) | Pushed by both the WebSocket relay AND the OpenRouter fan-out | Returns an unsubscribe function. |

#### Image generation params (`generateImage` / `batch`)

```ts
type GenerateImageParams = {
  prompt: string;
  negative_prompt?: string;
  width: number;                  // 256–2048
  height: number;                 // 256–2048
  steps: number;                  // 1–100
  cfg_scale: number;              // 1–30
  seed?: number;                  // -1 for random
  model?: string;                 // 'flux-dev' default
  // batch only:
  prompts?: string[];             // for batch()
};
```

OpenRouter image route additionally rejects ControlNet / inpaint inputs with a structured error.

#### Video generation params

```ts
type GenerateVideoParams = {
  prompt: string;
  image_path?: string;            // optional; absolute managed path
  width: number;                  // 256–1920
  height: number;                 // 256–1080
  duration: number;               // 1–10 seconds
  fps: number;                    // 12–60
  steps?: number;                 // 1–100
  model?: string;                 // 'ltx-video' default
  seed?: number;
};
```

#### Timeline export params (resolved by the renderer)

```ts
type ExportTimelineParams = {
  sequence_name: string;
  width: number;                  // 64–4096
  height: number;                 // 64–4096
  fps: number;                    // 1–60
  output_path: string;            // absolute MP4 path on disk
  frames: Array<{
    time_ms: number;
    layers: Array<{
      source_path: string;        // /outputs/... or absolute
      media_type: 'image' | 'video';
      source_time_ms: number;
      opacity: number;            // 0..1
    }>;
  }>;
  audio_layers: Array<{
    source_path: string;
    source_time_ms: number;
    timeline_offset_ms: number;
    duration_ms: number;
    clip_offset_ms: number;
    clip_duration_ms: number;
    gain: number;                 // 0..2
    fade_in_ms: number;
    fade_out_ms: number;
  }>;
};
```

#### Progress event payload

```ts
type ProgressEvent = {
  type: 'job_update';
  job_id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  progress: number;               // 0..100
};
```

### 1.8 `electron.system`

| Method | IPC channel | Returns |
|--------|-------------|---------|
| `getInfo()` | `system:get-info` | `Promise<{ gpu_available, gpu_name?, gpu_vram?, cuda_version?, comfyui_connected, models_count, backendConnected? }>` |

This is **enriched on the Main side** — it asks the backend for its `/api/system/info` AND inspects backend liveness, then merges. The renderer should treat `backendConnected` as "talking to the backend over HTTP works right now".

### 1.9 `electron.models`

| Method | IPC channel | Returns | Backend call |
|--------|-------------|---------|--------------|
| `list()` | `models:list` | `Promise<ModelRecord[]>` | `GET /api/models` |
| `get(modelId)` | `models:get` | `Promise<ModelRecord \| null>` | `GET /api/models/{id}` |
| `download(modelId)` | `models:download` | `Promise<DownloadJob \| { success: false, error }>` | `POST /api/models/{id}/download` (forwards `X-HF-Token` / `X-Civitai-Token`) |
| `downloadPause(modelId)` | `models:download:pause` | `Promise<DownloadJob \| { success: false, error }>` | `POST /api/models/{id}/download/pause` |
| `downloadResume(modelId)` | `models:download:resume` | `Promise<DownloadJob \| { success: false, error }>` | `POST /api/models/{id}/download/resume` (re-forwards `X-HF-Token` / `X-Civitai-Token`) |
| `downloadCancel(modelId)` | `models:download:cancel` | `Promise<DownloadJob \| { success: false, error }>` | `POST /api/models/{id}/download/cancel` |
| `downloadsList()` | `models:downloads:list` | `Promise<DownloadJob[]>` | `GET /api/models/downloads` |
| `subscribeDownloads()` | `models:downloads:subscribe` | `Promise<DownloadJob[]>` | `GET /api/models/downloads` (poll-based subscribe; a push channel can replace it later without changing the renderer contract) |
| `getStatus(modelId)` | `models:get-status` | `Promise<ModelStatus \| null>` | `GET /api/models/{id}/status` |
| `delete(modelId)` | `models:delete` | `Promise<{ success, error? }>` | `DELETE /api/models/{id}` |
| `importRoot(body)` | `models:import` | `Promise<LibraryRoot>` | `POST /api/models/import` |
| `scan()` | `models:scan` | `Promise<{ records_indexed: number, warnings: string[] }>` | `POST /api/models/scan` |
| `librariesList()` | `models:libraries:list` | `Promise<LibraryRoot[]>` | `GET /api/models/libraries` |
| `librariesRemove(rootId)` | `models:libraries:remove` | `Promise<{ removed: boolean, records_dropped: number }>` | `DELETE /api/models/libraries/{root_id}` |
| `librariesDetect()` | `models:libraries:detect` | `Promise<DetectedRoot[]>` | `GET /api/models/libraries/detect` |
| `search(query, source, page, nsfw)` | `models:search` | `Promise<SearchResponse>` | `GET /api/models/search` (forwards `X-HF-Token` + `X-Civitai-Token`) |
| `consent(modelId, kind, granted)` | `models:consent` | `Promise<ConsentState \| { success: false, error }>` | `POST /api/models/consent` |
| `convert(modelId)` | `models:convert` | `Promise<ConvertResult \| { success: false, error }>` | `POST /api/models/{id}/convert-safetensors` |
| `resolveRuntime(modelId)` | `models:resolveRuntime` | `Promise<RuntimePlan \| { success: false, error }>` | `POST /api/models/{id}/resolve-runtime` (refusals are 200 payloads — see the REST section) |

`body` for `importRoot`: `{ path: string; layout_hint?: string }` — see `ImportRootRequest` in the REST section below. `LibraryRoot`, `DetectedRoot`, `ModelRecord`, `DownloadJob`, `SearchResponse`, `ConsentState`, `ConvertResult`, and `RuntimePlan` types mirror the backend schemas of the same name.

`search(query, source, page, nsfw)` — `source` ∈ `'hf' | 'civitai'`. The handler attaches whichever hub tokens are held in the Main process (see `electron.auth` below) as `X-HF-Token` / `X-Civitai-Token` headers. The IPC layer mirrors the backend's offline-degrade contract: if the backend is unreachable, the handler resolves with `{ source, query, page, results: [], offline: true, warning }` instead of rejecting — the renderer never sees a thrown search error. Handler logging is message-only: the raw Axios error carries token-bearing request headers and must never reach the log.

`consent(modelId, kind, granted)` — `kind` ∈ `'pickle' | 'trust_remote_code'`. Consent is **deny-by-default and per-model**; granting/revoking is a deliberate user action and every change is audited by the backend `ConsentStore`.

### 1.10 `electron.hardware`

| Method | IPC channel | Returns | Backend call |
|--------|-------------|---------|--------------|
| `get()` | `hardware:get` | `Promise<HardwareProfile \| { success: false, error }>` | `GET /api/hardware` |

Truthful hardware probe for run-readiness preflight (M5). `HardwareProfile` mirrors the backend schema of the same name (snake_case wire keys). The renderer keeps the last-known profile when the call fails (local-first); the store action `loadHardwareProfile` owns that policy.

### 1.11 `electron.auth`

Session-scoped hub credentials. Tokens are held **only in Main-process memory** — never persisted by the Python backend, never returned to the renderer, never logged. The Main process injects them per-request as headers on the backend calls noted above: `X-HF-Token` for Hugging Face (search + downloads of HF-source records), `X-Civitai-Token` for CivitAI (search + direct-URL downloads/resume of `civitai`-source records). An empty or whitespace-only token clears the stored value.

| Method | IPC channel | Returns |
|--------|-------------|---------|
| `setHfToken(token)` | `auth:setHfToken` | `Promise<{ success: true }>` |
| `setCivitaiToken(token)` | `auth:setCivitaiToken` | `Promise<{ success: true }>` |

### 1.12 `electron.notifications`

```ts
notify(
  type: 'generation_complete' | 'generation_failed' | 'model_download',
  payload: { title: string; body: string }
): Promise<{ success: boolean; skipped?: boolean }>;
```

Each notification type is gated by the matching `notifyOn*` boolean in settings; if the user has disabled it, the call returns `{ success: true, skipped: true }` instead of showing.

### 1.13 `electron.backend`

| Method | IPC channel | Returns |
|--------|-------------|---------|
| `start()` | `backend:start` | `Promise<{ success, error? }>` |
| `stop()` | `backend:stop` | `Promise<{ success: true }>` |
| `getStatus()` | `backend:status` | `Promise<{ running, pid?, bundled? }>` |
| `checkBundled()` | `backend:check-bundled` | `Promise<{ exists, path? }>` |
| `onStatusChange(cb)` | `backend:status` (event) | unsubscribe function |

---

### 1.14 `electron.director` (M7 AI Director — RAG)

Local-first retrieval-augmented prompt-assist. The renderer syncs its corpus
(prior prompts, asset metadata) into a local index; the prompt-assist seam queries
it and injects a delimited reference-context block into the LLM **user** message
(never the cache-pinned system prompt). All handlers are non-fatal: a retrieval
failure never breaks the renderer.

| Renderer call | IPC channel | Backend | Notes |
|---|---|---|---|
| `director.syncCorpus(records)` | `director:sync-corpus` | `POST /api/v1/retrieval/ingest` | Bulk allow-list-sanitized corpus snapshot; backend re-embeds only new items (content hash). |
| `director.ingestRecord(record)` | `director:ingest-record` | `POST /api/v1/retrieval/ingest` | Single incremental record. |
| `director.clearIndex()` | `director:clear-index` | `POST /api/v1/retrieval/clear` | Returns `{ success }`. |
| `director.indexStats()` | `director:index-stats` | `GET /api/v1/retrieval/stats` | Returns `{ count, mode: 'semantic' \| 'lexical' }`. |

Settings: `settings.aiDirector = { enabled, sources: { promptHistory, assets, knowledgeBase } }` (default on, all sources). `generation.enhancePrompt` / `suggestNegativePrompt` accept an optional `augment: { sources, modelFamily }` and return `provenance[]` + `contextMode` when augmentation runs (LLM routes only; the local heuristic route is unchanged).

**Trust boundary:** retrieved + model-authored text is data, never instructions — wrapped in a delimited DATA block, and ingestion is allow-list so secrets/keys/paths are never indexed. Degrades cleanly: embedder absent → lexical; backend unreachable → un-augmented; empty corpus → knowledge-base only.

### 1.15 `electron.workflow` (M8 ComfyUI Interop)

Runs a user-authored ComfyUI graph as-authored on a connected Comfy server. The renderer exports the active `WorkflowGraph` to a Comfy API-format prompt (with integer output slots, via the slot-reconciliation layer) and submits it; the backend validates it through the safety gate before queueing. The renderer polls the returned job via `generation.getStatus(jobId)`.

| Renderer call | IPC channel | Backend | Notes |
|---|---|---|---|
| `workflow.runGraph({ graph, generationType })` | `workflow:run-graph` | `POST /api/v1/comfy/run-graph` | `generationType` is `'image' \| 'video'`. Returns `{ job_id, status, message }`. The Run-on-ComfyUI UI is gated on the renderer safety pre-check (first-class nodes + safe paths). |

ComfyUI stays **out of the M6 routing fabric** — it is a backend-internal execution detail, not a routable provider.

## Part 2 — Backend REST API

Base URL: `http://127.0.0.1:8000` (Uvicorn binds `0.0.0.0:8000` but the Main process always uses loopback).

### Tag index

| Tag | Purpose |
|-----|---------|
| Health | Root + readiness |
| System | Capability/system info |
| Prompts | LLM prompt enhancement |
| Generation | Image + video generation jobs |
| Jobs | Job status, cancel, list |
| Models | Model registry, hub search, consent, download, convert, delete, hardware probe, runtime preflight |
| Images | Crop/upscale primitives |
| Videos | Frame extraction |
| Timeline | Resolved timeline → MP4 export |
| ControlNet | Conditioned image generation (8 modes) |
| LoRA | LoRA-mixed image generation |
| Edit | Background removal, super-resolution, face restore |
| Batch | ZIP export |

### 2.1 Health

#### `GET /` — `tags=[Health]`, limit `60/min`

Liveness ping. Returns `{ "message": "Vision Studio API", "version": "3.0.0" }`.

#### `GET /api/health` — `tags=[System]`

Returns generator availability. **Exempt from auth** so the Main process can poll readiness during startup.

```json
{
  "status": "ok",
  "comfyui_connected": false,
  "direct_generator_available": true,
  "direct_video_generator_available": true,
  "generation_available": true
}
```

### 2.2 System

#### `GET /api/system/info` — `tags=[System]`, limit `60/min`

GPU + model info.

```json
{
  "gpu_available": true,
  "gpu_name": "NVIDIA GeForce RTX 4090",
  "gpu_vram": "24.0 GB",
  "cuda_version": "12.1",
  "comfyui_connected": false,
  "models_count": 4
}
```

### 2.3 Prompts

#### `POST /api/prompts/enhance` — `tags=[Prompts]`, limit `60/min`

```json
{ "prompt": "a cat", "mode": "clarify" }
```

`mode` ∈ `clarify | cinematic | concise | variations | expand`. Response is mode-specific but always `{ mode, prompt, variations? }`.

### 2.4 Generation

#### `POST /api/generate/image` — `tags=[Generation]`, limit `10/min`

Body — `ImageGenerationRequest`:

| Field | Type | Default | Range / values |
|-------|------|---------|----------------|
| `prompt` | string | — (required) | non-empty |
| `negative_prompt` | string | `""` | |
| `width` | int | `1024` | 256–2048 |
| `height` | int | `1024` | 256–2048 |
| `steps` | int | `25` | 1–100 |
| `cfg_scale` | float | `7.5` | 1–30 |
| `seed` | int | `-1` | -1 = random |
| `model` | string | `flux-dev` | `flux-dev`, `flux-schnell`, `flux-fill`, `sd3.5-large`, `sd3.5-medium`, `sd-1.5` |
| `scheduler` | string | `euler` | sampler name accepted by ComfyUI / diffusers |
| `acceleration_settings` | object \| null | `null` | M9 acceleration toggles (see below); `null` = all defaults |

<a id="acceleration-settings"></a>
**`acceleration_settings`** (M9, local generation only) — per-request inference acceleration toggles. Ignored by the hosted (OpenRouter / HuggingFace) routes. Each optimization is a tri-state string: `auto` (the backend decides from the hardware fit), `on` (force), or `off` (disable).

| Field | Type | Default | Values |
|-------|------|---------|--------|
| `master_enable` | bool | `true` | `false` disables all acceleration for the run |
| `sdpa` | string | `auto` | `auto` / `on` / `off` — fused scaled-dot-product attention |
| `channels_last` | string | `auto` | `auto` / `on` / `off` — channels-last memory format (conv-UNet families) |
| `compile` | string | `auto` | `auto` / `on` / `off` — `torch.compile` (reduce-overhead) |
| `quantization` | string | `auto` | `auto` / `on` / `off` — int8 / fp8 where the family + hardware allow |
| `attention_slicing` | string | `auto` | `auto` / `on` / `off` — only engaged under VRAM pressure |
| `tensorrt` | string | `auto` | `auto` / `on` / `off` — TensorRT engine build (one-time) |

Response — `JobResponse`:

```json
{ "job_id": "9a2…", "status": "pending", "message": "Image generation job started" }
```

The job runs asynchronously in `BackgroundTasks`. Poll via `GET /api/jobs/{id}` or subscribe via `/ws`.

#### `POST /api/generate/video` — `tags=[Generation]`, limit `10/min`

Body — `VideoGenerationRequest`:

| Field | Type | Default | Range / values |
|-------|------|---------|----------------|
| `prompt` | string | — (required) | |
| `image_path` | string \| null | `null` | optional input image (image-to-video) |
| `width` | int | `1024` | 256–1920 |
| `height` | int | `576` | 256–1080 |
| `fps` | int | `24` | 12–60 |
| `duration` | int | `5` | 1–10 seconds |
| `steps` | int | `25` | 1–100 |
| `model` | string | `ltx-video` | `ltx-video`, `svd`, `animate-diff` |
| `seed` | int | `-1` | -1 = random |
| `acceleration_settings` | object \| null | `null` | M9 acceleration toggles ([same shape as image](#acceleration-settings)); `null` = all defaults |

Returns `JobResponse`.

### 2.5 Jobs

#### `GET /api/jobs/{job_id}` — `tags=[Jobs]`, limit `60/min`

Returns `JobStatusResponse`:

```json
{
  "job_id": "9a2…",
  "status": "processing",
  "progress": 42.5,
  "type": "image",
  "created_at": "2026-05-03T18:21:14.318000Z",
  "completed_at": null,
  "result": null,
  "error": null
}
```

When `status === "completed"`, `result` is provider-specific:

- Image: `{ "images": ["/outputs/<job_id>/image_001.png", …], "seed": 12345, "width": 1024, "height": 1024, "prompt": "...", "model": "flux-dev" }`
- Video / timeline export: `{ "video": "/outputs/.../out.mp4", "output_path": "...", "fps": 24, "duration": 5.0, "frames": 120, "width": 1024, "height": 576, ... }`

For local diffusers generations (M9), the result also carries `acceleration` — the optimizations that actually took effect, honestly split into applied / skipped / fell-back lists (`null` for hosted-provider jobs):

```json
"acceleration": {
  "applied": ["sdpa", "compile:reduce-overhead", "channels_last"],
  "skipped": ["quantization:int8 (backend unavailable)"],
  "fell_back": ["compile (RuntimeError, ran eager)"]
}
```

`404` if not found.

#### `POST /api/jobs/{job_id}/cancel` — `tags=[Jobs]`, limit `30/min`

Sets status to `cancelled` if the job is `pending` or `processing`. No-op message for terminal jobs. `404` if not found.

#### `GET /api/jobs?status=&limit=` — `tags=[Jobs]`, limit `60/min`

`status` ∈ `pending|processing|completed|failed|cancelled` (optional). `limit` 1–100 (default 50). Returns:

```json
{ "jobs": [{ "job_id": "...", "status": "...", "type": "...", "progress": 42.5, "created_at": "..." }] }
```

### 2.6 Models

#### `GET /api/hardware` — `tags=[Models]`, limit `60/min`

Truthful hardware probe (spec 6.1). Runs the CUDA/RAM/disk queries in a worker thread (a cold driver can block briefly). Returns `HardwareProfile`:

```json
{
  "gpu_available": true,
  "gpu_name": "NVIDIA GeForce RTX 4090",
  "vram_total_bytes": 25769803776,
  "vram_free_bytes": 21474836480,
  "compute_major": 8,
  "compute_minor": 9,
  "cuda_version": "12.1",
  "torch_available": true,
  "system_ram_total_bytes": 68719476736,
  "system_ram_available_bytes": 51539607552,
  "disk_free_bytes": 966367641600
}
```

The probe never errors: a failed CUDA query degrades to `gpu_available: false` with zeroed VRAM fields (a half-probed GPU must never look usable), and RAM/disk probe failures degrade their fields to `0`/`null` defaults. `vram_free_bytes`/`vram_total_bytes` come straight from `torch.cuda.mem_get_info` — never inferred.

#### `GET /api/models` — `tags=[Models]`, limit `60/min`

Returns `ModelRecord[]` from the Foundry registry (M3+). The full `ModelRecord` shape is:

```json
{
  "id": "flux-dev",
  "name": "FLUX.1 [dev]",
  "artifact_type": "checkpoint",
  "capability": "image",
  "base_architecture": "flux",
  "source": "huggingface",
  "size": "12.0 GB",
  "status": "ready",
  "tier": "verified",
  "quality": "balanced",
  "runtime": "local",
  "hardware_class": "high",
  "vram": "16.0 GB",
  "description": "High-quality text-to-image model",
  "gated": false,
  "locations": ["/path/to/weights.safetensors"],
  "identity": "sha256:abc123…",
  "availability": "available",
  "library_root_id": null,
  "tier_reason": "in verified catalog",
  "format": "safetensors",
  "trust_remote_code": false,
  "nsfw": false,
  "download_url": null,
  "sha256": null
}
```

Four fields were added in M3: `locations` (absolute filesystem paths where the artifact is present; `string[]`), `identity` (content-derived identity hash for deduplication; `string | null`), `availability` (`"available" | "linked" | "remote"`), and `library_root_id` (ID of the `LibraryRoot` this record was indexed from; `string | null`). All four have safe defaults and are absent from records created before M3.

Six more fields were added in M4: `tier_reason` (human-readable explanation of the classifier's tier verdict; `string | null`), `format` (weight format, e.g. `"safetensors" | "pickle"`; `string | null`), `trust_remote_code` (model requires executing repo-authored code; `bool`, default `false`), `nsfw` (hub-flagged NSFW content; `bool`, default `false`), `download_url` (direct acquisition URL for CivitAI-source records; `string | null`), and `sha256` (expected weight digest — **must be a 64-character lowercase hex string**, schema-validated; `string | null`). All six have safe defaults. **`download_url` and `sha256` are server-side acquisition details only** — they live on the registry record for the download manager and are **never included in `SearchResult` responses**.

#### `GET /api/models/search` — `tags=[Models]`, limit `30/min`

Search Hugging Face or CivitAI for models. Results are classified through the tri-tier ladder (`verified | compatible | experimental`) with a `tier_reason`, and registered into the registry's **transient layer** so a follow-up `POST /api/models/{id}/download` can resolve them.

Query parameters:

| Param | Type | Default | Notes |
|-------|------|---------|-------|
| `q` | string | `""` | Search query (max 256 chars) |
| `source` | string | `hf` | `hf \| civitai` — anything else is `400` |
| `task` | string \| null | `null` | HF pipeline tag filter (`hf` source only; max 64 chars) |
| `sort` | string | `downloads` | `downloads \| likes \| lastModified`; unknown values fall back to `downloads` (`hf` source only) |
| `page` | int | `1` | Page of 20 results, **1–50** (`hf` source only; echoed back for both sources). Bounded because the HF call requests `page × 20` items — the cap stops local→hub request amplification. |
| `nsfw` | bool | `false` | Include NSFW results (`civitai` source only; CivitAI is NSFW-off by default) |
| `author` | string \| null | `null` | Author/organization filter (`hf` source only; max 128 chars) |

Out-of-bounds parameters (page outside 1–50, over-length strings) are FastAPI-native **`422`** validation errors.

Headers (both optional, supplied automatically by the Main process): `X-HF-Token` for the `hf` source, `X-Civitai-Token` for the `civitai` source. Tokens are read per-request, **never persisted in Python, never logged**.

Response — `SearchResponse`:

```json
{
  "source": "hf",
  "query": "flux lora",
  "page": 1,
  "results": [
    {
      "id": "hf:XLabs-AI/flux-RealismLora",
      "source": "hf",
      "name": "flux-RealismLora",
      "repo_id": "XLabs-AI/flux-RealismLora",
      "tier": "compatible",
      "tier_reason": "flux lora with safetensors weights",
      "artifact_type": "lora",
      "base_architecture": "flux",
      "capability": "image",
      "downloads": 12345,
      "likes": 678,
      "author": "XLabs-AI",
      "license": "other",
      "gated": false,
      "nsfw": false,
      "format": "safetensors",
      "trust_remote_code": false,
      "size": "Unknown",
      "tags": ["lora", "flux"]
    }
  ],
  "offline": false,
  "warning": null
}
```

`SearchResult` never carries `download_url` or `sha256` — those stay server-side on the registry record.

**Compatible-tier verification (supply-chain rail):** HF listing data is partial (tags, no file/config census), so any result that would classify `compatible` from listing tags alone is **re-verified against full repo signals** (`model_info` census: `auto_map`, repo `.py` files, safetensors component tree) before it is returned. If the verification fetch fails, the result fails closed to `experimental` with `tier_reason` `"compatible by tags only - full repo signals unverifiable, defaulting to experimental"`. Non-compatible results never trigger the extra fetch.

**Offline-degrade contract (spec 5.1):** any upstream failure (network down, hub outage, bad token) returns **`200`** with `offline: true`, `results: []`, and a `warning` naming **only the exception type** (e.g. `"search unavailable: ConnectionError"`) — **never a 5xx**. The local library stays fully operational regardless of hub reachability.

Errors: `400` if `source` is not `hf` or `civitai`.

#### `POST /api/models/consent` — `tags=[Models]`, limit `30/min`

Grant or revoke per-model security consent. Consent is **deny-by-default**, **per-model**, and every grant/revoke is **audited** by the backend `ConsentStore`.

Body — `ConsentRequest`:

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `model_id` | string | — (required) | Registry record id |
| `kind` | string | — (required) | `pickle \| trust_remote_code` |
| `granted` | bool | — (required) | `true` to grant, `false` to revoke |

Response — `ConsentState` (the full post-update state for the model):

```json
{ "model_id": "civitai:12345", "pickle": true, "trust_remote_code": false }
```

Errors: `400` if `kind` is not a recognised value.

#### `GET /api/models/downloads` — `tags=[Models]`, limit `60/min`

Snapshot of every download job (queue + progress). Returns `DownloadJob[]`:

```json
[
  {
    "model_id": "flux-dev",
    "status": "downloading",
    "progress": 42.5,
    "speed": 18350080.0,
    "eta": 312.4,
    "total_bytes": 12884901888,
    "error": null,
    "gate_url": null
  }
]
```

`status` ∈ `queued | downloading | paused | verifying | ready | error | cancelled`. `gate_url` is set when an HF repo is gated and the user must accept terms on the hub first.

#### `GET /api/models/{model_id}` — `tags=[Models]`, limit `60/min`

Returns a single `ModelRecord` by id (resolving legacy aliases). `404` if not found.

#### `POST /api/models/{model_id}/download` — `tags=[Models]`, limit `30/min`

Enqueues an async download and returns the `DownloadJob` with **`202 Accepted`**.

Headers: HF-source records read the optional `X-HF-Token` header; **`civitai`-source records read `X-Civitai-Token` instead** (the Main process sends both; the backend picks per record source). Tokens are never persisted in Python and never logged.

**Transient-record reclassification (supply-chain boundary):** search-originated HF records carry verdicts classified from partial listing data, so the route **re-fetches full repo signals and reclassifies them here, before the consent checks** — the fresh `tier` / `tier_reason` / `format` / `trust_remote_code` are written back onto the transient record. Catalog, indexed, and `civitai`-source records skip this (their verdicts are authoritative: catalog/header-verified, or CivitAI's explicit per-file metadata + mandatory sha256).

CivitAI-source records download via host-allowlisted HTTPS from the record's `download_url`, stream to a `.incomplete` staging file, and **verify the record's `sha256` before the atomic move into place** — a mismatch fails the job as corrupt/tampered. **Hashless CivitAI records are refused** (`status: "error"`, `"no sha256 on civitai record - refusing unverifiable download"`): the sha256 is the only integrity anchor because delivery is a CDN redirect. Redirects are walked manually with a strict policy: **every hop must be HTTPS**, the Bearer token is attached **only while the hop host is `civitai.com`** (delivery CDNs never see it), and the chain is capped at 5 hops.

HF repo downloads acquire a **filtered** file list: repo-authored `.py` files are never fetched (no loader executes repo code), and pickle-bearing suffixes (`.ckpt`/`.pt`/`.pth`/`.bin`/`.pkl`) are fetched only when per-model pickle consent exists.

Errors:

- `404` — unknown `model_id`.
- `409` — security consent missing (spec 5.3 rail, deny-by-default). `detail.error_code` is `"pickle-consent-required"` (record `format` is `pickle` and pickle consent has not been granted) or `"remote-code-consent-required"` (record sets `trust_remote_code` and remote-code consent has not been granted). Grant via `POST /api/models/consent`, then retry.
- `503` — `detail.error_code` `"repo-signals-unverifiable"`: a transient HF record's full safety signals could not be fetched (offline / hub outage), so the download fails closed before any bytes move. Retry when online.

#### `POST /api/models/{model_id}/download/{action}` — `tags=[Models]`, limit `30/min`

Pause, resume, or cancel an in-flight download. `action` ∈ `pause | resume | cancel`. Returns the updated `DownloadJob`. `resume` re-reads the per-source token header (`X-Civitai-Token` for `civitai`-source records, `X-HF-Token` otherwise) so resumed transfers stay authenticated. `404` for an unknown action or when no download job exists for `model_id`.

#### `POST /api/models/{model_id}/convert-safetensors` — `tags=[Models]`, limit `5/min` (heavy)

Consent-gated pickle → safetensors conversion (spec 5.3). No request body. Finds the record's local pickle file (`.ckpt`/`.pt`/`.pth`/`.bin` in `locations`), loads it inside the **`torch.load(weights_only=True)` security boundary** (tensors only — no arbitrary-code unpickling), and writes `<source>.safetensors` next to it.

Response — `ConvertResult`:

```json
{ "model_id": "civitai:12345", "safetensors_path": "C:/models/checkpoint.safetensors", "tensor_count": 1131 }
```

Errors:

- `404` — unknown `model_id`.
- `409` with `detail.error_code`:
  - `"pickle-consent-required"` — converting requires reading the pickle file; grant pickle consent first.
  - `"no-pickle-source"` — no local pickle file found for this model; download it first.
  - `"already-converted"` — a safetensors file already exists at the destination; it is never silently clobbered — delete it first to re-convert.
- `422` — conversion failed (corrupt/unreadable source, disk error). Error details are path-free: source names appear as basenames only and OS errors surface only the exception type (full details go to server logs).
- `503` — conversion unavailable: the backend is running in stub mode without `torch` installed.

#### `POST /api/models/{model_id}/resolve-runtime` — `tags=[Models]`, limit `30/min`

The load plan for **this** machine (spec 6.4). No request body. Probes the hardware fresh (worker thread), then resolves the record + per-model consent into a concrete diffusers plan. Returns `RuntimePlan`:

```json
{
  "pipeline_class": "StableDiffusionXLPipeline",
  "precision": "bf16",
  "offload": false,
  "vae_tiling": false,
  "attention_slicing": true,
  "single_file": false,
  "config_catalog_id": null,
  "vram_plan": {
    "weight_bytes": 3704409292,
    "activation_bytes": 3221225472,
    "runtime_bytes": 751619276,
    "total_bytes": 7677254040,
    "basis": "estimated"
  },
  "fit": "fits",
  "missing_components": [],
  "fallback_ladder": ["precision:fp16", "offload:cpu", "vae:tiling", "attention:slicing-max"],
  "readiness": "Ready - bf16 - fits (estimated)",
  "refusal": null
}
```

- `precision` ∈ `bf16 | fp16 | fp32` (honest selection: fp16-corrupting families like flux/sd35 get fp32 on pre-Ampere GPUs).
- `fit` ∈ `fits | fits-with-offload | over-budget | cpu-only`; `offload`/`vae_tiling` flip on automatically for `fits-with-offload`.
- `vram_plan.basis` is `"measured"` when the catalog carries a calibrated `measured_vram_bytes` for the record, else `"estimated"`. Weight size prefers local safetensors headers (exact) over the record's human size string (pre-download fallback).
- `missing_components` lists weighted `model_index.json` submodels with no weights on disk; config-only components (scheduler/tokenizer/feature_extractor) never appear.
- `fallback_ladder` is the ordered OOM-recovery rungs (spec 6.6).
- `readiness` is the human-readable preflight readout shown in the Generate panel footer.

**Refusals are `200` payloads, never 4xx/5xx** — preflight is informational: "this will not load, and here is why" is an answer, not a server error. A refused plan sets `refusal` (mirrored into `readiness`) and leaves the plan fields at their null defaults. Refusal causes: `trust_remote_code` records (no remote-code load path ships, consent or not), pickle-format records (convert to safetensors first), an architecture/capability pair with no shipped pipeline, or a single-file checkpoint family with no `from_single_file` path (svd).

Errors: `404` — unknown `model_id` (the only error case).

#### `GET /api/models/{model_id}/status` — `tags=[Models]`, limit `60/min`

Returns `{ id, name, status, progress, downloaded_bytes, total_bytes, error? }`.

#### `DELETE /api/models/{model_id}` — `tags=[Models]`, limit `30/min`

Deletes locally installed weights. Returns `{ "success": true }`. `404` if not installed. `409` if the model is a linked library reference — call `DELETE /api/models/libraries/{root_id}` instead; no bytes are ever deleted by that path either.

#### `POST /api/models/import` — `tags=[Models]`, limit `30/min`

Register a user-owned model library directory by reference. Vision Studio indexes it without copying any bytes.

Body — `ImportRootRequest`:

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `path` | string | — (required) | Absolute filesystem path to the library directory |
| `layout_hint` | string | `"generic"` | Directory-layout hint: `generic \| comfyui \| a1111 \| diffusers \| huggingface` |

Returns `201 LibraryRoot` on success. `400` if the path is invalid or `layout_hint` is not a recognised value. The operation is idempotent — calling it twice with the same path registers once and re-indexes.

#### `POST /api/models/scan` — `tags=[Models]`, limit `30/min`

Re-index all feeds (built-in app tree, HF cache, and every registered library root). Returns:

```json
{ "records_indexed": 42, "warnings": [] }
```

`records_indexed` is the total count across all feeds. `warnings` lists any paths that were skipped due to permissions or parse errors.

#### `GET /api/models/libraries` — `tags=[Models]`, limit `60/min`

List every registered `LibraryRoot`:

```json
[{ "id": "a1b2…", "path": "C:/Users/me/ComfyUI/models", "layout_hint": "comfyui", "added_at": "2026-05-10T14:00:00Z" }]
```

#### `GET /api/models/libraries/detect` — `tags=[Models]`, limit `60/min`

First-run detection: scans well-known install locations for ComfyUI, Automatic1111, and diffusers caches. Returns candidate `DetectedRoot[]` — these are **offers only**, nothing is registered until the user confirms via `POST /api/models/import`.

```json
[{ "path": "C:/Users/me/ComfyUI/models", "layout_hint": "comfyui" }]
```

#### `DELETE /api/models/libraries/{root_id}` — `tags=[Models]`, limit `30/min`

Remove a registered library root. Drops all `ModelRecord` entries that were sourced exclusively from this root. **Never touches source bytes** — files on disk are left untouched.

Returns `{ "removed": true, "records_dropped": 17 }`. `404` if `root_id` is unknown.

### 2.7 Images

#### `POST /api/images/crop` — `tags=[Images]`, limit `30/min`

Body — `ImageEditRequest`:

```json
{
  "source_path": "C:/users/.../outputs/<job>/image_001.png",
  "crop_box": { "left": 0, "top": 0, "width": 1024, "height": 768 },
  "rotation": 0,
  "flip_horizontal": false,
  "flip_vertical": false
}
```

Response `{ "image": "/outputs/crop-<id>/image_001-crop.png", "width": 1024, "height": 768, ... }`. `404` if `source_path` doesn't exist.

#### `POST /api/images/upscale` — `tags=[Images]`, limit `30/min`

Body — `ImageUpscaleRequest`:

```json
{ "source_path": "...", "scale_factor": 2 }
```

`scale_factor` ∈ `2..4`. Response `{ "image": "/outputs/upscale-<id>/...", "width": 2048, "height": 2048 }`.

### 2.8 Videos

#### `POST /api/videos/extract-frame` — `tags=[Videos]`, limit `30/min`

Body — `VideoFrameExtractRequest`:

```json
{ "source_path": "C:/.../my-video.mp4", "time_ms": 1500 }
```

Resolves to nearest frame; returns `{ "image": "/outputs/frame-<id>/<name>-frame.png", "output_path": "...", "width": 1920, "height": 1080, "time_ms": 1500, "frame_index": 36 }`. `404` if source missing.

### 2.9 Timeline

#### `POST /api/timeline/export` — `tags=[Timeline]`, limit `5/min`

Submit a fully resolved frame stream + audio plan; backend renders MP4 and (optionally) muxes audio via ffmpeg. Returns `JobResponse`. See [`ARCHITECTURE.md` §5.4](./ARCHITECTURE.md#54-timeline-export) for the rendering algorithm.

Body — `TimelineExportRequest`:

```json
{
  "sequence_name": "My Sequence",
  "width": 1920,
  "height": 1080,
  "fps": 24,
  "output_path": "C:/users/me/Documents/export.mp4",
  "frames": [
    { "time_ms": 0, "layers": [
      { "source_path": "/outputs/<job>/image_001.png", "media_type": "image", "source_time_ms": 0, "opacity": 1.0 }
    ]}
  ],
  "audio_layers": [
    {
      "source_path": "C:/.../music.mp3",
      "source_time_ms": 0,
      "timeline_offset_ms": 0,
      "duration_ms": 60000,
      "clip_offset_ms": 0,
      "clip_duration_ms": 60000,
      "gain": 1.0,
      "fade_in_ms": 500,
      "fade_out_ms": 1000
    }
  ]
}
```

Validation: `width/height` 64–4096; `fps` 1–60; `frames` length 1–24000; per-audio-layer `gain` 0–2.

### 2.10 ControlNet — `/api/v1/controlnet`

#### `POST /api/v1/controlnet/generate` — limit `10/min`

Body — `ControlNetRequest` (full schema in `backend/schemas/controlnet.py`):

| Field | Type | Default | Range |
|-------|------|---------|-------|
| `prompt` | string | required | 1–2000 chars |
| `init_image` | string | required | base64 or `data:image/...;base64,...` |
| `control_image` | string | required | base64 or data URL |
| `model` | enum | required | `canny | depth | normal | openpose | segmentation | mlsd | lineart | softedge` |
| `conditioning_scale` | float | `1.0` | 0–2 |
| `guidance_start` | float | `0.0` | 0–1 |
| `guidance_end` | float | `1.0` | 0–1 |
| `steps` | int | `25` | 1–150 |
| `guidance_scale` | float | `7.5` | 1–30 |
| `width` | int | `512` | 64–2048 |
| `height` | int | `512` | 64–2048 |
| `seed` | int | `-1` | -1 = random |
| `num_images` | int | `1` | 1–8 |
| `negative_prompt` | string | `""` | |

Response — `ControlNetResponse`:

```json
{
  "success": true,
  "images": ["data:image/png;base64,...", "..."],
  "seed": 12345,
  "processing_time_ms": 8421.3,
  "model_used": "canny",
  "warning": null
}
```

Errors `400` invalid input, `500` service error, all with `{ detail: { error, error_code } }` shape.

#### `POST /api/v1/controlnet/unload` — limit `60/min`

Frees the loaded ControlNet model from VRAM. Returns `{ "success": true, "message": "..." }`.

#### `GET /api/v1/controlnet/models`

Returns a static list of supported control modes with friendly names and descriptions.

### 2.11 LoRA — `/api/v1/lora`

#### `POST /api/v1/lora/generate` — limit `10/min`

| Field | Type | Default | Range |
|-------|------|---------|-------|
| `base_model` | string | required | model id or filesystem path |
| `lora_path` | string | required | path to `.safetensors` / `.pt` |
| `lora_scale` | float | `0.8` | 0–2 |
| `prompt` | string | required | 1–2000 chars |
| `negative_prompt` | string | `""` | max 2000 chars |
| `num_inference_steps` | int | `30` | 1–150 |
| `guidance_scale` | float | `7.5` | 1–30 |
| `width` | int | `512` | 64–2048 |
| `height` | int | `512` | 64–2048 |
| `seed` | int? | `null` | optional |
| `num_images` | int | `1` | 1–8 |

Response — `LoRAResponse`:

```json
{
  "success": true,
  "images": ["data:image/png;base64,..."],
  "seed": 12345,
  "processing_time_ms": 7321.5,
  "lora_applied": "path/to/style.safetensors",
  "lora_scale": 0.8
}
```

#### `POST /api/v1/lora/unload` — limit `60/min`

Frees the loaded LoRA from VRAM.

### 2.12 Edit — `/api/v1/edit`

#### `POST /api/v1/edit/remove-background` — limit `30/min`

Body — `BackgroundRemoveRequest`:

```json
{
  "image": "data:image/png;base64,...",
  "alpha_matting": false,
  "alpha_matting_foreground_threshold": 240,
  "alpha_matting_background_threshold": 10
}
```

Response — `BackgroundRemoveResponse`: `{ success, image: "data:image/png;base64,...", processing_time_ms }`.

#### `POST /api/v1/edit/upscale` — limit `30/min`

Body — `UpscaleRequest`:

```json
{ "image": "data:image/png;base64,...", "scale": 4, "face_enhance": false }
```

`scale` ∈ `2 | 4 | 8`. Response includes `original_size: [w,h]` and `new_size: [w,h]`.

#### `POST /api/v1/edit/restore-faces` — limit `30/min`

Body — `FaceRestoreRequest`:

```json
{ "image": "data:image/png;base64,...", "fidelity": 0.5 }
```

`fidelity` ∈ `0..1` (higher = more faithful to original). Response includes `faces_detected`.

#### `GET /api/v1/edit/models` — limit `60/min`

Lists `rembg`, `realesrgan`, `gfpgan` with `name`, `description`, `loaded` (bool).

### 2.13 Batch — `/api/v1/batch`

#### `POST /api/v1/batch/export-zip` — limit `5/min`

Body — `BatchExportRequest`:

```json
{
  "image_ids": ["img-001", "img-002"],
  "format": "jpg",
  "quality": 85,
  "resize": { "width": 1024, "height": 768 }
}
```

`format` ∈ `png|jpg|webp`. `quality` 1–100. `resize` optional.

Response — `BatchExportResponse`:

```json
{
  "success": true,
  "zip_file": "<base64>",
  "file_count": 2,
  "total_size_bytes": 458242,
  "processing_time_ms": 124.7
}
```

`404` if **all** image_ids are missing; partial misses are warned and skipped.

### 2.15 Retrieval / AI Director — `/api/v1/retrieval`

Local-first retrieval store for M7. The embedding model (`all-MiniLM-L6-v2`) is
lazily loaded and optional: when absent, ranking falls back to deterministic
lexical matching. The index persists as files under the runtime data dir
(`vectors.npz` + `corpus.json`); no SQLite, no native extension.

| Method | Path | Body → Response | Notes |
|---|---|---|---|
| POST | `/api/v1/retrieval/ingest` | `{ records: [{ source, text, boosted?, label? }] }` → `{ ingested, skipped, total }` | Allow-list: only `source/text/boosted/label` are read; content-hash dedupe. |
| POST | `/api/v1/retrieval/query` | `{ text, modelFamily?, sources[], maxTokens }` → `{ snippets: [{ id, source, text, label, score }], mode }` | `mode` is `semantic` or `lexical`. Snippets are budget-fit; KB entries merged by `modelFamily`. |
| POST | `/api/v1/retrieval/clear` | → `{ success }` | Empties the index. |
| GET | `/api/v1/retrieval/stats` | → `{ count, mode }` | |

`source` is `prompt-history \| assets \| knowledge-base`. The curated knowledge
base ships in-repo (`backend/services/retrieval/prompting_kb/*.json`, keyed by
model family) and is always available as the cold-start source. Favorited /
successfully-completed items are score-boosted; no `trust_remote_code` path.

### 2.16 ComfyUI Interop — `/api/v1/comfy`

Runs an imported / authored ComfyUI graph on a connected Comfy server (replacing
the hardcoded template for graph-originated runs). Imported graphs are **untrusted
input**: every graph is validated by `comfy_graph_guard.validate_comfy_graph`
before it reaches `queue_prompt`.

| Method | Path | Body → Response | Notes |
|---|---|---|---|
| POST | `/api/v1/comfy/run-graph` | `{ graph, generation_type? }` → `{ job_id, status, message }` | `generation_type` is `image` (default) or `video`. `200` schedules a background job (poll `GET /api/jobs/{job_id}`); `409` when no Comfy server is connected; `422` when the graph fails the safety gate. |

**Safety gate (Codex):** a **class-type allow-list** (the first-class core pipeline —
`CheckpointLoaderSimple`, `CLIPTextEncode`, `EmptyLatentImage`, `KSampler`,
`VAEDecode`, `SaveImage`, `PreviewImage`, `LoraLoader`, `VAELoader`) plus
`sanitize_path` / `sanitize_model_name` over every path/model field. Any
unsupported node type or unsafe path raises a structured, **leak-free** refusal
(no path or token in the message) and the graph is never submitted. The check runs
at the endpoint **and** as defense-in-depth at the start of `execute_comfy_graph`.
**Video-through-Comfy:** the flat video path (`process_video_generation`) prefers a
connected Comfy server (`build_video_workflow` + image/gif/video output extraction)
and falls back to `DirectVideoGenerator`.

### 2.14 Static `/outputs/*`

Mounted via `StaticFiles(directory=OUTPUT_DIR)`. Authentication is **bypassed** (path is in `AUTH_EXEMPT_PATHS`) so the renderer can render images via `<img src="http://127.0.0.1:8000/outputs/<job>/image_001.png">` without proxying through IPC. This is safe because the backend is loopback-only and the renderer can only request paths it learned through API responses.

---

## Part 3 — WebSocket: `/ws`

Single endpoint, used for real-time progress updates.

### Connection

```
ws://127.0.0.1:8000/ws[?token=<token>]
```

`?token` is required when `VISION_STUDIO_BACKEND_AUTH_TOKEN` is set (the Main process passes it automatically). Mismatch → close with code `1008`.

The Main process (`electron/ipc-handlers/generation.ts`) opens this connection on app start and reconnects with exponential backoff (1 s → 2 s → … capped at 30 s).

### Server → client

The server pushes one frame per active job every 500 ms while jobs are in `processing`:

```json
{
  "type": "job_update",
  "job_id": "9a2…",
  "status": "processing",
  "progress": 42.5
}
```

Each frame is forwarded directly to the renderer over the `generation:progress` IPC event with the same shape.

### Client → server

Optional subscription messages — currently a no-op accepted shape:

```json
{ "action": "subscribe", "job_id": "9a2…" }
```

The server ignores these (it broadcasts everything). Reserved for future per-job filtering.

---

## Part 4 — Hosted provider integrations (OpenRouter + HuggingFace Inference)

### OpenRouter

When the active account's `imageGenerationProvider === 'openrouter'`, image jobs run **entirely in the Main process** without ever calling the Python backend. They:

1. Use the `OpenRouterService` (`electron/services/openRouter.ts`) to call OpenRouter's REST API with the per-account `apiKey` (decrypted via `safeStorage`).
2. Persist returned images as PNG/JPG/WebP/GIF (chosen from the response MIME type) under `<outputRoot>/openrouter/YYYY-MM-DD/<jobId>-<n>.<ext>`.
3. Maintain their own job entries in an in-memory `Map` (`openRouterImageJobs`) — IDs are prefixed `openrouter-image-<uuid>` so `getStatus` and `cancel` can discriminate.
4. Emit `generation:progress` events directly so the renderer's progress UI is identical regardless of provider.

Limitations:

- ControlNet, inpaint, mask, and reference-image inputs are **not** supported on the OpenRouter route — those requests return `{ success: false, error: "OpenRouter still-image routing currently supports prompt-only generations…" }`.
- Cancel is best-effort via `AbortController`; if the upstream completed before the abort lands, the job lands as `completed`.
- Prompt-enhancement and negative-prompt suggestion routes use the account's `openRouterModel` (typically a chat model), not the image model.

Configuration is per-account; one account can route prompts to OpenRouter but generate locally, or vice-versa. See the `accounts:update` IPC for valid shapes.

### HuggingFace Inference (M6)

When the active account routes a job to HuggingFace — `imageGenerationProvider === 'huggingface'` (still image, ControlNet, inpaint), `videoGenerationProvider === 'huggingface'` (video), or a Local over-budget job carried over via the fallback policy — the job runs **entirely in the Main process** without calling the Python backend. They:

1. Use `HuggingFaceInferenceService` (`electron/services/huggingfaceInference.ts`) with the per-account BYOK token (decrypted via `safeStorage`); the token is used per-request, never logged, never returned to the renderer.
2. Post to the Inference Providers router — `https://router.huggingface.co/hf-inference/models/<model>` for image / ControlNet / inpaint / video (returning raw bytes), and the OpenAI-compatible router for chat.
3. Validate returned bytes against image/video magic numbers (sanitization) before normalizing to a data URL, then persist under `<outputRoot>/huggingface/YYYY-MM-DD/` (`<jobId>-<n>.<ext>` for images, `<jobId>.<ext>` for video).
4. Track jobs in in-memory stores with IDs prefixed `huggingface-image-<uuid>` / `huggingface-video-<uuid>`, discriminated by `routedJobProvider` (`electron/ipc-handlers/hostedImageRouting.ts`) so `getStatus` / `cancel` / `list-jobs` route to the right store.
5. Emit `generation:progress` so the renderer's progress UI is provider-agnostic.

**ControlNet & inpaint.** These ride `generation:generate-image`. The control/init image (a managed file path) is read and base64-encoded in the Main process behind a path guard (`hostedControlAssets.ts` — never reads outside the app's asset roots), and the vector inpaint mask is rasterized to a PNG sized to the init image (pure-JS point-in-polygon fill + zlib PNG encode, no native dependency). HuggingFace's ControlNet endpoint takes a single control image; the per-layer region mask is a local-only refinement and is not applied. img2img (a bare init image) and reference-image (IP-adapter) passes are not supported on HuggingFace and stay on Local.

Prompt-enhancement and negative-prompt suggestion use the account's `huggingFaceModel` against the OpenAI-compatible router (`https://router.huggingface.co/v1/chat/completions`).

### Routing fabric & capability matrix (M6)

*Where* a still-image or prompt-assist job runs is decided by the pure resolver `resolveRoute` (`shared/resolveRoute.ts`) over the capability registry (`shared/providerRouting.ts`). The renderer reads it to gray out impossible combinations; the Main process re-runs it at dispatch as the authoritative guard and refuses unsupported/unconfigured routes with a structured error.

| Modality | Local | OpenRouter | HuggingFace |
|----------|:-----:|:----------:|:-----------:|
| Still image | yes | yes | yes |
| ControlNet | yes | no | yes |
| Inpaint | yes | no | yes |
| Video | yes | no | yes |
| LLM prompt-assist | yes (heuristic) | yes | yes |

OpenRouter still-image is prompt-only (no ControlNet / inpaint / reference inputs). HuggingFace ships still image, ControlNet, inpaint, video, and LLM-assist — the registry declares each as `true` only because dispatch + UI back them end-to-end (it remains the authoritative routing guard). Because OpenRouter cannot do video, `resolveRoute` only ever surfaces HuggingFace as a hosted candidate for the `video` modality. The over-budget fallback prompt is currently wired for the still-image flow; video routing is an explicit per-account provider choice.

**Over-budget fallback.** A Local job that the M5 fit verdict marks `over-budget` triggers a fallback: when `autoRouteOnOverBudget` (Settings) is enabled and the account's `fallbackProvider` is capable + configured, the job routes silently (carried as a per-request `__providerOverride` on `generation:generate-image`); otherwise the renderer prompts (run locally / route to a hosted provider / cancel).

**New IPC.** `accounts:set-huggingface-token`, `accounts:clear-huggingface-token`; the `accounts:update` patch gains `huggingFaceModel`, `huggingFaceImageModel`, `huggingFaceVideoModel`, `videoGenerationProvider`, and `fallbackProvider`; `settings` gains `autoRouteOnOverBudget`.

This integration adds **no backend Python endpoint**, so `docs/api/openapi.json` is unchanged.

---

## Part 5 — Examples

### 5.1 Renderer: generate an image and watch progress

```ts
// In a React component
const start = async () => {
  const result = await window.electron.generation.generateImage({
    prompt: 'a serene mountain landscape at sunset, golden hour lighting',
    negative_prompt: 'blurry, low quality',
    width: 1024,
    height: 1024,
    steps: 30,
    cfg_scale: 7.5,
    model: 'flux-dev',
  });
  if (!result.success || !result.jobId) throw new Error(result.error);
  return result.jobId;
};

useEffect(() => {
  const unsubscribe = window.electron.generation.onProgress((evt) => {
    if (evt.job_id !== currentJobId) return;
    setProgress(evt.progress);
    if (evt.status === 'completed') {
      window.electron.generation.getStatus(evt.job_id).then((full) => {
        setImages(full.result.images);              // /outputs/... URLs
      });
    }
  });
  return unsubscribe;
}, [currentJobId]);
```

### 5.2 cURL: drive the backend directly

```bash
TOKEN="$VISION_STUDIO_BACKEND_AUTH_TOKEN"

# Start an image job
curl -X POST http://127.0.0.1:8000/api/generate/image \
  -H "Content-Type: application/json" \
  -H "x-vision-studio-token: $TOKEN" \
  -d '{"prompt":"a cyberpunk samurai under neon rain","width":1024,"height":1024,"steps":30}'

# Poll status
curl -H "x-vision-studio-token: $TOKEN" \
  http://127.0.0.1:8000/api/jobs/9a2…

# Cancel
curl -X POST -H "x-vision-studio-token: $TOKEN" \
  http://127.0.0.1:8000/api/jobs/9a2…/cancel
```

### 5.3 JavaScript: subscribe to the WebSocket

```js
const TOKEN = '...';                    // Main-process-minted token
const ws = new WebSocket(`ws://127.0.0.1:8000/ws?token=${encodeURIComponent(TOKEN)}`);

ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  if (msg.type === 'job_update') {
    console.log(`Job ${msg.job_id}: ${msg.status} ${msg.progress.toFixed(1)}%`);
  }
};

ws.onclose = (evt) => {
  // 1008 means the server rejected your token
  console.warn('ws closed', evt.code);
};
```

### 5.4 Python: invoke the ControlNet route

```python
import base64
import httpx

def encode(path):
    with open(path, "rb") as f:
        return "data:image/png;base64," + base64.b64encode(f.read()).decode("ascii")

response = httpx.post(
    "http://127.0.0.1:8000/api/v1/controlnet/generate",
    headers={"x-vision-studio-token": TOKEN},
    json={
        "prompt": "a futuristic city skyline at sunset",
        "init_image": encode("init.png"),
        "control_image": encode("canny.png"),
        "model": "canny",
        "steps": 30,
        "guidance_scale": 7.5,
        "width": 768,
        "height": 768,
        "num_images": 2,
    },
    timeout=300,
)
data = response.json()
for i, image in enumerate(data["images"]):
    base64_payload = image.split(",", 1)[1]
    open(f"out_{i}.png", "wb").write(base64.b64decode(base64_payload))
```

---

## Part 6 — Status codes

| Code | Meaning | When |
|------|---------|------|
| `200` | Success | Normal response |
| `201` | Created | `POST /api/models/import` — new library root registered |
| `202` | Accepted | `POST /api/models/{id}/download` — download enqueued; body is the `DownloadJob` |
| `400` | Bad request | Pydantic validation failure, `INVALID_INPUT` from `/api/v1/*`, unknown `source` on `/api/models/search`, or unknown `kind` on `/api/models/consent` |
| `403` | Forbidden | Missing/invalid `x-vision-studio-token` |
| `404` | Not found | Missing job, model, library root, download job/action, or source file |
| `409` | Conflict | `DELETE /api/models/{id}` on a linked library reference (remove its library root instead); consent/conversion conflicts on download + convert routes with `detail.error_code` ∈ `pickle-consent-required \| remote-code-consent-required \| no-pickle-source \| already-converted` |
| `422` | Unprocessable | `POST /api/models/{id}/convert-safetensors` — conversion failed (corrupt/unreadable pickle source); `GET /api/models/search` — out-of-bounds query params (`page` outside 1–50, over-length `q`/`author`/`task`) |
| `429` | Rate limited | Hit the per-IP rate limit; response includes `Retry-After` header and `{ "error": "Rate limit exceeded", "error_code": "RATE_LIMITED", "retry_after": "60" }` |
| `500` | Server error | Generation/edit/service exception; `{ error, error_code }` body |
| `503` | Unavailable | `POST /api/models/{id}/convert-safetensors` in stub mode — `torch` is not installed, conversion is unavailable; `POST /api/models/{id}/download` with `detail.error_code` `repo-signals-unverifiable` — a transient HF record's full safety signals could not be fetched, so the download fails closed |
| WS `1008` | Policy violation | Token mismatch on `/ws` |

---

_Last verified against the codebase on 2026-06-18. Canonical source: `backend/main.py`, `backend/api/{controlnet,lora,edit,batch,retrieval}.py`, `backend/services/retrieval/*`, `backend/foundry/{schemas,library_roots,index_service,hub_search,civitai_search,security_policy,download_manager,convert,hardware,runtime_resolver}.py`, `shared/retrieval.ts`, `electron/preload.ts`, `electron/ipc-handlers/generation.ts`, `electron/services/{mainIpc,retrievalClient,contextAssembler,promptAugmentation}.ts`, `electron/main.ts`._
