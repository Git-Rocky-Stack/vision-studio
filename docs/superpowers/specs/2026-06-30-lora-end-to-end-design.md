# LoRA End-to-End - Design Spec

**Date:** 2026-06-30
**Task:** #136 (Phase 1 / P1, launch-readiness plan)
**Status:** Approved (design)

## Goal

Make the existing multi-LoRA mixer a **real** feature for both image and video
generation. Today LoRA is a "Potemkin" surface: a polished mixer UI exists, but
its library is hardcoded fake data, its selections die in throwaway local state,
the generation request has no LoRA field, and the only real diffusers loader is
an orphaned SD1.5 stub the app never calls. This task closes the three broken
seams end-to-end - **real library, real request contract, real backend load** -
across every generation path that can accept a LoRA.

## Context (what already exists)

- **UI (built, disconnected):** `src/components/generate/LoRAMixer.tsx` - a
  complete mixer (add / remove, drag-reorder via dnd-kit, per-LoRA weight slider
  0-2 at `LoRAMixer.tsx:127-134`). Its library is a hardcoded placeholder
  (`LoRAMixer.tsx:43-53`, comment "backend API not built yet"). Mounted in the
  Generate "Control Layers" card (`GeneratePanel.tsx:1542`) into throwaway local
  state `refConfig.loraConfigs` (`GeneratePanel.tsx:372`).
- **Type (UI-only):** `LoRAConfig` (`src/types/generation.ts:57-63`:
  `id / name / triggerWord / weight / color`). Not referenced by any request
  payload.
- **Request contracts (no LoRA field):** `ImageGenerationRequestPayload`
  (`src/types/generation.ts:132-151`) and the video payload; backend
  `ImageGenerationRequest` (`backend/main.py:431-442`) and
  `VideoGenerationRequest` (`backend/main.py:445-455`).
- **Real generation path:** `POST /api/generate/image` (`main.py:1104`) ->
  `process_image_generation` (`main.py:1184`) -> `generate_direct`
  (`main.py:1325`) -> `DirectGenerator.generate_image`. Video mirror:
  `POST /api/generate/video` (`main.py:1355`) -> `direct_video_generator`.
  IPC pass-through in `electron/ipc-handlers/generation.ts`
  (image POST `:306`, video POST `:366`).
- **Pipeline construction (the LoRA hook site):**
  `DirectGenerator._load_from_plan` (`direct_generator.py:225`;
  `from_single_file` `:238`, `from_pretrained` `:251`), cached at
  `self.pipelines[model_name]` (`:221`), accel applied after (`:216`). Video:
  `DirectVideoGenerator._load_from_plan` (`direct_video_generator.py:187`;
  `MotionAdapter` for AnimateDiff `:225-226`; runtime flags `:250`).
- **Model resolution (M5/M6):** id -> `model_registry.get_record`
  (`backend/foundry/registry.py:53`) -> `resolve_model_runtime`
  (`backend/foundry/runtime_resolver.py:197`) -> `RuntimePlan`
  (`runtime_resolver.py:82-96`, carries pipeline class + base-architecture
  family). `resolve_plan` attaches loader paths (`direct_generator.py:47-94`).
- **LoRA already recognized by the indexer:** `backend/foundry/classifier.py`
  detects LoRA safetensors (`file_is_lora:98`, `lora_family_from_keys:110`,
  `lora_base_family:128`) and tiers them by base family
  (`post_index_tier:151-154, 273-316`). `backend/utils/model_manager.py` includes
  `'lora'` in `ModelInfo.type` and creates a `loras/` dir (`:116`).
- **Acquisition is artifact-type-agnostic:** `src/store/slices/modelsSlice.ts`
  (search / `enqueueDownload` / download lifecycle / library-root scan) never
  inspects `artifact_type`, so a LoRA already downloads and library-scans onto
  disk exactly like a checkpoint. `selectModelsByCapability`
  (`modelsSlice.ts:212-219`) filters by capability only.
- **Orphaned stub (to be retired):** `backend/services/lora_service.py`
  (real `load_lora_weights` at `:177` but hardcoded to SD1.5, ignores the M5
  resolver, never applies scale), `backend/api/lora.py` (isolated
  `/api/v1/lora` demo route), `backend/schemas/lora.py`, and their tests.
- **Stack:** diffusers 0.37.1, torch 2.5.1+cu121, transformers, accelerate
  installed (`load_lora_weights` / `set_adapters` / `fuse_lora` all present).
  **`peft` is NOT installed** - required for multi-adapter stacking.

## Scope (all in - nothing deferred)

1. **Real library:** LoRAMixer sources installed LoRAs from the store
   (`ModelRecord`s with `artifact_type === 'lora'`); the hardcoded
   `AVAILABLE_LORAS` mock is removed.
2. **Real request contract:** a `loras: { id, weight }[]` field flows from the
   mixer through the generation config, both request payloads, the IPC surface,
   and both backend request schemas.
3. **Real backend load:** LoRAs are loaded and stacked onto the actual
   generation pipeline at their set weights, using **runtime named adapters**
   (approach A below), for image **and** LoRA-capable video architectures.
4. **Compatibility safety:** the mixer shows only base-compatible LoRAs by
   default; the backend hard-checks compatibility and is fail-soft.
5. **Trigger words:** each selected LoRA offers a one-click "insert into prompt"
   chip (display + explicit insert, never silent auto-inject).
6. **Local-only routing:** LoRA-bearing jobs route Local only; the M6 router
   declines hosted providers with a clear message.
7. **Retire the orphaned LoRA stub** in favor of the real applier integrated
   into the main generation path.

## Backend load strategy (approach A - approved)

Pipelines are cached and reused across jobs (`self.pipelines[model_name]`), so
LoRA application must not mutate the cached base pipeline. Approach A:

- Immediately after pipeline construction and before device placement / accel
  (`direct_generator.py:~255`; video `direct_video_generator.py:~250`):
  for each requested LoRA, resolve `id -> model_registry.get_record -> local
  path`, then `pipe.load_lora_weights(path, adapter_name=<id>)`.
- `pipe.set_adapters([id...], [weight...])` applies the stack at the requested
  weights for the job.
- After the job's `_generate_sync` completes, `pipe.unload_lora_weights()`
  restores the cached pipeline to a clean base state.
- Requires `peft` for named multi-adapter management.

Rejected alternatives: **B (fuse/unfuse)** - faster inference but mutates the
shared cached pipeline, with state-leak risk if unfuse is missed; **C
(per-(model, LoRA-set) fused pipeline cache)** - fastest for repeated identical
stacks but heavy on VRAM/RAM with complex eviction.

## Request contract

Add `loras?: Array<{ id: string; weight: number }>` to:

- `ImageGenerationRequestPayload` and the video payload
  (`src/types/generation.ts`) - and populate it in the `GeneratePanel`
  request builders (image `:802-829`, video `:856`) from the mixer's selections.
- The IPC surface `src/types/electron.d.ts` (`generation.generateImage` /
  `generateVideo` params) - pass-through in
  `electron/ipc-handlers/generation.ts`.
- Backend `ImageGenerationRequest` / `VideoGenerationRequest`
  (`backend/main.py:431-455`) as `loras: list[LoraSelection] = []` where
  `LoraSelection` is `{ id: str; weight: float }` (a small Pydantic model,
  weight clamped to 0-2).

Trigger words stay **out** of the payload - they are a prompt concern resolved
in the UI (below). The payload carries only what the backend needs to load and
scale each adapter.

## Data model

Extend `ModelRecord` / `SearchResult` (`src/types/model.ts`) with optional LoRA
metadata the classifier already computes:

- `lora_base_architecture?: string` - the family a LoRA is compatible with
  (from `classifier.lora_base_family`).
- `trigger_words?: string[]` - best-effort (hub metadata when present).
- `default_weight?: number` - best-effort; UI falls back to `1.0`.

Add a `selectInstalledLoras(baseArchitecture?)` selector to `modelsSlice`
filtering `artifact_type === 'lora'`, optionally narrowed to the selected
checkpoint's family. The backend registry/classifier populate these fields on
LoRA records; library-scanned LoRAs without hub metadata surface with only the
detected base family.

## Frontend UX

- **Real library:** `LoRAMixer` reads from `selectInstalledLoras(...)` instead of
  `AVAILABLE_LORAS`. Selections move out of throwaway local state into the
  generation config that feeds the request builder, so they persist with the
  scene like other generation params (`GenerationConfig.lora` already exists at
  `src/types/project.ts:22`).
- **Compatibility:** LoRAs whose `lora_base_architecture` matches the selected
  base model are shown by default; incompatible ones are behind a **"show
  incompatible (may fail)"** toggle and clearly marked. (A cross-family LoRA -
  e.g. SDXL on FLUX - hard-errors in diffusers; the default view prevents it.)
- **Trigger words:** each selected LoRA with `trigger_words` renders a one-click
  **"insert into prompt"** chip; clicking appends the trigger to the prompt.
  No silent auto-inject (avoids surprise and double-insertion on re-generate).
- **Weights:** the existing per-LoRA 0-2 slider is retained; default `1.0`
  (or `default_weight`).
- **Empty state:** "No LoRAs installed - find some in the Foundry," linking to
  the `foundry` tab (mirrors the `ModelSelector` empty-state shipped in #135).
- **Video:** the mixer is enabled for LoRA-capable architectures
  (**AnimateDiff, LTX**) and **disabled with a one-line reason for SVD**
  (image-to-video, no LoRA conditioning). "Image + video" honestly means every
  path that can accept a LoRA.

## Routing & error handling

- **Local-only:** a job with a non-empty `loras` array routes Local; the M6
  router (`src/features/accounts/providerRouting.ts`) declines OpenRouter / HF
  Inference for LoRA-bearing jobs with a clear, surfaced message (hosted
  providers cannot accept a user LoRA).
- **Fail-soft backend:** an incompatible, missing, or corrupt LoRA is **skipped**
  (not applied), generation continues, and the job result reports which LoRAs
  were skipped and why. LoRA problems never crash a generation.
- **Compatibility check (backend):** each LoRA's base family is validated against
  the resolved plan's base architecture before `load_lora_weights`; mismatches
  are skipped and reported.

## Backend changes

- New reusable applier (a small module / `DirectGenerator` method) implementing
  approach A: resolve -> compatibility-check -> `load_lora_weights(adapter_name)`
  -> `set_adapters(weights)` -> (post-generate) `unload_lora_weights`. Consumed
  by both `DirectGenerator` and `DirectVideoGenerator` at their hook sites.
- `loras` plumbed from the request through `process_image_generation` /
  `process_video_generation` into the generator calls.
- **Retire the stub:** remove `backend/services/lora_service.py`,
  `backend/api/lora.py` (the `/api/v1/lora` route, unmounted from `main.py`),
  `backend/schemas/lora.py`, and their tests - replaced by the real applier.
  Any genuinely reusable logic (the diffusers availability guard) is folded into
  the applier. This prevents a misleading second, fake LoRA endpoint alongside
  the real path (aligns with the dead-code standard).
- **Dependency:** add `peft` to `backend/requirements.txt` (required for
  multi-adapter stacking), flagged for the **#149 repackage** so the bundled
  Python env includes it.

## Testing (TDD)

**Backend (`pytest`; diffusers-dependent paths guarded by `HAS_DEPS`):**
- Applier: given a mock pipeline and two LoRA selections, asserts
  `load_lora_weights` is called per adapter and `set_adapters` with the right
  names + weights; `unload_lora_weights` after generation.
- Compatibility: an incompatible LoRA is skipped and reported, not applied.
- Fail-soft: a missing/corrupt LoRA path is skipped and reported; generation
  still runs.
- Schema: `ImageGenerationRequest` / `VideoGenerationRequest` accept and clamp
  `loras`.

**Frontend (Vitest, mocking `window.electron` + store):**
- `LoRAMixer` renders installed LoRAs from the store (not the mock).
- The image request payload carries `loras: [{ id, weight }]`; video too.
- Compatibility filter: incompatible LoRAs hidden until the override toggle.
- Trigger-word chip inserts into the prompt.
- Empty state links to the `foundry` tab.
- SVD disables the mixer with a reason.
- M6 router declines hosted for LoRA-bearing jobs.

**Gates:** `npm run typecheck`, `npm test`, `npm run build`, backend `pytest`.

Design-system + a11y compliant: `lucide-react` icons only, no emoji (ui-glyphs
guard), machined radii + Carbon tokens, keyboard-navigable mixer + sliders.

## Out of scope (explicit)

- Training / creating LoRAs.
- LoRA on hosted providers (declined by design).
- The separate ComfyUI-graph "LoRA Loader" node
  (`src/features/workflow/`, its own existing path).

## Acceptance criteria

- The mixer lists actually-installed LoRAs; the hardcoded mock is gone.
- Selecting LoRAs at set weights measurably affects an image generation (LoRAs
  are loaded/stacked/unloaded on the real pipeline), and affects a video
  generation for AnimateDiff / LTX; SVD shows the mixer disabled with a reason.
- Incompatible LoRAs are hidden by default and skipped-and-reported by the
  backend; a missing/corrupt LoRA never crashes a generation.
- A LoRA's trigger word can be inserted into the prompt in one click.
- A LoRA-bearing job routes Local only; hosted providers are declined with a
  clear message.
- The empty state links to the Foundry.
- The orphaned `/api/v1/lora` stub is removed; `peft` is added to backend
  requirements.
- `npm run typecheck`, `npm test`, `npm run build`, and backend `pytest` green.
