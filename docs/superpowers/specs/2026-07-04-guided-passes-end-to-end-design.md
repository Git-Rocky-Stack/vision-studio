# Guided Passes End-to-End - Design Spec

**Date:** 2026-07-04
**Task:** Issue #34, ControlNet/guided-passes half (Phase 2, post-3.1.0; the
edit-tools half gets its own cycle)
**Status:** Approved (design)

## Goal

Make every guided pass the app already advertises real: ControlNet layers,
reference images (img2img + IP-Adapter), and inpaint masks, threaded from the
canvas control-layer UI through the request contract into the real diffusers
pipelines on the local generator - for all four image families (SD1.5, SDXL,
FLUX, SD3.5). Retire the orphaned `/api/v1/controlnet` stub the same way #136
retired `/api/v1/lora`.

## Context (verified ground truth, 2026-07-04)

- `GeneratePanel` sends `controlnet`, `reference_images`, and `inpaint`
  (image + vector mask) in the image payload
  (`src/features/generation/resolveCanvasControlLayers.ts`); Electron forwards
  the params verbatim to `POST /api/generate/image`; the backend
  `ImageGenerationRequest` schema has none of those fields, so **pydantic
  silently drops every guided pass and a plain txt2img runs**.
- The M6 hosted routes correctly decline guided passes with "switch back to
  Local" - but Local silently ignores them too.
- `backend/api/controlnet.py` + `services/controlnet_service.py` are orphaned
  (zero frontend callers): SD1.5-only, hardcoded `runwayml/stable-diffusion-v1-5`
  base, runtime HF downloads that bypass Foundry consent, no preprocessing
  (expects a preprocessed control image), and the decoded `init_image` is
  discarded.
- GeneratePanel renders a second dead surface: the `referenceMode` selector,
  denoising-strength slider, and `ControlNetPanel` hold state that never
  reaches any payload. (The LoRA part of that state IS real since #136.)
- Foundry's record schema already supports `artifact_type: 'controlnet'`;
  `flux-fill` (FLUX inpaint model) is already in the documented model list.
- The canvas resolver requires a drawn mask on every layer and supports mask
  types `rectangle | polygon | brush | erase`; ControlNet layers carry
  `strength`, `start_step`/`end_step` (normalized 0-1), and per-layer
  `prompt`/`negative_prompt`.

## Decisions of record (from brainstorming, 2026-07-04)

1. **Decomposition:** ControlNet/guided passes first; aux-model edit tools
   (bg removal, real upscale, face restore) are a separate follow-up cycle.
2. **Pass scope:** ALL guided passes this cycle - ControlNet, img2img
   reference, inpaint, and IP-Adapter masked multi-reference.
3. **Families:** all four image families - SD1.5, SDXL, FLUX, SD3.5 -
   hardware-fit gated.
4. **Architecture:** extend `direct_generator` via a new `backend/guided/`
   package; retire the standalone service. Staged across **4 PRs**.

## 1. Request contract & pass semantics

`ImageGenerationRequest` (backend/main.py) gains:

- `controlnet: list[ControlNetLayer]` -
  `{layer_id, layer_name, source_path, preprocessor, strength, start_step,
  end_step, mask, prompt, negative_prompt}`.
  Mapping: control image preprocessed from `source_path`;
  `strength` -> per-layer `controlnet_conditioning_scale`;
  `start_step`/`end_step` -> `control_guidance_start`/`control_guidance_end`;
  vector `mask` rasterized and used to gate the control map (control signal
  zeroed outside the mask). Multiple layers -> MultiControlNet.
- `reference_images: list[ReferenceImageLayer]` - `{layer_id, layer_name,
  source_path, mask, strength}`. One reference = img2img init image; two or
  more = IP-Adapter multi-reference (PR4). Until PR4 lands, two or more
  references are declined with a 422 and a clear message - never partially
  applied. `strength` maps to IP-Adapter scale, default `1.0` (frontend
  threads it from `layer.weight`).
- `inpaint: InpaintPass | None` - `{layer_id, layer_name, image_path, mask,
  prompt, negative_prompt}`. Rasterized mask + per-pass prompt overrides.
  FLUX inpaint routes to the installed `flux-fill` record (decline with a
  Foundry link if absent); other families use their inpaint pipeline variant.
  The top-level `image_path`/`mask` duplicates the frontend also sends are
  accepted but `inpaint` is canonical.
- `denoising_strength: float = 0.75` - threaded from the existing GeneratePanel
  slider (currently dropped); img2img/inpaint strength.

Semantics:

- Pass composition: ControlNet composes with txt2img, img2img, and inpaint
  where diffusers ships the combined pipeline class for that family;
  unsupported combos are declined per-family with a reason - never silently
  reduced.
- Per-layer `prompt`/`negative_prompt` on **controlnet** layers are not
  consumable by diffusers (no per-layer prompting); the UI marks those fields
  inpaint-only. No pretending.
- Masks: all four vector types rasterized backend-side (`guided/masks.py`).
  `erase` subtracts from the accumulated mask.
- Video requests unchanged - canvas layers are image-only by design
  (`resolveCanvasControlLayers` gates on `generationType === 'image'`).

## 2. Backend architecture

New `backend/guided/` package (import-safe on stub CI, the `foundry/lora.py`
pattern), consumed by `utils/direct_generator.py`:

- `masks.py` - vector-mask -> PIL rasterizer. Sole owner of mask geometry.
- `preprocessors.py` - `canny`/`scribble` via the already-shipped OpenCV
  (zero downloads); `depth`/`normal`/`openpose`/`segmentation` via
  `controlnet_aux` with consent-gated annotator weights. Registry pattern.
- `controlnet_registry.py` - per-family preprocessor -> ControlNet preset map
  (SD1.5: lllyasviel control_v11 suite; SDXL: diffusers + xinsir union;
  FLUX: InstantX/Shakker union; SD3.5: Stability official), resolved through
  **installed Foundry records** like `lora.py`'s record resolver.
- `pipelines.py` - variant derivation from the **cached** base pipeline via
  diffusers `from_pipe()` (img2img / inpaint / ControlNet variants share the
  loaded weights - no second checkpoint copy), plus a `controlnets_attached()`
  context manager mirroring `loras_applied()`: attach, generate, always
  detach + `torch.cuda.empty_cache()`.
- `ip_adapter.py` (PR4) - per-family IP-Adapter load/scale/unload +
  `ip_adapter_masks` wiring where supported.

`direct_generator` gains a guided branch that composes with `loras_applied()`
and the M9 acceleration plan; job progress and WebSocket streaming unchanged.

**Retirement (PR2):** `backend/api/controlnet.py`,
`services/controlnet_service.py`, and their tests are deleted; router
unregistered from `main.py`. `/api/v1/edit` is untouched (next cycle).

## 3. Model acquisition, compatibility, hardware fit

- **ControlNet models are Foundry records** (`artifact_type: 'controlnet'`,
  `base_architecture` set), acquired through the M2 consent/download flow and
  visible in the Foundry Library. **No silent runtime `from_pretrained`
  downloads** - the stub's runtime-download behavior is deleted with it.
- **Preprocessor annotator weights** are consent-gated through the same
  download service; canny/scribble need zero downloads.
- **IP-Adapter weights** (PR4): per-family adapter + image-encoder records
  (h94/IP-Adapter for SD1.5/SDXL; XLabs/InstantX for FLUX; InstantX for
  SD3.5), consent-gated.
- **Compatibility** mirrors `isLoraCompatible`: a ControlNet/IP-Adapter
  record applies only when its `base_architecture` matches the active
  checkpoint's family.
- **Hardware fit:** M5 fit entries gain per-family guided-pass VRAM overhead;
  unfittable combinations refuse with the measured reason (honesty rail:
  measured never masquerades as estimated).

## 4. Frontend reconciliation

- **Canvas control layers are the single canonical guided-pass input.**
- Retire the dead GeneratePanel surface: `referenceMode` selector and
  `ControlNetPanel` (config never reaches a payload). The denoising-strength
  slider stays and is threaded. The LoRA mixer (#136) is untouched.
- **Layer properties show install/compat state** per preprocessor x active
  checkpoint family, with the LoRAMixer-style empty-state link to the Foundry
  when the model is missing. Same for IP-Adapter on reference layers.
- **Pre-flight honesty:** generate blocks with a reason when a visible layer
  needs an uninstalled model or an unsupported family combo - the same
  message the backend 422 would give.
- Per-layer prompt fields become inpaint-only in the properties panel.
- DESIGN.md rails: mono labels, machined radii, lucide icons only,
  keyboard-navigable, reduced-motion safe.

## 5. Error handling & honesty semantics

- **Structural problems -> 422 pre-flight** (uninstalled model, unsupported
  combo, >1 inpaint mask), mirrored in the UI before submit.
- **Runtime pass failure -> failed job.** Never silent degradation to
  unguided output; silently producing an unguided image is the exact lie this
  cycle fixes. This deliberately diverges from LoRA's fail-soft contract -
  LoRA is a cosmetic adapter and keeps its documented behavior; guided passes
  are semantic.
- **One explicit degrade-with-notice case:** reference-image masks are
  honored on SD1.5/SDXL (`ip_adapter_masks`); FLUX/SD3.5 apply the reference
  globally and the job result carries an explicit "reference applied without
  mask on this family" notice surfaced in the UI. (Declining outright would
  make reference layers unusable on FLUX - the canvas resolver requires a
  drawn mask on every layer.)
- Hosted-provider declines (M6) stay exactly as-is.

## 6. Testing & CI strategy

- **Stub-CI-safe:** `guided/` imports cleanly with no torch /
  `controlnet_aux` / diffusers present; CI's stub suite stays authoritative.
- **Backend unit (fast, no models):** rasterizer across all four mask types
  and edge cases (empty points, inverted bounds, erase subtraction);
  preprocessor registry with mocked annotators; registry resolution +
  compatibility; schema validation incl. every 422 path; pipeline-variant
  derivation and `controlnets_attached()` always-detach hygiene with fake
  pipelines (mirrors `test_lora_apply.py`); flux-fill routing.
- **Frontend:** payload projection (denoising threading, layer shapes),
  pre-flight blocking, install/compat surfacing, retired-panel regressions,
  `generation.ts` <-> backend schema contract sync.
- **Local real-model gates per PR:** targeted suites like #136's LoRA gate,
  one guided-pass smoke per installed family, run with
  `backend/venv/Scripts/python.exe`; full stub suite on CI before merge.
- Standard gates per PR: `npm run typecheck`, `npm test`, `npm run build`,
  backend pytest.

## 7. PR staging & acceptance criteria

| PR | Ships | Acceptance |
|----|-------|------------|
| 1 | img2img + inpaint + mask rasterizer + schema threading + denoising strength | Inpaint edits only the masked region; a reference image at denoising 0.75 visibly guides output; flux-fill routes FLUX inpaint; zero new model weights required |
| 2 | ControlNet SD1.5 + SDXL: preprocessors, Foundry records + consent acquisition, MultiControlNet, orphan retired | canny/depth/openpose layers measurably constrain SD1.5 and SDXL output; per-layer strength + step range honored; uninstalled model -> 422 + UI block with Foundry link |
| 3 | FLUX + SD3.5 ControlNet, hardware-fit gating, UI reconciliation | ControlNet works on flux-dev and SD3.5 within fit limits; unfittable combos refuse with measured reason; no dead controls remain in GeneratePanel |
| 4 | IP-Adapter masked multi-reference, all families | Two masked reference layers each influence their region on SD1.5/SDXL; FLUX/SD3.5 apply globally with the explicit notice; adapter + encoder weights consent-gated |

Each PR lands independently green through the standard gate
(`gh pr checks` -> squash-merge) and closes a real user-visible lie; nothing
in a later PR is needed to keep an earlier PR honest.

## Out of scope (explicit)

- The aux-model edit tools (background removal, real super-resolution, face
  restoration) - the other half of #34, its own follow-up cycle, including
  the fake `AIToolsPanel.handleApply`, the store-only `runPipeline`, and the
  LANCZOS `/api/images/upscale`.
- CompositionPreview generation streaming (#33) and canvas text layers (#32).
- Guided passes on video generation (canvas layers are image-only).
- Regional per-ControlNet-layer prompting (no diffusers support; fields
  marked inpaint-only instead).
- Hosted-provider guided passes (M6 declines stand; #42 tracks hosted LoRA
  separately).

## Acceptance criteria (cycle-level)

- Every guided-pass field the frontend sends is consumed or explicitly
  declined - nothing is silently dropped at the schema boundary.
- A control layer, reference image, or inpaint mask measurably changes the
  generated image on every supported family, verified per-PR by the
  real-model smoke gates.
- All conditioning/adapter/annotator weights arrive only through
  consent-gated Foundry acquisition.
- The orphaned ControlNet stub is deleted; `GeneratePanel` contains no
  controls whose values go nowhere.
- `npm run typecheck`, `npm test`, `npm run build`, and backend pytest green
  on every PR.
