# Finalize Production Integrations Design

## Goal

Close the remaining stubbed and partial features in Vision Studio so image/video generation, model downloads, edit actions, batch operations, theme behavior, and user notifications are real production flows rather than placeholders.

## Scope

This design covers all currently identified incomplete features:

- Real ComfyUI image generation workflow submission and output collection
- Real video generation path with job progress and produced output files
- Real CivitAI model downloads with authenticated requests when configured
- Prompt enhancement from the generate panel
- Crop/apply and derived-image creation in edit mode
- Batch single export, bulk export, and delete operations
- Preview modal export, delete, regenerate, and upscale actions
- Layer thumbnails instead of placeholder previews
- Global theme application for dark/light/system
- Actual desktop notifications for key job and model lifecycle events

## Current Constraints

The existing architecture is already sufficient for the completion pass:

- FastAPI backend owns generation jobs and model lifecycle
- Electron main process owns safe filesystem access and dialogs
- Renderer panels already depend on store state and job polling
- Asset persistence is already in place and should remain the system of record for outputs

The main gap is not architecture, it is unfinished behavior at the seams between these layers.

## Recommended Approach

Extend the current backend and IPC surfaces instead of introducing another abstraction layer.

Why:

- Existing code already routes generation through jobs, so backend feature completion naturally fits there
- File operations are already guarded in Electron, so export/delete/edit outputs should stay there
- Renderer placeholders can be replaced with real async flows without changing app structure

This keeps the change set coherent and avoids building new infrastructure just to finish missing behavior.

## Backend Design

### Image Generation

Replace `generate_with_comfyui()` with a real implementation that:

- selects a workflow based on requested model
- injects prompt, negative prompt, size, steps, cfg, scheduler, and seed
- queues the prompt with ComfyUI
- polls or listens for completion
- copies or writes produced outputs into the Vision Studio managed output directory for the job
- returns the same result shape used by direct generation

If ComfyUI is reachable but the requested workflow cannot be built for that model, fail explicitly. The direct generator remains available only as the non-Comfy fallback path when ComfyUI is unavailable.

### Video Generation

Replace the simulated video job with a real service:

- add a `DirectVideoGenerator` backend utility
- support a minimal production-ready path using `diffusers` video-capable pipelines when available
- write an `.mp4` plus optional frame previews under the managed job directory
- report progress through the existing job model

Capability checks must be explicit. Unsupported model/runtime combinations should fail with actionable errors, not fake success.

### Prompt Enhancement

Add a backend prompt enhancement endpoint with deterministic transformations:

- clarify
- cinematic
- concise
- platform-adapted
- variation generation

The first implementation should be local and rules-based so it is production-safe without external dependencies. The endpoint should still return structured results that could later be backed by an LLM without changing the renderer contract.

### Edit Operations

Add backend image operations for:

- crop/rotate/flip output generation
- upscale

These operations create derived assets in managed output directories and return normal asset/job payloads. Use Pillow for crop/rotate/flip. Use a real upscale implementation that works offline, with model-backed upscaling when available and a high-quality image resize fallback only where unavoidable and labeled internally.

### Model Downloads

Finish CivitAI support in `ModelManager`:

- allow `download_url` metadata on model records
- optional `CIVITAI_API_TOKEN` support
- streamed chunk download with progress updates
- atomic final file placement
- error state updates

The download model API should surface success/failure and progress cleanly to the existing renderer polling flow.

## Electron Design

### IPC Additions

Add safe IPC methods for:

- `prompt:enhance`
- `images:crop`
- `images:upscale`
- `batch:export`
- `batch:delete`
- `notifications:notify`
- `theme:apply`

These should preserve the current security posture by validating source paths against managed roots before reading or writing files.

### Notifications

Use Electron `Notification` from the main process for:

- generation complete
- generation failed
- model download complete
- model download failed

Renderer triggers should be coarse-grained and originate from terminal state transitions, not every progress tick.

### Theme

Persisted theme settings already exist. Complete the feature by:

- applying the theme to the document root on app startup
- responding to changes immediately
- honoring `system` by tracking `matchMedia('(prefers-color-scheme: dark)')`

## Renderer Design

### Generate Panel

- wire `onEnhance`
- let preview-modal regenerate repopulate generate state with previous params
- keep prompt history consistent after enhancement and regeneration

### Batch Results

- real single export
- real bulk export of selected/all completed images
- delete selected results and associated asset records safely

### Preview Modal

- export current result
- delete current result and close/navigate predictably
- upscale current result into a new managed asset
- regenerate by rehydrating generate-panel state

### Edit Panel

- crop apply should create a derived asset and load it into the editor
- layer thumbnail rendering should be driven by layer type/data rather than a placeholder block

### Settings

- apply theme immediately
- convert the notifications tab from informational to actual preference toggles if the code supports persistence with minimal scope

## Data Flow

### ComfyUI Image Job

1. Renderer requests image generation.
2. Backend creates a job.
3. Backend builds and queues a ComfyUI workflow.
4. Backend monitors execution.
5. Backend copies final images into `OUTPUT_DIR/<job_id>/`.
6. Job completes with result payload.
7. Renderer/store persist assets and trigger completion notification.

### Edit/Upcale Derived Asset

1. Renderer sends a source asset path plus operation params through Electron.
2. Electron validates the path is managed.
3. Backend or main-process helper writes a new derived file.
4. Renderer stores the new asset record and loads it in preview/edit when appropriate.

### Model Download

1. Renderer starts download.
2. Backend transitions model status to `downloading`.
3. Backend downloads with progress updates.
4. Backend atomically moves the file into its final model directory.
5. Model status becomes `ready` or `error`.
6. Renderer refreshes model list/status and emits completion/failure notification.

## Error Handling

- No simulated success values
- All file mutations must stay within managed roots
- Backend job failures must include actionable messages
- Cancelled operations should leave no partial outputs registered as assets
- Failed downloads should remove incomplete temp files
- Theme and notifications should degrade safely on unsupported platforms

## Testing Strategy

Use TDD for all behavior changes.

Backend unit tests:

- ComfyUI workflow selection and output parsing
- CivitAI download request/auth/progress logic
- prompt enhancement transforms
- edit/upscale helpers
- video output packaging helpers

Electron/main-process tests:

- batch export/delete path validation
- notification trigger logic where testable
- theme resolution helpers

Renderer tests:

- only for extracted pure helpers and state transitions where easy to maintain

Verification:

- `npm test`
- app build
- targeted Python test or smoke verification where available
- code review subagent before final wrap-up
