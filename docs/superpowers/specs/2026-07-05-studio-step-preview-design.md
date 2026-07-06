# Studio Live Step Preview (#33) - Design

**Issue:** #33 - CompositionPreview's Generate button is a stub (`setPreviewActive(true)` and
nothing else), and the entire progressive-preview render path
(`ProgressivePreview`, `ProgressiveStepOverlay`, `generationPreviewSlice.addStepImage`)
has zero producers. Nothing ever streams step images.

**Goal:** Studio's Generate button submits a real image generation built from the
Studio prompt config, and the composition canvas shows live per-step preview
images decoded on the backend with tiny-VAE (taesd) decoders, streamed over the
existing WebSocket at ~2 frames/sec, with clean lifecycle: clear on submit,
hand off to the finished image on completion, real cancel, and honest
degradation to a step counter when no decoder is available.

**User-approved decisions (brainstorm, 2026-07-04):**
1. Generate submits the **GeneratePanel config** - the Studio `generationDraft`
   (the exact object GeneratePanel would consume on next mount) merged over the
   store generation settings - via a shared feature function following the
   established `runWorkflowExecution` / `runTimelineClipGeneration` pattern.
2. Per-step preview images are produced by **Tiny-VAE (taesd) decoders**
   (MIT-licensed, ~10 MB per family), shipped natively with the app per the
   heavy-by-design packaging directive. Model-license-restricted weights stay
   per-user via Foundry; taesd is MIT so it ships in the installer.

---

## Scope

**In scope**
- Backend: `backend/preview/` package - decoder registry + step-preview service;
  wiring into `DirectGenerator.generate_image`'s existing step callback; a new
  `step_image` WebSocket message riding the existing 500 ms `/ws` loop;
  eviction on job-terminal.
- Electron: forward `step_image` from the backend WS to the renderer on a new
  `generation:step-image` IPC channel; preload + type surface.
- Renderer: preview-slice lifecycle state (`previewJobId`, `previewError`,
  `beginPreview`, `setPreviewStep`); `runStudioGeneration` feature function;
  CompositionPreview / ProgressivePreview wiring (submit, subscribe, cancel,
  handoff, degrade, error strip).
- Packaging: `scripts/fetch-preview-decoders.cjs` downloads the four decoder
  weight sets into `resources/preview-decoders/`; the heavy-build gate
  (`scripts/assert-native-backend.cjs`) additionally asserts they are present;
  `.gitignore` entry; wired into `scripts/build-windows.cjs`.

**Out of scope (explicitly)**
- Video generation previews (`direct_video_generator` reports coarse progress
  only; SVD/LTX latents are not per-step-decodable in the same way).
- ComfyUI-routed jobs (no latents callback surface) and hosted providers
  (OpenRouter / HuggingFace run off-device - no latents exist locally). Both
  degrade to the step counter automatically.
- Guided-layer submission from Studio (composition layers stay visual aids;
  Studio submits the prompt config only - matching the approved decision).
- Backend cancellation semantics (existing `/api/jobs/{id}/cancel` behavior is
  unchanged; the UI cancel calls it and clears the preview).

---

## Architecture

```
DirectGenerator._generate_sync (worker thread)
  callback_on_step_end -> progress_callback_fn(step, timestep, latents)
       |- loop.call_soon_threadsafe(progress_callback, %)      [existing]
       '- step_preview_service.submit(job_id, step, total,      [NEW, sync,
            latents, family, width, height)                     worker thread]
              '- throttle >=0.5s/job -> taesd decode -> JPEG
                 -> base64 data URI -> latest[job_id] rev++

main.py send_job_updates (500ms loop, per WS connection)        [extended]
  for each processing job:
    send job_update (existing)
    preview = step_preview_service.latest(job.id)
    if preview.revision unseen on this connection:
      send {"type": "step_image", job_id, step, total_steps, image}

electron generation.ts ws.on('message')                         [extended]
  job_update   -> webContents.send('generation:progress', msg)  [existing]
  step_image   -> webContents.send('generation:step-image', msg)[NEW]

renderer
  CompositionPreview: useStepImageSubscription()                 [NEW hook]
    onStepImage(msg): if msg.job_id === previewJobId ->
      setTotalSteps(msg.total_steps); addStepImage(msg.step, msg.image)
  Generate button -> runStudioGeneration()                       [NEW feature fn]
    validate -> submit generateImage -> beginPreview(jobId, steps)
    -> poll getStatus (error-budget, no wall clock cap)
    -> completed: updateJob + syncAssets + setCurrentImage(final) + clearPreview
    -> failed: updateJob + previewError + notify
  ProgressivePreview cancel -> generation.cancel(previewJobId) + clearPreview
```

The `step_image` message (new WS + IPC contract):

```json
{
  "type": "step_image",
  "job_id": "e3b0c442-...",
  "step": 12,
  "total_steps": 25,
  "image": "data:image/jpeg;base64,/9j/4AAQ..."
}
```

`step` is 1-based (matches the "Step 12 / 25" counter). `image` is a complete
data URI so the renderer assigns it straight to `img.src`.

---

## Backend

### `backend/preview/decoders.py` - decoder registry

- Family map (catalog `base_architecture` -> decoder dir name):
  `{"sd15": "taesd", "sdxl": "taesdxl", "sd35": "taesd3", "flux": "taef1"}`.
  Any other family (svd, ltx, animatediff, unknown, None) -> no decoder,
  preview disabled for that job (fail-soft).
- `resolve_decoders_dir() -> Optional[str]` precedence:
  1. `VISION_STUDIO_PREVIEW_DECODERS_DIR` env var (tests, ops override);
  2. frozen (PyInstaller): `dirname(sys.executable)/preview-decoders`
     (the exe sits directly in electron `resourcesPath`, and
     `resources/preview-decoders/` ships beside it via `extraResources`);
  3. source runs, probed in order: `<backend>/../resources/preview-decoders`
     (dev checkout) then `<backend>/../preview-decoders` (the packaged
     `backend-source` fallback sits at `resourcesPath/backend-source`, and the
     decoders land at `resourcesPath/preview-decoders`);
  4. none exists -> `None`.
- `load_decoder(family)` -> `diffusers.AutoencoderTiny.from_pretrained(dir)`,
  cached per family, moved to the caller-supplied device, `float32`. Raises
  `PreviewDecoderUnavailable` (module-local exception) when the family is
  unsupported or the weights dir is missing - callers treat it as "disabled",
  never as a job failure.
- `decode_latents_to_data_uri(latents, family, width, height) -> str`:
  1. FLUX only: unpack packed latents `[B, (H/16)(W/16), 64]` ->
     `[B, 16, H/8, W/8]` (local mirror of the FluxPipeline unpack math -
     `view(B, H/16, W/16, 16, 2, 2) -> permute(0,3,1,4,2,5) -> reshape`);
  2. generic pre-scale from the loaded decoder's own config:
     `latents / config.scaling_factor + config.shift_factor` (identity for all
     four taesd decoders - kept generic for correctness);
  3. `decoder.decode(latents.to(device, dtype)).sample` -> `[-1, 1]` ->
     `(x / 2 + 0.5).clamp(0, 1)` -> PIL;
  4. resize longest edge to <= 512 px (LANCZOS), JPEG quality 70, base64,
     `data:image/jpeg;base64,` prefix.
  Everything under `torch.no_grad()`.

### `backend/preview/step_preview.py` - `StepPreviewService`

- Module-level singleton `step_preview_service` (imported by
  `utils/direct_generator.py` and `main.py` - same pattern as other module
  seams; tests monkeypatch it).
- `@dataclass StepPreview: revision: int, step: int, total_steps: int, image: str`.
- `submit(job_id, step, total_steps, latents, family, width, height)`:
  - runs synchronously in the ThreadPoolExecutor worker (off the event loop);
  - throttle: skip unless >= 0.5 s (`MIN_DECODE_INTERVAL_S`) since this job's
    last decode - except the first submit for a job, which always decodes so
    the user gets fast first feedback;
  - `latents is None` or family unsupported or decoder missing -> record the
    disabled state once per job (single log line) and return;
  - any decode exception -> disable previews for this job, log once, return.
    **A preview failure must never fail or slow the generation** beyond the
    throttled decode itself.
- `latest(job_id) -> Optional[StepPreview]` - snapshot read.
- `discard(job_id)` - eviction; called from `process_image_generation`'s new
  `finally` block so every terminal path (completed / failed / refused) frees
  the stored JPEG.
- Thread-safe via one `threading.Lock` (mirrors `JobManager`).

### `utils/direct_generator.py` wiring

Inside `generate_image` (async context, all needed values in scope), the
existing `progress_callback_fn` closure gains the preview submit:

```python
family = (_resolve_record(model_name) or {}).get("base_architecture")

def progress_callback_fn(step, timestep, latents):
    step_preview_service.submit(
        job_id=job_id, step=step + 1, total_steps=steps,
        latents=latents, family=family, width=width, height=height)
    if progress_callback:
        progress = (step + 1) / steps * 100
        loop.call_soon_threadsafe(progress_callback, progress)
```

No `_generate_sync` signature change: `callback_on_step_end` already forwards
`callback_kwargs.get("latents")` into this closure, and it already runs for
every pass kind (txt2img, img2img, inpaint, ControlNet, IP-Adapter). The video
generator is untouched.

### `main.py` WebSocket + eviction

- `send_job_updates` keeps a per-connection `sent_revisions: Dict[str, int]`;
  after each `job_update` it reads `step_preview_service.latest(job.id)` and
  sends one `step_image` message when the revision is new to this connection.
  The 500 ms loop caps the stream at 2 frames/sec per the approved design.
- `process_image_generation` wraps its body's terminal updates with
  `finally: step_preview_service.discard(job_id)`.

---

## Electron

- New `electron/ipc-handlers/backendWsRouting.ts`: pure
  `routeBackendWsMessage(raw: string, send: (channel, payload) => void)` that
  parses and dispatches `job_update -> 'generation:progress'` and
  `step_image -> 'generation:step-image'`; malformed JSON and unknown types are
  swallowed (logged), matching current behavior. `generation.ts`'s inline
  `ws.on('message')` handler delegates to it (unit-testable without a socket).
- `preload.ts` `generation` namespace gains
  `onStepImage: (callback) => unsubscribe` mirroring `onProgress`.
- `src/types/electron.d.ts` gains
  `StepImageEvent { type: 'step_image'; job_id: string; step: number; total_steps: number; image: string }`
  and `onStepImage(callback: (data: StepImageEvent) => void): () => void`.

---

## Renderer

### `generationPreviewSlice` additions

```ts
previewJobId: string | null   // job the preview canvas is tracking
previewError: string | null   // last Studio submission/run failure (session-only)

beginPreview(jobId, totalSteps) // fresh Map, currentStep 0, isPreviewActive true,
                                // previewJobId set, previewError null
setPreviewStep(step)            // monotonic: ignores step <= currentStep; drives
                                // the counter for decoder-less/hosted runs
setPreviewError(message | null)
clearPreview()                  // existing reset + previewJobId null (previewError
                                // is NOT cleared here - it must survive the
                                // preview teardown so the user can read it)
```

`addStepImage` keeps its 10-image eviction; its `currentStep` write gains a
monotonic guard (`Math.max(currentStep, step)`) so a frame that lands after a
poll-driven `setPreviewStep` cannot step the counter backwards.

### `src/features/studio/runStudioGeneration.ts` (shared feature function)

Follows the `runWorkflowExecution` conventions: injected
`electron = window.electron`, `store = useAppStore`, `pollIntervalMs = 500`,
optional `AbortSignal`; returns `{ ok: boolean; jobId?: string; error?: string }`.

1. **Config resolution** - the GeneratePanel config, exactly as GeneratePanel
   would consume it: `state.generationDraft` when present, else the same
   default GeneratePanel/PromptStudio operate on -
   dimensions from `computeDimensions(aspectRatio, resolutionTier, customWidth,
   customHeight)`, steps/cfgScale/scheduler/seed from `advancedGeneration`,
   prompt/negativePrompt empty. Model precedence:
   `draft?.model?.trim() || state.selectedImageModelId` (the cross-panel model
   mirror). Always submits an **image** generation.
2. **Validation (fail with `setPreviewError`, no submit):** empty prompt ->
   "Enter a prompt in Prompt Studio before generating."; backend not connected
   (`state.systemInfo.backendConnected` false) -> the exact GeneratePanel
   message ("The AI backend is not running. ..."). Re-entrancy: if
   `state.isPreviewActive`, return `{ ok: false }` silently (button is a no-op
   during a run).
3. **Submit:** payload mirrors GeneratePanel's prompt-only path - `prompt`,
   `negative_prompt`, `width`, `height`, `steps`, `cfg_scale`,
   `seed` (`-1 -> undefined`), `model`, `scheduler`,
   `acceleration_settings: toAccelerationRequestPayload(state.accelerationSettings)`.
   No canvas layers, LoRAs, or provider overrides (provider routing inside the
   `generation:generate-image` handler still applies; hosted jobs degrade to
   the counter). On submit error -> `setPreviewError`, return.
4. **Lifecycle begin:** `beginPreview(jobId, steps)`; `addJob` with
   `params: { ...payload, seed: advanced seed, output_root, source: 'studio' }`.
5. **Poll loop:** `getStatus` every `pollIntervalMs`; consecutive-failure
   budget of 5 via the existing `makePollErrorBudget` helpers; **no wall-clock
   cap** (CPU-only machines run many minutes; the workflow runner's 60 s budget
   is wrong here). Non-terminal: `updateJob(progress)` and
   `setPreviewStep(round(progress / 100 * steps))`. Stale-run guard: preview
   -slice writes only while `getState().previewJobId === jobId`; job-slice
   bookkeeping always runs.
6. **Completed:** `updateJob(completed...)`; `syncAssetsFromJobStatus` with
   `output_root`-bearing params (workflow-runner pattern); look up the synced
   asset via the `${job_id}::${outputPath}` id convention
   (`getOutputAssetId`); **handoff**:
   `setCurrentImage(asset.previewUrl, asset.path)` (fallback
   `toPreviewUrl(outputPath)` if the record lookup misses), THEN
   `clearPreview()` - order guarantees the canvas swaps from the last step
   frame straight to the finished image. `notify('generation_complete')`
   (swallow notify errors).
7. **Failed:** `updateJob(failed...)`, `clearPreview()`,
   `setPreviewError(status.error || 'Generation failed')`,
   `notify('generation_failed')` (swallowed).
   **Cancelled:** `updateJob`, `clearPreview()`, no error, no notification.
8. Abort signal (pre-aborted or fired mid-poll): cancel the backend job
   (swallow errors), mark the job failed with a cancellation message,
   `clearPreview()`.

### Component wiring

- **CompositionPreview**
  - `handleGenerate` -> `void runStudioGeneration()` (replaces the stub; the
    "#33 tracked" comment goes away).
  - Mounts `useStepImageSubscription()` (new hook,
    `src/features/studio/useStepImageSubscription.ts`): subscribes
    `window.electron.generation.onStepImage` on mount (guarded for absent
    preload in tests), and for events with `job_id === previewJobId` calls
    `setTotalSteps(total_steps)` then `addStepImage(step, image)`;
    unsubscribes on unmount.
  - Renders a dismissible error strip (role="alert", `.recessed-well`, error
    tokens, lucide `AlertCircle` + `X` dismiss -> `setPreviewError(null)`)
    above the canvas when `previewError` is set. No new hardware primitives;
    existing Carbon Pro tokens only.
- **ProgressivePreview**
  - Cancel: `previewJobId` from the store; handler awaits
    `electron.generation.cancel(previewJobId)` (swallow errors) then
    `clearPreview()`.
  - Frame derivation fix: the shown frame becomes the **highest-key entry of
    `stepImages`** instead of `stepImages.get(currentStep)`. The poll-driven
    counter (`setPreviewStep`) legitimately runs ahead of the 0.5 s-throttled
    decoder, and the old exact-key lookup would blank the image back to the
    spinner whenever counter > last decoded step.
  - Degrade state: when `currentStep > 0` and no step image exists, replace
    the "Initializing generation..." spinner copy with the honest
    "Rendering - step preview unavailable on this run." (counter overlay keeps
    ticking via `setPreviewStep`). The spinner-with-"Initializing..." state
    remains for `currentStep === 0`.

### Targeted pre-existing fix (in-scope hygiene)

`PromptStudioPanel.buildDefaultGenerationDraft` hardcodes `model: 'flux-dev'`.
It becomes `model: state.selectedImageModelId` (the panel already reads the
store; the pick-up is trivial) so a Studio draft created by typing a prompt
carries the actually-selected checkpoint instead of silently retargeting
flux-dev. `runStudioGeneration`'s `draft?.model || selectedImageModelId`
precedence makes this belt-and-braces.

---

## Packaging (heavy-by-design)

- **`scripts/fetch-preview-decoders.cjs`**: downloads, for each of
  `madebyollin/taesd`, `taesdxl`, `taesd3`, `taef1` (all MIT), the two
  diffusers-format files `config.json` + `diffusion_pytorch_model.safetensors`
  from the HuggingFace resolve endpoint into
  `resources/preview-decoders/{taesd,taesdxl,taesd3,taef1}/`. Idempotent
  (skips files that exist with plausible size), follows redirects, verifies
  each safetensors file is > 1 MB, and writes
  `resources/preview-decoders/ATTRIBUTION.txt` (source repos + MIT notice).
- **`scripts/assert-native-backend.cjs`**: in addition to the backend exe
  check, asserts all four decoder dirs contain `config.json` +
  `diffusion_pytorch_model.safetensors`. Packaging refuses to produce an
  installer without preview decoders - same rationale as the backend gate.
- **`scripts/build-windows.cjs`**: runs the fetch script during resource
  preparation (before electron-builder).
- **`.gitignore`**: `resources/preview-decoders/` (fetched artifacts, never
  committed).
- `electron-builder.yml` needs **no change**: `resources/ -> resourcesPath`
  already ships everything under `resources/`.

---

## Error handling / degradation matrix

| Condition | Behavior |
|---|---|
| Decoder weights missing / family unsupported (svd, ltx, unknown) | Preview disabled for the job, logged once; generation unaffected; UI shows counter + "step preview unavailable" copy |
| Decode raises mid-run | Same as above, from that step onward |
| Hosted-routed job (openrouter-/huggingface- job ids) | Backend WS never sees the job -> no step images; counter driven by poll progress |
| ComfyUI-routed job | Same degrade (no latents callback) |
| Empty prompt / backend down | `previewError` strip, nothing submitted |
| Submit rejected (fit refusal 422, model error) | `previewError` strip with the backend's user-facing message |
| Job failed mid-run | Preview cleared, `previewError` strip, OS notification |
| Cancel | Backend cancel + preview cleared silently |
| Poll errors (5 consecutive) | Treated as run failure ("Lost connection..." message), preview cleared |
| User starts run, closes Studio panel | Subscription unmounts; job continues; jobs panel still tracks it |
| WS reconnect mid-run | `sent_revisions` is per-connection; the fresh connection re-sends the latest revision - at most one duplicate frame, idempotent in the Map |

Honesty rails: the preview never fabricates frames (no client-side
interpolation); the counter reflects backend progress only; decoder-less runs
say so explicitly; error messages carry no filesystem paths.

---

## Testing

**Backend (stub tier - runs on torch-less CI):**
- `test_preview_decoders.py`: family map completeness; `resolve_decoders_dir`
  precedence (env var > frozen > source-relative > None) with tmp dirs +
  monkeypatched `sys.frozen`/`sys.executable`; unsupported family raises
  `PreviewDecoderUnavailable`.
- `test_step_preview_service.py`: first-submit always decodes; 0.5 s throttle
  (monotonic clock monkeypatched); revision increments; decode exception
  disables the job's previews without raising; `latest`/`discard`; `None`
  latents ignored; fake decoder seam (no torch).
- `test_direct_generator_step_preview.py`: `progress_callback_fn` submits to a
  monkeypatched `step_preview_service` with correct
  job_id/step/total/family/dims (extends the `_FakeTorch` +
  `fake _generate_sync` pattern from `test_direct_generator_progress.py`).
- `test_ws_step_images.py`: `send_job_updates`-level test with a fake
  websocket + seeded service: sends one `step_image` per new revision, none
  when the revision is unchanged; message schema matches the contract;
  `process_image_generation` discards on completion and on failure.
- FLUX unpack math: shape-only test guarded by
  `pytest.importorskip("torch")` (runs locally, skips on stub CI).

**Backend (local real tier - this machine):**
- `test_step_preview_smoke_local.py` (skipif decoders or sd-1-5 weights
  missing): real SD1.5 run at 256x256 / 4 steps through
  `DirectGenerator.generate_image`; asserts >= 1 decoded frame captured with a
  valid JPEG data URI and non-degenerate pixel variance. This is the #33
  acceptance evidence.

**Electron (vitest):** `backendWsRouting.test.ts` - `job_update` routes to
`generation:progress`, `step_image` to `generation:step-image`, malformed JSON
and unknown types are dropped.

**Renderer (vitest):**
- Slice: `beginPreview` / `setPreviewStep` monotonicity / `previewError`
  survives `clearPreview` / `previewJobId` reset.
- `runStudioGeneration.test.ts` (mock electron, real store, workflow-test
  pattern): validation failures; submit + `beginPreview`; poll -> completed ->
  asset handoff (`setCurrentImage` before `clearPreview`); failed -> error
  strip state; cancelled -> silent clear; stale-run guard; error-budget
  exhaustion.
- `useStepImageSubscription`: matching job updates the map; mismatched job_id
  ignored; unsubscribe on unmount.
- Components: CompositionPreview Generate calls the feature function; error
  strip renders/dismisses; ProgressivePreview cancel calls
  `generation.cancel(previewJobId)`; degrade copy at `currentStep > 0` with
  empty map.

**Scripts:** run `fetch-preview-decoders.cjs` for real (dev machine), verify
idempotence on re-run; `assert-native-backend.cjs` throws when a decoder dir
is removed, passes when restored.

Gates: `npm run typecheck`, `npm test`, backend
`venv/Scripts/python.exe -m pytest`, `npm run build` all green before the PR.
