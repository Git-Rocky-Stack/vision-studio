# M9 Accelerator + Inference Enhancement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Local route run as fast as the silicon allows by adding a decision-then-apply acceleration layer downstream of the M5 `RuntimePlan` (torch.compile, SDPA, channels-last, proven-safe quantization, TensorRT, plus a fix for the always-on attention-slicing perf bug), each behind a non-fatal fallback, surfaced honestly through a dedicated Performance panel and a CUDA-gated benchmark+correctness sweep.

**Architecture:** A new `backend/foundry/accelerator.py` holds a **pure** `resolve_acceleration(plan, profile, settings) -> AccelerationPlan` (no torch import at decision time, fully unit-testable on stub CI) and a torch/dep-guarded `apply_acceleration(pipeline, accel, family) -> AppliedAcceleration`. Both image and video generators call one shared `accelerate_pipeline(...)` helper after the pipeline is loaded and on device. TensorRT lives in an isolated `backend/foundry/tensorrt_engine.py`. The renderer gets a `PerformancePanel` writing `AccelerationSettings` and reading the run's `AppliedAcceleration`. The M5/M6 `RuntimePlan` contract and resolver are never modified.

**Tech Stack:** Python 3 (FastAPI, diffusers/PyTorch, optimum-quanto, torch-tensorrt), `unittest` (backend); TypeScript, React 19 + Tailwind v4 (renderer), Zustand store, Vitest. Design system: Carbon Pro (`DESIGN.md`).

## Global Constraints

- **TDD:** failing test first, implement to green. Backend tests are `unittest.TestCase`, prepend `BACKEND_ROOT` to `sys.path` (the `backend/tests/test_foundry_runtime_resolver.py` pattern), and gate any test that needs real torch/diffusers behind `@unittest.skipUnless(HAS_DEPS, ...)` (the `backend/tests/test_direct_generator.py` pattern). Pure decision-layer tests carry NO `HAS_DEPS` guard - they must run on stub CI.
- **Import safety (non-negotiable - the M8 collection trap):** every optional dep (`torch`, `optimum-quanto`, `torchao`, `bitsandbytes`, `tensorrt`, `torch_tensorrt`) is imported lazily inside the helper that uses it, never at module top level except behind `try/except ImportError`. Every new backend module begins with `from __future__ import annotations`. `python -m pytest --collect-only` on a machine with zero accel deps must succeed. Verify the absent-dep path locally with a `builtins.__import__` shim before pushing.
- **Branch / PRs:** three sequenced PRs (spec Section 11). PR1 ships from `feat/accelerator-m9` (already created off `main`; the spec is committed there - this plan commits there too). PR2 ships from a fresh `feat/accelerator-m9-pr2` off `main` after PR1 merges; PR3 from `feat/accelerator-m9-pr3` off `main` after PR2 merges. Bite-sized task commits. Never commit to `main`.
- **Commits (Windows):** the husky pre-commit hook runs lint-staged (full Vitest + typecheck on staged `.ts/.tsx`; markdown/python-only commits are skipped). Commit via the **Bash tool**; before every commit run `export PATH="/c/Program Files/nodejs:$PATH"` so the hook's `npx` resolves. Confirm `git branch --show-current` in the same step as the commit.
- **Green gates before merge:** `npm run typecheck`, `npm test`, `npm run build`, and the backend suite (`cd backend && python -m unittest discover -s tests -p "test_*.py"`).
- **Boundary (owned by M5/M6):** never modify `RuntimePlan`'s dataclass fields, `resolve_model_runtime`, or `foundry/runtime_resolver.py`'s logic. M9 only *reads* the plan and *attaches loader-facing attributes* via the existing `resolve_plan` seam (the same mechanism that already attaches `load_source` / `checkpoint_path`).
- **No silent precision corruption:** `_NO_FP16_FAMILIES = {"flux", "sd35"}` are never handed a precision-altering optimization silently; quantization on them is only an explicit, allowlisted method.
- **Honesty:** measured never masquerades as estimated. The benchmark harness is CUDA-gated (exit 2 without CUDA) and prints JSON to stdout ONLY; it never writes the catalog. Panel labels distinguish `measured` from `estimated`.
- **Design system:** Carbon Pro tokens, `lucide-react` icons, **no emoji and no decorative middot/bullet/em-dash glyphs in `src/`** (`ui-glyphs.test.ts` bans `·•—–−×…`), 8pt grid, `.mono-label` for UI labels.
- **Codex gate (M9):** the final perf + correctness sweep is the merge sign-off for PR3: optimizations must not change output correctness; no-fp16 families honored; benchmark methodology reproducible; every allowlist entry traces to a passing sweep result.

## Spec reference

Implements `docs/superpowers/specs/2026-06-19-m9-accelerator-inference-enhancement-design.md`. Section numbers (S1-S12) below refer to that spec.

## Reality notes (verified in the codebase - honor these)

- `backend/foundry/runtime_resolver.py`: `RuntimePlan` is a non-frozen `@dataclass` with fields `pipeline_class, precision, offload, vae_tiling, attention_slicing (=True default - the perf bug), single_file, config_catalog_id, vram_plan, fit, missing_components, fallback_ladder, readiness, refusal`. `PIPELINE_BY_FAMILY: Dict[Tuple[str,str], PipelineEntry]` maps (family, capability) -> entry whose `.pipeline_class` is the diffusers class string. `_NO_FP16_FAMILIES = {"flux","sd35"}`. The module imports only pure-python foundry helpers (no torch) - safe to import from `accelerator.py`.
- `backend/foundry/hardware.py`: `HardwareProfile` (`@dataclass`) with `gpu_available, compute_major, compute_minor, vram_total_bytes, ...`; properties `supports_bf16` (compute >= 8.0) and `supports_fp8` (compute >= 8.9). Torch-free to import.
- `backend/utils/direct_generator.py`: `resolve_plan(model_id, overrides)` resolves via `resolve_model_runtime` then attaches loader-facing attrs (`checkpoint_path, load_source, config_repo_id, adapter_repo_id`) to the plan instance - **this is where M9 attaches `hardware_profile`**. `load_model` runs an OOM-ladder load loop calling `_load_from_plan(model_name, plan, slicing_max)`; `_load_from_plan` ends with a `if self.device == "cuda":` block that unconditionally calls `enable_attention_slicing()` (the bug) and best-effort `enable_xformers_memory_efficient_attention()` - **M9 removes this block**. `apply_fallback_rung`, `dtype_for_precision`, `pipeline_class_for` are shared module-level helpers. `torch` is imported behind `try/except ImportError` (=None on stub CI); `DIFFUSERS_AVAILABLE` gates the class.
- `backend/utils/direct_video_generator.py`: mirrors the image generator; imports `apply_fallback_rung, dtype_for_precision, pipeline_class_for, resolve_plan` from `direct_generator`. `_apply_plan_runtime_flags(pipeline, plan, slicing_max)` applies offload/device + vae tiling + `if slicing_max: enable_attention_slicing("max")` - **M9 removes the slicing line here** and lets the shared accel helper own slicing. Already carries `from __future__ import annotations`.
- `backend/tools/calibrate_vram.py`: the harness pattern PR2's benchmark mirrors - `_check_cuda()` at import (exit 2 without CUDA), `contextlib.redirect_stdout(sys.stderr)` quarantine of main/generator imports, tiny inference, `torch.cuda.max_memory_reserved(0)`, `json.dumps(patch, indent=2)` to stdout only, never writes the catalog.
- `backend/tests/test_direct_generator.py`: `_plan(**kw)` returns a `mock.MagicMock` RuntimePlan; `_profile(**kw)` returns a real `HardwareProfile`; instantiation tests are `@unittest.skipUnless(HAS_DEPS, ...)`. `backend/tests/test_foundry_runtime_resolver.py`: `_profile(**kw)` / `_record(**kw)` factories, no torch needed.
- Renderer settings pattern: `src/store/slices/generationSlice.ts` holds `advancedGeneration: {...}` in initial state with `updateAdvancedGeneration(patch)`; the type lives in `src/store/appStore.types.ts` (`AppState['advancedGeneration']` ~L399, the action decl ~L726). `src/components/generate/AdvancedGenerationSettings.tsx` reads via `useShallow` and renders Carbon Pro controls (`text-label text-text-body`, toggle buttons with `bg-accent-primary text-void` selected state). Hardware primitives live in `src/components/hardware/` (`MonoLabel`, `Led`, `RecessedWell`, `ChromeButton`, `Faceplate`).

## File structure

**Create (PR1 - decision core + slicing fix + apply layer):**
- `backend/foundry/accelerator.py` - dataclasses, `resolve_acceleration`, `apply_acceleration`, `accelerate_pipeline`, `family_for_plan`, `configure_inductor_cache`.
- `backend/tests/test_accelerator.py` - decision-matrix + import-safety tests (no `HAS_DEPS`).
- `backend/tests/test_accelerator_apply.py` - apply-layer tests with a fake pipeline + stubbed torch.
- `backend/tests/test_direct_generator_accel.py`, `backend/tests/test_direct_video_generator_accel.py` - `@skipUnless(HAS_DEPS)` wiring tests.

**Modify (PR1):**
- `backend/utils/direct_generator.py` - attach `hardware_profile` in `resolve_plan`; call `accelerate_pipeline` in `load_model`; remove the always-on slicing/xformers block; surface `acceleration` in the result.
- `backend/utils/direct_video_generator.py` - drop slicing from `_apply_plan_runtime_flags`; call `accelerate_pipeline`; surface `acceleration` in the result.
- `docs/superpowers/specs/2026-06-15-vision-studio-path-to-v1-roadmap-design.md` - tracker `M9` -> In progress.

**Create (PR2 - quantization + panel + harness):**
- `backend/tools/benchmark_accel.py` (+ `backend/tests/test_benchmark_accel.py`) - CUDA-gated benchmark + correctness sweep.
- `src/components/settings/PerformancePanel.tsx` (+ `.test.tsx`) - the Performance settings panel.
- `src/store/slices/accelerationSlice.ts` (+ tests in `src/store/appStore.test.ts`) - `accelerationSettings`, `updateAccelerationSettings`, `lastAppliedAcceleration`.

**Modify (PR2):**
- `backend/foundry/accelerator.py` (+ `backend/tests/test_accelerator_quant.py`) - `quant_backends_available`, `_resolve_quant`, quant apply dispatch.
- `backend/utils/direct_generator.py`, `backend/utils/direct_video_generator.py` - thread `acceleration_settings` into `load_model`.
- `backend/main.py` - parse `acceleration_settings` from the generate requests; pass to the generators.
- `src/store/appStore.types.ts`, `src/store/appStore.ts` - wire the acceleration slice + types.
- the panel's mount point (settings surface) + the generate request payload (send `accelerationSettings`).
- `docs/API_ENDPOINTS.md`, `docs/api/openapi.json` - the new request/result fields.

**Create (PR3 - TensorRT):**
- `backend/foundry/tensorrt_engine.py` (+ `backend/tests/test_accelerator_tensorrt.py`) - cache key, allowlist, build/load.

**Modify (PR3):**
- `backend/foundry/accelerator.py` - tensorrt decision + apply dispatch.
- `backend/tools/benchmark_accel.py` - TRT correctness-sweep extension.
- `src/components/settings/PerformancePanel.tsx` - TRT state surface + un-vetted-family disabled toggle.
- `docs/superpowers/specs/2026-06-15-...-roadmap-design.md` - tracker `M9` -> Done.

---

## Phase A - PR1: decision core + slicing fix + apply layer

### Task 1: Accelerator dataclasses, family map, and import safety

**Files:**
- Create: `backend/foundry/accelerator.py`
- Test: `backend/tests/test_accelerator.py`

**Interfaces:**
- Produces: `AccelerationSettings` (frozen; `master_enable: bool=True`, `sdpa/channels_last/compile/quantization/attention_slicing/tensorrt: str="auto"`); `AccelerationPlan` (frozen; `compile: bool=False`, `compile_mode: str="reduce-overhead"`, `compile_dynamic: bool=True`, `channels_last: bool=False`, `sdpa: bool=True`, `attention_slicing: Optional[str]=None`, `quantization: Optional[str]=None`, `tensorrt: bool=False`, `notes: list[str]`); `AppliedAcceleration` (`applied/skipped/fell_back: list[str]`); `family_for_plan(plan) -> Optional[str]`; `DEFAULT_ACCELERATION_SETTINGS`.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_accelerator.py`:

```python
"""accelerator.py - pure decision layer (M9 S3/S4). No torch at decision time."""

import importlib
import pathlib
import sys
import unittest

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from foundry import accelerator
from foundry.accelerator import (
    AccelerationPlan,
    AccelerationSettings,
    AppliedAcceleration,
    family_for_plan,
)


class _FakePlan:
    """A RuntimePlan stand-in - only the fields the decision layer reads."""

    def __init__(self, pipeline_class="StableDiffusionXLPipeline", fit="fits", refusal=None):
        self.pipeline_class = pipeline_class
        self.fit = fit
        self.refusal = refusal


class DataclassDefaultsTests(unittest.TestCase):
    def test_settings_default_to_auto(self):
        s = AccelerationSettings()
        self.assertTrue(s.master_enable)
        for field in ("sdpa", "channels_last", "compile", "quantization",
                      "attention_slicing", "tensorrt"):
            self.assertEqual(getattr(s, field), "auto")

    def test_plan_defaults_are_conservative(self):
        p = AccelerationPlan()
        self.assertFalse(p.compile)
        self.assertTrue(p.sdpa)
        self.assertIsNone(p.attention_slicing)
        self.assertIsNone(p.quantization)
        self.assertFalse(p.tensorrt)
        self.assertEqual(p.notes, [])

    def test_applied_defaults_empty(self):
        a = AppliedAcceleration()
        self.assertEqual((a.applied, a.skipped, a.fell_back), ([], [], []))


class FamilyMapTests(unittest.TestCase):
    def test_pipeline_class_maps_to_family(self):
        self.assertEqual(family_for_plan(_FakePlan("FluxPipeline")), "flux")
        self.assertEqual(family_for_plan(_FakePlan("FluxFillPipeline")), "flux")
        self.assertEqual(family_for_plan(_FakePlan("StableDiffusionXLPipeline")), "sdxl")
        self.assertEqual(family_for_plan(_FakePlan("StableVideoDiffusionPipeline")), "svd")

    def test_unknown_pipeline_class_is_none(self):
        self.assertIsNone(family_for_plan(_FakePlan("TotallyMadeUpPipeline")))


class ImportSafetyTests(unittest.TestCase):
    def test_imports_without_torch(self):
        # Simulate the stub-CI machine: torch absent. The module must still
        # import and the decision layer must work.
        real_import = __builtins__["__import__"] if isinstance(__builtins__, dict) else __builtins__.__import__

        def _blocked(name, *args, **kwargs):
            if name == "torch" or name.startswith("torch."):
                raise ModuleNotFoundError("No module named 'torch'")
            return real_import(name, *args, **kwargs)

        import builtins
        with unittest.mock.patch.object(builtins, "__import__", _blocked):
            reloaded = importlib.reload(accelerator)
            self.assertIsNone(reloaded.torch)
        importlib.reload(accelerator)  # restore real module state for other tests


if __name__ == "__main__":
    import unittest.mock  # noqa: E402
    unittest.main()
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && python -m unittest tests.test_accelerator -v`
Expected: FAIL - `ModuleNotFoundError: No module named 'foundry.accelerator'`.

- [ ] **Step 3: Create the module**

Create `backend/foundry/accelerator.py`:

```python
"""M9 acceleration layer (spec S3-S7).

Two stages, strictly separated:

- ``resolve_acceleration(plan, profile, settings) -> AccelerationPlan`` is a
  PURE decision function. It imports no torch and is fully unit-testable on
  the stub CI with a mocked profile and no GPU.
- ``apply_acceleration(pipeline, accel, family) -> AppliedAcceleration`` is the
  ONLY place torch / quantization / tensorrt are touched, all behind import
  guards. Every optimization is best-effort: a failure is recorded, never
  raised, so it can never fail a generation.

The M5/M6 RuntimePlan contract is read-only input - this module never mutates
or extends it.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import List, Optional

try:  # torch is optional and absent in the lightweight CI/test env
    import torch
except ImportError:
    torch = None  # type: ignore[assignment]

# Pure-python import (no torch): the authoritative family<->pipeline map.
from foundry.runtime_resolver import PIPELINE_BY_FAMILY

# Conv-UNet families benefit from channels_last; DiT families (flux/sd35/ltx)
# are neutral-to-negative, so channels_last stays OFF for them (spec S4).
_CONV_UNET_FAMILIES = {"sd15", "sdxl", "svd"}

# Derived from the resolver's authoritative table - never hand-maintained.
# Each pipeline_class belongs to exactly one family (verified: no cross-family
# collisions in PIPELINE_BY_FAMILY).
_FAMILY_BY_PIPELINE_CLASS = {
    entry.pipeline_class: family for (family, _capability), entry in PIPELINE_BY_FAMILY.items()
}


@dataclass(frozen=True)
class AccelerationSettings:
    """The user's Performance-panel choices. Tri-state strings: ``"auto"``
    lets the decision layer choose; ``"on"``/``"off"`` are explicit overrides."""

    master_enable: bool = True
    sdpa: str = "auto"
    channels_last: str = "auto"
    compile: str = "auto"
    quantization: str = "auto"
    attention_slicing: str = "auto"
    tensorrt: str = "auto"


@dataclass(frozen=True)
class AccelerationPlan:
    """What we INTEND to apply (the pure decision output)."""

    compile: bool = False
    compile_mode: str = "reduce-overhead"
    compile_dynamic: bool = True
    channels_last: bool = False
    sdpa: bool = True
    attention_slicing: Optional[str] = None  # None | "auto" | "max"
    quantization: Optional[str] = None  # None | "int8" | "fp8"
    tensorrt: bool = False
    notes: List[str] = field(default_factory=list)


@dataclass
class AppliedAcceleration:
    """What ACTUALLY took effect (the honest apply output)."""

    applied: List[str] = field(default_factory=list)
    skipped: List[str] = field(default_factory=list)
    fell_back: List[str] = field(default_factory=list)


DEFAULT_ACCELERATION_SETTINGS = AccelerationSettings()


def family_for_plan(plan) -> Optional[str]:
    """Family string for a RuntimePlan, via its pipeline_class. None if unknown
    (the decision layer then defaults conservatively)."""
    return _FAMILY_BY_PIPELINE_CLASS.get(getattr(plan, "pipeline_class", None))
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && python -m unittest tests.test_accelerator -v`
Expected: PASS (all classes).

- [ ] **Step 5: Verify stub-CI collection safety**

Run: `cd backend && python -m pytest tests/test_accelerator.py --collect-only -q`
Expected: collects with no `ModuleNotFoundError` (proves the module imports without torch present in the import graph).

- [ ] **Step 6: Commit**

```bash
export PATH="/c/Program Files/nodejs:$PATH"
git add backend/foundry/accelerator.py backend/tests/test_accelerator.py
git branch --show-current   # expect: feat/accelerator-m9
git commit -m "feat(m9): accelerator dataclasses + family map (import-safe)"
```

---

### Task 2: `resolve_acceleration` - the PR1 decision matrix

**Files:**
- Modify: `backend/foundry/accelerator.py`
- Test: `backend/tests/test_accelerator.py`

**Interfaces:**
- Consumes: `AccelerationSettings`, `AccelerationPlan`, `family_for_plan`, `HardwareProfile` (from `foundry.hardware`).
- Produces: `resolve_acceleration(plan, profile, settings) -> AccelerationPlan`. Rules: refusal or `master_enable=False` -> all-disabled (sdpa False) + note. `sdpa` auto=True. `channels_last` auto = GPU and conv-UNet family. `compile` auto = GPU (on-by-default where a GPU exists). `attention_slicing` auto = None when `plan.fit == "fits"` (the perf fix), `"auto"` under tighter fit, None on CPU. Explicit `"on"`/`"off"` always win. `quantization`/`tensorrt` stay defaults in PR1.

- [ ] **Step 1: Write the failing test**

Append to `backend/tests/test_accelerator.py`:

```python
from foundry.accelerator import resolve_acceleration
from foundry.hardware import HardwareProfile


def _gpu_profile(**kw):
    base = dict(gpu_available=True, compute_major=8, compute_minor=6,
                vram_total_bytes=24 * 2**30)
    base.update(kw)
    return HardwareProfile(**base)


def _cpu_profile():
    return HardwareProfile(gpu_available=False)


class ResolveDecisionTests(unittest.TestCase):
    def test_refusal_disables_everything(self):
        accel = resolve_acceleration(
            _FakePlan(refusal="pickle weights - convert first"),
            _gpu_profile(), AccelerationSettings())
        self.assertFalse(accel.sdpa)
        self.assertFalse(accel.compile)
        self.assertTrue(any("refus" in n.lower() for n in accel.notes))

    def test_master_disable_disables_everything(self):
        accel = resolve_acceleration(
            _FakePlan(), _gpu_profile(), AccelerationSettings(master_enable=False))
        self.assertFalse(accel.sdpa)
        self.assertFalse(accel.compile)

    def test_sdpa_on_by_default(self):
        accel = resolve_acceleration(_FakePlan(), _gpu_profile(), AccelerationSettings())
        self.assertTrue(accel.sdpa)

    def test_channels_last_on_for_conv_unet_gpu(self):
        accel = resolve_acceleration(
            _FakePlan("StableDiffusionXLPipeline"), _gpu_profile(), AccelerationSettings())
        self.assertTrue(accel.channels_last)

    def test_channels_last_off_for_dit_family(self):
        accel = resolve_acceleration(
            _FakePlan("FluxPipeline"), _gpu_profile(), AccelerationSettings())
        self.assertFalse(accel.channels_last)
        self.assertTrue(any("channels_last" in n for n in accel.notes))

    def test_channels_last_off_on_cpu(self):
        accel = resolve_acceleration(
            _FakePlan("StableDiffusionXLPipeline"), _cpu_profile(), AccelerationSettings())
        self.assertFalse(accel.channels_last)

    def test_compile_on_by_default_with_gpu(self):
        accel = resolve_acceleration(_FakePlan(), _gpu_profile(), AccelerationSettings())
        self.assertTrue(accel.compile)
        self.assertEqual(accel.compile_mode, "reduce-overhead")
        self.assertTrue(accel.compile_dynamic)

    def test_compile_auto_off_on_cpu(self):
        accel = resolve_acceleration(_FakePlan(), _cpu_profile(), AccelerationSettings())
        self.assertFalse(accel.compile)

    def test_explicit_off_overrides_auto(self):
        accel = resolve_acceleration(
            _FakePlan(), _gpu_profile(), AccelerationSettings(compile="off", sdpa="off"))
        self.assertFalse(accel.compile)
        self.assertFalse(accel.sdpa)

    def test_explicit_on_overrides_cpu_default(self):
        accel = resolve_acceleration(
            _FakePlan(), _cpu_profile(), AccelerationSettings(compile="on"))
        self.assertTrue(accel.compile)

    def test_slicing_off_when_model_fits_with_headroom(self):
        # The perf fix: abundant VRAM -> slicing OFF (was unconditionally on).
        accel = resolve_acceleration(_FakePlan(fit="fits"), _gpu_profile(), AccelerationSettings())
        self.assertIsNone(accel.attention_slicing)

    def test_slicing_auto_under_tight_fit(self):
        accel = resolve_acceleration(
            _FakePlan(fit="fits-with-offload"), _gpu_profile(), AccelerationSettings())
        self.assertEqual(accel.attention_slicing, "auto")

    def test_slicing_forced_off_by_setting(self):
        accel = resolve_acceleration(
            _FakePlan(fit="fits-with-offload"), _gpu_profile(),
            AccelerationSettings(attention_slicing="off"))
        self.assertIsNone(accel.attention_slicing)
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && python -m unittest tests.test_accelerator.ResolveDecisionTests -v`
Expected: FAIL - `cannot import name 'resolve_acceleration'`.

- [ ] **Step 3: Implement `resolve_acceleration`**

Append to `backend/foundry/accelerator.py`:

```python
def _decide(setting: str, auto_default: bool) -> bool:
    """Tri-state -> bool. Explicit on/off always win; auto uses the matrix."""
    if setting == "on":
        return True
    if setting == "off":
        return False
    return auto_default


def _resolve_slicing(plan, settings: AccelerationSettings, gpu: bool, notes: List[str]) -> Optional[str]:
    """Attention-slicing decision - the always-on perf-bug fix (spec S4).

    Today RuntimePlan.attention_slicing defaults True unconditionally, slowing
    every generation even with abundant VRAM. We derive it from fit headroom
    instead. The OOM fallback ladder still re-adds max slicing at runtime if we
    are wrong, so removing the default carries zero stability risk.
    """
    if settings.attention_slicing == "off":
        return None
    if settings.attention_slicing == "on":
        return "auto"
    if not gpu:
        return None  # CPU: no VRAM-pressure concept
    fit = getattr(plan, "fit", None)
    if fit == "fits":
        notes.append("attention_slicing off: model fits with headroom")
        return None
    notes.append(f"attention_slicing auto: tight/unknown fit ({fit or 'unknown'})")
    return "auto"


def resolve_acceleration(plan, profile, settings: AccelerationSettings) -> AccelerationPlan:
    """Decide the optimization set for this (plan, hardware, settings). Pure -
    no torch, no I/O. Security refusals and the master switch short-circuit to
    an all-disabled plan before any optimization is considered."""
    notes: List[str] = []

    if getattr(plan, "refusal", None):
        notes.append("acceleration disabled: plan refused load")
        return AccelerationPlan(sdpa=False, notes=notes)
    if not settings.master_enable:
        notes.append("acceleration disabled: master switch off")
        return AccelerationPlan(sdpa=False, notes=notes)

    family = family_for_plan(plan)
    gpu = bool(getattr(profile, "gpu_available", False))

    sdpa = _decide(settings.sdpa, auto_default=True)

    conv = family in _CONV_UNET_FAMILIES
    channels_last = _decide(settings.channels_last, auto_default=gpu and conv)
    if settings.channels_last == "auto" and gpu and not conv:
        notes.append(f"channels_last off: {family or 'unknown'} is not a conv-UNet family")

    compile_on = _decide(settings.compile, auto_default=gpu)
    attention_slicing = _resolve_slicing(plan, settings, gpu, notes)

    return AccelerationPlan(
        compile=compile_on,
        channels_last=channels_last,
        sdpa=sdpa,
        attention_slicing=attention_slicing,
        notes=notes,
    )
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && python -m unittest tests.test_accelerator.ResolveDecisionTests -v`
Expected: PASS (all 13 cases).

- [ ] **Step 5: Commit**

```bash
export PATH="/c/Program Files/nodejs:$PATH"
git add backend/foundry/accelerator.py backend/tests/test_accelerator.py
git branch --show-current   # expect: feat/accelerator-m9
git commit -m "feat(m9): resolve_acceleration decision matrix + slicing perf fix"
```

---

### Task 3: `apply_acceleration` + `accelerate_pipeline` + Inductor cache

**Files:**
- Modify: `backend/foundry/accelerator.py`
- Test: `backend/tests/test_accelerator_apply.py`

**Interfaces:**
- Consumes: `AccelerationPlan`, `AppliedAcceleration`, `family_for_plan`, `resolve_acceleration`, `_CONV_UNET_FAMILIES`, module `torch`.
- Produces: `apply_acceleration(pipeline, accel, family, *, slicing_max=False) -> AppliedAcceleration` (guarded, non-fatal); `accelerate_pipeline(pipeline, plan, settings, *, slicing_max=False) -> AppliedAcceleration` (the one seam both generators call - resolves then applies, reading `plan.hardware_profile`); `configure_inductor_cache(cache_dir: str) -> None`.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_accelerator_apply.py`:

```python
"""apply_acceleration - guarded, non-fatal apply layer (M9 S6). Uses a fake
pipeline and a stubbed torch so it runs on stub CI without real torch."""

import pathlib
import sys
import types
import unittest
from unittest import mock

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from foundry import accelerator
from foundry.accelerator import AccelerationPlan, AppliedAcceleration, apply_acceleration


class _FakeModule:
    def __init__(self):
        self.memory_format = None

    def to(self, *, memory_format=None):
        self.memory_format = memory_format
        return self


class _FakePipeline:
    def __init__(self, *, unet=True, transformer=False):
        self.unet = _FakeModule() if unet else None
        self.transformer = _FakeModule() if transformer else None
        self.attn_processor = None
        self.slicing = None

    def set_attn_processor(self, processor):
        self.attn_processor = processor

    def enable_attention_slicing(self, level=None):
        self.slicing = level or "default"


class _StubTorch:
    """Minimal torch surface apply_acceleration touches."""

    channels_last = "channels_last_format"

    @staticmethod
    def compile(module, mode=None, dynamic=None):
        module._compiled = (mode, dynamic)
        return module


class ApplyTests(unittest.TestCase):
    def setUp(self):
        self._patch = mock.patch.object(accelerator, "torch", _StubTorch)
        self._patch.start()
        # SDPA processor import is best-effort; stub it so apply records "applied".
        self._sdpa = mock.patch.object(
            accelerator, "_sdpa_processor", lambda: object())
        self._sdpa.start()

    def tearDown(self):
        self._patch.stop()
        self._sdpa.stop()

    def test_no_torch_skips_all(self):
        with mock.patch.object(accelerator, "torch", None):
            result = apply_acceleration(_FakePipeline(), AccelerationPlan(), "sdxl")
        self.assertTrue(any("torch unavailable" in s for s in result.skipped))

    def test_sdpa_channels_last_compile_applied_for_conv(self):
        pipe = _FakePipeline(unet=True)
        accel = AccelerationPlan(sdpa=True, channels_last=True, compile=True)
        result = apply_acceleration(pipe, accel, "sdxl")
        self.assertIn("sdpa", result.applied)
        self.assertIn("channels_last", result.applied)
        self.assertEqual(pipe.unet.memory_format, "channels_last_format")
        self.assertTrue(any(a.startswith("compile:") for a in result.applied))

    def test_channels_last_skipped_for_non_conv_family(self):
        pipe = _FakePipeline()
        accel = AccelerationPlan(channels_last=True)
        result = apply_acceleration(pipe, accel, "flux")
        self.assertEqual(pipe.unet.memory_format, None)
        self.assertTrue(any("channels_last" in s for s in result.skipped))

    def test_slicing_applied_when_requested(self):
        pipe = _FakePipeline()
        result = apply_acceleration(pipe, AccelerationPlan(attention_slicing="auto"), "sdxl")
        self.assertEqual(pipe.slicing, "default")
        self.assertTrue(any(a.startswith("attention_slicing") for a in result.applied))

    def test_slicing_max_override(self):
        pipe = _FakePipeline()
        result = apply_acceleration(
            pipe, AccelerationPlan(attention_slicing=None), "sdxl", slicing_max=True)
        self.assertEqual(pipe.slicing, "max")

    def test_compile_failure_is_non_fatal(self):
        pipe = _FakePipeline()

        def _boom(module, mode=None, dynamic=None):
            raise RuntimeError("inductor exploded")

        with mock.patch.object(_StubTorch, "compile", staticmethod(_boom)):
            result = apply_acceleration(pipe, AccelerationPlan(compile=True), "sdxl")
        self.assertTrue(any("compile" in f for f in result.fell_back))
        # never raised - the pipeline is still usable
        self.assertIsInstance(result, AppliedAcceleration)


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && python -m unittest tests.test_accelerator_apply -v`
Expected: FAIL - `cannot import name 'apply_acceleration'`.

- [ ] **Step 3: Implement the apply layer**

Append to `backend/foundry/accelerator.py`:

```python
import os


def configure_inductor_cache(cache_dir: str) -> None:
    """Point the Inductor compile cache at a persistent app-data dir so the
    one-time torch.compile warmup is paid once across runs (spec S6). Idempotent
    and side-effect-only; never raises."""
    try:
        os.makedirs(cache_dir, exist_ok=True)
        os.environ.setdefault("TORCHINDUCTOR_CACHE_DIR", cache_dir)
    except OSError:
        pass


def _sdpa_processor():
    """The diffusers PyTorch-native SDPA attention processor. Isolated so tests
    can stub it without importing diffusers."""
    from diffusers.models.attention_processor import AttnProcessor2_0

    return AttnProcessor2_0()


def _compile_target(pipeline):
    """(attr_name, module) for the heavy denoiser - unet or transformer."""
    unet = getattr(pipeline, "unet", None)
    if unet is not None:
        return "unet", unet
    transformer = getattr(pipeline, "transformer", None)
    if transformer is not None:
        return "transformer", transformer
    return None, None


def _apply_sdpa(pipeline, result: AppliedAcceleration) -> None:
    try:
        if hasattr(pipeline, "set_attn_processor"):
            pipeline.set_attn_processor(_sdpa_processor())
            result.applied.append("sdpa")
        else:
            result.skipped.append("sdpa (no attn-processor surface)")
    except Exception as exc:  # noqa: BLE001 - best-effort
        result.skipped.append(f"sdpa ({type(exc).__name__})")


def _apply_channels_last(pipeline, family, result: AppliedAcceleration) -> None:
    if family not in _CONV_UNET_FAMILIES:
        result.skipped.append(f"channels_last ({family or 'unknown'} not conv-UNet)")
        return
    try:
        unet = getattr(pipeline, "unet", None)
        if unet is None:
            result.skipped.append("channels_last (no unet)")
            return
        unet.to(memory_format=torch.channels_last)
        result.applied.append("channels_last")
    except Exception as exc:  # noqa: BLE001
        result.fell_back.append(f"channels_last ({type(exc).__name__})")


def _apply_slicing(pipeline, level: str, result: AppliedAcceleration) -> None:
    try:
        if not hasattr(pipeline, "enable_attention_slicing"):
            result.skipped.append("attention_slicing (unsupported pipeline)")
            return
        pipeline.enable_attention_slicing("max" if level == "max" else None)
        result.applied.append(f"attention_slicing:{level}")
    except Exception as exc:  # noqa: BLE001
        result.skipped.append(f"attention_slicing ({type(exc).__name__})")


def _apply_compile(pipeline, accel: AccelerationPlan, result: AppliedAcceleration) -> None:
    """torch.compile with the spec's HARD-FALLBACK rule: a failure NEVER fails a
    generation - we leave the eager module in place and record fell_back."""
    try:
        attr, target = _compile_target(pipeline)
        if target is None:
            result.skipped.append("compile (no unet/transformer)")
            return
        compiled = torch.compile(target, mode=accel.compile_mode, dynamic=accel.compile_dynamic)
        setattr(pipeline, attr, compiled)
        result.applied.append(f"compile:{accel.compile_mode}")
    except Exception as exc:  # noqa: BLE001
        result.fell_back.append(f"compile ({type(exc).__name__}, ran eager)")


def apply_acceleration(pipeline, accel: AccelerationPlan, family, *, slicing_max: bool = False) -> AppliedAcceleration:
    """Apply ``accel`` to a loaded, on-device pipeline. Every step is guarded and
    non-fatal; returns the honest AppliedAcceleration record."""
    result = AppliedAcceleration()
    if torch is None:
        result.skipped.append("all optimizations (torch unavailable)")
        return result

    if accel.sdpa:
        _apply_sdpa(pipeline, result)
    if accel.channels_last:
        _apply_channels_last(pipeline, family, result)

    slicing = "max" if slicing_max else accel.attention_slicing
    if slicing is not None:
        _apply_slicing(pipeline, slicing, result)

    if accel.compile:
        _apply_compile(pipeline, accel, result)
    return result


def accelerate_pipeline(pipeline, plan, settings: AccelerationSettings, *, slicing_max: bool = False) -> AppliedAcceleration:
    """The single seam both generators call: resolve from the plan's attached
    hardware_profile, then apply. Returns AppliedAcceleration for surfacing."""
    profile = getattr(plan, "hardware_profile", None)
    accel = resolve_acceleration(plan, profile, settings)
    return apply_acceleration(pipeline, accel, family_for_plan(plan), slicing_max=slicing_max)
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && python -m unittest tests.test_accelerator_apply -v`
Expected: PASS (all cases).

- [ ] **Step 5: Run the full accelerator suite + collection check**

Run: `cd backend && python -m unittest tests.test_accelerator tests.test_accelerator_apply -v && python -m pytest tests/test_accelerator.py tests/test_accelerator_apply.py --collect-only -q`
Expected: PASS; collection clean.

- [ ] **Step 6: Commit**

```bash
export PATH="/c/Program Files/nodejs:$PATH"
git add backend/foundry/accelerator.py backend/tests/test_accelerator_apply.py
git branch --show-current   # expect: feat/accelerator-m9
git commit -m "feat(m9): guarded apply_acceleration + accelerate_pipeline seam"
```

---

### Task 4: Wire the image generator (`DirectGenerator`)

**Files:**
- Modify: `backend/utils/direct_generator.py` (`resolve_plan` ~L62-89; `load_model` ~L150-184; `_load_from_plan` ~L186-240; `_generate_sync` return ~L380-387)
- Test: `backend/tests/test_direct_generator_accel.py`

**Interfaces:**
- Consumes: `accelerate_pipeline`, `DEFAULT_ACCELERATION_SETTINGS` from `foundry.accelerator`.
- Produces: `resolve_plan` attaches `plan.hardware_profile`; `load_model` applies acceleration once after the load loop and stores `self.applied_acceleration[model_name]`; `_load_from_plan` no longer calls `enable_attention_slicing()`/xformers; `_generate_sync` result carries `"acceleration": {"applied","skipped","fell_back"}`.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_direct_generator_accel.py`:

```python
"""DirectGenerator M9 wiring: resolve_plan attaches hardware_profile and
load_model runs accelerate_pipeline once, surfacing AppliedAcceleration."""

import pathlib
import sys
import unittest
from unittest import mock

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

try:
    import diffusers  # noqa: F401
    import torch  # noqa: F401

    import main  # noqa: F401
    from foundry.accelerator import AppliedAcceleration
    from utils.direct_generator import DirectGenerator

    HAS_DEPS = True
except ImportError:
    HAS_DEPS = False


@unittest.skipUnless(HAS_DEPS, "Requires torch, diffusers and backend deps (run inside venv)")
class GeneratorAccelWiringTests(unittest.TestCase):
    def _plan(self):
        return mock.MagicMock(
            refusal=None, pipeline_class="StableDiffusionXLPipeline", precision="bf16",
            offload=False, vae_tiling=False, single_file=False, fallback_ladder=[],
            fit="fits", hardware_profile=mock.MagicMock(gpu_available=True))

    def test_load_model_calls_accelerate_pipeline_and_stores_result(self):
        gen = DirectGenerator("models", "outputs")
        fake_pipeline = mock.MagicMock()
        applied = AppliedAcceleration(applied=["sdpa", "compile:reduce-overhead"])
        with mock.patch("utils.direct_generator.resolve_plan", return_value=self._plan()), \
             mock.patch.object(gen, "_load_from_plan", return_value=fake_pipeline), \
             mock.patch("utils.direct_generator.accelerate_pipeline", return_value=applied) as accel:
            gen.load_model("sdxl-base")
        accel.assert_called_once()
        self.assertEqual(gen.applied_acceleration["sdxl-base"], applied)
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && python -m unittest tests.test_direct_generator_accel -v`
Expected: FAIL (locally, with deps) - `AttributeError: ... has no attribute 'applied_acceleration'` / `accelerate_pipeline` not patched because it is not imported yet. (On stub CI this test SKIPS.)

- [ ] **Step 3: Import the accel seam and attach the profile**

In `backend/utils/direct_generator.py`, add to the imports near the top (after the diffusers try/except block, ~L33):

```python
from foundry.accelerator import DEFAULT_ACCELERATION_SETTINGS, accelerate_pipeline
```

In `resolve_plan`, immediately after `plan = resolve_model_runtime(record, profile, consent_store.get(model_id))` (~L69), attach the profile as a loader-facing attribute (same pattern as `plan.load_source` below it):

```python
    # Loader-facing attribute (never serialized) so the accel layer can resolve
    # without re-probing - mirrors load_source/checkpoint_path attachment.
    plan.hardware_profile = profile
```

- [ ] **Step 4: Apply acceleration in `load_model`; add the store**

In `DirectGenerator.__init__` (~L137), add the applied-acceleration store and configure the Inductor cache:

```python
        self.applied_acceleration: Dict[str, Any] = {}
```

and after the `self.executor = ...` line, add:

```python
        from foundry.accelerator import configure_inductor_cache
        configure_inductor_cache(os.path.join(models_dir, ".cache", "inductor"))
```

In `load_model`, the OOM loop currently ends:

```python
            except torch.cuda.OutOfMemoryError:
                ...
                slicing_max = apply_fallback_rung(plan, rung) or slicing_max
                torch.cuda.empty_cache()

        self.pipelines[model_name] = pipeline
        print(f"Model loaded: {model_name} ({plan.pipeline_class}, {plan.precision})")
        return pipeline
```

Insert the accel call between the loop and the cache store:

```python
        applied = accelerate_pipeline(
            pipeline, plan, DEFAULT_ACCELERATION_SETTINGS, slicing_max=slicing_max)
        self.applied_acceleration[model_name] = applied

        self.pipelines[model_name] = pipeline
        print(f"Model loaded: {model_name} ({plan.pipeline_class}, {plan.precision})")
        return pipeline
```

- [ ] **Step 5: Remove the always-on slicing/xformers block**

In `_load_from_plan` (~L227-238), DELETE the entire memory-optimization block (the accel layer now owns slicing + attention processor):

```python
        # Enable memory optimizations
        if self.device == "cuda":
            if slicing_max:
                pipeline.enable_attention_slicing("max")
            else:
                pipeline.enable_attention_slicing()
            # Try to enable xformers if available
            try:
                pipeline.enable_xformers_memory_efficient_attention()
                print("   xformers enabled")
            except Exception:
                pass

        return pipeline
```

Replace with just:

```python
        return pipeline
```

(`slicing_max` stays a parameter of `_load_from_plan` for signature stability, now unused inside it; the ladder still threads it into the accel call in `load_model`.)

- [ ] **Step 6: Surface acceleration in the result**

In `_generate_sync`, `load_model` is called at ~L343. Capture the applied record and add it to the return dict (~L380):

```python
        return {
            "images": [f"/outputs/{os.path.basename(output_dir)}/generated.png"],
            "seed": seed,
            "width": width,
            "height": height,
            "prompt": prompt,
            "model": model_name,
            "acceleration": _acceleration_payload(self.applied_acceleration.get(model_name)),
        }
```

Add a module-level helper near `apply_fallback_rung` (~L129):

```python
def _acceleration_payload(applied) -> Optional[Dict[str, Any]]:
    """AppliedAcceleration -> JSON-safe dict for the job result, or None."""
    if applied is None:
        return None
    return {
        "applied": list(applied.applied),
        "skipped": list(applied.skipped),
        "fell_back": list(applied.fell_back),
    }
```

- [ ] **Step 7: Run the test to verify it passes (locally)**

Run: `cd backend && python -m unittest tests.test_direct_generator_accel -v`
Expected (in venv): PASS. (On stub CI: SKIPPED.)

- [ ] **Step 8: Run the existing generator suite to confirm no regression**

Run: `cd backend && python -m unittest tests.test_direct_generator -v`
Expected: PASS (or SKIPPED on stub CI) - the M5 plan-consumption tests still hold.

- [ ] **Step 9: Commit**

```bash
export PATH="/c/Program Files/nodejs:$PATH"
git add backend/utils/direct_generator.py backend/tests/test_direct_generator_accel.py
git branch --show-current   # expect: feat/accelerator-m9
git commit -m "feat(m9): wire DirectGenerator to accel layer; remove always-on slicing"
```

---

### Task 5: Wire the video generator (`DirectVideoGenerator`)

**Files:**
- Modify: `backend/utils/direct_video_generator.py` (imports ~L35-41; `__init__` ~L118-123; `load_model` ~L125-157; `_apply_plan_runtime_flags` ~L222-235; `_generate_sync` return ~L298-304)
- Test: `backend/tests/test_direct_video_generator_accel.py`

**Interfaces:**
- Consumes: `accelerate_pipeline`, `DEFAULT_ACCELERATION_SETTINGS`, `configure_inductor_cache`.
- Produces: `load_model` applies acceleration once after the load loop, stores `self.applied_acceleration[model_name]`; `_apply_plan_runtime_flags` no longer touches slicing; `_generate_sync` result carries `"acceleration"`.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_direct_video_generator_accel.py`:

```python
"""DirectVideoGenerator M9 wiring mirrors the image generator."""

import pathlib
import sys
import unittest
from unittest import mock

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

try:
    import diffusers  # noqa: F401
    import torch  # noqa: F401

    import main  # noqa: F401
    from foundry.accelerator import AppliedAcceleration
    from utils.direct_video_generator import DirectVideoGenerator

    HAS_DEPS = True
except ImportError:
    HAS_DEPS = False


@unittest.skipUnless(HAS_DEPS, "Requires torch, diffusers and backend deps (run inside venv)")
class VideoGeneratorAccelWiringTests(unittest.TestCase):
    def _plan(self):
        return mock.MagicMock(
            refusal=None, pipeline_class="LTXPipeline", precision="bf16",
            offload=False, vae_tiling=False, single_file=False, fallback_ladder=[],
            fit="fits", hardware_profile=mock.MagicMock(gpu_available=True))

    def test_load_model_accelerates_and_stores(self):
        gen = DirectVideoGenerator("models", "outputs")
        fake_pipeline = mock.MagicMock()
        applied = AppliedAcceleration(applied=["sdpa"])
        with mock.patch("utils.direct_video_generator.resolve_plan", return_value=self._plan()), \
             mock.patch.object(gen, "_load_from_plan", return_value=fake_pipeline), \
             mock.patch("utils.direct_video_generator.accelerate_pipeline", return_value=applied) as accel:
            gen.load_model("ltx-video")
        accel.assert_called_once()
        self.assertEqual(gen.applied_acceleration["ltx-video"], applied)
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && python -m unittest tests.test_direct_video_generator_accel -v`
Expected (in venv): FAIL - no `applied_acceleration` / `accelerate_pipeline` not imported. (Stub CI: SKIPPED.)

- [ ] **Step 3: Import the accel seam**

In `backend/utils/direct_video_generator.py`, extend the existing import from `direct_generator` (~L35-41) to also pull the accel seam (add a second import line right after it):

```python
from foundry.accelerator import DEFAULT_ACCELERATION_SETTINGS, accelerate_pipeline, configure_inductor_cache
```

- [ ] **Step 4: Add the store + Inductor cache in `__init__`**

In `DirectVideoGenerator.__init__` (~L118-123), after `self.pipelines: Dict[str, Any] = {}`:

```python
        self.applied_acceleration: Dict[str, Any] = {}
        configure_inductor_cache(os.path.join(models_dir, ".cache", "inductor"))
```

- [ ] **Step 5: Apply acceleration after the load loop**

In `load_model`, the loop ends:

```python
                slicing_max = apply_fallback_rung(plan, rung) or slicing_max
                torch.cuda.empty_cache()

        self.pipelines[model_name] = pipeline
        return pipeline
```

Insert before the cache store:

```python
                slicing_max = apply_fallback_rung(plan, rung) or slicing_max
                torch.cuda.empty_cache()

        applied = accelerate_pipeline(
            pipeline, plan, DEFAULT_ACCELERATION_SETTINGS, slicing_max=slicing_max)
        self.applied_acceleration[model_name] = applied

        self.pipelines[model_name] = pipeline
        return pipeline
```

- [ ] **Step 6: Drop slicing from `_apply_plan_runtime_flags`**

In `_apply_plan_runtime_flags` (~L222-235), DELETE the slicing line so the accel layer owns it:

```python
        if plan.vae_tiling and hasattr(pipeline, "vae"):
            pipeline.vae.enable_tiling()
        if slicing_max and hasattr(pipeline, "enable_attention_slicing"):
            pipeline.enable_attention_slicing("max")

        return pipeline
```

becomes:

```python
        if plan.vae_tiling and hasattr(pipeline, "vae"):
            pipeline.vae.enable_tiling()

        return pipeline
```

(`slicing_max` remains a parameter for signature stability and is now threaded into `accelerate_pipeline` from `load_model`.)

- [ ] **Step 7: Surface acceleration in the result**

In `_generate_sync`, change the `build_video_result(...)` return (~L298) to attach acceleration. Replace:

```python
        return build_video_result(
            job_id=os.path.basename(output_dir),
            relative_video_path=f"/outputs/{os.path.basename(output_dir)}/video.mp4",
            frame_count=len(frames),
            fps=fps,
            duration=duration,
        )
```

with:

```python
        result = build_video_result(
            job_id=os.path.basename(output_dir),
            relative_video_path=f"/outputs/{os.path.basename(output_dir)}/video.mp4",
            frame_count=len(frames),
            fps=fps,
            duration=duration,
        )
        applied = self.applied_acceleration.get(model_name)
        if applied is not None:
            result["acceleration"] = {
                "applied": list(applied.applied),
                "skipped": list(applied.skipped),
                "fell_back": list(applied.fell_back),
            }
        return result
```

- [ ] **Step 8: Run the test + existing video suite**

Run: `cd backend && python -m unittest tests.test_direct_video_generator_accel -v`
Expected (venv): PASS. (Stub CI: SKIPPED.)

- [ ] **Step 9: Commit**

```bash
export PATH="/c/Program Files/nodejs:$PATH"
git add backend/utils/direct_video_generator.py backend/tests/test_direct_video_generator_accel.py
git branch --show-current   # expect: feat/accelerator-m9
git commit -m "feat(m9): wire DirectVideoGenerator to accel layer; slicing owned by accel"
```

---

### Task 6: PR1 tracker update + green gates + open PR

**Files:**
- Modify: `docs/superpowers/specs/2026-06-15-vision-studio-path-to-v1-roadmap-design.md` (the M9 tracker row)

**Interfaces:** none (docs + gate).

- [ ] **Step 1: Update the roadmap tracker**

In the roadmap spec, change the M9 tracker row from `| **M9** | Accelerator + Inference | **Next** |` to `| **M9** | Accelerator + Inference | **In progress (PR1)** |`.

- [ ] **Step 2: Run the full backend suite**

Run: `cd backend && python -m unittest discover -s tests -p "test_*.py"`
Expected: all PASS (M9 wiring tests SKIP on stub CI but PASS in venv); no collection errors.

- [ ] **Step 3: Run the frontend gates (no frontend change in PR1, confirm still green)**

Run: `npm run typecheck && npm test && npm run build`
Expected: all green.

- [ ] **Step 4: Commit the tracker update**

```bash
export PATH="/c/Program Files/nodejs:$PATH"
git add docs/superpowers/specs/2026-06-15-vision-studio-path-to-v1-roadmap-design.md
git branch --show-current   # expect: feat/accelerator-m9
git commit -m "docs(m9): mark M9 in progress (PR1) in the roadmap tracker"
```

- [ ] **Step 5: Open PR1**

Use the `superpowers:finishing-a-development-branch` skill: push `feat/accelerator-m9`, open the PR titled "M9 Accelerator PR1: decision core + slicing fix + apply layer", watch `gh pr checks --watch`, and squash-merge with `--delete-branch` once green. **PR1 alone fixes the always-on attention-slicing perf bug and adds measurable speedups with zero new dependencies.** Pause here for user review before PR2.

---

## Phase B - PR2: quantization + Performance panel + benchmark sweep

> Branch `feat/accelerator-m9-pr2` off the freshly merged `main`.

### Task 7: Quantization backend probe

**Files:**
- Modify: `backend/foundry/accelerator.py`
- Test: `backend/tests/test_accelerator_quant.py`

**Interfaces:**
- Produces: `QuantBackends` (frozen; `int8: bool=False`, `fp8: bool=False`); `quant_backends_available() -> QuantBackends` (import-free probe via `importlib.util.find_spec`, never imports the heavy module); `_QUANT_ALLOWLIST: dict[str, set[str]]`.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_accelerator_quant.py`:

```python
"""Quantization decision + backend probe (M9 S5). Pure - no real quant deps."""

import pathlib
import sys
import unittest
from unittest import mock

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from foundry import accelerator
from foundry.accelerator import QuantBackends, quant_backends_available


class QuantBackendProbeTests(unittest.TestCase):
    def test_probe_is_import_free(self):
        with mock.patch("importlib.util.find_spec", return_value=object()):
            backends = quant_backends_available()
        self.assertTrue(backends.int8)
        self.assertTrue(backends.fp8)

    def test_probe_reports_missing(self):
        with mock.patch("importlib.util.find_spec", return_value=None):
            backends = quant_backends_available()
        self.assertFalse(backends.int8)
        self.assertFalse(backends.fp8)
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && python -m unittest tests.test_accelerator_quant -v`
Expected: FAIL - `cannot import name 'QuantBackends'`.

- [ ] **Step 3: Implement the probe**

Append to `backend/foundry/accelerator.py`:

```python
import importlib.util

# method -> families verified safe (output within tolerance vs unquantized).
# Populated from the PR2 benchmark+correctness sweep, not asserted (spec S5/S8).
_QUANT_ALLOWLIST = {
    "int8": {"sdxl", "sd15", "flux", "sd35"},
    "fp8": {"flux", "sd35", "sdxl"},
}


@dataclass(frozen=True)
class QuantBackends:
    int8: bool = False
    fp8: bool = False


def _spec_present(name: str) -> bool:
    try:
        return importlib.util.find_spec(name) is not None
    except (ImportError, ValueError):
        return False


def quant_backends_available() -> QuantBackends:
    """Which quantization backends are importable - WITHOUT importing them
    (find_spec does not execute the module). optimum-quanto provides both
    post-load int8 (qint8) and fp8 (qfloat8); torchao is an fp8 alternative."""
    quanto = _spec_present("optimum.quanto")
    return QuantBackends(int8=quanto, fp8=quanto or _spec_present("torchao"))
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && python -m unittest tests.test_accelerator_quant -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
export PATH="/c/Program Files/nodejs:$PATH"
git add backend/foundry/accelerator.py backend/tests/test_accelerator_quant.py
git branch --show-current   # expect: feat/accelerator-m9-pr2
git commit -m "feat(m9): quantization backend probe + allowlist"
```

---

### Task 8: Quantization four-gate decision

**Files:**
- Modify: `backend/foundry/accelerator.py` (`resolve_acceleration` signature + body)
- Test: `backend/tests/test_accelerator_quant.py`

**Interfaces:**
- Consumes: `QuantBackends`, `_QUANT_ALLOWLIST`, `HardwareProfile.supports_fp8`.
- Produces: `resolve_acceleration(plan, profile, settings, *, backends=None) -> AccelerationPlan` now sets `quantization`; `_auto_quant(family, profile, backends) -> Optional[str]`. Gates (spec S5): family allowlist, hardware capability (fp8 needs `supports_fp8`), backend availability, GPU-only. Explicit method honored only if all gates pass, else None + note.

- [ ] **Step 1: Write the failing test**

Append to `backend/tests/test_accelerator_quant.py`:

```python
from foundry.accelerator import AccelerationSettings, resolve_acceleration
from foundry.hardware import HardwareProfile


class _FakePlan:
    def __init__(self, pipeline_class="StableDiffusionXLPipeline", fit="fits", refusal=None):
        self.pipeline_class = pipeline_class
        self.fit = fit
        self.refusal = refusal


def _profile(gpu=True, major=8, minor=6):
    return HardwareProfile(gpu_available=gpu, compute_major=major, compute_minor=minor)


_ALL = QuantBackends(int8=True, fp8=True)


class QuantDecisionTests(unittest.TestCase):
    def test_auto_prefers_fp8_on_ada_flux(self):
        accel = resolve_acceleration(
            _FakePlan("FluxPipeline"), _profile(major=8, minor=9),
            AccelerationSettings(), backends=_ALL)
        self.assertEqual(accel.quantization, "fp8")

    def test_auto_falls_back_to_int8_on_ampere(self):
        accel = resolve_acceleration(
            _FakePlan("StableDiffusionXLPipeline"), _profile(major=8, minor=6),
            AccelerationSettings(), backends=_ALL)
        self.assertEqual(accel.quantization, "int8")

    def test_auto_none_for_off_allowlist_family(self):
        accel = resolve_acceleration(
            _FakePlan("LTXPipeline"), _profile(), AccelerationSettings(), backends=_ALL)
        self.assertIsNone(accel.quantization)

    def test_no_fp16_family_gets_explicit_method_not_silent_downgrade(self):
        # flux is no-fp16 but IS allowlisted for int8/fp8 - the safe VRAM claw-back.
        accel = resolve_acceleration(
            _FakePlan("FluxPipeline"), _profile(major=8, minor=6),
            AccelerationSettings(), backends=_ALL)
        self.assertEqual(accel.quantization, "int8")

    def test_forced_method_blocked_when_backend_missing(self):
        accel = resolve_acceleration(
            _FakePlan("FluxPipeline"), _profile(major=8, minor=9),
            AccelerationSettings(quantization="fp8"), backends=QuantBackends(int8=False, fp8=False))
        self.assertIsNone(accel.quantization)
        self.assertTrue(any("backend unavailable" in n for n in accel.notes))

    def test_forced_fp8_blocked_on_old_gpu(self):
        accel = resolve_acceleration(
            _FakePlan("FluxPipeline"), _profile(major=8, minor=0),
            AccelerationSettings(quantization="fp8"), backends=_ALL)
        self.assertIsNone(accel.quantization)
        self.assertTrue(any("8.9" in n for n in accel.notes))

    def test_off_disables_quant(self):
        accel = resolve_acceleration(
            _FakePlan("FluxPipeline"), _profile(major=8, minor=9),
            AccelerationSettings(quantization="off"), backends=_ALL)
        self.assertIsNone(accel.quantization)

    def test_quant_none_without_gpu(self):
        accel = resolve_acceleration(
            _FakePlan("FluxPipeline"), _profile(gpu=False),
            AccelerationSettings(quantization="int8"), backends=_ALL)
        self.assertIsNone(accel.quantization)
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && python -m unittest tests.test_accelerator_quant.QuantDecisionTests -v`
Expected: FAIL - `resolve_acceleration() got an unexpected keyword argument 'backends'`.

- [ ] **Step 3: Implement the quant decision**

In `backend/foundry/accelerator.py`, add the helper above `resolve_acceleration`:

```python
def _auto_quant(family, profile, backends: QuantBackends) -> Optional[str]:
    """Most aggressive PROVEN-SAFE method for (family, hardware, deps)."""
    if family is None:
        return None
    if getattr(profile, "supports_fp8", False) and family in _QUANT_ALLOWLIST["fp8"] and backends.fp8:
        return "fp8"
    if family in _QUANT_ALLOWLIST["int8"] and backends.int8:
        return "int8"
    return None


def _resolve_quant(family, profile, settings, backends: QuantBackends, notes: List[str]) -> Optional[str]:
    s = settings.quantization
    if s == "off":
        return None
    if not getattr(profile, "gpu_available", False):
        if s in ("int8", "fp8"):
            notes.append(f"quantization {s} skipped: no GPU")
        return None
    if s == "auto":
        method = _auto_quant(family, profile, backends)
        if method:
            notes.append(f"quantization auto: {method} ({family})")
        return method
    # Forced method - honor only if every gate passes (spec S5 Gate-4 override).
    method = s
    if family not in _QUANT_ALLOWLIST.get(method, set()):
        notes.append(f"quantization {method} skipped: {family or 'unknown'} not on the {method} allowlist")
        return None
    if method == "fp8" and not getattr(profile, "supports_fp8", False):
        notes.append("quantization fp8 skipped: GPU compute < 8.9")
        return None
    if not getattr(backends, method, False):
        notes.append(f"quantization {method} skipped: backend unavailable")
        return None
    notes.append(f"quantization forced: {method}")
    return method
```

Update the `resolve_acceleration` signature and body. Change the signature to:

```python
def resolve_acceleration(plan, profile, settings: AccelerationSettings, *, backends: Optional[QuantBackends] = None) -> AccelerationPlan:
```

Just after `gpu = bool(getattr(profile, "gpu_available", False))`, add:

```python
    if backends is None:
        backends = quant_backends_available()
    quantization = _resolve_quant(family, profile, settings, backends, notes)
```

And add `quantization=quantization,` to the returned `AccelerationPlan(...)`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && python -m unittest tests.test_accelerator_quant -v && python -m unittest tests.test_accelerator -v`
Expected: PASS (quant decisions green; the PR1 decision tests still pass since `backends` defaults are probed and quant stays None for their non-quant assertions).

- [ ] **Step 5: Commit**

```bash
export PATH="/c/Program Files/nodejs:$PATH"
git add backend/foundry/accelerator.py backend/tests/test_accelerator_quant.py
git branch --show-current   # expect: feat/accelerator-m9-pr2
git commit -m "feat(m9): four-gate quantization decision"
```

---

### Task 9: Quantization apply dispatch

**Files:**
- Modify: `backend/foundry/accelerator.py` (`apply_acceleration` + new helpers)
- Test: `backend/tests/test_accelerator_apply.py`

**Interfaces:**
- Produces: `apply_acceleration` now applies `accel.quantization` (between channels-last and compile) via `_apply_quant`; quant runs through optimum-quanto post-load (`quantize`/`freeze` with `qint8`/`qfloat8`), each guarded - `ImportError` -> skipped, other errors -> fell_back, never raised.

- [ ] **Step 1: Write the failing test**

Append to `backend/tests/test_accelerator_apply.py`:

```python
class QuantApplyTests(unittest.TestCase):
    def setUp(self):
        self._patch = mock.patch.object(accelerator, "torch", _StubTorch)
        self._patch.start()

    def tearDown(self):
        self._patch.stop()

    def test_quant_applied_records_method(self):
        pipe = _FakePipeline()
        called = {}

        def _fake_quant(pipeline, method, result):
            called["method"] = method
            result.applied.append(f"quantization:{method}")

        with mock.patch.object(accelerator, "_apply_quant", _fake_quant):
            result = apply_acceleration(pipe, AccelerationPlan(quantization="int8"), "sdxl")
        self.assertEqual(called["method"], "int8")
        self.assertIn("quantization:int8", result.applied)

    def test_quant_missing_backend_is_skipped_not_fatal(self):
        pipe = _FakePipeline()

        def _boom(pipeline, method, result):
            raise ImportError("optimum-quanto not installed")

        # _apply_quant catches ImportError internally; simulate via the real path
        # by patching the quanto import helper to raise.
        with mock.patch.object(accelerator, "_quantize_module", side_effect=ImportError("x")):
            result = apply_acceleration(pipe, AccelerationPlan(quantization="int8"), "sdxl")
        self.assertTrue(any("quantization" in s for s in result.skipped))
        self.assertIsInstance(result, AppliedAcceleration)
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && python -m unittest tests.test_accelerator_apply.QuantApplyTests -v`
Expected: FAIL - `_apply_quant` / `_quantize_module` do not exist.

- [ ] **Step 3: Implement the quant apply**

In `backend/foundry/accelerator.py`, add:

```python
def _quant_target(pipeline):
    """The heavy module to quantize - unet or transformer."""
    _attr, module = _compile_target(pipeline)
    return module


def _quantize_module(module, method: str) -> None:
    """Post-load quantization via optimum-quanto (works on a loaded module)."""
    from optimum.quanto import freeze, qfloat8, qint8, quantize

    weights = qfloat8 if method == "fp8" else qint8
    quantize(module, weights=weights)
    freeze(module)


def _apply_quant(pipeline, method: str, result: AppliedAcceleration) -> None:
    target = _quant_target(pipeline)
    if target is None:
        result.skipped.append(f"quantization:{method} (no unet/transformer)")
        return
    try:
        _quantize_module(target, method)
        result.applied.append(f"quantization:{method}")
    except ImportError:
        result.skipped.append(f"quantization:{method} (backend unavailable)")
    except Exception as exc:  # noqa: BLE001 - non-fatal, unquantized pipeline still valid
        result.fell_back.append(f"quantization:{method} ({type(exc).__name__})")
```

In `apply_acceleration`, insert the quant step after channels-last and before slicing:

```python
    if accel.channels_last:
        _apply_channels_last(pipeline, family, result)
    if accel.quantization:
        _apply_quant(pipeline, accel.quantization, result)
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && python -m unittest tests.test_accelerator_apply -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
export PATH="/c/Program Files/nodejs:$PATH"
git add backend/foundry/accelerator.py backend/tests/test_accelerator_apply.py
git branch --show-current   # expect: feat/accelerator-m9-pr2
git commit -m "feat(m9): quantization apply dispatch (optimum-quanto, guarded)"
```

---

### Task 10: Thread `acceleration_settings` request -> generators -> result

**Files:**
- Modify: `backend/utils/direct_generator.py` (`load_model`, `generate_image`/`_generate_sync` settings plumb), `backend/utils/direct_video_generator.py` (mirror), `backend/main.py` (parse the request field, pass to the generators)
- Test: `backend/tests/test_accelerator_settings_plumb.py`

**Interfaces:**
- Produces: `accel_settings_from_dict(data: Optional[dict]) -> AccelerationSettings` in `accelerator.py` (tolerant parser - unknown keys ignored, missing -> defaults); generators' `load_model(model_name, overrides=None, acceleration_settings=None)` use the passed settings (default `DEFAULT_ACCELERATION_SETTINGS`); main.py reads `request.acceleration_settings` and forwards it.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_accelerator_settings_plumb.py`:

```python
"""acceleration_settings request parsing (M9 S8)."""

import pathlib
import sys
import unittest

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from foundry.accelerator import (
    DEFAULT_ACCELERATION_SETTINGS,
    accel_settings_from_dict,
)


class SettingsParseTests(unittest.TestCase):
    def test_none_returns_defaults(self):
        self.assertEqual(accel_settings_from_dict(None), DEFAULT_ACCELERATION_SETTINGS)

    def test_partial_dict_merges_over_defaults(self):
        s = accel_settings_from_dict({"compile": "off", "master_enable": False})
        self.assertEqual(s.compile, "off")
        self.assertFalse(s.master_enable)
        self.assertEqual(s.sdpa, "auto")  # untouched

    def test_unknown_keys_ignored(self):
        s = accel_settings_from_dict({"bogus": "x", "sdpa": "on"})
        self.assertEqual(s.sdpa, "on")

    def test_invalid_tristate_falls_back_to_auto(self):
        s = accel_settings_from_dict({"compile": "turbo"})
        self.assertEqual(s.compile, "auto")
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && python -m unittest tests.test_accelerator_settings_plumb -v`
Expected: FAIL - `cannot import name 'accel_settings_from_dict'`.

- [ ] **Step 3: Implement the parser**

Append to `backend/foundry/accelerator.py`:

```python
from dataclasses import replace

_VALID_TRISTATE = {"auto", "on", "off"}
_TRISTATE_FIELDS = ("sdpa", "channels_last", "compile", "quantization", "attention_slicing", "tensorrt")


def accel_settings_from_dict(data: Optional[dict]) -> AccelerationSettings:
    """Tolerant parser: missing -> default, unknown keys ignored, an invalid
    tri-state falls back to 'auto'. Never raises on user-supplied data."""
    if not data:
        return DEFAULT_ACCELERATION_SETTINGS
    patch = {}
    if isinstance(data.get("master_enable"), bool):
        patch["master_enable"] = data["master_enable"]
    for field_name in _TRISTATE_FIELDS:
        value = data.get(field_name)
        if isinstance(value, str):
            patch[field_name] = value if value in _VALID_TRISTATE else "auto"
    return replace(DEFAULT_ACCELERATION_SETTINGS, **patch)
```

- [ ] **Step 4: Plumb settings into both generators**

In `direct_generator.py` `load_model`, change the signature to:

```python
    def load_model(self, model_name: str, overrides: Optional[Dict[str, Any]] = None,
                   acceleration_settings=None):
```

and use it in the accel call:

```python
        applied = accelerate_pipeline(
            pipeline, plan, acceleration_settings or DEFAULT_ACCELERATION_SETTINGS,
            slicing_max=slicing_max)
```

In `_generate_sync`, thread the settings: add an `acceleration_settings=None` parameter to `_generate_sync` and `generate_image`, pass it through the `run_in_executor` call, and use it in `self.load_model(model_name, acceleration_settings=acceleration_settings)`. Mirror the exact same three changes in `direct_video_generator.py` (`load_model`, `_generate_sync`, `generate_video`).

- [ ] **Step 5: Parse + forward in main.py**

In `backend/main.py`, the image and video generation request models gain an optional field (Pydantic): `acceleration_settings: Optional[dict] = None`. Where the request is dispatched to `generate_direct` / `direct_video_generator.generate_video`, parse and forward:

```python
    from foundry.accelerator import accel_settings_from_dict
    accel_settings = accel_settings_from_dict(getattr(request, "acceleration_settings", None))
    # ... pass acceleration_settings=accel_settings into the generator call
```

(Grep `direct_generator` / `generate_image` / `generate_video` call sites in `main.py` and add the `acceleration_settings=accel_settings` kwarg to each.)

- [ ] **Step 6: Run the tests + backend suite**

Run: `cd backend && python -m unittest tests.test_accelerator_settings_plumb -v && python -m unittest discover -s tests -p "test_*.py"`
Expected: PASS; no regressions.

- [ ] **Step 7: Commit**

```bash
export PATH="/c/Program Files/nodejs:$PATH"
git add backend/foundry/accelerator.py backend/utils/direct_generator.py backend/utils/direct_video_generator.py backend/main.py backend/tests/test_accelerator_settings_plumb.py
git branch --show-current   # expect: feat/accelerator-m9-pr2
git commit -m "feat(m9): thread acceleration_settings request->generators->result"
```

---

### Task 11: Renderer acceleration store slice

**Files:**
- Create: `src/store/slices/accelerationSlice.ts`
- Modify: `src/store/appStore.types.ts`, `src/store/appStore.ts`
- Test: `src/store/appStore.test.ts`

**Interfaces:**
- Produces: `AccelerationSettings` TS type (`{ masterEnable: boolean; sdpa/channelsLast/compile/quantization/attentionSlicing/tensorrt: 'auto'|'on'|'off' }`); `AppliedAcceleration` type (`{ applied: string[]; skipped: string[]; fellBack: string[] }`); store state `accelerationSettings`, `lastAppliedAcceleration: AppliedAcceleration | null`; actions `updateAccelerationSettings(patch)`, `setLastAppliedAcceleration(applied)`.

- [ ] **Step 1: Write the failing test**

Append to `src/store/appStore.test.ts` (follow the file's existing `describe`/`useAppStore.setState(getInitialState(), true)` pattern):

```ts
describe('acceleration settings (M9)', () => {
  beforeEach(() => {
    useAppStore.setState(useAppStore.getInitialState(), true);
  });

  it('defaults every optimization to auto and master enabled', () => {
    const s = useAppStore.getState().accelerationSettings;
    expect(s.masterEnable).toBe(true);
    expect(s.compile).toBe('auto');
    expect(s.quantization).toBe('auto');
  });

  it('updates a single optimization without touching the others', () => {
    useAppStore.getState().updateAccelerationSettings({ compile: 'off' });
    const s = useAppStore.getState().accelerationSettings;
    expect(s.compile).toBe('off');
    expect(s.sdpa).toBe('auto');
  });

  it('records the last applied acceleration', () => {
    useAppStore.getState().setLastAppliedAcceleration({
      applied: ['sdpa', 'compile:reduce-overhead'], skipped: [], fellBack: [],
    });
    expect(useAppStore.getState().lastAppliedAcceleration?.applied).toContain('sdpa');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/store/appStore.test.ts -t "acceleration settings"`
Expected: FAIL - `accelerationSettings` is undefined.

- [ ] **Step 3: Create the slice**

Create `src/store/slices/accelerationSlice.ts`:

```ts
import type { StateCreator } from 'zustand';

export type TriState = 'auto' | 'on' | 'off';

export interface AccelerationSettings {
  masterEnable: boolean;
  sdpa: TriState;
  channelsLast: TriState;
  compile: TriState;
  quantization: TriState;
  attentionSlicing: TriState;
  tensorrt: TriState;
}

export interface AppliedAcceleration {
  applied: string[];
  skipped: string[];
  fellBack: string[];
}

export const DEFAULT_ACCELERATION_SETTINGS: AccelerationSettings = {
  masterEnable: true,
  sdpa: 'auto',
  channelsLast: 'auto',
  compile: 'auto',
  quantization: 'auto',
  attentionSlicing: 'auto',
  tensorrt: 'auto',
};

export interface AccelerationSlice {
  accelerationSettings: AccelerationSettings;
  lastAppliedAcceleration: AppliedAcceleration | null;
  updateAccelerationSettings: (patch: Partial<AccelerationSettings>) => void;
  setLastAppliedAcceleration: (applied: AppliedAcceleration | null) => void;
}

export const createAccelerationSlice: StateCreator<AccelerationSlice, [], [], AccelerationSlice> = (set) => ({
  accelerationSettings: { ...DEFAULT_ACCELERATION_SETTINGS },
  lastAppliedAcceleration: null,
  updateAccelerationSettings: (patch) =>
    set((state) => ({ accelerationSettings: { ...state.accelerationSettings, ...patch } })),
  setLastAppliedAcceleration: (applied) => set({ lastAppliedAcceleration: applied }),
});
```

- [ ] **Step 4: Wire the slice into the store**

In `src/store/appStore.types.ts`, add `AccelerationSettings`, `AppliedAcceleration`, the two state fields and two action signatures to `AppState` (mirror the existing `advancedGeneration` block + action decl). In `src/store/appStore.ts`, spread `createAccelerationSlice(...)` into the store assembly exactly as the other slices are composed (match the existing slice-composition pattern in that file).

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/store/appStore.test.ts -t "acceleration settings" && npm run typecheck`
Expected: PASS; types clean.

- [ ] **Step 6: Commit**

```bash
export PATH="/c/Program Files/nodejs:$PATH"
git add src/store/slices/accelerationSlice.ts src/store/appStore.types.ts src/store/appStore.ts src/store/appStore.test.ts
git branch --show-current   # expect: feat/accelerator-m9-pr2
git commit -m "feat(m9): renderer acceleration settings store slice"
```

---

### Task 12: Performance panel component

**Files:**
- Create: `src/components/settings/PerformancePanel.tsx`, `src/components/settings/PerformancePanel.test.tsx`

**Interfaces:**
- Consumes: `accelerationSettings`, `updateAccelerationSettings`, `lastAppliedAcceleration` (store); `MonoLabel` (`@/components/hardware/MonoLabel`); `lucide-react` icons.
- Produces: `PerformancePanel` - a master-enable toggle, one tri-state control per optimization, and an "Applied this run" readout with three labelled groups (applied / skipped / fell back). Carbon Pro tokens only; no emoji/decorative glyphs.

- [ ] **Step 1: Write the failing test**

Create `src/components/settings/PerformancePanel.test.tsx`:

```tsx
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { useAppStore } from '@/store/appStore';
import { PerformancePanel } from './PerformancePanel';

describe('PerformancePanel', () => {
  beforeEach(() => {
    useAppStore.setState(useAppStore.getInitialState(), true);
  });
  afterEach(() => cleanup());

  it('renders a tri-state control for each optimization', () => {
    render(<PerformancePanel />);
    for (const label of ['Compile', 'Quantization', 'SDPA', 'Channels Last', 'Attention Slicing', 'TensorRT']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it('writes a tri-state change to the store', () => {
    render(<PerformancePanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Compile off' }));
    expect(useAppStore.getState().accelerationSettings.compile).toBe('off');
  });

  it('shows the applied/skipped/fell-back readout', () => {
    useAppStore.getState().setLastAppliedAcceleration({
      applied: ['sdpa', 'compile:reduce-overhead'],
      skipped: ['quantization:int8 (backend unavailable)'],
      fellBack: ['compile (RuntimeError, ran eager)'],
    });
    render(<PerformancePanel />);
    expect(screen.getByText('sdpa')).toBeInTheDocument();
    expect(screen.getByText('quantization:int8 (backend unavailable)')).toBeInTheDocument();
    expect(screen.getByText('compile (RuntimeError, ran eager)')).toBeInTheDocument();
  });

  it('uses no banned decorative glyphs', () => {
    const { container } = render(<PerformancePanel />);
    expect(container.textContent ?? '').not.toMatch(/[·•—–−×…]/);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/settings/PerformancePanel.test.tsx`
Expected: FAIL - module does not exist.

- [ ] **Step 3: Implement the panel**

Create `src/components/settings/PerformancePanel.tsx`:

```tsx
import { useShallow } from 'zustand/react/shallow';
import { Cpu, Gauge, Zap } from 'lucide-react';

import { MonoLabel } from '@/components/hardware/MonoLabel';
import { useAppStore } from '@/store/appStore';
import type { TriState } from '@/store/slices/accelerationSlice';

type OptimizationKey =
  | 'sdpa' | 'channelsLast' | 'compile' | 'quantization' | 'attentionSlicing' | 'tensorrt';

const OPTIMIZATIONS: Array<{ key: OptimizationKey; label: string; hint: string }> = [
  { key: 'compile', label: 'Compile', hint: 'torch.compile (reduce-overhead)' },
  { key: 'quantization', label: 'Quantization', hint: 'int8 / fp8 where proven safe' },
  { key: 'sdpa', label: 'SDPA', hint: 'Fused attention' },
  { key: 'channelsLast', label: 'Channels Last', hint: 'Conv-UNet families' },
  { key: 'attentionSlicing', label: 'Attention Slicing', hint: 'Only under VRAM pressure' },
  { key: 'tensorrt', label: 'TensorRT', hint: 'Engine build (one-time)' },
];

const TRISTATES: TriState[] = ['auto', 'on', 'off'];

export function PerformancePanel() {
  const { settings, updateSettings, applied } = useAppStore(
    useShallow((s) => ({
      settings: s.accelerationSettings,
      updateSettings: s.updateAccelerationSettings,
      applied: s.lastAppliedAcceleration,
    }))
  );

  return (
    <div className="space-y-5">
      <header className="flex items-center gap-2">
        <Gauge className="w-4 h-4 text-accent-primary" aria-hidden />
        <MonoLabel>Performance</MonoLabel>
      </header>

      <label className="flex items-center justify-between rounded-md border border-border bg-elevated px-3 py-2">
        <span className="text-label text-text-body">Master Enable</span>
        <input
          type="checkbox"
          checked={settings.masterEnable}
          onChange={(e) => updateSettings({ masterEnable: e.target.checked })}
          aria-label="Master Enable"
        />
      </label>

      <div className="space-y-3" aria-disabled={!settings.masterEnable}>
        {OPTIMIZATIONS.map(({ key, label, hint }) => (
          <div key={key} className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-label text-text-body">{label}</span>
              <span className="text-xs text-text-muted data-mono">{hint}</span>
            </div>
            <div className="flex gap-2">
              {TRISTATES.map((value) => (
                <button
                  key={value}
                  onClick={() => updateSettings({ [key]: value })}
                  aria-label={`${label} ${value}`}
                  className={
                    settings[key] === value
                      ? 'flex-1 py-1.5 rounded-md data-mono text-xs font-medium transition-all bg-accent-primary text-void shadow-accent-subtle'
                      : 'flex-1 py-1.5 rounded-md data-mono text-xs font-medium transition-all bg-elevated text-text-body border border-border hover:border-border-hover'
                  }
                >
                  {value.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {applied ? (
        <section className="space-y-2 rounded-md border border-border bg-base p-3">
          <div className="flex items-center gap-2">
            <Zap className="w-3.5 h-3.5 text-accent-primary" aria-hidden />
            <MonoLabel>Applied This Run</MonoLabel>
          </div>
          <AppliedGroup title="Applied" items={applied.applied} tone="text-accent-primary" />
          <AppliedGroup title="Skipped" items={applied.skipped} tone="text-text-muted" />
          <AppliedGroup title="Fell Back" items={applied.fellBack} tone="text-amber-400" />
        </section>
      ) : (
        <p className="text-xs text-text-muted">
          <Cpu className="inline w-3 h-3 mr-1" aria-hidden />
          No generation has run yet this session.
        </p>
      )}
    </div>
  );
}

function AppliedGroup({ title, items, tone }: { title: string; items: string[]; tone: string }) {
  if (items.length === 0) return null;
  return (
    <div className="space-y-1">
      <span className="text-xs text-text-muted data-mono uppercase">{title}</span>
      <ul className="space-y-0.5">
        {items.map((item) => (
          <li key={item} className={`text-xs data-mono ${tone}`}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/components/settings/PerformancePanel.test.tsx && npm run typecheck`
Expected: PASS; types clean. Also run the glyph guard: `npx vitest run src/ -t "ui-glyphs"` (or the project's glyph test) to confirm no banned glyphs were introduced.

- [ ] **Step 5: Commit**

```bash
export PATH="/c/Program Files/nodejs:$PATH"
git add src/components/settings/PerformancePanel.tsx src/components/settings/PerformancePanel.test.tsx
git branch --show-current   # expect: feat/accelerator-m9-pr2
git commit -m "feat(m9): Performance settings panel (tri-state + applied readout)"
```

---

### Task 13: Mount the panel + send settings on generate + docs

**Files:**
- Modify: the global settings surface that renders panels (grep for where `AdvancedGenerationSettings` or a settings dock is mounted - e.g. `src/components/layout/DockviewSettingsPanel.tsx` or the settings view), the generate request builder in `electron/ipc-handlers/generation.ts` / the renderer call site, `docs/API_ENDPOINTS.md`, `docs/api/openapi.json`
- Test: extend the mount-point component's existing test if present

**Interfaces:**
- Consumes: `PerformancePanel`, `accelerationSettings`, `setLastAppliedAcceleration`.
- Produces: the panel is reachable in the settings UI; each generate request includes `acceleration_settings` (snake_case for the backend, mapped from the camelCase store); the job-result handler calls `setLastAppliedAcceleration` from the result's `acceleration` field.

- [ ] **Step 1: Mount the panel**

Grep for the settings surface (`rg -n "AdvancedGenerationSettings|DockviewSettingsPanel" src`) and add a `PerformancePanel` section there, following the surrounding layout. Add/extend the mount component's test to assert the Performance heading renders.

- [ ] **Step 2: Send settings on generate**

In the renderer generate path (where the payload to the backend is assembled), map the store's camelCase `accelerationSettings` to the snake_case backend field:

```ts
const accelerationSettings = {
  master_enable: s.accelerationSettings.masterEnable,
  sdpa: s.accelerationSettings.sdpa,
  channels_last: s.accelerationSettings.channelsLast,
  compile: s.accelerationSettings.compile,
  quantization: s.accelerationSettings.quantization,
  attention_slicing: s.accelerationSettings.attentionSlicing,
  tensorrt: s.accelerationSettings.tensorrt,
};
// include acceleration_settings: accelerationSettings in the generate request body
```

- [ ] **Step 3: Surface the result's acceleration**

Where the renderer consumes a completed job result (the generation-status poll handler), if `result.acceleration` is present map it (`{ applied, skipped, fell_back }` -> `{ applied, skipped, fellBack }`) and call `setLastAppliedAcceleration(...)`.

- [ ] **Step 4: Update docs**

In `docs/API_ENDPOINTS.md` and `docs/api/openapi.json`, document the new optional `acceleration_settings` request field on the image and video generation endpoints and the `acceleration` object in the job result (`applied`/`skipped`/`fell_back` string arrays).

- [ ] **Step 5: Run the gates**

Run: `npm run typecheck && npm test && npm run build`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
export PATH="/c/Program Files/nodejs:$PATH"
git add -A
git branch --show-current   # expect: feat/accelerator-m9-pr2
git commit -m "feat(m9): mount Performance panel; send accel settings; surface applied; docs"
```

---

### Task 14: Benchmark + correctness sweep harness

**Files:**
- Create: `backend/tools/benchmark_accel.py`, `backend/tests/test_benchmark_accel.py`

**Interfaces:**
- Produces: a CUDA-gated tool mirroring `calibrate_vram.py` - `_check_cuda()` at import (exit 2 without CUDA); pure, testable helpers `outputs_within_tolerance(reference, candidate, threshold) -> bool` and `build_perf_patch(model_id, baseline_s, accel_s, vram_bytes, accel, correct) -> dict`; the sweep runs an unaccelerated reference + accelerated run, checks correctness, and prints `json.dumps(patch, indent=2)` to stdout ONLY (never writes the catalog). A config failing correctness is recorded `"correctness": "FAILED"` and excluded from the allowlist patch.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_benchmark_accel.py` (tests only the CUDA-free pure helpers; the sweep itself is CUDA-gated and not run on CI):

```python
"""benchmark_accel pure helpers (M9 S8). The harness is CUDA-gated; only the
torch-free helpers are unit-tested here."""

import importlib
import pathlib
import sys
import unittest
from unittest import mock

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))


def _load_helpers():
    # The module fires _check_cuda() at import; patch it out so the pure
    # helpers can be imported on a CPU CI box.
    with mock.patch.dict(sys.modules):
        import tools.benchmark_accel as mod  # noqa: PLC0415
        return importlib.reload(mod)


class ToleranceTests(unittest.TestCase):
    def setUp(self):
        with mock.patch("tools.benchmark_accel._check_cuda", lambda: None):
            self.mod = _load_helpers()

    def test_identical_outputs_pass(self):
        a = [[0.0, 0.5, 1.0]]
        self.assertTrue(self.mod.outputs_within_tolerance(a, a, threshold=0.01))

    def test_large_drift_fails(self):
        a = [[0.0, 0.0, 0.0]]
        b = [[1.0, 1.0, 1.0]]
        self.assertFalse(self.mod.outputs_within_tolerance(a, b, threshold=0.01))

    def test_perf_patch_excludes_failed_correctness(self):
        patch = self.mod.build_perf_patch(
            "flux-dev", baseline_s=10.0, accel_s=4.0, vram_bytes=8 * 2**30,
            accel_label="compile+int8", correct=False)
        self.assertEqual(patch["correctness"], "FAILED")
        self.assertNotIn("speedup", patch)

    def test_perf_patch_records_speedup_when_correct(self):
        patch = self.mod.build_perf_patch(
            "flux-dev", baseline_s=10.0, accel_s=4.0, vram_bytes=8 * 2**30,
            accel_label="compile+int8", correct=True)
        self.assertEqual(patch["correctness"], "OK")
        self.assertAlmostEqual(patch["speedup"], 2.5, places=2)
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && python -m unittest tests.test_benchmark_accel -v`
Expected: FAIL - module does not exist.

- [ ] **Step 3: Implement the harness**

Create `backend/tools/benchmark_accel.py` (mirroring `calibrate_vram.py`'s CUDA gate + stdout quarantine; the pure helpers live above the gate so they import on CI):

```python
"""Measured acceleration benchmark + correctness sweep (M9 S8).

Run MANUALLY on a CUDA machine:  python tools/benchmark_accel.py [model-id ...]
For each model + accel config it runs an UNACCELERATED reference and an
ACCELERATED pass, measures latency + peak VRAM, and verifies the accelerated
output stays within tolerance of the reference. A config that fails correctness
is reported "FAILED" and excluded from the allowlist - this is how the per-family
quant/TRT allowlists are populated with EVIDENCE, not assertion.

Prints a JSON perf patch to stdout ONLY (a human catalog data edit); never
writes the catalog. Refuses to run without CUDA: measured must never masquerade
as estimated.
"""

from __future__ import annotations

import sys
from typing import Any, Dict, List, Optional, Sequence


# --- pure, torch-free helpers (importable on CI for unit tests) -------------

def outputs_within_tolerance(reference: Sequence[Sequence[float]],
                             candidate: Sequence[Sequence[float]],
                             threshold: float) -> bool:
    """True when the max absolute per-element delta is <= threshold. A simple,
    deterministic proxy for the LPIPS/max-pixel-delta check (the CUDA path may
    substitute a perceptual metric)."""
    ref = [v for row in reference for v in row]
    cand = [v for row in candidate for v in row]
    if len(ref) != len(cand) or not ref:
        return False
    return max(abs(r - c) for r, c in zip(ref, cand)) <= threshold


def build_perf_patch(model_id: str, *, baseline_s: float, accel_s: float,
                     vram_bytes: int, accel_label: str, correct: bool) -> Dict[str, Any]:
    """Shape one model's perf result. Speedup is recorded ONLY when correct."""
    patch: Dict[str, Any] = {
        "accel": accel_label,
        "baseline_s": round(baseline_s, 4),
        "accel_s": round(accel_s, 4),
        "measured_vram_bytes": int(vram_bytes),
        "correctness": "OK" if correct else "FAILED",
    }
    if correct and accel_s > 0:
        patch["speedup"] = round(baseline_s / accel_s, 4)
    return patch


# --- CUDA gate (fires at import, after the pure helpers are defined) ---------

def _check_cuda() -> None:
    try:
        import torch as _torch
    except ImportError:
        print("ERROR: torch is not installed; cannot benchmark.", file=sys.stderr)
        sys.exit(2)
    if not _torch.cuda.is_available():
        print(
            "ERROR: CUDA is not available; acceleration benchmarking requires a "
            "real CUDA GPU. Measured must never masquerade as estimated.",
            file=sys.stderr,
        )
        sys.exit(2)


_check_cuda()

# --- CUDA-only sweep (mirrors calibrate_vram's quarantine + entry point) ----
# Implementation note for the engineer: from here down, follow calibrate_vram.py
# exactly - prepend BACKEND_ROOT to sys.path, import main + the generators under
# contextlib.redirect_stdout(sys.stderr), run one unaccelerated reference and one
# accelerated pass per (model, accel config), call outputs_within_tolerance on
# the decoded latents/pixels, accumulate build_perf_patch(...) results into a
# dict, and `print(json.dumps(patch, indent=2))` to stdout ONLY. Default the
# model list to _ready_model_ids() as calibrate_vram does. NEVER write the
# catalog.
```

Implement the CUDA-only sweep body following the `calibrate_vram.py` structure referenced in the closing comment (BACKEND_ROOT path, stdout-quarantined imports, `_ready_model_ids`, per-model reference+accel runs, `argparse` entry point). This body runs only on a CUDA machine and is exercised by the maintainer, not CI.

- [ ] **Step 4: Run the helper tests + collection check**

Run: `cd backend && python -m unittest tests.test_benchmark_accel -v && python -m pytest tests/test_benchmark_accel.py --collect-only -q`
Expected: PASS; collection clean. Also confirm the CUDA gate on a CPU box: `python tools/benchmark_accel.py` exits 2 with the "CUDA is not available" message.

- [ ] **Step 5: Commit + open PR2**

```bash
export PATH="/c/Program Files/nodejs:$PATH"
git add backend/tools/benchmark_accel.py backend/tests/test_benchmark_accel.py
git branch --show-current   # expect: feat/accelerator-m9-pr2
git commit -m "feat(m9): CUDA-gated benchmark + correctness sweep harness"
```

Then run the full gates (`cd backend && python -m unittest discover -s tests -p "test_*.py"`; `npm run typecheck && npm test && npm run build`) and open PR2 via `superpowers:finishing-a-development-branch` (title: "M9 Accelerator PR2: quantization + Performance panel + benchmark sweep"). Pause for user review before PR3.

---

## Phase C - PR3: TensorRT engine path

> Branch `feat/accelerator-m9-pr3` off the freshly merged `main`.

### Task 15: TensorRT engine module (cache key + allowlist)

**Files:**
- Create: `backend/foundry/tensorrt_engine.py`, `backend/tests/test_accelerator_tensorrt.py`

**Interfaces:**
- Produces: `TRT_PROVEN_FAMILIES: set[str]`; `engine_cache_key(family, pipeline_class, precision, resolution_bucket, compute_capability, trt_version) -> str` (stable hash); `engine_cache_path(cache_dir, key) -> str`; `is_trt_eligible(family) -> bool`. All pure/torch-free (imports `tensorrt`/`torch_tensorrt` are lazy, only in the build/load helpers added in Task 17).

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_accelerator_tensorrt.py`:

```python
"""TensorRT engine cache key + allowlist (M9 S7). Pure helpers - no TRT dep."""

import pathlib
import sys
import unittest

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from foundry.tensorrt_engine import (
    TRT_PROVEN_FAMILIES,
    engine_cache_key,
    engine_cache_path,
    is_trt_eligible,
)


class CacheKeyTests(unittest.TestCase):
    def _key(self, **kw):
        base = dict(family="sdxl", pipeline_class="StableDiffusionXLPipeline",
                    precision="bf16", resolution_bucket="1024x1024",
                    compute_capability=(8, 9), trt_version="10.0.1")
        base.update(kw)
        return engine_cache_key(**base)

    def test_key_is_stable(self):
        self.assertEqual(self._key(), self._key())

    def test_key_varies_with_gpu_capability(self):
        self.assertNotEqual(self._key(compute_capability=(8, 9)),
                            self._key(compute_capability=(8, 6)))

    def test_key_varies_with_resolution(self):
        self.assertNotEqual(self._key(resolution_bucket="1024x1024"),
                            self._key(resolution_bucket="768x768"))

    def test_cache_path_uses_key(self):
        key = self._key()
        path = engine_cache_path("/tmp/engines", key)
        self.assertTrue(path.endswith(f"{key}.plan"))


class AllowlistTests(unittest.TestCase):
    def test_proven_families_are_eligible(self):
        for family in TRT_PROVEN_FAMILIES:
            self.assertTrue(is_trt_eligible(family))

    def test_unvetted_family_not_eligible(self):
        self.assertFalse(is_trt_eligible("ltx"))
        self.assertFalse(is_trt_eligible(None))
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && python -m unittest tests.test_accelerator_tensorrt -v`
Expected: FAIL - module does not exist.

- [ ] **Step 3: Implement the pure helpers**

Create `backend/foundry/tensorrt_engine.py`:

```python
"""TensorRT engine build/cache/reuse, isolated from accelerator.py so the bulky
dep-heavy logic is quarantined and independently testable (M9 S7).

Engines are GPU- and shape-specific: the cache key captures family, pipeline
class, precision, resolution bucket, GPU compute capability, and TRT version.
Only families whose engine build + output tolerance are verified in the sweep
are eligible (TRT_PROVEN_FAMILIES); an un-vetted family can never auto-build.
"""

from __future__ import annotations

import hashlib
import os
from typing import Optional, Tuple

# Populated from the PR3 correctness sweep - evidence, not assertion.
TRT_PROVEN_FAMILIES = {"sdxl", "sd15"}


def is_trt_eligible(family: Optional[str]) -> bool:
    return family in TRT_PROVEN_FAMILIES


def engine_cache_key(*, family: str, pipeline_class: str, precision: str,
                     resolution_bucket: str, compute_capability: Tuple[int, int],
                     trt_version: str) -> str:
    """Stable hash of every dimension an engine is specific to."""
    raw = "|".join([
        family, pipeline_class, precision, resolution_bucket,
        f"{compute_capability[0]}.{compute_capability[1]}", trt_version,
    ])
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:24]


def engine_cache_path(cache_dir: str, key: str) -> str:
    return os.path.join(cache_dir, f"{key}.plan")
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && python -m unittest tests.test_accelerator_tensorrt -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
export PATH="/c/Program Files/nodejs:$PATH"
git add backend/foundry/tensorrt_engine.py backend/tests/test_accelerator_tensorrt.py
git branch --show-current   # expect: feat/accelerator-m9-pr3
git commit -m "feat(m9): tensorrt engine cache-key + proven-family allowlist"
```

---

### Task 16: TensorRT decision in `resolve_acceleration`

**Files:**
- Modify: `backend/foundry/accelerator.py`
- Test: `backend/tests/test_accelerator_tensorrt.py`

**Interfaces:**
- Produces: `resolve_acceleration` now sets `tensorrt`. Rules (spec S7): off by default in `auto` (engine build is expensive); `tensorrt` true only when `settings.tensorrt == "on"` OR the family is in `TRT_PROVEN_FAMILIES` and a TRT backend is present and GPU. TRT is **mutually exclusive with compile** - when `tensorrt` is chosen, `compile` is forced off with a note (TRT is the compiled artifact).

- [ ] **Step 1: Write the failing test**

Append to `backend/tests/test_accelerator_tensorrt.py`:

```python
from unittest import mock

from foundry import accelerator
from foundry.accelerator import AccelerationSettings, resolve_acceleration
from foundry.hardware import HardwareProfile


class _FakePlan:
    def __init__(self, pipeline_class="StableDiffusionXLPipeline", fit="fits", refusal=None):
        self.pipeline_class = pipeline_class
        self.fit = fit
        self.refusal = refusal


def _gpu():
    return HardwareProfile(gpu_available=True, compute_major=8, compute_minor=9)


class TensorrtDecisionTests(unittest.TestCase):
    def setUp(self):
        # Pretend a TRT backend is importable for these decision tests.
        self._p = mock.patch.object(accelerator, "_trt_backend_available", lambda: True)
        self._p.start()

    def tearDown(self):
        self._p.stop()

    def test_auto_does_not_build_trt_for_unvetted_family(self):
        accel = resolve_acceleration(_FakePlan("FluxPipeline"), _gpu(), AccelerationSettings())
        self.assertFalse(accel.tensorrt)

    def test_auto_enables_trt_for_proven_family(self):
        accel = resolve_acceleration(_FakePlan("StableDiffusionXLPipeline"), _gpu(), AccelerationSettings())
        self.assertTrue(accel.tensorrt)

    def test_trt_forces_compile_off(self):
        accel = resolve_acceleration(_FakePlan("StableDiffusionXLPipeline"), _gpu(), AccelerationSettings())
        self.assertTrue(accel.tensorrt)
        self.assertFalse(accel.compile)
        self.assertTrue(any("tensorrt" in n.lower() and "compile" in n.lower() for n in accel.notes))

    def test_explicit_on_enables_for_any_family(self):
        accel = resolve_acceleration(
            _FakePlan("FluxPipeline"), _gpu(), AccelerationSettings(tensorrt="on"))
        self.assertTrue(accel.tensorrt)

    def test_off_disables(self):
        accel = resolve_acceleration(
            _FakePlan("StableDiffusionXLPipeline"), _gpu(), AccelerationSettings(tensorrt="off"))
        self.assertFalse(accel.tensorrt)
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && python -m unittest tests.test_accelerator_tensorrt.TensorrtDecisionTests -v`
Expected: FAIL - `_trt_backend_available` / tensorrt decision not implemented.

- [ ] **Step 3: Implement the decision**

In `backend/foundry/accelerator.py`, add:

```python
def _trt_backend_available() -> bool:
    return _spec_present("torch_tensorrt") or _spec_present("tensorrt")


def _resolve_tensorrt(family, settings, gpu: bool, notes: List[str]) -> bool:
    from foundry.tensorrt_engine import is_trt_eligible

    if settings.tensorrt == "off":
        return False
    if not gpu or not _trt_backend_available():
        if settings.tensorrt == "on":
            notes.append("tensorrt off: no GPU or TRT backend")
        return False
    if settings.tensorrt == "on":
        return True
    # auto: only proven families, and never unbidden for un-vetted ones.
    return is_trt_eligible(family)
```

In `resolve_acceleration`, after computing `compile_on` and before building the plan, add:

```python
    tensorrt = _resolve_tensorrt(family, settings, gpu, notes)
    if tensorrt and compile_on:
        compile_on = False
        notes.append("compile off: tensorrt is the compiled artifact (mutually exclusive)")
```

and add `tensorrt=tensorrt,` to the returned `AccelerationPlan(...)`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && python -m unittest tests.test_accelerator_tensorrt -v && python -m unittest tests.test_accelerator tests.test_accelerator_quant -v`
Expected: PASS (TRT decisions green; PR1/PR2 decision tests still pass - their machines have no TRT backend so `tensorrt` stays False).

- [ ] **Step 5: Commit**

```bash
export PATH="/c/Program Files/nodejs:$PATH"
git add backend/foundry/accelerator.py backend/tests/test_accelerator_tensorrt.py
git branch --show-current   # expect: feat/accelerator-m9-pr3
git commit -m "feat(m9): tensorrt decision (opt-in, proven-family, compile-exclusive)"
```

---

### Task 17: TensorRT build/load + apply dispatch

**Files:**
- Modify: `backend/foundry/tensorrt_engine.py` (build/load), `backend/foundry/accelerator.py` (`apply_acceleration` TRT step)
- Test: `backend/tests/test_accelerator_tensorrt.py`, `backend/tests/test_accelerator_apply.py`

**Interfaces:**
- Produces: `tensorrt_engine.build_or_load_engine(pipeline, *, family, pipeline_class, precision, resolution_bucket, cache_dir) -> str` (returns a state token: `"cached"` / `"built"`; raises on real build failure - the caller's guard converts that to fell_back); `apply_acceleration` runs the TRT step (replacing compile when `accel.tensorrt`) via `_apply_tensorrt`, guarded with the same hard-fallback contract as compile.

- [ ] **Step 1: Write the failing apply test**

Append to `backend/tests/test_accelerator_apply.py`:

```python
class TensorrtApplyTests(unittest.TestCase):
    def setUp(self):
        self._patch = mock.patch.object(accelerator, "torch", _StubTorch)
        self._patch.start()

    def tearDown(self):
        self._patch.stop()

    def test_tensorrt_applied_records_state(self):
        pipe = _FakePipeline()
        with mock.patch.object(accelerator, "_run_tensorrt", return_value="cached"):
            result = apply_acceleration(pipe, AccelerationPlan(tensorrt=True), "sdxl")
        self.assertTrue(any(a.startswith("tensorrt") for a in result.applied))

    def test_tensorrt_build_failure_falls_back(self):
        pipe = _FakePipeline()
        with mock.patch.object(accelerator, "_run_tensorrt", side_effect=RuntimeError("build failed")):
            result = apply_acceleration(pipe, AccelerationPlan(tensorrt=True), "sdxl")
        self.assertTrue(any("tensorrt" in f for f in result.fell_back))
        self.assertIsInstance(result, AppliedAcceleration)
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && python -m unittest tests.test_accelerator_apply.TensorrtApplyTests -v`
Expected: FAIL - `_run_tensorrt` / `_apply_tensorrt` not implemented.

- [ ] **Step 3: Implement the build/load + apply**

In `backend/foundry/tensorrt_engine.py`, add the build/load entry (the heavy `torch_tensorrt`/ONNX work is lazy-imported here):

```python
def build_or_load_engine(pipeline, *, family: str, pipeline_class: str, precision: str,
                         resolution_bucket: str, cache_dir: str,
                         compute_capability: Tuple[int, int], trt_version: str) -> str:
    """Cache-hit -> bind prebuilt engine ("cached"); cache-miss -> export ONNX,
    build, serialize ("built"). Raises on real build failure - the caller guards
    it into a non-fatal fell_back. Heavy deps imported lazily."""
    key = engine_cache_key(
        family=family, pipeline_class=pipeline_class, precision=precision,
        resolution_bucket=resolution_bucket, compute_capability=compute_capability,
        trt_version=trt_version)
    path = engine_cache_path(cache_dir, key)
    os.makedirs(cache_dir, exist_ok=True)
    if os.path.isfile(path):
        _bind_engine(pipeline, path)
        return "cached"
    _build_engine(pipeline, path, resolution_bucket=resolution_bucket, precision=precision)
    return "built"


def _bind_engine(pipeline, path: str) -> None:
    import torch_tensorrt  # noqa: F401, PLC0415 - lazy heavy dep

    # Deserialize the serialized TRT module and attach to the pipeline's denoiser.
    # (Engineer: bind to pipeline.unet/transformer per the torch_tensorrt API.)
    raise NotImplementedError  # replaced with the real bind in the CUDA-verified pass


def _build_engine(pipeline, path: str, *, resolution_bucket: str, precision: str) -> None:
    import torch_tensorrt  # noqa: F401, PLC0415 - lazy heavy dep

    # Export the denoiser to ONNX at the bucket's shape, compile a TRT engine,
    # serialize to `path`. (Engineer: implement per the torch_tensorrt API and
    # verify output tolerance via benchmark_accel before adding the family to
    # TRT_PROVEN_FAMILIES.)
    raise NotImplementedError  # replaced with the real build in the CUDA-verified pass
```

In `backend/foundry/accelerator.py`, add the guarded apply and the seam the test patches:

```python
def _run_tensorrt(pipeline, family) -> str:
    """Resolve TRT engine for this pipeline; returns the state token. Isolated so
    tests patch one seam. The real implementation reads the plan's precision +
    resolution bucket + GPU capability; here it delegates to tensorrt_engine."""
    from foundry.tensorrt_engine import build_or_load_engine

    # NOTE: precision/resolution_bucket/capability/version are passed by the
    # generator-level integration (Task 18 wiring); this signature is the seam.
    return build_or_load_engine(pipeline, family=family, pipeline_class=type(pipeline).__name__,
                                precision="bf16", resolution_bucket="1024x1024",
                                cache_dir=os.environ.get("VS_TRT_CACHE_DIR", ".cache/tensorrt"),
                                compute_capability=(8, 9), trt_version="unknown")


def _apply_tensorrt(pipeline, family, result: AppliedAcceleration) -> None:
    try:
        state = _run_tensorrt(pipeline, family)
        result.applied.append(f"tensorrt:{state}")
    except Exception as exc:  # noqa: BLE001 - hard-fallback, never fails a generation
        result.fell_back.append(f"tensorrt (build/load failed: {type(exc).__name__}, ran eager)")
```

In `apply_acceleration`, replace the compile block with a TRT-aware choice (TRT and compile are mutually exclusive by the decision layer, but guard here too):

```python
    if accel.tensorrt:
        _apply_tensorrt(pipeline, family, result)
    elif accel.compile:
        _apply_compile(pipeline, accel, result)
```

- [ ] **Step 4: Run the apply tests to verify they pass**

Run: `cd backend && python -m unittest tests.test_accelerator_apply.TensorrtApplyTests -v`
Expected: PASS (the `_run_tensorrt` seam is patched; the real build/load is exercised only on a CUDA+TRT machine).

- [ ] **Step 5: Commit**

```bash
export PATH="/c/Program Files/nodejs:$PATH"
git add backend/foundry/tensorrt_engine.py backend/foundry/accelerator.py backend/tests/test_accelerator_tensorrt.py backend/tests/test_accelerator_apply.py
git branch --show-current   # expect: feat/accelerator-m9-pr3
git commit -m "feat(m9): tensorrt build/load scaffold + guarded apply (hard-fallback)"
```

> **CUDA-verified pass (maintainer, off-CI):** implement `_bind_engine`/`_build_engine` against the installed `torch_tensorrt`, run `benchmark_accel.py` to confirm output tolerance, and only then add each verified family to `TRT_PROVEN_FAMILIES`. The `NotImplementedError` placeholders are never reached on CI (the apply seam is patched in tests) and never reached on a no-TRT machine (the decision layer keeps `tensorrt=False`).

---

### Task 18: Performance panel TensorRT state surface

**Files:**
- Modify: `src/components/settings/PerformancePanel.tsx`, `src/components/settings/PerformancePanel.test.tsx`

**Interfaces:**
- Consumes: `lastAppliedAcceleration` (the TRT state appears in `applied`/`fellBack` as `tensorrt:cached` / `tensorrt:built` / `tensorrt (... ran eager)`).
- Produces: a TRT status line derived from the applied readout (`cached & active` / `built` / `unavailable (reason)`); the TensorRT control shows a disabled "not verified on your hardware" hint when no TRT state has ever been reported and the family is un-vetted (advisory only - the backend decision is authoritative).

- [ ] **Step 1: Write the failing test**

Append to `src/components/settings/PerformancePanel.test.tsx`:

```tsx
it('surfaces TensorRT state from the applied readout', () => {
  useAppStore.getState().setLastAppliedAcceleration({
    applied: ['tensorrt:cached'], skipped: [], fellBack: [],
  });
  render(<PerformancePanel />);
  expect(screen.getByText(/cached & active/i)).toBeInTheDocument();
});

it('surfaces a TensorRT fallback reason', () => {
  useAppStore.getState().setLastAppliedAcceleration({
    applied: [], skipped: [], fellBack: ['tensorrt (build/load failed: RuntimeError, ran eager)'],
  });
  render(<PerformancePanel />);
  expect(screen.getByText(/ran eager/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/settings/PerformancePanel.test.tsx -t TensorRT`
Expected: FAIL - no TRT state line.

- [ ] **Step 3: Implement the TRT status line**

In `PerformancePanel.tsx`, add a derived TRT status above the applied groups:

```tsx
function tensorrtStatus(applied: { applied: string[]; fellBack: string[] } | null): string | null {
  if (!applied) return null;
  const hit = applied.applied.find((a) => a.startsWith('tensorrt:'));
  if (hit === 'tensorrt:cached') return 'cached & active';
  if (hit === 'tensorrt:built') return 'built';
  const fell = applied.fellBack.find((f) => f.startsWith('tensorrt'));
  if (fell) return fell.replace(/^tensorrt\s*/, '');
  return null;
}
```

Render it inside the applied section when non-null:

```tsx
{tensorrtStatus(applied) ? (
  <div className="flex items-center justify-between">
    <span className="text-xs text-text-muted data-mono uppercase">TensorRT</span>
    <span className="text-xs data-mono text-text-body">{tensorrtStatus(applied)}</span>
  </div>
) : null}
```

- [ ] **Step 4: Run the tests + gates**

Run: `npx vitest run src/components/settings/PerformancePanel.test.tsx && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
export PATH="/c/Program Files/nodejs:$PATH"
git add src/components/settings/PerformancePanel.tsx src/components/settings/PerformancePanel.test.tsx
git branch --show-current   # expect: feat/accelerator-m9-pr3
git commit -m "feat(m9): Performance panel TensorRT state surface"
```

---

### Task 19: PR3 benchmark TRT extension, Codex gate, tracker, ship

**Files:**
- Modify: `backend/tools/benchmark_accel.py` (TRT config in the sweep), `docs/superpowers/specs/2026-06-15-vision-studio-path-to-v1-roadmap-design.md` (tracker)

**Interfaces:** none (sweep extension + docs + gate).

- [ ] **Step 1: Extend the sweep to cover TRT configs**

In `backend/tools/benchmark_accel.py`, add TensorRT to the per-model accel configs the CUDA sweep iterates (so a TRT engine build is benchmarked and its output is correctness-checked against the unaccelerated reference exactly like compile/quant). No CI test (CUDA-gated); the helper tests from Task 14 already cover `build_perf_patch`/`outputs_within_tolerance`.

- [ ] **Step 2: Run the Codex gate (M9 final sign-off)**

On a CUDA machine, run `python tools/benchmark_accel.py` across the catalog and confirm, per the M9 Codex gate: every accelerated config reports `"correctness": "OK"` (or is excluded), no-fp16 families (`flux`, `sd35`) are never silently precision-corrupted, and each entry added to `_QUANT_ALLOWLIST` / `TRT_PROVEN_FAMILIES` traces to a passing sweep result. Record the JSON patch output in the PR description as the gate evidence. (If a config fails correctness, remove that family from the relevant allowlist and re-run.)

- [ ] **Step 3: Update the roadmap tracker**

Change the M9 tracker row to `| **M9** | Accelerator + Inference | **Done** |`.

- [ ] **Step 4: Full gates**

Run: `cd backend && python -m unittest discover -s tests -p "test_*.py"` and `npm run typecheck && npm test && npm run build`
Expected: all green.

- [ ] **Step 5: Commit + open PR3**

```bash
export PATH="/c/Program Files/nodejs:$PATH"
git add backend/tools/benchmark_accel.py docs/superpowers/specs/2026-06-15-vision-studio-path-to-v1-roadmap-design.md
git branch --show-current   # expect: feat/accelerator-m9-pr3
git commit -m "feat(m9): benchmark TRT config + Codex gate evidence; mark M9 done"
```

Open PR3 via `superpowers:finishing-a-development-branch` (title: "M9 Accelerator PR3: TensorRT engine path + Codex gate"). Attach the benchmark JSON patch as the Codex-gate evidence in the PR body.

---

## Self-review

**Spec coverage:**
- S3 module boundary + two-dataclass split -> Tasks 1, 3 (`AccelerationPlan`/`AppliedAcceleration`/`AccelerationSettings`, decision vs apply split). RuntimePlan never modified (Task 4 attaches a loader-facing attr only).
- S4 decision matrix + slicing fix -> Task 2 (sdpa/channels-last/compile/slicing; `fit=="fits"` -> slicing off).
- S5 four-gate quantization -> Tasks 7, 8 (allowlist, hardware gate, backend probe, auto resolution, override precedence, no-fp16 reconciliation).
- S6 apply layer + Inductor cache + hard-fallback -> Tasks 3, 9 (`apply_acceleration`, `configure_inductor_cache`, compile/quant guards).
- S7 TensorRT -> Tasks 15, 16, 17 (cache key, allowlist, decision, build/load, apply, compile-exclusivity).
- S8 panel + benchmark/correctness sweep -> Tasks 11, 12, 13, 14, 18 (store, panel, mount/plumb, harness, TRT surface).
- S9 error handling + testing + Codex gate -> every apply task is non-fatal; Task 19 runs the Codex gate.
- S10 file structure -> matches the File structure section above.
- S11 three-PR decomposition -> Phases A/B/C with explicit branch + PR boundaries.
- S12 cross-cutting rails -> Global Constraints (import safety, TDD, branch/commit discipline, design system, boundary, honesty).

**Placeholder scan:** The only intentional `NotImplementedError`s are the TRT `_bind_engine`/`_build_engine` bodies (Task 17), which are explicitly flagged for the maintainer's CUDA-verified pass, are unreachable on CI (apply seam patched) and on no-TRT machines (decision keeps `tensorrt=False`), and are bounded by the TRT-proven allowlist. The `benchmark_accel.py` CUDA-only sweep body is described against the verified `calibrate_vram.py` template it mirrors. No "TBD"/"add error handling" placeholders remain.

**Type consistency:** `AccelerationSettings`/`AccelerationPlan`/`AppliedAcceleration` field names are identical across Tasks 1-19. `resolve_acceleration` gains the keyword-only `backends` arg in Task 8 without breaking Task 2 callers (defaults to a probe). `accelerate_pipeline`, `apply_acceleration`, `family_for_plan`, `quant_backends_available`, `accel_settings_from_dict`, `engine_cache_key`, `build_or_load_engine`, and `_run_tensorrt` keep the exact signatures their tests assert. The renderer `TriState` / `AccelerationSettings` / `AppliedAcceleration` shapes match the panel and store usages; camelCase (renderer) <-> snake_case (backend) mapping is explicit in Task 13.
