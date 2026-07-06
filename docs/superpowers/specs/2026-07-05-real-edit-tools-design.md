# Real Edit Tools — Design (#34 second half)

**Date:** 2026-07-05
**Issue:** #34 (edit_service half — the ControlNet half shipped as PRs 1-4 of the guided-passes cycle)
**Status:** Approved (design presented and approved in-session; scope decisions made by Rocky:
"Wire all 7 in this cycle" + weights via "Foundry records")

## 1. Problem

The Edit page advertises seven AI tools; none of them work, and the app pretends they do:

| Surface | Lie |
| --- | --- |
| `AIToolsPanel.handleApply` (`src/components/edit/AIToolsPanel.tsx:70`) | `setTimeout(2000)` spinner theater for all 7 tools; nothing is processed |
| `EditService.remove_background` (`backend/services/edit_service.py`) | Returns the input converted to RGBA — background fully intact |
| `EditService.upscale` | Plain PIL LANCZOS resize labeled "Real-ESRGAN" |
| `EditService.restore_faces` | Returns the input unchanged with `faces_detected: 0` |
| `/api/v1/edit/*` router (`backend/api/edit.py`) | Fully mounted, rate-limited, documented — zero renderer consumers, backed by the stubs above |
| `ImagePreviewModal` "Upscale" (`/api/images/upscale` → `utils/image_ops.upscale_image_file`) | LANCZOS resize presented as AI upscale |
| Image model picker (`selectModelsByCapability`, `src/store/slices/modelsSlice.ts:217`) | Pre-existing leak found during this design: the picker filters by `capability` only, so installed ControlNet / annotator / LoRA / IP-Adapter records (all `capability: "image"`) appear as selectable generation checkpoints |

Honesty rails require every one of these to become real or refuse loudly.

## 2. Scope

All seven tools become real in this cycle, split across two staged PRs:

- **PR1 — model-backed tools (this spec's full detail):** Background Removal (U²-Net),
  AI Upscale (Real-ESRGAN), Face Enhancement (GFPGAN) — real backend implementations,
  six Foundry weight records, job-based execution, panel wiring, ImagePreviewModal reroute,
  model-picker fix, catalog hygiene.
- **PR2 — guided-pass tools (architecture pinned here, plan written after PR1 merges):**
  Style Transfer (img2img), Generative Fill + Object Removal (inpaint with Edit-page masks),
  AI Expand (backend outpaint pre-step + inpaint) — thin frontends over the shipped guided-pass
  machinery.

Out of scope: video sources (tools disable on video, same `isLikelyVideoPath` guard the crop
tab uses), background *replacement* prompt in PR1 (returns in PR2 as inpaint), alpha matting
(YAGNI — edge refinement is a real feather/blur pass on the alpha mask instead).

## 3. Approach decisions (with alternatives considered)

1. **U²-Net directly on onnxruntime, not via the `rembg` wrapper.** rembg's session layer
   auto-downloads weights via pooch to `~/.u2net` — a hidden network path that violates the
   consent-gated Foundry contract. The u2net pre/post-processing is ~60 lines of standard,
   well-documented code (resize 320×320, per-channel normalize, sigmoid map, resize back,
   apply as alpha). Direct onnxruntime keeps one dependency instead of rembg's tree and
   guarantees zero silent downloads. Same model, same output quality.
2. **spandrel (MIT, ComfyUI's loader) for Real-ESRGAN and GFPGAN, not `realesrgan`/`gfpgan`/
   `basicsr` packages.** basicsr is unmaintained and breaks against modern torch (the
   `torchvision.transforms.functional_tensor` import rot); spandrel loads the same `.pth`
   checkpoints into clean reimplementations, supports both RealESRGAN arches and GFPGAN 1.4's
   clean arch, and runs CPU or CUDA.
3. **facexlib for face detect/align/paste-back** (RetinaFace ResNet50 + ParseNet), pointed at
   Foundry-installed weights — never its own downloader. It is the canonical helper stack from
   the GFPGAN author; only its detection/parsing modules are imported.
4. **Job-based execution, not the current sync HTTP.** Tiled Real-ESRGAN on CPU takes minutes;
   a synchronous endpoint gives timeouts with no progress or cancel. Edit ops become
   `GenerationJob`s (new `type: "edit"`) in the existing `job_manager`, polled through
   `GET /api/jobs/{job_id}`, cancellable between tiles/faces through the existing cancel
   endpoint. The unconsumed sync response schemas are replaced (zero consumers = free).
5. **Weights as Foundry records with direct GitHub-release URLs** (the authors' canonical
   distribution points), acquired through the download manager's existing direct-URL branch,
   generalized from `source == "civitai"` to any record carrying `download_url` + `sha256`.
   Alternatives rejected: HF mirrors (unofficial, unpinnable provenance), installer bundling
   (~800 MB of weights the user may never use; support decoders like taesd ship in-installer,
   user-facing model weights stay consent-gated per the established split).

## 4. PR1 — Part A architecture

### 4.1 Dependencies

Runtime (declared in the commented AI/ML block of `backend/requirements.txt` per the
torch-family convention, installed into `backend/venv`, asserted by
`scripts/assert-native-backend.cjs` so the packaged app always ships them — heavy-by-design):

- `onnxruntime>=1.17` — u2net inference (CPU EP; CUDA EP optional, not required)
- `spandrel>=0.4.0` — Real-ESRGAN + GFPGAN checkpoint loading (torch-based, MIT)
- `facexlib>=0.3.0` — RetinaFace detection + ParseNet parsing for GFPGAN paste-back

All three are import-guarded in `backend/edit_tools/` modules exactly like
`guided/preprocessors.py` guards `controlnet_aux`: stub CI (no torch) imports the modules
fine; invoking an operation without the dependency raises the loud
`EditModelUnavailable` error.

### 4.2 Foundry records (six, `capability: "edit"`, new `artifact_type: "edit-model"`)

| id | file | source URL (release asset) | size | license | format |
| --- | --- | --- | --- | --- | --- |
| `edit-u2net` | `u2net.onnx` | `github.com/danielgatis/rembg/releases/download/v0.0.0/u2net.onnx` | ~176 MB | Apache-2.0 | `onnx` |
| `edit-realesrgan-x4plus` | `RealESRGAN_x4plus.pth` | `github.com/xinntao/Real-ESRGAN/releases/download/v0.1.0/RealESRGAN_x4plus.pth` | ~64 MB | BSD-3 | `pickle` |
| `edit-realesrgan-x4plus-anime` | `RealESRGAN_x4plus_anime_6B.pth` | `github.com/xinntao/Real-ESRGAN/releases/download/v0.2.2.4/RealESRGAN_x4plus_anime_6B.pth` | ~18 MB | BSD-3 | `pickle` |
| `edit-gfpgan-v14` | `GFPGANv1.4.pth` | `github.com/TencentARC/GFPGAN/releases/download/v1.3.0/GFPGANv1.4.pth` | ~333 MB | Apache-2.0 | `pickle` |
| `edit-face-detection` | `detection_Resnet50_Final.pth` | `github.com/xinntao/facexlib/releases/download/v0.1.0/detection_Resnet50_Final.pth` | ~104 MB | facexlib (MIT repo) | `pickle` |
| `edit-face-parsing` | `parsing_parsenet.pth` | `github.com/xinntao/facexlib/releases/download/v0.2.2/parsing_parsenet.pth` | ~81 MB | facexlib (MIT repo) | `pickle` |

- `edit-gfpgan-v14.companions = ["edit-face-detection", "edit-face-parsing"]` — the #49
  companion closure installs and consent-checks them together (`_raise_unless_consented`
  already covers companions, `main.py:2014`).
- `source: "github"`; every record carries `download_url` + `sha256` pinned at implementation
  time by downloading each asset once and hashing it (fail-closed: the direct-URL path refuses
  records without sha256, unchanged).
- Every `.pth` record is `format: "pickle"` → the existing install-time pickle-consent gate
  (`pickle-consent-required`) applies verbatim. `u2net.onnx` is `format: "onnx"` (protobuf,
  no code execution — no consent required, mirroring safetensors).
- New enum values ripple: `artifact_type` comment enum in `foundry/model_record.py` gains
  `edit-model`; `format` comment gains `onnx`; TS `ModelRecord['source']` union
  (`src/types/model.ts:38`) gains `'github'`.
- Loading is torch `weights_only`-safe in practice (all five .pth files are plain tensor
  state dicts; spandrel and our facexlib wiring load them without executing pickled code),
  but the records stay honestly labeled `pickle` and consent-gated — the gate keys off the
  container format, not our loader's discipline.

### 4.3 Download manager generalization

`foundry/download_manager.py` routes direct downloads on `record.get("source") == "civitai"`.
That branch becomes: any record with a `download_url` takes the direct-URL path (stream →
sha256 verify → atomic move). CivitAI token injection stays conditional on
`source == "civitai"`. HF-repo records (no `download_url`) are unaffected.

### 4.4 Backend package `backend/edit_tools/`

New package mirroring `backend/preview/` and `backend/guided/`:

- **`weights.py`** — `EditModelUnavailable(RuntimeError)` (user-facing message, never a
  filesystem path) and `require_edit_weights(record_id, resolve_record, label) -> str`:
  record must exist, `status == "ready"`, and have an on-disk location with the expected
  extension; otherwise raise `"The <label> weights are not installed - install
  '<record_id>' from the Foundry first."` Mirrors `guided/controlnet_registry._require_installed`.
- **`background.py`** — cached onnxruntime session per model path (CPU EP). `remove_background
  (image, edge_refinement) -> Image` : u2net preprocess (320×320, normalize), run, sigmoid
  saliency map, bilinear resize to source, optional Gaussian feather driven by the
  edge-refinement value (0-100 → 0-8 px radius — real mask post-processing, not a fake knob),
  compose RGBA.
- **`upscale.py`** — spandrel `ModelLoader` cached per path. `upscale(image, scale, model_path,
  progress_cb, cancel_check) -> Image`: tiled inference (tile 256, overlap 16, reflect-padded
  edges), `cancel_check()` between tiles raises `EditCancelled`, `progress_cb(done, total)`
  per tile; scale 2 runs the 4× model then LANCZOS-downsamples to exactly 2× (reported
  honestly in the result metadata as `model_scale: 4, output_scale: 2`).
- **`faces.py`** — facexlib `FaceRestoreHelper` constructed against the Foundry-installed
  detection/parsing weight paths (no facexlib downloader), spandrel-loaded GFPGAN for the
  aligned 512×512 crops. `restore_faces(image, strength, progress_cb, cancel_check) ->
  (Image, faces_detected)`: detect → align → restore each face (cancel check between faces)
  → paste back; `strength` (0-100 → 0.0-1.0) alpha-blends restored pixels over the original
  inside the face regions. `faces_detected` is the honest RetinaFace count — zero faces
  returns the input unchanged with `faces_detected: 0` and no error.
- **`service.py`** — `run_edit_operation(operation, params, progress_cb, cancel_check) ->
  Dict`: decodes the validated source file, dispatches to the three modules, writes the
  result PNG to `outputs/<job_id>/`, returns `{"images": ["/outputs/<job_id>/<name>.png"],
  ...metadata}` (`faces_detected`, `model_used`, `original_size`, `new_size` as applicable) —
  the same result shape image jobs use, so job polling, WS updates, and orphan cleanup work
  untouched. Device selection follows `torch.cuda.is_available()` for the torch-backed ops.

`services/edit_service.py` (the stub) is deleted; `backend/tests` for it are replaced.

### 4.5 API — `/api/v1/edit/*` becomes job submitters

`backend/api/edit.py` + `backend/schemas/edit.py` rewritten:

- `POST /api/v1/edit/remove-background` `{source_path, edge_refinement: int 0-100 = 50}`
- `POST /api/v1/edit/upscale` `{source_path, scale: 2|4 = 2, model: "general"|"anime" =
  "general", face_enhance: bool = false}`
- `POST /api/v1/edit/restore-faces` `{source_path, strength: int 0-100 = 50}`
- All three: validate `source_path` with the same path validation `/api/images/crop` uses,
  fail 422 on bad params / 400 on bad paths, then create a `GenerationJob(type="edit")` and
  schedule `process_edit_job` — respond `202 {"job_id": ...}`. Rate limit `LIMITS["edit"]`
  unchanged. Missing weights surface as a FAILED job whose error is the
  `EditModelUnavailable` Foundry message (the job must exist first so the panel has one
  consistent error path).
- `GET /api/v1/edit/models` reports per-tool readiness from the registry (record installed →
  `ready: true`), replacing the fake `loaded` flags.
- `process_edit_job(job_id, operation, params)` lives in `main.py` beside
  `process_image_generation`: PROCESSING → run `run_edit_operation` in a worker thread
  (`asyncio.to_thread`) with `progress_cb` → `job_manager.update_job(progress=...)` and
  `cancel_check` reading the job's cancelled status → COMPLETED with the result dict /
  FAILED with the honest error. Cancellation between tiles/faces marks the job CANCELLED.

`/api/images/upscale`, `utils/image_ops.upscale_image_file`, and the
`generation:upscale-image` IPC are retired (orphaned by the reroute below — same treatment
as the `/api/v1/lora` stub in ccbddbaf).

### 4.6 Electron + renderer

- `electron/ipc-handlers/generation.ts`: `generation:edit-image` → POST
  `/api/v1/edit/{operation}` → `{job_id}` (the `toSafeRendererError` pattern). Polling and
  cancel reuse `generation:get-status` / `generation:cancel` untouched.
- `electron/preload.ts`: `editImage(params)` added to the api object AND the file's inline
  `ElectronAPI` interface (both places — the #33 lesson). `src/types/electron.d.ts` gains the
  typed signature.
- **`src/features/edit/useEditTool.ts`** — hook owning the submit → poll → complete lifecycle
  (poll cadence and error budget mirroring `runStudioGeneration`): returns
  `{run(operation, params), isRunning, progress, error, clearError}`. On completion the
  handoff mirrors the Studio job flow exactly: `syncAssetsFromJobStatus(status)` then
  `setCurrentImage(toPreviewUrl(images[0]), resolveStoredAssetPath(images[0], ...))` — edit
  jobs are ordinary jobs with `result.images`, so the renderer `GenerationJob.type` and
  `AssetJobStatus.type` unions widen to include `'edit'`. On failure: honest error message
  (Foundry pointer preserved verbatim from the backend).
- **`AIToolsPanel.tsx`** — the `setTimeout` theater is deleted.
  - Real in PR1: `bg-removal` (Edge Refinement slider → `edge_refinement`), `upscale`
    (2×/4× + model select where `general`/`anime` map to the two records and `face` maps to
    `general + face_enhance: true`), `face-enhance` (Enhancement slider → `strength`).
  - Removed fake knobs: `bg-removal`'s "Replace Background" prompt input (returns in PR2 as
    inpaint), `face-enhance`'s Eye Enhancement toggle and Skin Smoothing slider (GFPGAN
    exposes no such controls — fake precision is dishonest).
  - The four guided tools keep their configuration UI but their Apply buttons are disabled
    with the caption "Ships with the guided-pass update." until PR2 — honest, and gone within
    the same cycle.
  - Disabled states: no `currentImageAssetPath`, video source, or a tool already running.
    Error strip per tool (status-error tokens, dismissible) with an "Open Foundry" action
    (`setActiveTab('foundry')`) when the error is a missing-weights refusal.
- **`ImagePreviewModal.tsx`** — the LANCZOS "Upscale" reroutes to the real
  `edit/upscale` job (2×, general); button shows job progress and surfaces the Foundry
  refusal when weights are missing.

### 4.7 Model picker fix (pre-existing leak)

`selectModelsByCapability` gains an artifact-type allowlist — only `checkpoint` and
`diffusers-pipeline` records are selectable generation models. This fixes today's leak
(annotators/ControlNets/LoRAs/IP-Adapters appearing in the picker on machines that installed
them) and automatically keeps all six `edit-model` records out.

### 4.8 Catalog hygiene

`foundry/verified-catalog.json` records `controlnet-depth-sdxl` and `controlnet-openpose-sdxl`
each carry a duplicate `"companions"` key (leftover from the `files` addition). Deduplicated;
a regression test asserts no duplicate keys anywhere in the catalog (`json.loads` with a
duplicate-key-rejecting `object_pairs_hook`).

## 5. PR2 — Part B architecture (contract level)

All four tools submit through the existing `/api/generate/image` guided-pass contract with the
user's selected checkpoint (`selectedImageModelId`); no new model code. Each refuses honestly
when no image checkpoint is installed.

- **Style Transfer → img2img:** current edit image as the init image, preset modifier +
  optional user text as the prompt, `styleStrength` (0-100) mapped onto `denoising_strength`
  (0.30-0.90). Uses the shipped img2img pass.
- **Generative Fill → inpaint:** PR2 adds an inpaint-mask drawing mode to the Edit canvas
  reusing the `RegionMaskDrawer` infrastructure; `RegionMask {type, points, bounds, brushSize}`
  converts 1:1 to `GenerationMaskPayload {type, points, bounds, brush_size}` (the Canvas
  control-layer conversion). Prompt = `genFillPrompt`. Empty mask refuses via the existing
  `mask_coverage` honesty check.
- **Object Removal → inpaint:** same mask flow, removal-tuned prompt/negative handling; the
  UI copy is honest that removal is AI inpainting.
- **AI Expand → outpaint pre-step:** `ImageGenerationRequest` gains
  `outpaint: {directions: subset of up/down/left/right, pixels: 64-512}`. The backend expands
  the canvas (edge-reflect prefill), builds the border mask itself, and runs the existing
  inpaint machinery. Prompt = `expandPrompt`.
- Results land through the same `useEditTool`-style poll → `upsertDerivedAsset` →
  `setCurrentImage` handoff; step preview (#33) works for these since they are ordinary
  generation jobs. Background *replacement* returns as: u2net subject mask (from the PR1
  tool), inverted, fed to inpaint with `bgReplacePrompt`.

PR2's full task plan is written after PR1 merges.

## 6. Error handling

- Every user-facing error message is path-free (`GuidedValidationError` discipline).
- Missing dependency (stub install): `EditModelUnavailable` with "this build is missing the
  <dep> runtime - reinstall Vision Studio."
- Missing weights: the Foundry-pointer copy from `weights.py`, surfaced as a failed job.
- Corrupt/unreadable source image: failed job with "The source image could not be read -
  re-export the frame and try again."
- Cancellation: job CANCELLED, no error strip (silent, matching Studio preview behavior).
- Zero faces on restore: success with `faces_detected: 0`; the panel reports "No faces
  detected - the image is unchanged." (success-with-notice, not an error).

## 7. Testing

**Stub-CI-safe (no torch/onnxruntime/spandrel/facexlib on CI):**
- `weights.py` refusal matrix (missing record / not ready / no on-disk file / wrong extension).
- `background.py` pre/post math against an injected fake session (deterministic saliency map →
  expected alpha, feather radius mapping, RGBA composition).
- `upscale.py` tiling: tile/overlap arithmetic, seam-free reassembly with a fake ×4 model
  (nearest-upscale lambda), cancellation between tiles, progress monotonicity, 2× downsample.
- `faces.py` orchestration with fake helper/restorer seams: detect→restore→paste flow,
  strength blend math, honest zero-face path, cancellation between faces.
- API: 202 submission shape, param validation (scale ∉ {2,4} → 422), bad path → 400,
  missing weights → FAILED job with Foundry copy, cancel → CANCELLED, `/models` readiness.
- Catalog: six records complete (sha256 non-empty, https URLs, companions closure resolves,
  pickle/onnx formats correct), duplicate-key regression across the whole catalog.
- Download manager: `download_url` records route through the direct branch regardless of
  source; sha256 stays mandatory; HF-repo records unaffected.
- Frontend (Vitest): `selectModelsByCapability` artifact-type allowlist;
  `useEditTool` lifecycle (jsdom `.test.tsx`, fake timers: submit → poll → derived-asset
  handoff, failure path, re-entrancy no-op); `AIToolsPanel` (three tools dispatch real
  operations with mapped params, disabled matrix, error strip + Foundry action, no
  `setTimeout` theater anywhere, guided tools' Apply disabled with the PR2 caption);
  `ImagePreviewModal` reroute.

**Real-weight local smokes (`VS_REAL_SMOKE=1`, skipif weights/deps missing):**
- Background removal on a generated SD1.5 subject image: output has genuine alpha variance
  (foreground α≈255 region AND background α≈0 region), subject pixels preserved.
- Upscale: 4× output dimensions exact; Laplacian variance (sharpness) strictly greater than
  the LANCZOS-resize baseline of the same input.
- Face restore: SD1.5-generated portrait → `faces_detected >= 1` and face-region pixels
  measurably changed; non-face landscape → `faces_detected == 0`, image unchanged.

**Gates:** backend pytest (venv python), `npm run typecheck`, `npm test`, `npm run build`,
real-weight smokes, plus a live Foundry install of all six records through the real
consent flow before the acceptance smokes.

## 8. Packaging

- The three new Python deps ride the PyInstaller bundle: `backend/main.spec` declares
  `onnxruntime`, `spandrel`, and `facexlib` as hidden imports, and the backend build script
  (`build-backend.cjs`) gains an import preflight that refuses to bundle a venv missing any
  of them (heavy-by-design directive). All heavy imports in `backend/edit_tools/` are
  module-level and guarded so PyInstaller's static analysis sees them.
- No weights ship in the installer; all six records arrive per-user through the Foundry with
  the pickle-consent gate. Installer size is unchanged.
