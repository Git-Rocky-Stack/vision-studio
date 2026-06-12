# Model Foundry M5 - Hardware-Fit + Auto-Wiring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Foundry decides what a model needs, whether it runs HERE, and how it should load: a truthful `HardwareProfile`, an exact-weights VRAM estimator with honest estimated-vs-measured labeling, `resolve_model_runtime(model_id, hardware)` replacing the generators' hardcoded branching, single-file checkpoint loading via `from_single_file` (config-pinned, SVD excluded), run-readiness preflight for the GeneratePanel footer, and a recorded fallback ladder - plus the M4 gate residuals (loader-side security enforcement, revision pinning, family-field promotion).

**Architecture:** Three new pure modules - `hardware.py` (probe, never raises), `fit.py` (weight bytes from headers are EXACT per Spike D; uncertainty lives only in labeled activation/runtime bands), `runtime_resolver.py` (family -> pipeline map, precision selection, security refusals, dependency completeness, readiness readout, fallback ladder) - consumed by two new API routes (`GET /api/hardware`, `POST /api/models/{id}/resolve-runtime`), by `direct_generator.py` / `direct_video_generator.py` (replacing name-substring branching), and by the frontend preflight footer through mirrored IPC. Measured VRAM lands later as verified-catalog *data edits* via an opt-in CUDA-gated calibration tool (this dev machine has no CUDA silicon - Spike D adjustment 1).

**Tech Stack:** Python 3.12 / FastAPI / torch+diffusers 0.37.1 (lazy, always mocked in tests) / psutil; Electron IPC (axios, `backendAuthHeaders` pattern); React 19 + Zustand.

**Ground rules (non-negotiable, from project history):**
- ALL backend tests are `unittest.TestCase` subclasses (CI runs unittest discover). `tests/conftest.py` auto-tags `test_*_api.py` as integration; no non-benchmark test loads real weights.
- No torch / no network at import time or in tests. torch, diffusers, psutil probes are lazily imported and always mocked.
- Routes: literal paths BEFORE dynamic `{model_id}` paths in `main.py`. Every route gets `@limiter.limit` (60/min reads, 30/min mutations).
- Tokens arrive per-request in headers, passed as local params, never stored or logged.
- The Spike C corpus regression gate (false-Compatible = 0) must stay green through every classifier change.
- `docs/API_ENDPOINTS.md` + `docs/api/openapi.json` are BOTH hand-curated - never regenerate; update in the same PR.
- IPC channel names mirrored between `electron/preload.ts` and `electron/ipc-handlers/generation.ts`; slice actions follow the local-first patterns in `modelsSlice.ts`.
- No emoji in app source; lucide-react icons only.

**Spike D inputs honored throughout** (`docs/superpowers/spikes/2026-06-11-fit-autowire-truth.md`):
1. Measured numbers = calibration harness + catalog data edits (no CUDA on this machine); every estimate labeled `estimated` until measured.
2. `vram_estimate = weight_bytes(target_dtype)` [exact, from headers] `+ activation_band(family) + runtime_band`. Observed RSS is REJECTED as a fit signal (mmap).
3. `from_single_file` pins `config=` to the catalog's canonical family repo; offline with no cached config -> honest preflight failure.
4. SVD has no `FromSingleFileMixin` -> excluded from the single-file upgrade, reason names the missing load path.
5. System-RAM preflight uses load PEAK (single-file: resident + checkpoint bytes).

**M4 Codex-gate residuals closed here** (`docs/superpowers/reviews/2026-06-11-m4-codex-supply-chain-review.md` section 2):
- Loader-side enforcement: the resolver REFUSES remote-code records without consent (and M5 still never passes `trust_remote_code=True` - there is no remote-code load path to enable), refuses pickle records outside the convert flow, and never falls back from safetensors to pickle.
- Revision pinning: transient HF records pin the revision their signals were classified at; the download manager already honors `record["revision"]`.
- `TierVerdict.family` promoted to a real field; the `_family_from_reason` string heuristic is deleted.

---

## File structure

```
backend/foundry/hardware.py             NEW   HardwareProfile + probe_hardware (never raises; truthful no-CUDA)
backend/foundry/fit.py                  NEW   weight bytes (exact) + precision scaling + bands + VramEstimate + hardware_fit + load-peak RAM
backend/foundry/runtime_resolver.py     NEW   PIPELINE_BY_FAMILY + precision selection + security refusals
                                              + dependency completeness + readiness readout + fallback ladder
backend/foundry/classifier.py           MOD   TierVerdict.family field; indexed_tier single-file upgrade (svd carve-out)
backend/foundry/hub_search.py           MOD   verdict.family replaces _family_from_reason (deleted)
backend/foundry/hub_signals.py          MOD   fetch_repo_signals captures info.sha as revision
backend/foundry/model_record.py         MOD   + companions, measured_vram_bytes, revision fields
backend/foundry/schemas.py              MOD   + HardwareProfileSchema, VramEstimateSchema, RuntimePlanSchema; ModelRecord fields
backend/foundry/verified-catalog.json   MOD   + companions data edits (flux->T5/CLIP noted, sdxl->vae, animatediff->adapter)
backend/main.py                         MOD   + GET /api/hardware, POST /api/models/{id}/resolve-runtime
backend/utils/direct_generator.py       MOD   consumes resolve_model_runtime (pipeline class, dtype, flags, single-file)
backend/utils/direct_video_generator.py MOD   same for ltx / svd / animatediff
backend/tools/calibrate_vram.py         NEW   opt-in CUDA-gated measured-numbers harness -> catalog data edits
electron/ipc-handlers/generation.ts     MOD   + hardware:get, models:resolveRuntime handlers
electron/preload.ts                     MOD   + hardware.get, models.resolveRuntime
src/types/electron.d.ts                 MOD   + the 2 new methods
src/types/model.ts                      MOD   + HardwareProfile, VramEstimate, RuntimePlan types
src/store/slices/modelsSlice.ts         MOD   + hardwareProfile state/load, resolveRuntime action
src/store/appStore.types.ts             MOD   + new slice fields
src/components/generate/PreflightFooter.tsx  NEW  run-readiness footer (states + data; Carbon Pro pass = design agent)
src/pages/GeneratePanel.tsx             MOD   mounts PreflightFooter
backend/tests/test_foundry_hardware.py          NEW
backend/tests/test_foundry_fit.py               NEW
backend/tests/test_foundry_runtime_resolver.py  NEW
backend/tests/test_foundry_hardware_api.py      NEW   (integration; TestClient)
backend/tests/test_foundry_classifier.py        MOD   (family field, single-file upgrade, svd carve-out)
backend/tests/test_foundry_hub_search.py        MOD   (family from verdict)
backend/tests/test_foundry_hub_signals.py       MOD   (revision capture)
src/store/slices/librarySelectors.test.ts       MOD   (hardware/resolve actions)
tests/integration/api-contracts.test.ts         MOD   (HardwareProfile/RuntimePlan contracts)
docs/API_ENDPOINTS.md, docs/api/openapi.json    MOD   (hand-curated additions)
```

Execution branch: `feat/model-foundry-m5`.

---

### Task 1: Promote `family` to a `TierVerdict` field (M4 debt; unlocks the resolver)

**Files:**
- Modify: `backend/foundry/classifier.py`
- Modify: `backend/foundry/hub_search.py`
- Test: `backend/tests/test_foundry_classifier.py`, `backend/tests/test_foundry_hub_search.py`

`classify_repo`'s docstring already carries the M5 note: "promote family to a TierVerdict field instead" of `hub_search._family_from_reason` parsing reason strings.

- [ ] **Step 1: Write the failing tests**

Append to `backend/tests/test_foundry_classifier.py`:

```python
class FamilyFieldTests(unittest.TestCase):
    """M5: family is a first-class verdict field - no reason-string parsing."""

    def _signals(self, **kw):
        base = dict(
            repo_id="org/m", reachable=True, library_name="diffusers",
            tags=["diffusers:StableDiffusionXLPipeline"],
            class_name="StableDiffusionXLPipeline",
            siblings=["model_index.json", "unet/diffusion_pytorch_model.safetensors"],
            has_safetensors=True,
        )
        base.update(kw)
        return RepoSignals(**base)

    def test_class_signal_carries_family(self):
        verdict = classify_repo(self._signals(), set())
        self.assertEqual(verdict.tier, "compatible")
        self.assertEqual(verdict.family, "sdxl")

    def test_lora_tag_channel_carries_family(self):
        signals = self._signals(
            class_name=None, tags=["lora", "base_model:black-forest-labs/FLUX.1-dev"],
            siblings=["pytorch_lora_weights.safetensors"],
        )
        verdict = classify_repo(signals, set())
        self.assertEqual(verdict.family, "flux")

    def test_experimental_default_has_no_family(self):
        signals = self._signals(class_name=None, tags=[], siblings=["weights.safetensors"])
        verdict = classify_repo(signals, set())
        self.assertEqual(verdict.tier, "experimental")
        self.assertIsNone(verdict.family)

    def test_indexed_tier_carries_family(self):
        tier, reason, family = indexed_tier("lora", "sdxl")
        self.assertEqual(tier, "compatible")
        self.assertEqual(family, "sdxl")
```

(Adjust `indexed_tier`'s return shape test to the actual signature chosen in Step 3 - it currently returns `(tier, reason)`; it becomes `(tier, reason, family)` and ALL call sites update in this task.)

In `backend/tests/test_foundry_hub_search.py`, update the family assertion in `test_results_classified_with_reasons` to prove the field path (the reason string no longer needs to carry a parseable family token):

```python
        self.assertEqual(results[0].base_architecture, "sdxl")
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `backend\venv\Scripts\python.exe -m pytest backend/tests/test_foundry_classifier.py backend/tests/test_foundry_hub_search.py -q`
Expected: FAIL - `TierVerdict` has no attribute `family`; `indexed_tier` returns 2-tuple.

- [ ] **Step 3: Implement**

In `backend/foundry/classifier.py`:

```python
@dataclass
class TierVerdict:
    tier: str
    reason: str
    available: bool = True
    trust_remote_code: bool = False
    format: Optional[str] = None
    family: Optional[str] = None   # M5: sdxl|sd15|sd35|flux|ltx|svd|animatediff
```

Populate `family=` in every branch of `classify_repo` that knows it: catalog rule (`family=None` is fine - the record carries `base_architecture` already), class-signal branches (`family=FAMILY_BY_CLASS.get(signals.class_name)` - the gated, comp_st, partial, and pickle-only branches all pass it), lora tag channel (`family=tag_family`), header lora channel (`family=header_family`). Defaults keep `family=None`.

Change `indexed_tier(artifact_type, family)` to return `(tier, reason, family_out)` where `family_out` echoes the input family for recognized families and is `None` otherwise. Update its call site in `backend/foundry/indexer.py` (`artifact_to_record`) in this task.

Delete `classify_repo`'s docstring NOTE about `_family_from_reason` (the constraint no longer exists). In `backend/foundry/hub_search.py`: delete `_family_from_reason` entirely and use:

```python
        family = verdict.family
        results.append(
            SearchResult(
                ...
                base_architecture=family or "unknown",
                capability=_FAMILY_CAPABILITY.get(family or "", "image"),
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `backend\venv\Scripts\python.exe -m pytest backend/tests -k foundry -q`
Expected: PASS, including the 41-fixture corpus gate (family is additive; tiers unchanged).

- [ ] **Step 5: Commit**

```bash
git add backend/foundry/classifier.py backend/foundry/hub_search.py backend/foundry/indexer.py backend/tests/test_foundry_classifier.py backend/tests/test_foundry_hub_search.py
git commit -m "refactor(foundry): promote family to TierVerdict field (M4 debt)"
```

---

### Task 2: Revision pinning for transient HF records (M4 gate residual)

**Files:**
- Modify: `backend/foundry/hub_signals.py` (capture `info.sha`)
- Modify: `backend/foundry/hub_search.py` (SearchResult.revision)
- Modify: `backend/main.py` (`_search_result_to_record` + enqueue reclassification update)
- Modify: `backend/foundry/model_record.py`, `backend/foundry/schemas.py` (revision field, default `"main"`)
- Test: `backend/tests/test_foundry_hub_signals.py`, `backend/tests/test_foundry_consent_api.py`

The download manager already reads `record.get("revision", "main")` (`download_manager.py:_resolve_files`); nothing pins it for search-originated records, so bytes can drift from the classified revision.

- [ ] **Step 1: Write the failing tests**

In `test_foundry_hub_signals.py` `FetchRepoSignalsTests`, extend `_info()` with `sha="abc123commit"` and add:

```python
    def test_revision_sha_captured(self):
        info = self._info(["unet/diffusion_pytorch_model.safetensors"])
        signals, _dl = self._fetch(info)
        self.assertEqual(signals.revision, "abc123commit")
```

In `test_foundry_consent_api.py` `SupplyChainGateTests`, extend `test_clean_full_signals_proceed_to_enqueue`:

```python
        # The record is pinned to the revision the signals were classified at.
        refreshed = self.client.get(f"/api/models/{TRANSIENT_ID}").json()
        self.assertEqual(refreshed["revision"], "abc123commit")
```

(`_full_signals` gains `revision="abc123commit"`.)

- [ ] **Step 2: Run to verify failure** - `RepoSignals` has no `revision`.

- [ ] **Step 3: Implement**

`RepoSignals` gains `revision: Optional[str] = None`. `fetch_repo_signals` sets `revision=getattr(info, "sha", None)`. `ModelRecord`/`ModelRecordSchema` gain `revision: Optional[str] = None` (the manager's `"main"` default stays at the read site). `_search_result_to_record` passes `revision=None` (search listings carry no sha - pinning happens at the enqueue boundary). The enqueue reclassification block in `main.py` adds `revision=signals.revision` to the `update_transient` call.

- [ ] **Step 4: Run** `-k foundry` - PASS. **Step 5: Commit** `feat(foundry): pin transient records to classified revision`.

---

### Task 3: `HardwareProfile` + `probe_hardware`

**Files:**
- Create: `backend/foundry/hardware.py`
- Test: `backend/tests/test_foundry_hardware.py`

- [ ] **Step 1: Write the failing tests** (`backend/tests/test_foundry_hardware.py`)

```python
"""HardwareProfile probe - lazy torch/psutil, never raises, truthful no-CUDA."""

import pathlib
import sys
import tempfile
import unittest
from unittest import mock

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from foundry.hardware import HardwareProfile, probe_hardware  # type: ignore[import-not-found]


def _torch(available=True, free=8 * 2**30, total=12 * 2**30, cap=(8, 6),
           name="NVIDIA GeForce RTX 3060", cuda="12.1"):
    t = mock.MagicMock()
    t.cuda.is_available.return_value = available
    t.cuda.mem_get_info.return_value = (free, total)
    t.cuda.get_device_capability.return_value = cap
    t.cuda.get_device_name.return_value = name
    t.version.cuda = cuda
    return t


def _psutil(total=32 * 2**30, available=20 * 2**30):
    p = mock.MagicMock()
    p.virtual_memory.return_value = mock.MagicMock(total=total, available=available)
    return p


class ProbeTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix="foundry-hw-")

    def _probe(self, torch_mod, psutil_mod):
        with mock.patch.dict(sys.modules, {"torch": torch_mod, "psutil": psutil_mod}):
            return probe_hardware(self.tmp)

    def test_cuda_profile_is_complete(self):
        profile = self._probe(_torch(), _psutil())
        self.assertTrue(profile.gpu_available)
        self.assertEqual(profile.gpu_name, "NVIDIA GeForce RTX 3060")
        self.assertEqual(profile.vram_total_bytes, 12 * 2**30)
        self.assertEqual(profile.vram_free_bytes, 8 * 2**30)
        self.assertEqual((profile.compute_major, profile.compute_minor), (8, 6))
        self.assertEqual(profile.cuda_version, "12.1")
        self.assertEqual(profile.system_ram_total_bytes, 32 * 2**30)
        self.assertGreater(profile.disk_free_bytes, 0)

    def test_no_cuda_machine_is_truthful(self):
        # THIS dev machine: torch CUDA-built, no device (Spike D environment).
        profile = self._probe(_torch(available=False), _psutil())
        self.assertFalse(profile.gpu_available)
        self.assertIsNone(profile.gpu_name)
        self.assertEqual(profile.vram_total_bytes, 0)
        self.assertEqual(profile.vram_free_bytes, 0)
        # RAM and disk are still real - CPU paths budget against them.
        self.assertEqual(profile.system_ram_available_bytes, 20 * 2**30)
        self.assertGreater(profile.disk_free_bytes, 0)

    def test_torch_missing_never_raises(self):
        profile = self._probe(None, _psutil())  # import torch -> ImportError
        self.assertFalse(profile.gpu_available)
        self.assertFalse(profile.torch_available)

    def test_psutil_missing_never_raises(self):
        profile = self._probe(_torch(available=False), None)
        self.assertEqual(profile.system_ram_total_bytes, 0)

    def test_cuda_query_failure_degrades_to_no_gpu(self):
        t = _torch()
        t.cuda.mem_get_info.side_effect = RuntimeError("driver wedged")
        profile = self._probe(t, _psutil())
        self.assertFalse(profile.gpu_available)


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run to verify failure** (module does not exist).

- [ ] **Step 3: Implement** (`backend/foundry/hardware.py`)

```python
"""HardwareProfile - the truthful probe behind /api/hardware (spec 6.1).

Lazy imports, never raises: a probe failure degrades the affected fields to
their zero/None defaults rather than erroring. gpu_available is true ONLY
when every CUDA query succeeded - a wedged driver reads as no-GPU, and the
fit logic then reports cpu-only honestly instead of planning against
numbers that do not exist (Spike D: this dev machine has no CUDA device).
"""

import os
import shutil
from dataclasses import dataclass
from typing import Optional


@dataclass
class HardwareProfile:
    gpu_available: bool = False
    gpu_name: Optional[str] = None
    vram_total_bytes: int = 0
    vram_free_bytes: int = 0
    compute_major: int = 0
    compute_minor: int = 0
    cuda_version: Optional[str] = None
    torch_available: bool = False
    system_ram_total_bytes: int = 0
    system_ram_available_bytes: int = 0
    disk_free_bytes: int = 0

    @property
    def supports_bf16(self) -> bool:
        return self.gpu_available and (self.compute_major, self.compute_minor) >= (8, 0)

    @property
    def supports_fp8(self) -> bool:
        return self.gpu_available and (self.compute_major, self.compute_minor) >= (8, 9)


def probe_hardware(models_dir: str) -> HardwareProfile:
    profile = HardwareProfile()
    try:
        import torch  # noqa: PLC0415

        profile.torch_available = True
        if torch.cuda.is_available():
            free, total = torch.cuda.mem_get_info(0)
            major, minor = torch.cuda.get_device_capability(0)
            profile.gpu_available = True
            profile.gpu_name = torch.cuda.get_device_name(0)
            profile.vram_free_bytes = int(free)
            profile.vram_total_bytes = int(total)
            profile.compute_major = int(major)
            profile.compute_minor = int(minor)
            profile.cuda_version = torch.version.cuda
    except Exception:
        # Truthful degrade: a half-probed GPU must never look usable.
        profile.gpu_available = False
        profile.gpu_name = None
        profile.vram_free_bytes = 0
        profile.vram_total_bytes = 0
    try:
        import psutil  # noqa: PLC0415

        memory = psutil.virtual_memory()
        profile.system_ram_total_bytes = int(memory.total)
        profile.system_ram_available_bytes = int(memory.available)
    except Exception:
        pass
    try:
        probe = models_dir if os.path.isdir(models_dir) else os.path.dirname(models_dir)
        profile.disk_free_bytes = int(shutil.disk_usage(probe or ".").free)
    except Exception:
        pass
    return profile
```

- [ ] **Step 4: Run to verify pass.** **Step 5: Commit** `feat(foundry): HardwareProfile probe (truthful, never raises)`.

---

### Task 4: `fit.py` - exact weight bytes, precision scaling, labeled bands, `VramEstimate`

**Files:**
- Create: `backend/foundry/fit.py`
- Test: `backend/tests/test_foundry_fit.py`

- [ ] **Step 1: Write the failing tests** (`backend/tests/test_foundry_fit.py`)

```python
"""Fit estimator math. Spike D: header param-count x dtype-bytes equals file
size at ratio 1.0000 - weight bytes are EXACT; uncertainty lives ONLY in the
labeled activation/runtime bands."""

import pathlib
import sys
import unittest

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from foundry.fit import (  # type: ignore[import-not-found]
    PRECISION_BYTES,
    VramEstimate,
    estimate_vram,
    load_peak_ram_bytes,
    weight_bytes_from_header,
)


def _header(tensors):
    return {
        name: {"dtype": dtype, "shape": shape, "data_offsets": [0, 1]}
        for name, (dtype, shape) in tensors.items()
    }


class WeightBytesTests(unittest.TestCase):
    def test_exact_math_param_count_times_dtype(self):
        # Spike D measured shapes: sd15 unet 859.5M params F32 = 3.202 GiB.
        header = _header({"unet.weight": ("F32", [859_520_964])})
        self.assertEqual(weight_bytes_from_header(header), 859_520_964 * 4)

    def test_metadata_block_ignored_and_mixed_dtypes_summed(self):
        header = _header({"a": ("F16", [10, 10]), "b": ("I64", [5])})
        header["__metadata__"] = {"format": "pt"}
        self.assertEqual(weight_bytes_from_header(header), 100 * 2 + 5 * 8)

    def test_unknown_dtype_assumes_4_bytes_conservative(self):
        header = _header({"a": ("MYSTERY", [10])})
        self.assertEqual(weight_bytes_from_header(header), 40)


class EstimateTests(unittest.TestCase):
    def test_estimate_composes_weights_band_runtime_and_is_labeled(self):
        estimate = estimate_vram(
            weight_bytes_native=4 * 2**30, native_bytes_per_param=4,
            target_precision="fp16", family="sd15",
        )
        self.assertEqual(estimate.weight_bytes, 2 * 2**30)  # fp32 -> fp16 halves
        self.assertGreater(estimate.activation_bytes, 0)
        self.assertGreater(estimate.runtime_bytes, 0)
        self.assertEqual(
            estimate.total_bytes,
            estimate.weight_bytes + estimate.activation_bytes + estimate.runtime_bytes,
        )
        self.assertEqual(estimate.basis, "estimated")

    def test_measured_number_overrides_and_relabels(self):
        estimate = estimate_vram(
            weight_bytes_native=4 * 2**30, native_bytes_per_param=4,
            target_precision="fp16", family="sd15",
            measured_total_bytes=5 * 2**30,
        )
        self.assertEqual(estimate.total_bytes, 5 * 2**30)
        self.assertEqual(estimate.basis, "measured")

    def test_unknown_family_gets_widest_band(self):
        known = estimate_vram(2**30, 4, "fp16", "sd15")
        unknown = estimate_vram(2**30, 4, "fp16", "never-heard-of-it")
        self.assertGreaterEqual(unknown.activation_bytes, known.activation_bytes)


class LoadPeakTests(unittest.TestCase):
    def test_single_file_peak_adds_checkpoint_bytes(self):
        # Spike D: from_single_file is NOT mmap-lazy; conversion holds
        # resident weights + the checkpoint transiently.
        resident = 4 * 2**30
        checkpoint = 2 * 2**30
        self.assertEqual(
            load_peak_ram_bytes(resident, checkpoint_bytes=checkpoint, single_file=True),
            resident + checkpoint,
        )

    def test_diffusers_layout_peak_is_resident_only(self):
        self.assertEqual(
            load_peak_ram_bytes(4 * 2**30, checkpoint_bytes=0, single_file=False),
            4 * 2**30,
        )


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run to verify failure.**

- [ ] **Step 3: Implement** (`backend/foundry/fit.py`)

```python
"""VRAM / RAM fit math (spec 6.2, calibrated by Spike D).

Weight bytes are EXACT: safetensors headers give every tensor's shape and
dtype, and Spike D measured predicted-vs-file ratios of 1.0000 across real
sd15/controlnet weights. ALL uncertainty therefore lives in two labeled
bands: activation memory (family-dependent; seeded from published runs of
each family at its native resolution) and CUDA runtime overhead (context +
cudnn workspaces). Bands are refined by tools/calibrate_vram.py on real
CUDA hardware as verified-catalog data edits; until then basis="estimated"
is surfaced everywhere (spec 6.2: measured vs estimated always labeled).
Observed RSS is NEVER a signal - from_pretrained is mmap-lazy (Spike D).
"""

import math
from dataclasses import dataclass
from typing import Dict, Optional

DTYPE_BYTES = {
    "F64": 8, "F32": 4, "F16": 2, "BF16": 2,
    "I64": 8, "I32": 4, "I16": 2, "I8": 1, "U8": 1, "BOOL": 1,
    "F8_E4M3": 1, "F8_E5M2": 1,
}

PRECISION_BYTES: Dict[str, int] = {"fp32": 4, "bf16": 2, "fp16": 2, "fp8": 1}

# Activation bands at each family's native resolution, in bytes. Seeded from
# published community measurements; calibration refines (data edits, not
# code). The unknown-family band is deliberately the WIDEST so unrecognized
# architectures are never optimistically declared to fit.
_GIB = 2**30
ACTIVATION_BAND_BYTES: Dict[str, int] = {
    "sd15": int(1.5 * _GIB),
    "sdxl": int(3.0 * _GIB),
    "sd35": int(3.5 * _GIB),
    "flux": int(4.0 * _GIB),
    "ltx": int(4.0 * _GIB),
    "svd": int(4.5 * _GIB),
    "animatediff": int(3.5 * _GIB),
}
_UNKNOWN_ACTIVATION_BAND = int(5.0 * _GIB)

# CUDA context + cudnn/cublas workspaces. Estimated; calibration refines.
RUNTIME_BAND_BYTES = int(0.7 * _GIB)


def weight_bytes_from_header(header: dict) -> int:
    """Exact bytes for the tensors a safetensors header describes."""
    total = 0
    for key, meta in header.items():
        if key == "__metadata__":
            continue
        count = math.prod(meta["shape"]) if meta["shape"] else 1
        total += count * DTYPE_BYTES.get(meta["dtype"], 4)
    return total


@dataclass
class VramEstimate:
    weight_bytes: int
    activation_bytes: int
    runtime_bytes: int
    total_bytes: int
    basis: str  # "measured" | "estimated"


def estimate_vram(
    weight_bytes_native: int,
    native_bytes_per_param: int,
    target_precision: str,
    family: Optional[str],
    measured_total_bytes: Optional[int] = None,
) -> VramEstimate:
    """Compose the plan-time VRAM budget for a model at a target precision."""
    if measured_total_bytes:
        return VramEstimate(
            weight_bytes=0, activation_bytes=0, runtime_bytes=0,
            total_bytes=int(measured_total_bytes), basis="measured",
        )
    target_bytes = PRECISION_BYTES.get(target_precision, 4)
    weights = (weight_bytes_native * target_bytes) // max(1, native_bytes_per_param)
    activation = ACTIVATION_BAND_BYTES.get(family or "", _UNKNOWN_ACTIVATION_BAND)
    return VramEstimate(
        weight_bytes=int(weights),
        activation_bytes=activation,
        runtime_bytes=RUNTIME_BAND_BYTES,
        total_bytes=int(weights) + activation + RUNTIME_BAND_BYTES,
        basis="estimated",
    )


def load_peak_ram_bytes(resident_bytes: int, checkpoint_bytes: int, single_file: bool) -> int:
    """System-RAM peak during load (Spike D adjustment 5): single-file
    conversion is not mmap-lazy and transiently holds resident + checkpoint."""
    return resident_bytes + (checkpoint_bytes if single_file else 0)
```

- [ ] **Step 4: Run to verify pass.** **Step 5: Commit** `feat(foundry): fit estimator (exact weights + labeled bands)`.

---

### Task 5: `hardware_fit` verdicts

**Files:**
- Modify: `backend/foundry/fit.py`
- Test: `backend/tests/test_foundry_fit.py`

- [ ] **Step 1: Write the failing tests** (append to `test_foundry_fit.py`)

```python
from foundry.fit import hardware_fit  # add to imports
from foundry.hardware import HardwareProfile  # add to imports


def _profile(**kw):
    base = dict(
        gpu_available=True, gpu_name="RTX", vram_total_bytes=12 * 2**30,
        vram_free_bytes=10 * 2**30, compute_major=8, compute_minor=6,
        torch_available=True, system_ram_total_bytes=32 * 2**30,
        system_ram_available_bytes=24 * 2**30, disk_free_bytes=500 * 2**30,
    )
    base.update(kw)
    return HardwareProfile(**base)


def _estimate(total, weights=None):
    weights = weights if weights is not None else int(total * 0.7)
    return VramEstimate(
        weight_bytes=weights, activation_bytes=total - weights - 1, runtime_bytes=1,
        total_bytes=total, basis="estimated",
    )


class HardwareFitTests(unittest.TestCase):
    def test_fits_when_total_within_free_vram(self):
        verdict = hardware_fit(_estimate(8 * 2**30), _profile())
        self.assertEqual(verdict, "fits")

    def test_fits_with_offload_when_weights_fit_in_ram(self):
        # 16 GiB total > 10 free VRAM, but offloadable weights fit in RAM.
        verdict = hardware_fit(_estimate(16 * 2**30, weights=11 * 2**30), _profile())
        self.assertEqual(verdict, "fits-with-offload")

    def test_over_budget_when_even_offload_cannot_hold_it(self):
        profile = _profile(system_ram_available_bytes=4 * 2**30)
        verdict = hardware_fit(_estimate(40 * 2**30, weights=38 * 2**30), profile)
        self.assertEqual(verdict, "over-budget")

    def test_cpu_only_when_no_gpu(self):
        verdict = hardware_fit(_estimate(4 * 2**30), _profile(
            gpu_available=False, vram_free_bytes=0, vram_total_bytes=0,
        ))
        self.assertEqual(verdict, "cpu-only")

    def test_boundary_exactly_free_vram_fits(self):
        verdict = hardware_fit(_estimate(10 * 2**30), _profile())
        self.assertEqual(verdict, "fits")
```

- [ ] **Step 2: Run to verify failure.**

- [ ] **Step 3: Implement** (append to `fit.py`; import `HardwareProfile` under `TYPE_CHECKING` or accept duck-typed)

```python
def hardware_fit(estimate: VramEstimate, profile) -> str:
    """fits | fits-with-offload | over-budget | cpu-only (spec 6.2).

    Offload moves weights to pinned host RAM, so the offload rung needs the
    WEIGHTS to fit in available system RAM while activations + runtime still
    fit in VRAM. No GPU -> cpu-only, stated honestly (Spike D: a 2-step
    128x128 sd15 run took ~13 s on this machine's CPU - functional, unfit).
    """
    if not profile.gpu_available:
        return "cpu-only"
    if estimate.total_bytes <= profile.vram_free_bytes:
        return "fits"
    non_weight = estimate.activation_bytes + estimate.runtime_bytes
    if (
        estimate.weight_bytes <= profile.system_ram_available_bytes
        and non_weight <= profile.vram_free_bytes
    ):
        return "fits-with-offload"
    return "over-budget"
```

- [ ] **Step 4: Run to verify pass.** **Step 5: Commit** `feat(foundry): hardware_fit verdicts`.

---

### Task 6: Catalog + record plumbing - `companions`, `measured_vram_bytes`

**Files:**
- Modify: `backend/foundry/model_record.py`, `backend/foundry/schemas.py`
- Modify: `backend/foundry/verified-catalog.json`
- Test: `backend/tests/test_foundry_model_record.py`

Spec section 3: the manifest encodes per-model dependency graphs and measured VRAM; both are DATA, not code. `companions` lists catalog ids the model needs alongside (sdxl -> `sdxl-vae`, animatediff -> its base + adapter relation already modeled by artifact records); `measured_vram_bytes` is `null` until the calibration harness writes it.

- [ ] **Step 1: Write the failing tests** (append to `test_foundry_model_record.py`, matching its existing class style)

```python
class M5CatalogFieldTests(unittest.TestCase):
    def test_companions_and_measured_vram_default_safely(self):
        record = ModelRecord(
            id="x", name="x", artifact_type="checkpoint",
            capability="image", base_architecture="sdxl", source="huggingface",
        )
        self.assertEqual(record.companions, [])
        self.assertIsNone(record.measured_vram_bytes)
        data = record.to_dict()
        self.assertIn("companions", data)
        self.assertIn("measured_vram_bytes", data)

    def test_catalog_companions_load(self):
        records = load_catalog(CATALOG_PATH)
        self.assertIn("sdxl-vae", records["sdxl-base"].companions)
        # Every companion id must itself be a catalog id - no dangling refs.
        for record in records.values():
            for companion in record.companions:
                self.assertIn(companion, records)
```

- [ ] **Step 2: Run to verify failure.**

- [ ] **Step 3: Implement.** `ModelRecord` gains `companions: List[str] = field(default_factory=list)` and `measured_vram_bytes: Optional[int] = None` (and `to_dict` includes them - follow the existing field-add pattern from M4 Task 1). `ModelRecordSchema` mirrors. Catalog data edits (data, reviewable in diff):
  - `"sdxl-base"`: `"companions": ["sdxl-vae"]`
  - `"sdxl-refiner"`: `"companions": ["sdxl-vae"]`
  - `"sd-1-5"`: `"companions": ["sd-vae-ft-mse"]`
  - `"animatediff"`: `"companions": []` (its motion-adapter IS the record; base resolution is the resolver's job)
  - every entry: `"measured_vram_bytes": null`

  (FLUX's T5/CLIP companions ship inside its diffusers repo - the dependency graph for diffusers-layout repos is `model_index.json`, resolved in Task 8; catalog `companions` is for cross-record needs only.)

- [ ] **Step 4: Run** `-k foundry` (model_record + schemas + api contract tests). **Step 5: Commit** `feat(foundry): catalog companions + measured_vram_bytes (data fields)`.

---

### Task 7: `runtime_resolver.py` core - pipeline map, precision, security refusals

**Files:**
- Create: `backend/foundry/runtime_resolver.py`
- Test: `backend/tests/test_foundry_runtime_resolver.py`

- [ ] **Step 1: Write the failing tests** (`backend/tests/test_foundry_runtime_resolver.py`)

```python
"""resolve_model_runtime - the plan, not the execution (spec 6.3/6.4).

Security invariants (M4 gate residuals): remote-code records are REFUSED
without consent - and even with consent M5 has no remote-code load path, so
the refusal names that honestly; pickle records resolve only through the
convert flow; safetensors never silently falls back to pickle; svd has no
from_single_file path (Spike D adjustment 4)."""

import pathlib
import sys
import unittest

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from foundry.hardware import HardwareProfile  # type: ignore[import-not-found]
from foundry.runtime_resolver import (  # type: ignore[import-not-found]
    PIPELINE_BY_FAMILY,
    resolve_model_runtime,
    select_precision,
)


def _profile(**kw):
    base = dict(
        gpu_available=True, gpu_name="RTX", vram_total_bytes=24 * 2**30,
        vram_free_bytes=20 * 2**30, compute_major=8, compute_minor=6,
        torch_available=True, system_ram_total_bytes=32 * 2**30,
        system_ram_available_bytes=24 * 2**30, disk_free_bytes=500 * 2**30,
    )
    base.update(kw)
    return HardwareProfile(**base)


def _record(**kw):
    base = dict(
        id="sdxl-base", artifact_type="checkpoint", capability="image",
        base_architecture="sdxl", source="huggingface", repo_id="org/sdxl",
        tier="verified", format="safetensors", trust_remote_code=False,
        size="6.9 GB", companions=[], measured_vram_bytes=None, locations=[],
    )
    base.update(kw)
    return base


NO_CONSENT = {"pickle": False, "trust_remote_code": False}


class PipelineMapTests(unittest.TestCase):
    def test_all_seven_families_map_for_image_video(self):
        # Spike D stage-1 table: every family resolves in diffusers 0.37.1.
        for family, capability, expected in [
            ("sd15", "image", "StableDiffusionPipeline"),
            ("sdxl", "image", "StableDiffusionXLPipeline"),
            ("sd35", "image", "StableDiffusion3Pipeline"),
            ("flux", "image", "FluxPipeline"),
            ("flux", "inpaint", "FluxFillPipeline"),
            ("ltx", "video", "LTXPipeline"),
            ("svd", "video", "StableVideoDiffusionPipeline"),
            ("animatediff", "video", "AnimateDiffPipeline"),
        ]:
            with self.subTest(family=family, capability=capability):
                entry = PIPELINE_BY_FAMILY[(family, capability)]
                self.assertEqual(entry.pipeline_class, expected)

    def test_svd_is_marked_no_single_file(self):
        self.assertFalse(PIPELINE_BY_FAMILY[("svd", "video")].single_file_ok)
        self.assertTrue(PIPELINE_BY_FAMILY[("sdxl", "image")].single_file_ok)


class PrecisionTests(unittest.TestCase):
    def test_bf16_on_ampere_plus(self):
        self.assertEqual(select_precision("sdxl", _profile()), "bf16")

    def test_fp16_below_ampere(self):
        self.assertEqual(
            select_precision("sdxl", _profile(compute_major=7, compute_minor=5)), "fp16"
        )

    def test_flux_never_fp16(self):
        # flux is numerically unstable in fp16 - below-Ampere flux stays bf16-
        # incapable and resolves fp32-on-offload rather than corrupt output.
        self.assertEqual(
            select_precision("flux", _profile(compute_major=7, compute_minor=5)), "fp32"
        )

    def test_cpu_is_fp32(self):
        self.assertEqual(
            select_precision("sdxl", _profile(gpu_available=False)), "fp32"
        )


class ResolveSecurityTests(unittest.TestCase):
    def test_remote_code_record_is_refused_even_with_consent(self):
        plan = resolve_model_runtime(
            _record(trust_remote_code=True), _profile(),
            consent={"pickle": False, "trust_remote_code": True},
        )
        self.assertIsNotNone(plan.refusal)
        self.assertIn("remote code", plan.refusal)

    def test_pickle_record_routed_to_convert_not_loaded(self):
        plan = resolve_model_runtime(
            _record(format="pickle"), _profile(),
            consent={"pickle": True, "trust_remote_code": False},
        )
        self.assertIsNotNone(plan.refusal)
        self.assertIn("convert", plan.refusal.lower())

    def test_unknown_family_refused_never_guessed(self):
        plan = resolve_model_runtime(
            _record(base_architecture="wan22"), _profile(), consent=NO_CONSENT
        )
        self.assertIsNotNone(plan.refusal)
        self.assertIn("wan22", plan.refusal)

    def test_svd_single_file_refused_with_load_path_named(self):
        plan = resolve_model_runtime(
            _record(base_architecture="svd", capability="video",
                    artifact_type="checkpoint", source="local"),
            _profile(), consent=NO_CONSENT,
        )
        self.assertIsNotNone(plan.refusal)
        self.assertIn("from_single_file", plan.refusal)


class ResolveHappyPathTests(unittest.TestCase):
    def test_verified_sdxl_resolves_complete_plan(self):
        plan = resolve_model_runtime(_record(), _profile(), consent=NO_CONSENT)
        self.assertIsNone(plan.refusal)
        self.assertEqual(plan.pipeline_class, "StableDiffusionXLPipeline")
        self.assertEqual(plan.precision, "bf16")
        self.assertEqual(plan.fit, "fits")
        self.assertFalse(plan.offload)
        self.assertEqual(plan.vram_plan.basis, "estimated")

    def test_tight_vram_plans_offload_flags(self):
        plan = resolve_model_runtime(
            _record(size="6.9 GB"), _profile(vram_free_bytes=4 * 2**30),
            consent=NO_CONSENT,
        )
        self.assertIsNone(plan.refusal)
        self.assertEqual(plan.fit, "fits-with-offload")
        self.assertTrue(plan.offload)
        self.assertTrue(plan.vae_tiling)

    def test_measured_catalog_number_is_used_and_labeled(self):
        plan = resolve_model_runtime(
            _record(measured_vram_bytes=9 * 2**30), _profile(), consent=NO_CONSENT
        )
        self.assertEqual(plan.vram_plan.basis, "measured")
        self.assertEqual(plan.vram_plan.total_bytes, 9 * 2**30)
```

- [ ] **Step 2: Run to verify failure.**

- [ ] **Step 3: Implement** (`backend/foundry/runtime_resolver.py`)

```python
"""resolve_model_runtime(record, hardware) -> RuntimePlan (spec 6.3/6.4).

THE PLAN, fully surfaced and overridable (D8). Pillar 2 optimizes within it.
Security comes first: this module is the loader-side enforcement point the
M4 Codex gate deferred to M5 - remote-code records never resolve (M5 ships
no remote-code load path, consent or not); pickle records resolve only
through convert-to-safetensors; a missing safetensors file NEVER falls back
to a pickle sibling. Weight size comes from the record's parsed size string
(pre-download) or the local header (post-index) - never from observed RSS.
"""

import re
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple

from foundry.fit import VramEstimate, estimate_vram, hardware_fit
from foundry.hardware import HardwareProfile


@dataclass(frozen=True)
class PipelineEntry:
    pipeline_class: str
    single_file_ok: bool
    # Catalog id whose repo supplies from_single_file's pinned config=
    # (Spike D adjustment 3 - never let key-sniffing pick the config repo).
    config_catalog_id: Optional[str]


PIPELINE_BY_FAMILY: Dict[Tuple[str, str], PipelineEntry] = {
    ("sd15", "image"): PipelineEntry("StableDiffusionPipeline", True, "sd-1-5"),
    ("sd15", "edit"): PipelineEntry("StableDiffusionImg2ImgPipeline", True, "sd-1-5"),
    ("sd15", "inpaint"): PipelineEntry("StableDiffusionInpaintPipeline", True, "sd-1-5"),
    ("sdxl", "image"): PipelineEntry("StableDiffusionXLPipeline", True, "sdxl-base"),
    ("sdxl", "edit"): PipelineEntry("StableDiffusionXLImg2ImgPipeline", True, "sdxl-base"),
    ("sd35", "image"): PipelineEntry("StableDiffusion3Pipeline", True, "sd3.5-medium"),
    ("flux", "image"): PipelineEntry("FluxPipeline", True, "flux-dev"),
    ("flux", "edit"): PipelineEntry("FluxImg2ImgPipeline", True, "flux-dev"),
    ("flux", "inpaint"): PipelineEntry("FluxFillPipeline", True, "flux-fill"),
    ("ltx", "video"): PipelineEntry("LTXPipeline", True, "ltx-video"),
    ("svd", "video"): PipelineEntry("StableVideoDiffusionPipeline", False, None),
    ("animatediff", "video"): PipelineEntry("AnimateDiffPipeline", True, "animatediff"),
}

# Families that corrupt output in fp16 (community-established; flux notably).
_NO_FP16_FAMILIES = {"flux", "sd35"}

_SIZE_RE = re.compile(r"([\d.]+)\s*(GB|GiB|MB|MiB)", re.IGNORECASE)


def select_precision(family: str, profile: HardwareProfile) -> str:
    if not profile.gpu_available:
        return "fp32"
    if profile.supports_bf16:
        return "bf16"
    if family in _NO_FP16_FAMILIES:
        return "fp32"  # honest: slow beats corrupt
    return "fp16"


def weight_bytes_from_size_string(size: str) -> int:
    """Parse the record's human size ('6.9 GB') into bytes; 0 if unknown.
    Pre-download this is the only weight signal; post-index the header wins."""
    match = _SIZE_RE.search(size or "")
    if not match:
        return 0
    value = float(match.group(1))
    unit = match.group(2).lower()
    scale = 2**30 if unit in ("gb", "gib") else 2**20
    return int(value * scale)


@dataclass
class RuntimePlan:
    pipeline_class: Optional[str] = None
    precision: Optional[str] = None
    offload: bool = False
    vae_tiling: bool = False
    attention_slicing: bool = True
    single_file: bool = False
    config_catalog_id: Optional[str] = None
    vram_plan: Optional[VramEstimate] = None
    fit: Optional[str] = None
    missing_components: List[str] = field(default_factory=list)
    fallback_ladder: List[str] = field(default_factory=list)
    readiness: str = ""
    refusal: Optional[str] = None


def _refuse(reason: str) -> RuntimePlan:
    return RuntimePlan(refusal=reason, readiness=reason)


def resolve_model_runtime(
    record: dict,
    profile: HardwareProfile,
    consent: Dict[str, bool],
) -> RuntimePlan:
    # -- security gate (order matters: refusals before any planning) -------
    if record.get("trust_remote_code"):
        return _refuse(
            "requires running remote code authored by the repo - no remote-code "
            "load path exists; not supported"
        )
    if (record.get("format") or "").lower() == "pickle":
        if not consent.get("pickle"):
            return _refuse("pickle weights - grant consent and convert to safetensors first")
        return _refuse("pickle weights - convert to safetensors first (Models > Convert)")

    family = record.get("base_architecture") or "unknown"
    capability = record.get("capability") or "image"
    entry = PIPELINE_BY_FAMILY.get((family, capability)) or PIPELINE_BY_FAMILY.get(
        (family, "image")
    )
    if entry is None:
        return _refuse(f"architecture '{family}' has no shipped pipeline - cannot auto-wire")

    single_file = record.get("artifact_type") == "checkpoint" and bool(record.get("locations"))
    if single_file and not entry.single_file_ok:
        return _refuse(
            f"single-file {family} checkpoints have no from_single_file load path "
            f"in diffusers - not loadable"
        )

    # -- the plan -----------------------------------------------------------
    precision = select_precision(family, profile)
    weight_bytes = weight_bytes_from_size_string(record.get("size") or "")
    estimate = estimate_vram(
        weight_bytes_native=weight_bytes,
        native_bytes_per_param=2 if "fp16" in (record.get("size") or "").lower() else 4,
        target_precision=precision,
        family=family,
        measured_total_bytes=record.get("measured_vram_bytes"),
    )
    fit = hardware_fit(estimate, profile)
    offload = fit == "fits-with-offload"
    plan = RuntimePlan(
        pipeline_class=entry.pipeline_class,
        precision=precision,
        offload=offload,
        vae_tiling=offload,
        attention_slicing=True,
        single_file=single_file,
        config_catalog_id=entry.config_catalog_id if single_file else None,
        vram_plan=estimate,
        fit=fit,
        fallback_ladder=_ladder(precision, fit),
    )
    return plan


def _ladder(precision: str, fit: str) -> List[str]:
    """Ordered OOM-recovery rungs (spec 6.6), each recorded when stepped."""
    rungs: List[str] = []
    if precision == "bf16":
        rungs.append("precision:fp16")
    if fit != "fits-with-offload":
        rungs.append("offload:cpu")
    rungs.append("vae:tiling")
    rungs.append("attention:slicing-max")
    return rungs
```

(Note: `native_bytes_per_param` heuristics are refined in Task 8 when the local header is available - the size-string fallback is pre-download only. Tests in Step 1 pin the behavior that matters: refusals, mapping, precision, fit, labeling.)

- [ ] **Step 4: Run to verify pass.** **Step 5: Commit** `feat(foundry): runtime resolver core (map, precision, security refusals)`.

---

### Task 8: Resolver completeness - local headers, dependency check, readiness readout

**Files:**
- Modify: `backend/foundry/runtime_resolver.py`
- Test: `backend/tests/test_foundry_runtime_resolver.py`

- [ ] **Step 1: Write the failing tests** (append)

```python
import json
import os
import tempfile
from tests.foundry_fixtures import LORA_TENSORS, make_safetensors


class LocalTruthTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix="foundry-resolver-")

    def test_local_header_beats_size_string(self):
        # A real local safetensors header gives EXACT weight bytes.
        path = make_safetensors(os.path.join(self.tmp, "m.safetensors"), LORA_TENSORS)
        plan = resolve_model_runtime(
            _record(artifact_type="lora", size="999 GB", locations=[path]),
            _profile(), consent=NO_CONSENT,
        )
        self.assertLess(plan.vram_plan.weight_bytes, 2**20)  # tiny fixture, not 999GB

    def test_diffusers_dir_missing_weighted_component_reported(self):
        snap = os.path.join(self.tmp, "repo")
        os.makedirs(os.path.join(snap, "unet"))
        os.makedirs(os.path.join(snap, "vae"))
        with open(os.path.join(snap, "model_index.json"), "w", encoding="utf-8") as h:
            json.dump({
                "_class_name": "StableDiffusionXLPipeline",
                "unet": ["diffusers", "UNet2DConditionModel"],
                "vae": ["diffusers", "AutoencoderKL"],
                "scheduler": ["diffusers", "EulerDiscreteScheduler"],
            }, h)
        # unet has weights; vae dir exists but is EMPTY -> missing.
        make_safetensors(
            os.path.join(snap, "unet", "diffusion_pytorch_model.safetensors"),
            {"unet.weight": [4, 4]},
        )
        plan = resolve_model_runtime(
            _record(artifact_type="diffusers-pipeline", locations=[snap]),
            _profile(), consent=NO_CONSENT,
        )
        self.assertIn("vae", plan.missing_components)
        self.assertNotIn("scheduler", plan.missing_components)  # config-only never blocks
        self.assertIn("Needs", plan.readiness)


class ReadinessReadoutTests(unittest.TestCase):
    def test_ready_string(self):
        plan = resolve_model_runtime(_record(), _profile(), consent=NO_CONSENT)
        self.assertEqual(plan.readiness, "Ready - bf16 - fits (estimated)")

    def test_offload_string(self):
        plan = resolve_model_runtime(
            _record(), _profile(vram_free_bytes=4 * 2**30), consent=NO_CONSENT
        )
        self.assertIn("CPU offload", plan.readiness)

    def test_over_budget_names_the_vram(self):
        plan = resolve_model_runtime(
            _record(size="23.8 GB"),
            _profile(vram_free_bytes=6 * 2**30, vram_total_bytes=8 * 2**30,
                     system_ram_available_bytes=2 * 2**30),
            consent=NO_CONSENT,
        )
        self.assertIn("Over budget", plan.readiness)
        self.assertIn("8 GB", plan.readiness)

    def test_cpu_only_string_is_honest(self):
        plan = resolve_model_runtime(
            _record(), _profile(gpu_available=False, vram_free_bytes=0),
            consent=NO_CONSENT,
        )
        self.assertIn("CPU only", plan.readiness)
        self.assertIn("not recommended", plan.readiness)
```

- [ ] **Step 2: Run to verify failure.**

- [ ] **Step 3: Implement.** Add to `runtime_resolver.py`:

```python
from foundry.fit import weight_bytes_from_header
from foundry.safetensors_header import HeaderError, read_safetensors_header

_WEIGHT_GLOBS = ("*.safetensors", "*.bin")


def _local_weight_bytes(record: dict) -> Tuple[int, int]:
    """(weight_bytes, native_bytes_per_param) from local safetensors headers.
    (0, 4) when nothing local is readable - callers fall back to the size
    string. Reads headers only - never loads tensors."""
    import glob
    import os

    total = 0
    native = 4
    for location in record.get("locations") or []:
        paths = []
        if os.path.isfile(location) and location.endswith(".safetensors"):
            paths = [location]
        elif os.path.isdir(location):
            paths = glob.glob(os.path.join(location, "**", "*.safetensors"), recursive=True)
        for path in paths:
            try:
                header = read_safetensors_header(path)
            except (HeaderError, OSError):
                continue
            total += weight_bytes_from_header(header)
            dtypes = {m.get("dtype") for k, m in header.items() if k != "__metadata__"}
            if dtypes & {"F16", "BF16"}:
                native = 2
    return total, native


def _missing_components(record: dict) -> List[str]:
    """Weighted model_index.json submodels with no weights on disk (Spike D
    stage 3: config-only components - scheduler/tokenizer/feature_extractor -
    never block)."""
    import glob
    import json
    import os

    missing: List[str] = []
    for location in record.get("locations") or []:
        index_path = os.path.join(location, "model_index.json")
        if not os.path.isfile(index_path):
            continue
        try:
            with open(index_path, "r", encoding="utf-8") as handle:
                index = json.load(handle)
        except (OSError, ValueError):
            continue
        for name, value in index.items():
            if not (isinstance(value, (list, tuple)) and len(value) == 2):
                continue
            if value[1] is None or name in ("scheduler", "tokenizer", "tokenizer_2",
                                            "tokenizer_3", "feature_extractor"):
                continue
            component_dir = os.path.join(location, name)
            weighted = any(
                glob.glob(os.path.join(component_dir, pattern)) for pattern in _WEIGHT_GLOBS
            )
            if not weighted:
                missing.append(name)
    return missing


def _readiness(plan: RuntimePlan, profile: HardwareProfile) -> str:
    if plan.missing_components:
        return "Needs " + ", ".join(plan.missing_components)
    basis = plan.vram_plan.basis if plan.vram_plan else "estimated"
    if plan.fit == "fits":
        return f"Ready - {plan.precision} - fits ({basis})"
    if plan.fit == "fits-with-offload":
        return f"Runs with CPU offload (~slower) - {plan.precision} ({basis})"
    if plan.fit == "cpu-only":
        return "CPU only - not recommended for real work"
    total_gb = round(profile.vram_total_bytes / 2**30)
    return f"Over budget on {total_gb} GB VRAM ({basis})"
```

Wire into `resolve_model_runtime`: after the security gate, call `_local_weight_bytes`; when it returns `> 0` use it (and its native bytes) instead of the size string; set `plan.missing_components = _missing_components(record)` and `plan.readiness = _readiness(plan, profile)` before returning. The over-budget readout uses the PROFILE's total VRAM (the user's card), not the estimate.

Also wire the Spike D load-peak RAM check (adjustment 5): for single-file plans, compute `load_peak_ram_bytes(plan.vram_plan.weight_bytes, checkpoint_bytes=<local file size>, single_file=True)`; when the peak exceeds `profile.system_ram_available_bytes`, prefix the readiness with `"Low RAM for load conversion - "` (informational, never a refusal - the OS can page; the user deserves the warning). Add one test:

```python
    def test_single_file_load_peak_warns_on_low_ram(self):
        path = make_safetensors(os.path.join(self.tmp, "big.safetensors"),
                                {"w": [1024, 1024]})
        plan = resolve_model_runtime(
            _record(artifact_type="checkpoint", locations=[path]),
            _profile(system_ram_available_bytes=1024),  # absurdly low
            consent=NO_CONSENT,
        )
        self.assertIn("Low RAM", plan.readiness)
```

- [ ] **Step 4: Run to verify pass.** **Step 5: Commit** `feat(foundry): resolver local-header truth + dependency completeness + readiness`.

---

### Task 9: Classifier single-file upgrade (SVD carve-out) + `from_single_file` tier honesty

**Files:**
- Modify: `backend/foundry/classifier.py` (`indexed_tier`)
- Test: `backend/tests/test_foundry_classifier.py`

M3/M4 honestly kept indexed single-file checkpoints Experimental because the app had no `from_single_file` call sites (Spike C adjustment 4: "revisit this boundary in M5"). M5 ships the load path (Tasks 7/11), so known-family single-file checkpoints upgrade to Compatible - EXCEPT svd (Spike D adjustment 4).

- [ ] **Step 1: Write the failing tests** (update `indexed_tier` cases in `test_foundry_classifier.py`)

```python
class IndexedSingleFileUpgradeTests(unittest.TestCase):
    def test_known_family_checkpoint_now_compatible(self):
        tier, reason, family = indexed_tier("checkpoint", "sdxl")
        self.assertEqual(tier, "compatible")
        self.assertIn("from_single_file", reason)
        self.assertEqual(family, "sdxl")

    def test_svd_checkpoint_stays_experimental_with_load_path_named(self):
        tier, reason, _family = indexed_tier("checkpoint", "svd")
        self.assertEqual(tier, "experimental")
        self.assertIn("from_single_file", reason)

    def test_unknown_family_checkpoint_stays_experimental(self):
        tier, reason, family = indexed_tier("checkpoint", "unknown")
        self.assertEqual(tier, "experimental")
        self.assertIsNone(family)
```

(Existing tests asserting the old "load path lands with M5" reason for known families are UPDATED in this task - that promise is now kept. The corpus gate is unaffected: it classifies repos, not indexed artifacts.)

- [ ] **Step 2: Run to verify failure.**

- [ ] **Step 3: Implement** in `indexed_tier`:

```python
    if artifact_type == "checkpoint":
        if family == "svd":
            return (
                "experimental",
                "svd single-file checkpoint - StableVideoDiffusionPipeline has no "
                "from_single_file path in diffusers",
                "svd",
            )
        if family in _SINGLE_FILE_FAMILIES:  # sd15|sdxl|sd35|flux|ltx|animatediff
            return (
                "compatible",
                f"single-file {family} checkpoint - loads via from_single_file "
                f"(config pinned to catalog)",
                family,
            )
        return ("experimental", "single-file checkpoint of unrecognized architecture", None)
```

- [ ] **Step 4: Run** `-k foundry` (corpus stays green). **Step 5: Commit** `feat(foundry): single-file checkpoints compatible via from_single_file (svd carved out)`.

---

### Task 10: API - `GET /api/hardware` + `POST /api/models/{id}/resolve-runtime` + schemas

**Files:**
- Modify: `backend/foundry/schemas.py`
- Modify: `backend/main.py`
- Modify: `docs/API_ENDPOINTS.md`, `docs/api/openapi.json`
- Test: `backend/tests/test_foundry_hardware_api.py`

- [ ] **Step 1: Write the failing tests** (`backend/tests/test_foundry_hardware_api.py`)

```python
"""Integration: GET /api/hardware + POST /api/models/{id}/resolve-runtime."""

import pathlib
import sys
import unittest
from unittest import mock

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from fastapi.testclient import TestClient

import main  # type: ignore[import-not-found]
from foundry.hardware import HardwareProfile  # type: ignore[import-not-found]


def _profile(**kw):
    base = dict(
        gpu_available=True, gpu_name="RTX 4090", vram_total_bytes=24 * 2**30,
        vram_free_bytes=20 * 2**30, compute_major=8, compute_minor=9,
        cuda_version="12.1", torch_available=True,
        system_ram_total_bytes=64 * 2**30, system_ram_available_bytes=48 * 2**30,
        disk_free_bytes=900 * 2**30,
    )
    base.update(kw)
    return HardwareProfile(**base)


class HardwareApiTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(main.app)

    def test_hardware_route_returns_profile(self):
        with mock.patch.object(main, "probe_hardware", return_value=_profile()):
            response = self.client.get("/api/hardware")
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertTrue(body["gpu_available"])
        self.assertEqual(body["vram_total_bytes"], 24 * 2**30)
        self.assertEqual(body["compute_major"], 8)

    def test_resolve_runtime_known_model(self):
        with mock.patch.object(main, "probe_hardware", return_value=_profile()):
            response = self.client.post("/api/models/sdxl-base/resolve-runtime")
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertIsNone(body["refusal"])
        self.assertEqual(body["pipeline_class"], "StableDiffusionXLPipeline")
        self.assertIn(body["fit"], ("fits", "fits-with-offload", "over-budget"))
        self.assertIn(body["vram_plan"]["basis"], ("measured", "estimated"))
        self.assertTrue(body["readiness"])

    def test_resolve_runtime_unknown_model_404(self):
        response = self.client.post("/api/models/ghost/resolve-runtime")
        self.assertEqual(response.status_code, 404)

    def test_refusals_are_200_payloads_not_4xx(self):
        # Preflight is informational - a refusal is an ANSWER, not an error.
        record = {
            "id": "m", "artifact_type": "diffusers-pipeline", "capability": "image",
            "base_architecture": "sdxl", "source": "huggingface", "format": "safetensors",
            "trust_remote_code": True, "size": "1 GB", "locations": [],
            "companions": [], "measured_vram_bytes": None,
        }
        with mock.patch.object(main.model_registry, "get_record", return_value=record), \
                mock.patch.object(main, "probe_hardware", return_value=_profile()):
            response = self.client.post("/api/models/m/resolve-runtime")
        self.assertEqual(response.status_code, 200)
        self.assertIn("remote code", response.json()["refusal"])


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run to verify failure.**

- [ ] **Step 3: Implement.** In `schemas.py`:

```python
class HardwareProfileSchema(BaseModel):
    gpu_available: bool
    gpu_name: Optional[str] = None
    vram_total_bytes: int = 0
    vram_free_bytes: int = 0
    compute_major: int = 0
    compute_minor: int = 0
    cuda_version: Optional[str] = None
    torch_available: bool = False
    system_ram_total_bytes: int = 0
    system_ram_available_bytes: int = 0
    disk_free_bytes: int = 0


class VramEstimateSchema(BaseModel):
    weight_bytes: int
    activation_bytes: int
    runtime_bytes: int
    total_bytes: int
    basis: str


class RuntimePlanSchema(BaseModel):
    model_config = ConfigDict(protected_namespaces=())
    pipeline_class: Optional[str] = None
    precision: Optional[str] = None
    offload: bool = False
    vae_tiling: bool = False
    attention_slicing: bool = True
    single_file: bool = False
    config_catalog_id: Optional[str] = None
    vram_plan: Optional[VramEstimateSchema] = None
    fit: Optional[str] = None
    missing_components: List[str] = []
    fallback_ladder: List[str] = []
    readiness: str = ""
    refusal: Optional[str] = None
```

In `main.py` (imports: `from foundry.hardware import probe_hardware`, `from foundry.runtime_resolver import resolve_model_runtime`; route placement: `/api/hardware` is literal - place with the other literal routes; `resolve-runtime` is dynamic-suffixed like `convert-safetensors`):

```python
@app.get("/api/hardware", response_model=HardwareProfileSchema, tags=["Models"])
@limiter.limit("60/minute")
async def get_hardware(request: Request):
    """Truthful hardware probe (spec 6.1). Runs in a worker thread - the
    CUDA query can block briefly on a cold driver."""
    loop = asyncio.get_running_loop()
    profile = await loop.run_in_executor(None, probe_hardware, MODELS_DIR)
    return HardwareProfileSchema(**asdict(profile))


@app.post("/api/models/{model_id}/resolve-runtime", response_model=RuntimePlanSchema, tags=["Models"])
@limiter.limit("30/minute")
async def resolve_runtime(request: Request, model_id: str):
    """The load plan for THIS machine (spec 6.4). Refusals are 200 payloads:
    preflight is informational - 'this will not load, and here is why' is an
    answer, not a server error."""
    record = model_registry.get_record(model_id)
    if record is None:
        raise HTTPException(status_code=404, detail=f"Model '{model_id}' not found")
    loop = asyncio.get_running_loop()
    profile = await loop.run_in_executor(None, probe_hardware, MODELS_DIR)
    plan = resolve_model_runtime(record, profile, consent_store.get(model_id))
    data = asdict(plan)
    if plan.vram_plan is not None:
        data["vram_plan"] = asdict(plan.vram_plan)
    return RuntimePlanSchema(**data)
```

Update `docs/API_ENDPOINTS.md` (Part: Models routes; both routes with param/response tables mirroring the schemas above, refusal-is-200 semantics, rate limits) and `docs/api/openapi.json` (two new paths + three new component schemas) - hand-curated, same PR.

- [ ] **Step 4: Run** `-k foundry` - PASS. **Step 5: Commit** `feat(api): GET /api/hardware + POST resolve-runtime`.

---

### Task 11: Generators consume the plan (image + video + `from_single_file`)

**Files:**
- Modify: `backend/utils/direct_generator.py`
- Modify: `backend/utils/direct_video_generator.py`
- Test: extend `backend/tests/test_direct_generator.py` (or the existing generator test file - locate with `grep -l "direct_generator" backend/tests/`)

This is the riskiest task: it replaces name-substring branching (`if "flux" in model_name.lower()`) with plan consumption, while keeping behavior identical for every catalog id. Incremental and verifiable:

- [ ] **Step 1: Write the failing tests** (in the generator's existing test file, matching its harness - generation tests already run with stub/mocked pipelines on CI)

```python
class PlanConsumptionTests(unittest.TestCase):
    """load_model resolves the plan, then loads exactly what it says."""

    def test_plan_decides_pipeline_class_and_dtype(self):
        # Catalog sdxl on an Ampere GPU -> StableDiffusionXLPipeline + bf16.
        generator = DirectGenerator(device="cuda")
        plan = mock.MagicMock(
            refusal=None, pipeline_class="StableDiffusionXLPipeline",
            precision="bf16", offload=False, vae_tiling=False,
            attention_slicing=True, single_file=False, config_catalog_id=None,
        )
        with mock.patch("utils.direct_generator.resolve_plan", return_value=plan), \
                mock.patch.object(diffusers_mock.StableDiffusionXLPipeline,
                                  "from_pretrained") as loader:
            generator.load_model("sdxl-base")
        self.assertEqual(loader.call_args.kwargs["torch_dtype"], torch_mock.bfloat16)

    def test_refusal_raises_typed_error_and_never_loads(self):
        generator = DirectGenerator(device="cuda")
        plan = mock.MagicMock(refusal="pickle weights - convert first")
        with mock.patch("utils.direct_generator.resolve_plan", return_value=plan):
            with self.assertRaises(ModelLoadRefusedError) as ctx:
                generator.load_model("sketchy-model")
        self.assertIn("convert", str(ctx.exception))

    def test_offload_plan_applies_offload_flags(self):
        plan = mock.MagicMock(
            refusal=None, pipeline_class="StableDiffusionPipeline",
            precision="fp16", offload=True, vae_tiling=True,
            attention_slicing=True, single_file=False, config_catalog_id=None,
        )
        pipeline = mock.MagicMock()
        with mock.patch("utils.direct_generator.resolve_plan", return_value=plan), \
                mock.patch.object(diffusers_mock.StableDiffusionPipeline,
                                  "from_pretrained", return_value=pipeline):
            DirectGenerator(device="cuda").load_model("sd-1-5")
        pipeline.enable_model_cpu_offload.assert_called_once()
        pipeline.vae.enable_tiling.assert_called_once()

    def test_single_file_plan_uses_from_single_file_with_pinned_config(self):
        plan = mock.MagicMock(
            refusal=None, pipeline_class="StableDiffusionXLPipeline",
            precision="fp16", offload=False, vae_tiling=False,
            attention_slicing=True, single_file=True, config_catalog_id="sdxl-base",
        )
        with mock.patch("utils.direct_generator.resolve_plan", return_value=plan), \
                mock.patch.object(diffusers_mock.StableDiffusionXLPipeline,
                                  "from_single_file") as loader:
            DirectGenerator(device="cuda").load_model("local-checkpoint")
        # config= pinned from the catalog - never key-sniffed (Spike D adj. 3).
        self.assertIn("config", loader.call_args.kwargs)
```

(EXACT mock shapes must follow the generator test file's existing torch/diffusers stubbing pattern - read it first; the assertions above are the contract. Adapt names like `diffusers_mock`/`torch_mock` to that harness.)

- [ ] **Step 2: Run to verify failure.**

- [ ] **Step 3: Implement.** In `direct_generator.py`:
  - Add a typed error: `class ModelLoadRefusedError(RuntimeError)` carrying the refusal string (surfaced by the generation route as a 409-style user-facing message, matching how other load failures surface in that file).
  - Add `resolve_plan(model_id, overrides=None)` - a thin module-level function that pulls `model_registry.get_record`, `probe_hardware(MODELS_DIR)`, and `consent_store.get` from `main` lazily (import inside the function to avoid the circular import) and returns `resolve_model_runtime(record, profile, consent)`. Module-level so tests patch ONE seam. `overrides` is the spec-D8 seam: a dict that may carry `precision` / `offload` / `vae_tiling` from the generation request's advanced settings; non-None values are applied onto the plan AFTER resolution (security refusals are NEVER overridable). One test: an explicit `{"precision": "fp16"}` override beats the plan's bf16; a refusal stays a refusal regardless of overrides.
  - In `load_model`: call `resolve_plan`; raise `ModelLoadRefusedError(plan.refusal)` when set; map `plan.precision` -> torch dtype (`{"bf16": torch.bfloat16, "fp16": torch.float16, "fp32": torch.float32}`); resolve the pipeline class by name: `getattr(diffusers, plan.pipeline_class)`; branch `from_single_file(path, config=<catalog repo_id of plan.config_catalog_id>, torch_dtype=dtype)` vs `from_pretrained(repo_or_path, torch_dtype=dtype, use_safetensors=True)`. `use_safetensors=True` is NON-NEGOTIABLE (never fall back to pickle - M4 gate residual).
  - Post-load flags from the plan: `enable_model_cpu_offload()` when `plan.offload` (replaces manual `.to(device)` in that branch - offload manages device placement), `pipeline.vae.enable_tiling()` when `plan.vae_tiling`, keep `enable_attention_slicing()` + xformers try/except as today.
  - The legacy `model_map` dict DIES: repo ids come from the registry record (`record["repo_id"]`). Keep a one-line legacy-alias pass-through via `model_registry.legacy_aliases` (already handled by `get_record`).
  - On load OOM (`torch.cuda.OutOfMemoryError`), step the plan's `fallback_ladder` (lower precision -> offload -> tiling), logging each rung, re-raising honestly when exhausted. Implement as a loop around the load call consuming `plan.fallback_ladder`.
  - Mirror the same consumption in `direct_video_generator.py` for ltx/svd/animatediff (AnimateDiff keeps its MotionAdapter load, sourced from the record's companions/adapter as today).

- [ ] **Step 4: Run the generator test files + `-k foundry`.** Expected: PASS, with the existing generator tests proving catalog ids still load the same classes at the same dtypes.

- [ ] **Step 5: Commit** `feat(generation): generators consume resolve_model_runtime (plan-driven load + from_single_file + fallback ladder)`.

---

### Task 12: Electron IPC - `hardware:get` + `models:resolveRuntime`

**Files:**
- Modify: `electron/ipc-handlers/generation.ts`, `electron/preload.ts`, `src/types/electron.d.ts`
- Test: `tests/integration/api-contracts.test.ts` (contract shapes)

- [ ] **Step 1: Write the failing contract tests** (follow the file's existing M4 search/consent contract pattern - assert the renderer-visible shapes):

```typescript
describe('M5 hardware + runtime plan contracts', () => {
  it('HardwareProfile carries the fit-relevant fields', () => {
    const profile: HardwareProfile = {
      gpu_available: true, gpu_name: 'RTX 4090',
      vram_total_bytes: 25769803776, vram_free_bytes: 21474836480,
      compute_major: 8, compute_minor: 9, cuda_version: '12.1',
      torch_available: true, system_ram_total_bytes: 68719476736,
      system_ram_available_bytes: 51539607552, disk_free_bytes: 966367641600,
    };
    expect(profile.vram_total_bytes).toBeGreaterThan(0);
  });

  it('RuntimePlan refusal and readiness are renderer-visible', () => {
    const plan: RuntimePlan = {
      pipeline_class: 'StableDiffusionXLPipeline', precision: 'bf16',
      offload: false, vae_tiling: false, attention_slicing: true,
      single_file: false, config_catalog_id: null,
      vram_plan: { weight_bytes: 1, activation_bytes: 1, runtime_bytes: 1, total_bytes: 3, basis: 'estimated' },
      fit: 'fits', missing_components: [], fallback_ladder: [],
      readiness: 'Ready - bf16 - fits (estimated)', refusal: null,
    };
    expect(plan.readiness).toContain('Ready');
  });
});
```

- [ ] **Step 2: Run `npm test` to verify failure** (types missing).

- [ ] **Step 3: Implement.**
  - `src/types/model.ts`: add `HardwareProfile`, `VramEstimate`, `RuntimePlan` interfaces mirroring the Python schemas exactly (snake_case keys - the wire format).
  - `electron/ipc-handlers/generation.ts`: `hardware:get` -> `GET /api/hardware`; `models:resolveRuntime` -> `POST /api/models/${encodeURIComponent(modelId)}/resolve-runtime`. Both follow the existing handler pattern: `backendAuthHeaders`, message-only error logging (`error instanceof Error ? error.message : error` - NEVER the raw error object), `{ success: false, error }` envelopes.
  - `electron/preload.ts`: `hardware: { get: () => ipcRenderer.invoke('hardware:get') }` and `models.resolveRuntime(modelId)`. `src/types/electron.d.ts` mirrors both.

- [ ] **Step 4: Run `npm run typecheck` + `npm test`.** **Step 5: Commit** `feat(electron): hardware:get + models:resolveRuntime IPC`.

---

### Task 13: Frontend - hardware state + preflight footer (states + data)

**Files:**
- Modify: `src/store/slices/modelsSlice.ts`, `src/store/appStore.types.ts`
- Create: `src/components/generate/PreflightFooter.tsx`
- Modify: `src/pages/GeneratePanel.tsx`
- Test: `src/store/slices/librarySelectors.test.ts`

Carbon Pro styling is the design agent's pass (spec 7.3) - this task delivers correct STATES and DATA with existing primitives (`.mono-label`, `.recessed-well`, lucide icons), no new tokens.

- [ ] **Step 1: Write the failing tests** (append to `librarySelectors.test.ts`, matching the M4 mock pattern)

```typescript
describe('modelsSlice hardware + preflight actions', () => {
  beforeEach(() => {
    useAppStore.setState({ hardwareProfile: null });
  });

  it('loadHardwareProfile stores the profile (local-first on failure)', async () => {
    const profile = { gpu_available: false, vram_total_bytes: 0 } as HardwareProfile;
    mockModelsApi({});
    (globalThis as any).window.electron.hardware = { get: vi.fn().mockResolvedValue(profile) };
    await useAppStore.getState().loadHardwareProfile();
    expect(useAppStore.getState().hardwareProfile).toEqual(profile);

    (globalThis as any).window.electron.hardware.get = vi.fn().mockRejectedValue(new Error('down'));
    await useAppStore.getState().loadHardwareProfile();
    expect(useAppStore.getState().hardwareProfile).toEqual(profile); // kept
  });

  it('resolveRuntime returns the plan and surfaces bridge failures', async () => {
    const plan = { readiness: 'Ready - bf16 - fits (estimated)', refusal: null };
    mockModelsApi({ resolveRuntime: vi.fn().mockResolvedValue(plan) });
    const result = await useAppStore.getState().resolveRuntime('sdxl-base');
    expect(result).toMatchObject({ readiness: expect.stringContaining('Ready') });

    mockModelsApi({ resolveRuntime: vi.fn().mockRejectedValue(new Error('bridge down')) });
    await expect(useAppStore.getState().resolveRuntime('sdxl-base')).rejects.toThrow('bridge down');
  });
});
```

- [ ] **Step 2: Run to verify failure.**

- [ ] **Step 3: Implement.**
  - Slice: `hardwareProfile: null as HardwareProfile | null` (NOT persisted - hardware changes between sessions; exclude from the partialize allowlist), `loadHardwareProfile` (local-first swallow, keeps last-known on failure), `resolveRuntime(modelId)` (returns the plan/envelope; does NOT swallow - preflight truth must surface, same deliberate deviation as consent/convert, comment it).
  - `PreflightFooter.tsx`: props `{ modelId: string | null }`; on model change calls `resolveRuntime`; renders one of the states: loading / `refusal` (alert styling, `ShieldAlert` icon) / `Needs ...` (missing components, `PackageX`) / readiness line with fit-colored status dot (existing `.led-glow` primitive drives REAL state: green fits, amber offload, red over-budget/cpu-only). Reduced-motion safe (no new animation). Every state present: loading, error, empty (no model selected), ready.
  - `GeneratePanel.tsx`: mount `<PreflightFooter modelId={selectedModelId} />` above the generate action, where the recon located the linear flow.

- [ ] **Step 4: Run `npm run typecheck` + `npm test` + `npm run build`.** **Step 5: Commit** `feat(ui): run-readiness preflight footer (states + data)`.

---

### Task 14: Calibration harness (measured numbers as data edits)

**Files:**
- Create: `backend/tools/calibrate_vram.py`
- Test: none (the tool is the real-model tier by definition; excluded from CI like `tests/benchmarks/`)

- [ ] **Step 1: Implement** (`backend/tools/calibrate_vram.py`)

```python
"""Measured-VRAM calibration harness (Spike D adjustment 1).

Run MANUALLY on a CUDA machine:  python tools/calibrate_vram.py [model-id ...]
For each catalog model with local bytes, loads it via resolve_model_runtime's
plan, runs one tiny inference, records torch.cuda.max_memory_allocated /
max_memory_reserved, and prints a JSON patch of measured_vram_bytes values
for verified-catalog.json. Blessing numbers is a DATA EDIT (spec section 3):
review the printed patch and apply it to the catalog by hand in its own
commit - this tool never writes the catalog itself.

Refuses to run without CUDA: estimates must never masquerade as measured.
"""
```

Body: argparse over catalog ids (default: all with `status == "ready"`); per model - `torch.cuda.reset_peak_memory_stats()`, load via the Task 11 path, 2-step 128x128 (image) / 8-frame minimal (video) inference, capture `max_memory_allocated(0)` and `max_memory_reserved(0)`, unload + `torch.cuda.empty_cache()`; emit `{"<id>": {"measured_vram_bytes": <reserved>, "precision": "<plan.precision>", "torch": "<version>", "gpu": "<name>"}}` to stdout. Hard-exit with a clear message when `torch.cuda.is_available()` is False.

- [ ] **Step 2: Sanity-run on THIS machine** - expected output: the CUDA refusal message (that IS the test on this hardware).

- [ ] **Step 3: Commit** `feat(tools): CUDA-gated VRAM calibration harness (catalog data edits)`.

---

### Task 15: Milestone gate + docs sweep

- [ ] **Step 1: Full gates**

```bash
backend\venv\Scripts\python.exe -m pytest backend/tests -k foundry -q   # all foundry suites
npm run typecheck && npm test && npm run build
```
Expected: all green; corpus gate (false-Compatible = 0) green; CI green on the PR (Linux stub + Windows).

- [ ] **Step 2: Docs sweep** - `docs/API_ENDPOINTS.md` + `docs/api/openapi.json` carry `/api/hardware`, `resolve-runtime`, the three new schemas, and the new IPC channels in the channel table; the M3.5/M4 sections untouched. Update the "Last verified" date.

- [ ] **Step 3: Commit + PR** - branch `feat/model-foundry-m5`, PR titled `Model Foundry M5: hardware-fit + resolve_model_runtime + from_single_file`, CI watch, squash-merge per the release process.

---

## Explicitly out of scope (deliberate, do not gold-plate)

- **Remote-code loading** - there is NO `trust_remote_code=True` load path in M5; consent for it exists as recorded intent only. Building that path is a future, explicitly-designed milestone.
- **Dependency auto-FETCH UX** - the resolver reports `missing_components` and catalog `companions`; one-click fetch-the-missing wiring is the browse-panel design pass (spec 7.3) on top of the existing download route.
- **fp8 auto-selection** - `supports_fp8` is probed and surfaced; auto-picking fp8 waits for calibration data (it changes output quality, not just memory).
- **Panel composition / Carbon Pro styling** - design agent's pass; M5 ships states + data.
- **Runtime OOM ladder beyond load** - the ladder wraps LOAD; mid-inference OOM recovery belongs to Pillar 2 (Accelerator).

## Execution amendments (recorded during subagent-driven execution)

1. **Task 4 `estimate_vram` measured branch (Critical, found by the Task 4+5
   quality review):** the plan's sketch zeroed all components under measured
   basis, which made `over-budget` structurally unreachable for measured
   models in `hardware_fit` (`non_weight=0` and `weights=0` are vacuously
   satisfiable; probe-verified: a 40 GiB measured model on 1 GiB VRAM read
   "fits-with-offload"). Shipped fix: weights stay exact (computed, clamped
   to the measurement), the measurement's remainder lands in
   `activation_bytes` (runtime folded in), zero/negative measurements are
   treated as no-measurement. Regression tests:
   `test_measured_over_budget_is_honest`, `test_measured_offload_still_reachable`,
   `test_measured_below_computed_weights_clamps`,
   `test_zero_or_negative_measurement_is_not_a_measurement`.
2. **Task 8 addition:** when `weight_bytes_native` is 0 (unparseable size,
   nothing local) and no measurement exists, the readiness string must
   disclose the uncertainty (append "(weight size unknown)") rather than
   reporting a confident bands-only verdict.

## After the milestone

Per spec 8.4: **Codex independent review (final sweep)** on the full Foundry surface before declaring Foundry v1 done. Then Pillar 2 (Accelerator) planning begins on top of `resolve_model_runtime`'s plan contract.
