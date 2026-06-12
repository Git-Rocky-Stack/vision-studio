# Spike D - Fit & Auto-Wire Truth (Model Foundry M5)

> Time-boxed throwaway exploration mandated by the Model Foundry spec
> (`docs/superpowers/specs/2026-05-30-model-foundry-design.md`, section 8.1, spike D)
> before any M5 (Hardware-fit + auto-wiring) production code. Exploration code is
> throwaway and was NOT held to TDD. The durable artifact is this document.

**Date:** 2026-06-11
**Branch:** `docs/model-foundry-spike-d`
**Verdict:** **GO (with adjustments)** - architecture->pipeline auto-wiring and
`from_single_file` load end-to-end on real weights; weight-bytes estimation from
safetensors headers is **exact** (ratio 1.0000 across six real files); dependency
resolution from `model_index.json` discriminates weights-bearing vs config-only
components correctly. The spec's "measured VRAM numbers on real silicon" half is
**re-scoped** (adjustment 1): the dev machine has **no CUDA device** (Intel UHD 620
iGPU only - `torch.cuda.is_available() == False` under torch 2.5.1+cu121), so
on-silicon calibration ships as an M5 harness producing verified-catalog *data
edits* when run on CUDA hardware, and every number is honestly labeled
estimated-vs-measured until then (which spec section 6.2 requires anyway).

---

## 1. The question (from spec section 8.1)

> Do VRAM estimates track measured reality on real silicon, and does
> architecture->pipeline auto-wiring + dependency resolution load each family
> end-to-end?
> **Output:** calibrated overhead bands; verified pipeline/dependency map;
> measured numbers -> Verified catalog.

## 2. Method

Five-stage throwaway harness run from a temp dir against the backend venv
(Python 3.12.12, torch 2.5.1+cu121, diffusers 0.37.1, 31.9 GiB system RAM):

1. **Auto-wiring map truth** - for every family in the M5 map, assert the
   diffusers pipeline class exists, whether it inherits `FromSingleFileMixin`,
   and capture its `__init__` component signature (the dependency graph the
   loader actually demands).
2. **Estimator math truth** - parse real safetensors headers (via the app's own
   `foundry.safetensors_header.read_safetensors_header`) for six local real
   files (sd15 unet/vae/text_encoder/safety_checker + two sd15 controlnets);
   compare `sum(prod(shape) x dtype_bytes)` against actual file size.
3. **Dependency-resolution truth** - enumerate `model_index.json` submodels of
   the local SD1.5 repo; verify on-disk presence and weights-bearing vs
   config-only discrimination; confirm missing-component detection.
4. **End-to-end CPU load + inference** - `from_pretrained` the real SD1.5
   (fp32), run a 2-step 128x128 generation, compose a ControlNet pipeline from
   shared components; measure RSS at every stage.
5. **`from_single_file` truth** - download a real single-file sd15 checkpoint
   (fp16, 1.99 GiB, Comfy-Org sd15 archive), load via
   `StableDiffusionPipeline.from_single_file(torch_dtype=float32)`, generate.

Real weights only; no mocks anywhere. Local inventory: SD1.5 full diffusers
layout (5.11 GiB) + 8 sd15 ControlNets in the HF cache. No SDXL/FLUX/SD3.5/
LTX/SVD weights were present locally; their loaders were validated at the
class/signature level (stage 1), not end-to-end - the calibration harness
(adjustment 1) closes that on CUDA hardware where the big families are viable.

## 3. Headline findings

| Question | Answer (measured) |
| --- | --- |
| family -> pipeline class map | **All 7 families resolve** in diffusers 0.37.1: flux (FluxPipeline / Img2Img / Fill), sdxl (+Img2Img), sd15 (+Img2Img/Inpaint/ControlNet), sd35, ltx, svd, animatediff (+`MotionAdapter`). |
| `from_single_file` support | **Every shipped class supports it EXCEPT `StableVideoDiffusionPipeline`** - svd single-file checkpoints have no load path and must stay Experimental (adjustment 4). |
| Weight-bytes estimation | **Exact.** `sum(prod(shape) x dtype_bytes)` vs file size = ratio **1.0000** on all six real files (859.5M-param unet 3.202 GiB, vae 0.312, text_encoder 0.458, safety_checker 1.132, controlnets 1.346 each). Precision scaling is then pure arithmetic: sd15 inference set (unet+vae+te, 1.066B params) -> fp32 3.97 GiB / fp16-bf16 1.99 / fp8 0.99. |
| Pre-download estimates | Same headers are available server-side without downloading via `HfApi.get_safetensors_metadata` (Spike C tooling) - the estimator works pre-acquisition with identical math. |
| Dependency resolution | `model_index.json` submodels enumerate exactly; weights-bearing (unet/vae/text_encoder/safety_checker) vs config-only (scheduler/tokenizer/feature_extractor) discrimination works via a per-dir weights glob; missing-component detection returns clean names for the "Needs X" preflight readout. The pipeline-class `__init__` signature (stage 1) agrees with `model_index.json` everywhere - either is a valid graph source; `model_index.json` wins for *installed* repos, the class signature for *planned* ones. |
| End-to-end load + inference | SD1.5 fp32 `from_pretrained` 0.8 s; 2-step 128x128 CPU generation 12.7 s; ControlNet pipeline composed from shared components in 0.2 s. The wire works. |
| mmap residency (estimator design input) | `from_pretrained` of safetensors is **mmap-lazy**: RSS rose only 0.02 GiB on loading a ~4 GiB model; pages became resident during inference (post-run RSS delta 3.81 GiB ~= weight bytes + small activations). **Observed RSS is NOT a fit signal** - the estimator must budget header-derived weight bytes. On CUDA this distinction vanishes for VRAM (weights are explicitly copied), so VRAM budget = exact weight bytes in target dtype + activation band + CUDA context band; **only the bands need silicon calibration, never the weight bytes**. |
| `from_single_file` truth | **Loads and generates end-to-end** on a real fp16 single-file checkpoint (header: 1.066B params, F16, predicted 1.986 GiB = file size). Load 5.5 s, 2-step 128x128 generation OK. Two wrinkles below. |
| Single-file config fetch | `from_single_file` **fetched 11 config files from the hub** on first load (it infers the family from checkpoint keys, then pulls the canonical repo's configs). Single-file loading is therefore network-dependent unless configs are pre-cached or `config=` is passed. M5 must handle this explicitly (adjustment 3). |
| dtype-conversion transient | fp16 checkpoint loaded with `torch_dtype=float32` cost ~3.92 GiB RSS (~2x the checkpoint): converted weights resident + transient checkpoint copy - single-file loads are NOT mmap-lazy. **Load-time system-RAM peak ~= resident weights + checkpoint bytes**; the preflight's RAM check needs the peak, not the steady state. |
| CPU fallback honesty | sd15 fp32 at 128x128 takes ~5-13 s per 2 steps on this CPU. Functional, unusable for real work. On a no-CUDA machine `hardware_fit` must say so honestly (`cpu-only - not recommended`), never pretend fitness. |

## 4. The adjustments (to the M5 design)

1. **"Measured numbers" become a calibration harness + catalog data edits.** This
   dev machine has no CUDA silicon, so the spec's measured-VRAM half cannot be
   produced here - and per spec section 3, blessing/measuring is a *data edit*,
   not code. M5 ships a maintainable calibration script (real-model, opt-in,
   CUDA-gated - mirroring the existing real-vs-stub test pattern) that loads each
   verified model on actual CUDA hardware and writes measured load/peak VRAM into
   `verified-catalog.json`. Until run, all entries carry estimates and the
   spec-mandated `estimated` label. The estimate formula itself is validated
   (weight bytes exact; bands published-data-seeded, calibration-refined).
2. **Estimator formula:** `vram_estimate = weight_bytes(target_dtype) [exact, from
   headers - local file or server-side pre-download] + activation_band(resolution,
   family) + runtime_band(CUDA context)`. Weight bytes carry zero uncertainty;
   uncertainty lives ONLY in the bands, which are honestly labeled and
   calibration-refined. RSS observation is explicitly rejected as a signal (mmap).
3. **`from_single_file` must pin its config source.** Pass `config=<canonical
   family repo>` (from the verified catalog) so family inference never silently
   pulls an attacker-influenceable or wrong config, and pre-cache or disclose the
   config fetch in preflight ("first single-file load of this family fetches
   configs - {n} small files"). Offline with no cached config -> honest preflight
   failure, not a mid-load exception.
4. **SVD is excluded from the single-file upgrade.** `StableVideoDiffusionPipeline`
   has no `FromSingleFileMixin` in 0.37.1; indexed svd single-file checkpoints
   stay Experimental with the load-path named in `tier_reason`. M3/M4's honest
   default already says exactly this - M5's upgrade rule simply carves svd out.
5. **System-RAM preflight uses load-peak, not steady state** (single-file
   conversion transient: resident + checkpoint bytes; offload adds pinned-host
   copies on top).

## 5. Seeded M5 test list (feeds spec section 8.2)

All mocked/no-network, table-driven, both CI OSes; real-model legs opt-in
behind the existing env-flag pattern.

1. **Estimator math** - header -> params -> bytes per precision; table-driven
   over real captured headers (sd15 set + controlnets + the fp16 single-file);
   exact-ratio asserted.
2. **`hardware_fit` verdicts** - `fits | fits-with-offload | over-budget |
   cpu-only` boundaries with mocked `HardwareProfile`s (24 GiB / 8 GiB / 1 GiB
   iGPU / no-CUDA); estimated-vs-measured labeling asserted on every verdict.
3. **`resolve_model_runtime`** - family -> pipeline class + component graph for
   all 7 families; unknown family -> honest refusal (never a guess); svd
   single-file -> no runtime plan, reason names the missing load path.
4. **Dependency completeness** - `model_index.json` submodels vs on-disk dirs,
   weights-bearing vs config-only; missing weighted component -> "Needs
   {component} ({size})" readout; config-only components never block.
5. **Single-file config pinning** - resolve `config=` from the catalog family
   map; offline + uncached -> preflight failure with reason; no silent hub
   inference.
6. **Precision selection** - bf16 on compute capability >= 8.0, fp16 below,
   fp8 gated to >= 8.9, fp32 on CPU; per-family overrides honored.
7. **Fallback ladder** - ordered rungs (lower precision -> offload -> tiling),
   each step recorded and surfaced, ladder exhaustion -> honest failure.
8. **Preflight readout strings** - the GeneratePanel footer contract: "Ready -
   bf16 - fits", "Needs T5 encoder (1.2 GB)", "Runs with CPU offload (~slower)",
   "Over budget on 8 GB VRAM", "CPU only - not recommended".
9. **`HardwareProfile` probe** - no-CUDA machine (this one) -> complete,
   truthful profile (gpu none, RAM, disk); CUDA profiles mocked (name, total/free
   VRAM, compute capability, driver); probe never raises on missing nvml/torch.
10. **API contracts** - `GET /hardware`, `POST /models/{id}/resolve-runtime`
    (+ rate limits, literal-before-dynamic route order) and the mirrored
    `hardware:get` / `models:resolveRuntime` IPC channels.
11. **Load-peak RAM math** - single-file load peak = resident + checkpoint
    bytes; offload plans add pinned-host copies.

## 6. Environment snapshot (for reproducibility)

- Windows 11 Pro 10.0.26200; backend venv Python 3.12.12; torch 2.5.1+cu121
  (CUDA-built, **no CUDA device**); diffusers 0.37.1; 31.9 GiB RAM; GPU:
  Intel UHD Graphics 620 (1 GiB, no CUDA).
- Local real weights: `runwayml/stable-diffusion-v1-5` full diffusers layout +
  8x `lllyasviel/control_v11*_sd15_*` ControlNets (HF cache).
- Single-file leg: 1.99 GiB fp16 sd15 checkpoint from the Comfy-Org sd15
  archive, downloaded unauthenticated at ~32 MB/s, removed after the run.
- Harness was throwaway, run from a temp dir, not committed - per spike
  discipline. Its full log is distilled into section 3.
