# Vision Studio - M9 Accelerator + Inference Enhancement (Design Spec)

> **Status:** Approved design (2026-06-19). Elaborates the M9 section of the
> Path-to-v1 Program Roadmap
> (`docs/superpowers/specs/2026-06-15-vision-studio-path-to-v1-roadmap-design.md`).
> This spec is the just-in-time elaboration of an already-locked milestone; it
> does **not** re-open program scope. It inherits the program's cross-cutting
> engineering rails by reference and resolves M9's open decisions. Next artifact:
> the implementation plan via the writing-plans skill.

## 1. Context and goal

M9 is **Pillar 2** of the Path-to-v1 program: make the Local route run as fast as
the silicon allows. M5 (Model Foundry) already produces **the plan** -
`resolve_model_runtime(record, profile, consent) -> RuntimePlan` - and its
resolver docstring explicitly reserves the next step: *"Pillar 2 optimizes within
it."* M9 is that optimizer. It consumes the `RuntimePlan` and a `HardwareProfile`,
decides which optimizations are safe and beneficial, applies them behind hard
fallbacks, and makes each fallback-ladder rung (precision -> offload -> tiling ->
slicing) genuinely fast - measured on real CUDA hardware.

**Goal:** given a `RuntimePlan` + `HardwareProfile`, decide and apply a coherent
set of inference optimizations - `torch.compile`, SDPA / fused attention,
channels-last, quantization where proven safe, TensorRT, and a fix for the
always-on attention-slicing perf bug - each behind a non-fatal fallback; surface
exactly what was applied through a dedicated Performance settings panel; and
populate the optimization allowlists from a CUDA-gated benchmark **and correctness**
sweep, never from assertion.

**The hard boundary this respects:** M9 does **not** change the `RuntimePlan`
contract or the resolver - those are owned by M5/M6. M9 adds a *separate*
acceleration layer downstream of the plan. This satisfies both the roadmap's
"owned by M5/M6" constraint and M9's test strategy (decision logic unit-tested on
CI with a mocked profile and no GPU).

**Current surface this builds on (verified against the code):**

- `backend/foundry/runtime_resolver.py` - `resolve_model_runtime(...) -> RuntimePlan`.
  `RuntimePlan` fields M9 consumes: `pipeline_class`, `precision`, `offload`,
  `vae_tiling`, `attention_slicing` (**defaults `True` unconditionally - the perf
  bug**), `config_catalog_id`, `vram_plan` (`VramEstimate`), `fit`,
  `fallback_ladder`, `readiness`, `refusal`. `select_precision` returns
  bf16/fp16/fp32; `_NO_FP16_FAMILIES = {"flux", "sd35"}`; `_ladder(precision, fit)`
  builds the OOM rungs `precision:fp16`, `offload:cpu`, `vae:tiling`,
  `attention:slicing-max`; `PIPELINE_BY_FAMILY` maps (family, capability) ->
  `PipelineEntry` for sd15/sdxl/sd35/flux/ltx/svd/animatediff.
- `backend/foundry/hardware.py` - `HardwareProfile` with `compute_major`/
  `compute_minor`, `supports_bf16` (compute >= 8.0), `supports_fp8` (compute >= 8.9);
  `probe_hardware(models_dir)` never raises (truthful degrade to no-GPU).
- `backend/utils/direct_generator.py` - image generator. Seams M9 attaches to:
  `resolve_plan(model_id, overrides)` (module-level, patched by tests; "security
  refusals are NEVER overridable"), `apply_fallback_rung(plan, rung)` (OOM ladder),
  `dtype_for_precision(precision)`, `pipeline_class_for(plan)` (shared helpers the
  video generator imports), and `_load_from_plan` which today applies offload /
  `.to(device)` / `vae.enable_tiling()` / `enable_attention_slicing()` / best-effort
  `enable_xformers_memory_efficient_attention()`. **M9's `apply_acceleration` step
  inserts immediately after the pipeline is loaded and moved to device.**
- `backend/utils/direct_video_generator.py` - `DirectVideoGenerator`, mirrors the
  image generator; `_apply_plan_runtime_flags(pipeline, plan, slicing_max)` is the
  shared post-load flag applier. Imports `apply_fallback_rung`, `dtype_for_precision`,
  `pipeline_class_for`, `resolve_plan` from `direct_generator` - the DRY pattern M9
  follows for a shared apply helper.
- `backend/tools/calibrate_vram.py` - the harness pattern M9's benchmark mirrors:
  `_check_cuda()` at import (exit 2 if no CUDA - "Estimates must never masquerade as
  measured"); stdout-quarantine of main/generator imports via
  `redirect_stdout(sys.stderr)`; runs tiny inference, records
  `torch.cuda.max_memory_reserved(0)`, blesses the pipeline's REAL dtype; prints
  `json.dumps(patch, indent=2)` to **stdout only**; never writes the catalog.

## 2. Open decisions resolved (this brainstorm)

The roadmap left three decisions open for M9; a fourth (control surface) surfaced
during design. All four are locked to maximal-ambition answers:

1. **Quantization scope = Aggressive.** Auto-applied wherever a per-family
   allowlist + hardware capability permits, on by default. "Aggressive" means
   default-on *where proven safe* (evidence-backed allowlist), not blind.
2. **`torch.compile` = On by default with hard-fallback.** `mode=reduce-overhead`,
   `dynamic=True`, persistent Inductor cache, best-effort try/except (never fails a
   generation), one-time "Optimizing..." state.
3. **TensorRT = In v1.** Full engine-build path (overrides the roadmap's default
   "candidate for post-v1" cut).
4. **Control surface = Dedicated Performance settings panel.** Real toggles +
   honest surfacing of applied acceleration + estimated-vs-measured labels.

## 3. Architecture: module boundary and the two-dataclass split

**New module `backend/foundry/accelerator.py`** sits downstream of the M5 resolver,
never inside it. The data flow:

```
resolve_model_runtime(record, profile, consent)  ->  RuntimePlan          # M5/M6, untouched
resolve_acceleration(plan, profile, settings)     ->  AccelerationPlan     # M9 decision layer (pure, no torch)
apply_acceleration(pipeline, accel, family)       ->  AppliedAcceleration  # M9 apply layer (torch + dep-guarded)
```

Both generators call `resolve_acceleration` right after they hold a `RuntimePlan`,
then `apply_acceleration` right after the pipeline is loaded and `.to(device)` -
immediately following the existing `_apply_plan_runtime_flags` seam. The
`RuntimePlan` is read-only input; M9 adds nothing to it.

**`AccelerationPlan` (frozen - the decision output):**

```python
@dataclass(frozen=True)
class AccelerationPlan:
    compile: bool = False                    # torch.compile the UNet/transformer
    compile_mode: str = "reduce-overhead"    # Inductor mode
    compile_dynamic: bool = True             # dynamic shapes (avoid recompiles on res change)
    channels_last: bool = False              # conv-UNet families only (sd15/sdxl/svd)
    sdpa: bool = True                        # fused scaled-dot-product attention
    attention_slicing: Optional[str] = None  # None | "auto" | "max" - only under memory pressure
    quantization: Optional[str] = None       # None | "int8" | "fp8"
    tensorrt: bool = False                   # build/use a TensorRT engine
    notes: list[str] = field(default_factory=list)  # human-readable rationale (drives panel labels)
```

**`AppliedAcceleration` (the apply output - what actually took effect):**

```python
@dataclass
class AppliedAcceleration:
    applied: list[str]      # e.g. ["sdpa", "channels_last", "compile:reduce-overhead"]
    skipped: list[str]      # e.g. ["quantization:int8 (bitsandbytes unavailable)"]
    fell_back: list[str]    # e.g. ["compile (Inductor error, ran eager)"]
```

This split is the keystone. `AccelerationPlan` is what we *intend* - pure, fully
unit-testable on CI with a mocked profile and no GPU. `AppliedAcceleration` is what
we *got* - the honest surface for the panel ("estimated vs measured", "requested vs
applied"). The decision layer never imports torch; the apply layer is the only place
torch / bitsandbytes / tensorrt are touched, all behind import guards.

## 4. The decision layer: `resolve_acceleration`

```python
def resolve_acceleration(
    plan: RuntimePlan,
    profile: HardwareProfile,
    settings: AccelerationSettings,
) -> AccelerationPlan: ...
```

`AccelerationSettings` is a small frozen dataclass mirroring the Performance panel:
one tri-state per optimization (`"auto" | "on" | "off"`, default `"auto"`) plus a
global `master_enable`. `auto` = "decide per the matrix"; `on`/`off` = explicit user
override.

**Security short-circuit (never overridable):** if `plan.refusal` is set or
`plan.readiness` blocks, return an all-disabled `AccelerationPlan` with a note and
touch nothing. This mirrors the generator invariant "security refusals are NEVER
overridable."

**Per-family decision matrix** (family derived the same way M5 derives it - from the
record/`config_catalog_id`):

| Optimization | Gate / rule |
|---|---|
| **sdpa** | On by default for all families (PyTorch-native, no dep). Replaces the best-effort xformers call. |
| **channels_last** | **Conv-UNet families only** - `sd15`, `sdxl`, `svd`. Neutral-to-negative on DiT families (`flux`, `sd35`, `ltx`), so **off** there. Hard allowlist, not a guess. |
| **compile** | On by default, `mode=reduce-overhead`, `dynamic=True`. Off only if `settings.compile == "off"`. Apply layer hard-falls-back to eager on any Inductor error. |
| **quantization** | Per-family allowlist x hardware gate (Section 5). `auto` resolves to the best *proven-safe* method the hardware supports; never applied to a family off the allowlist. |
| **tensorrt** | Off by default even in `auto` (engine build is expensive/slow first-run); `on` only when the user explicitly enables it OR a family is on the TRT-proven allowlist (Section 7). |
| **attention_slicing** | **The fix.** `None` (off) when `plan.fit` indicates fit-with-headroom; `"auto"` under moderate pressure; `"max"` only when the plan signals tight fit. The OOM ladder still re-adds `attention:slicing-max` at runtime if we are wrong, so this carries zero stability risk. |

**The slicing fix, precisely.** Today `RuntimePlan.attention_slicing` defaults to
`True` unconditionally, throttling every generation even on a 24 GB card running a
4 GB model. `resolve_acceleration` derives slicing from `plan.fit` / `plan.vram_plan`
headroom instead. M9 does **not** mutate the `RuntimePlan`: the generator reads
`AccelerationPlan.attention_slicing` for the normal path and ignores the legacy
`plan.attention_slicing` field there. The OOM ladder rung path (`apply_fallback_rung`)
is unchanged, so the safety net is intact.

**No-fp16 families stay sacred.** `flux` and `sd35` (`_NO_FP16_FAMILIES`) are never
handed a precision-altering optimization silently. Quantization on them is only ever
an *explicit, verified-safe* method from the allowlist (Section 5); `channels_last`
is already off for them by the conv rule.

Every non-trivial decision appends a one-line reason to `notes` (e.g.
`"channels_last off: flux is a DiT family"`), which becomes the panel's honest "why"
surface.

## 5. Quantization: the four-gate proven-safe model

"Aggressive" = default-on *wherever proven safe*. Safety is the product of four
independent gates; quantization applies only when **all four** pass.

**Gate 1 - Per-family method allowlist.** A static table maps each family to the
quantization methods verified not to corrupt its output. A family absent from a
method's set never gets it, even in `auto`.

```python
# method -> families verified safe (output within tolerance vs unquantized)
_QUANT_ALLOWLIST = {
    "int8": {"sdxl", "sd15", "flux", "sd35"},   # bitsandbytes 8-bit on UNet/transformer
    "fp8":  {"flux", "sd35", "sdxl"},            # fp8 weight-only, compute >= 8.9 only
}
```

**Gate 2 - Hardware capability.** `int8` requires `bitsandbytes` + CUDA. `fp8`
requires `profile.supports_fp8` (compute >= 8.9 - Ada/Hopper). On older hardware,
`fp8` is skipped to the next-best allowed method, never forced.

**Gate 3 - Dependency availability.** The decision layer gates on a cheap,
import-free capability probe `quant_backends_available()` returning which of
bitsandbytes / optimum-quanto / torchao imported successfully. If the backend is
absent (the stub CI case), `quantization` resolves to `None` with a note - the
decision is still *made* on CI even though it could never *apply* there.

**Gate 4 - `auto` resolution** picks the most aggressive proven-safe method for the
(family, hardware, deps) tuple:

```python
def _auto_quant(family, profile, backends) -> Optional[str]:
    if profile.supports_fp8 and family in _QUANT_ALLOWLIST["fp8"] and backends.fp8:
        return "fp8"      # smallest + fastest where the silicon allows
    if family in _QUANT_ALLOWLIST["int8"] and backends.int8:
        return "int8"     # broad fallback, claws back VRAM
    return None           # honest: nothing proven safe here
```

**No-fp16-family reconciliation.** `flux` and `sd35` *are* on the allowlist - that
is the point. They cannot drop to fp16, but int8/fp8 are *verified-safe explicit
methods*, not a silent precision downgrade. This is how M9 claws back VRAM on the
heavy DiT models without corrupting them. The allowlist is **evidence-backed**:
every entry traces to a passing correctness sweep (Section 8), re-verified at the
Codex gate (Section 9).

**User override.** Panel `quantization = "off"` forces `None`. `"int8"` / `"fp8"`
force that method **only if Gates 1-3 still pass**; a forced method that fails its
gate resolves to `None` with a visible note explaining why it could not apply. A
manual toggle never corrupts output.

## 6. The apply layer: `apply_acceleration`

The only function in M9 that touches torch and the optional accel deps.

```python
def apply_acceleration(pipeline, accel: AccelerationPlan, family: str) -> AppliedAcceleration: ...
```

Runs after `_apply_plan_runtime_flags` in both generators - one shared call site, no
duplication. Optimizations apply in an order that lands cheap/always-safe transforms
first and expensive/fallible ones last:

1. **sdpa** - set the pipeline attention processor to PyTorch-native
   `AttnProcessor2_0` (or leave diffusers' default SDPA path). Replaces today's
   best-effort `enable_xformers_memory_efficient_attention()`. Always safe, no dep.
2. **channels_last** - `pipeline.unet.to(memory_format=torch.channels_last)`,
   double-checked against the conv-UNet allowlist (no-op otherwise).
3. **quantization** - dispatch to a backend-specific helper, each wrapped in its own
   `try/except ImportError` and `try/except Exception`. Non-fatal: the unquantized
   pipeline is already loaded and valid, so a failure records `skipped`/`fell_back`
   and continues. Never raises into the generator.
4. **attention_slicing** - `enable_attention_slicing(accel.attention_slicing)` only
   when not `None`. (The OOM ladder path stays separate and unchanged.)
5. **compile** - `torch.compile(module, mode=..., dynamic=...)` best-effort.
   **Hard-fallback rule: a compile failure NEVER fails a generation** - on any
   exception, log, leave the eager module in place, record
   `fell_back += ["compile (...)"]`. A persistent Inductor cache
   (`TORCHINDUCTOR_CACHE_DIR` under an app-data path) pays the warmup cost once
   across runs; the generator surfaces a one-shot "Optimizing..." state on first
   compile.
6. **tensorrt** - delegated to the TensorRT path (Section 7); fully guarded and
   non-fatal.

**Import safety (the CI rail).** Every optional dep - `bitsandbytes`,
`optimum-quanto`, `torchao`, `tensorrt`, `torch_tensorrt` - is imported lazily
*inside* the helper that needs it, never at module top level. The module carries
`from __future__ import annotations` so any optional-dep type in a signature is not
evaluated at import. This is the exact rail from the M8 aiohttp lesson: pytest
collection on the stub CI imports `accelerator.py` cleanly with zero accel deps,
because nothing heavy is touched until a helper runs (and tests mock those).

**DRY.** `apply_acceleration` lives in `accelerator.py`; both generators import and
call it - the same pattern they already use for `apply_fallback_rung` /
`dtype_for_precision` / `pipeline_class_for`.

## 7. The TensorRT engine path

TensorRT is the heaviest optimization and the one the roadmap deferred; pulled into
v1, it gets a real engine-build path, isolated so its weight never destabilizes the
common path.

**Submodule `backend/foundry/tensorrt_engine.py`** quarantines the bulky, dep-heavy
logic and is independently testable. `apply_acceleration` calls into it only when
`accel.tensorrt` is true.

**Lifecycle - build once, reuse always:**

1. **Cache key** = hash of `(family, pipeline_class, precision, resolution-bucket,
   GPU compute capability, TRT version)`. Engines are GPU- and shape-specific, so the
   key captures all of them. Engines live under an app-data path
   (`tensorrt/engines/<key>.plan`), never in the repo.
2. **Cache hit** -> deserialize and bind the prebuilt engine. Fast.
   `applied += ["tensorrt (cached)"]`.
3. **Cache miss** -> an **explicit, surfaced engine build**: export the
   UNet/transformer to ONNX, build the TRT engine, serialize to cache. This takes
   minutes, so it runs behind a clear, cancellable "Building TensorRT engine
   (one-time)..." state in the panel - never silently blocking a generation. The
   build is **opt-in** (panel toggle or TRT-proven family allowlist); it never fires
   unbidden in `auto`.
4. **Build failure** -> identical hard-fallback to compile: log,
   `fell_back += ["tensorrt (build failed, ran eager)"]`, fall back to the
   already-loaded eager (or compiled) pipeline. A generation is never lost to a TRT
   failure.

**Scope guards for v1:**

- A **TRT-proven family allowlist** - only families whose engine build + output
  tolerance we have verified in the sweep are eligible. An un-vetted family cannot
  auto-build; its panel toggle is shown disabled with a "not yet verified on your
  hardware" note rather than offering a path that might corrupt output.
- TRT is **mutually exclusive with `compile`** for a given module (TRT *is* the
  compiled artifact); the decision layer records the precedence in `notes`. It also
  does not stack with quantization on the same module simultaneously.
- All `tensorrt` / `torch_tensorrt` imports are lazy and guarded; absent on stub CI,
  the decision still resolves (`tensorrt=False` with a note) and the apply path
  no-ops.

**Honesty surface.** The panel shows TRT state explicitly - `available` / `building`
/ `cached & active` / `unavailable (reason)` - so the user always knows whether the
cost was paid and whether it is in effect.

## 8. Surfaces: Performance panel + benchmark/correctness sweep

Two surfaces, one principle: **never let an estimate masquerade as a measurement.**

### 8.1 Performance settings panel (renderer)

New global panel `src/components/settings/PerformancePanel.tsx` - Carbon Pro,
`lucide-react` icons, no emoji/decorative glyphs, hardware primitives driving real
state per `DESIGN.md`. It holds:

- A **master enable** plus one tri-state control (`auto` / `on` / `off`) per
  optimization: compile, channels-last, SDPA, quantization (with method sub-select
  int8/fp8), attention-slicing, TensorRT. Tri-state maps 1:1 onto
  `AccelerationSettings`.
- An **"Applied this run" readout** fed by `AppliedAcceleration` - three honest
  columns: *applied* / *skipped (reason)* / *fell back (reason)*. The decision
  layer's `notes` and the apply results surface verbatim, so the user sees exactly
  why channels-last is off on Flux, or that compile fell back to eager.
- **Estimated-vs-measured labels.** Speedup figures from the verified catalog are
  tagged `measured` (GPU-calibrated) vs `estimated` (heuristic) - the same honesty
  rule M5 uses for VRAM. TensorRT state shows `available / building / cached & active
  / unavailable`.

Settings persist via the existing settings store/IPC; channel names stay in sync
between `electron/preload.ts` and the handler. The panel contains **no** acceleration
logic - it only writes `AccelerationSettings` and reads `AppliedAcceleration`; the
decision/apply layers are the source of truth.

### 8.2 Benchmark + correctness sweep (`backend/tools/benchmark_accel.py`)

CUDA-gated, mirroring `calibrate_vram.py` exactly:

- `_check_cuda()` at import - **exit 2 if no CUDA.** Measured perf is never faked.
- stdout-quarantine: all main/generator imports wrapped in
  `redirect_stdout(sys.stderr)`; **stdout emits pure JSON only**, stderr gets chatter.
- For each (model, accel config): load, run a fixed-seed reference generation
  **unaccelerated**, then **accelerated**; measure before/after latency
  (`torch.cuda.Event`) and `max_memory_reserved`.
- **Correctness is first-class.** Compare accelerated output to the unaccelerated
  reference within a tolerance (LPIPS / max-pixel-delta threshold). A config that
  exceeds tolerance is reported as **FAILED correctness** and **excluded from the
  allowlist**. This is how the per-family quant/TRT allowlists in Sections 5 and 7
  are populated with evidence rather than assertion.
- Prints `json.dumps(patch, indent=2)` to stdout for a **human catalog data-edit** -
  **never auto-writes** the verified catalog, identical to the calibrate tool.

The sweep is the empirical backbone: the allowlists are *outputs* of this tool, and
the Codex gate re-runs it as the final correctness sign-off.

## 9. Error handling, testing, and the Codex gate

### 9.1 Error-handling contract (one rule, everywhere)

**No acceleration failure ever fails a generation.** The unaccelerated pipeline is
always loaded and valid *before* any accel is attempted, so every optimization is a
best-effort enhancement on a working baseline. Compile, quantization, and TensorRT
each catch their own exceptions, record `skipped`/`fell_back` with a reason, and
return. The only hard stops are M5/M6 security refusals, which short-circuit
`resolve_acceleration` to all-disabled before anything runs.

### 9.2 Testing strategy

- **Decision layer (`resolve_acceleration`) - full CI coverage, no GPU.** Pure
  function, mocked `HardwareProfile` + `RuntimePlan` + `AccelerationSettings`.
  Table-driven tests assert the matrix: channels-last off for DiT families, slicing
  off under headroom / max under pressure, quant allowlist x hardware gates,
  no-fp16 families never silently downgraded, override precedence, refusal
  short-circuit. The bulk of the tests, runs in the ~0.3s stub-CI path.
- **Apply layer - import-safety + dispatch tests.** Verify `accelerator.py` imports
  cleanly with **zero** accel deps (the absent-dep `builtins.__import__` shim from
  the M8 lesson), and each helper no-ops gracefully when its dep is missing. Torch
  calls mocked; assert the right pipeline methods are invoked and exceptions are
  swallowed into `fell_back`.
- **Panel - Vitest + Testing Library.** Tri-state toggles map to
  `AccelerationSettings`; the applied/skipped/fell-back readout renders from
  `AppliedAcceleration`; Carbon Pro token assertions; no legacy/emoji glyphs.
- **Benchmark + correctness sweep - CUDA-gated, real models, run locally.** Not on
  stub CI (no torch). Produces the allowlist evidence.
- Gates: `npm run typecheck` / `npm test` / `npm run build` + backend pytest all
  green.

### 9.3 The Codex gate (M9-specific)

Final perf + correctness sign-off before merge: optimizations must not change output
correctness (the sweep's tolerance check is the evidence); no silent precision
corruption (no-fp16 families honored - verified); benchmark methodology sound and
reproducible (fixed seed, CUDA-gated, JSON-only stdout). Every allowlist entry must
trace to a passing sweep result.

## 10. File structure

| File | Responsibility |
|---|---|
| `backend/foundry/accelerator.py` (new) | `resolve_acceleration` (pure decision), `apply_acceleration` (guarded apply), `AccelerationPlan` / `AppliedAcceleration` / `AccelerationSettings`, quant helpers + `quant_backends_available()`. |
| `backend/foundry/tensorrt_engine.py` (new) | TRT engine build / cache / reuse, cache-key hashing, TRT-proven allowlist. |
| `backend/utils/direct_generator.py` (modify) | Call `resolve_acceleration` + `apply_acceleration`; read slicing from `AccelerationPlan`, not the legacy field. |
| `backend/utils/direct_video_generator.py` (modify) | Same two calls at the shared post-load seam. |
| `backend/tools/benchmark_accel.py` (new) | CUDA-gated benchmark + correctness sweep; JSON-only stdout. |
| `src/components/settings/PerformancePanel.tsx` (new) | Tri-state toggles + applied/skipped/fell-back readout + estimated-vs-measured labels. |
| Settings store slice + `electron/preload.ts` + handler (modify) | Persist `AccelerationSettings`; expose `AppliedAcceleration`; keep IPC channel names in sync. |
| `backend/tests/test_accelerator_*.py`, panel `.test.tsx` (new) | Decision-matrix, import-safety, dispatch, and UI tests. |

## 11. PR decomposition (one spec, sequenced PRs)

One coherent subsystem, shipped in three reviewable PRs; each is independently green
and shippable.

- **PR1 - Decision core + slicing fix + apply layer (no new deps).**
  `accelerator.py` (`resolve_acceleration` + the three dataclasses), the
  attention-slicing fix, sdpa + channels-last + compile apply paths, the full
  decision-layer test suite, both generators wired. Delivers a real, measurable
  speedup with zero optional deps - clean on stub CI. PR1 alone fixes the
  always-on-slicing perf bug.
- **PR2 - Quantization + the Performance panel.** The four-gate quant model, backend
  helpers (bitsandbytes / quanto / torchao, all guarded), `PerformancePanel` UI +
  settings IPC, the applied/skipped readout. `benchmark_accel.py` lands here to
  populate the quant allowlist.
- **PR3 - TensorRT.** `tensorrt_engine.py`, engine build/cache/reuse, the TRT family
  allowlist, panel TRT state surface, the correctness-sweep extension + Codex gate
  sign-off.

## 12. Cross-cutting rails (inherited from the program roadmap)

- **TDD, failing-test-first; bite-sized commits.** Each task ends with an
  independently testable deliverable.
- **Import safety:** optional-dep modules use `try/except ImportError` +
  `from __future__ import annotations` so pytest collection on the stub CI never
  breaks (the M8 aiohttp/torch rail).
- **Green gates before ship:** `npm run typecheck`, `npm test`, `npm run build`,
  backend pytest.
- **Design system:** Carbon Pro per `DESIGN.md`; no emoji or decorative glyphs in
  `src/`; `lucide-react` icons; `.mono-label` for UI labels.
- **Boundary:** never change the `RuntimePlan` contract or the M5/M6 resolver/router.
- **Honesty:** measured never masquerades as estimated (catalog labels; CUDA-gated
  harness).
- **Codex gate:** the M9-specific perf + correctness sweep is the final sign-off.
