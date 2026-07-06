# Studio Live Step Preview (#33) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Studio's Generate button submits a real image job from the Studio prompt config, and the composition canvas streams live per-step preview frames decoded on the backend with taesd tiny-VAE decoders.

**Architecture:** Backend decodes in-flight latents (throttled 0.5 s/job) inside the existing diffusers step callback and stores the latest JPEG per job; the existing 500 ms `/ws` loop pushes a new `step_image` message per revision; electron forwards it on a new `generation:step-image` IPC channel; the renderer's new `runStudioGeneration` feature function submits the draft config, polls, and drives the preview-slice lifecycle (clear on submit, handoff on complete, cancel, degrade).

**Tech Stack:** FastAPI/PyTorch (diffusers `AutoencoderTiny`), Electron 33 + `ws`, React 19 + Zustand, Vitest, pytest.

**Spec:** `docs/superpowers/specs/2026-07-05-studio-step-preview-design.md`

## Global Constraints

- Branch: `feat/studio-step-preview`. Never commit on main. Never `git add -A` (LICENSE.txt stays untracked).
- Commits via the Bash tool: `export PATH="/c/Program Files/nodejs:$PATH"` first, `git branch --show-current` in the same call. Never `--no-verify`.
- Backend tests: `backend/venv/Scripts/python.exe -m pytest` from `backend/` (bare `python` is a dep-less system 3.14).
- Frontend tests: `npx vitest run <file>`; full gates at the end: `npm run typecheck`, `npm test`, `npm run build`.
- User-facing error strings never contain filesystem paths.
- No emoji in `src/` (ui-glyphs test); no decorative em-dash - ASCII hyphen only. lucide-react icons only.
- Design tokens: reuse `border-status-error-border` / `bg-status-error-muted` / `text-status-error`, `.raised-control`, `type-caption`, `rounded-sm`. No new tokens.
- Preview failures must NEVER fail or noticeably slow a generation (fail-soft everywhere on the backend).
- Message contract (WS + IPC, exact keys): `{"type": "step_image", "job_id": str, "step": int (1-based), "total_steps": int, "image": "data:image/jpeg;base64,..."}`.

---

## File Structure

```
backend/preview/__init__.py                          (new, empty package marker)
backend/preview/decoders.py                          (new: family map, dir resolution, load, decode)
backend/preview/step_preview.py                      (new: throttled service + singleton)
backend/utils/direct_generator.py                    (modify: submit from step callback)
backend/main.py                                      (modify: build_ws_updates, send_job_updates, eviction)
backend/tests/test_preview_decoders.py               (new)
backend/tests/test_step_preview_service.py           (new)
backend/tests/test_direct_generator_step_preview.py  (new)
backend/tests/test_ws_step_images.py                 (new)
backend/tests/test_step_preview_smoke_local.py       (new, VS_REAL_SMOKE gated)
electron/ipc-handlers/backendWsRouting.ts            (new: pure message router)
electron/ipc-handlers/backendWsRouting.test.ts       (new)
electron/ipc-handlers/generation.ts                  (modify: delegate ws message handling)
electron/preload.ts                                  (modify: onStepImage)
src/types/electron.d.ts                              (modify: StepImageEvent + onStepImage)
src/store/slices/generationPreviewSlice.ts           (modify: lifecycle state/actions)
src/store/appStore.types.ts                          (modify: state + action types)
src/store/appStore.test.ts                           (modify: new slice tests)
src/features/studio/runStudioGeneration.ts           (new: shared submit + poll + lifecycle)
src/features/studio/runStudioGeneration.test.ts      (new)
src/features/studio/useStepImageSubscription.ts      (new: IPC -> store hook)
src/features/studio/useStepImageSubscription.test.ts (new)
src/components/studio/ProgressivePreview.tsx         (modify: frame derive, cancel, degrade)
src/components/studio/ProgressivePreview.test.tsx    (modify)
src/components/studio/CompositionPreview.tsx         (modify: real Generate, hook, error strip)
src/components/studio/CompositionPreview.test.tsx    (modify)
src/components/studio/PromptStudioPanel.tsx          (modify: default draft model fix)
src/components/studio/PromptStudioPanel.test.tsx     (modify: buildDefaultGenerationDraft test)
scripts/fetch-preview-decoders.cjs                   (new)
scripts/assert-native-backend.cjs                    (modify: decoder gate)
scripts/build-windows.cjs                            (modify: run fetch during resource prep)
.gitignore                                           (modify: resources/preview-decoders/)
```

---

### Task 1: Backend decoder registry (`backend/preview/decoders.py`)

**Files:**
- Create: `backend/preview/__init__.py`
- Create: `backend/preview/decoders.py`
- Test: `backend/tests/test_preview_decoders.py`

**Interfaces:**
- Produces: `FAMILY_DECODERS: Dict[str, str]`, `PreviewDecoderUnavailable(Exception)`,
  `resolve_decoders_dir() -> Optional[str]`, `decoder_dir_for_family(family) -> str`,
  `load_decoder(family, device="cpu")`, `_unpack_flux_latents(latents, width, height)`,
  `decode_latents_to_data_uri(latents, family, width, height) -> str`,
  `_clear_decoder_cache()`, `ENV_DECODERS_DIR = "VISION_STUDIO_PREVIEW_DECODERS_DIR"`.

- [ ] **Step 1: Write the failing tests**

`backend/tests/test_preview_decoders.py`:

```python
"""#33: taesd decoder registry - family map, dir resolution, FLUX unpack."""

import os
import pathlib
import sys
import unittest
from unittest import mock

import pytest

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from preview import decoders  # noqa: E402


class FamilyMapTests(unittest.TestCase):
    def test_exactly_the_four_supported_families(self):
        self.assertEqual(decoders.FAMILY_DECODERS, {
            "sd15": "taesd",
            "sdxl": "taesdxl",
            "sd35": "taesd3",
            "flux": "taef1",
        })


class ResolveDecodersDirTests(unittest.TestCase):
    def setUp(self):
        import tempfile
        self.tmp = tempfile.mkdtemp()
        self.addCleanup(lambda: __import__("shutil").rmtree(self.tmp, ignore_errors=True))

    def test_env_override_wins(self):
        with mock.patch.dict(os.environ, {decoders.ENV_DECODERS_DIR: self.tmp}):
            self.assertEqual(decoders.resolve_decoders_dir(), self.tmp)

    def test_env_override_pointing_nowhere_disables_previews(self):
        missing = os.path.join(self.tmp, "nope")
        with mock.patch.dict(os.environ, {decoders.ENV_DECODERS_DIR: missing}):
            self.assertIsNone(decoders.resolve_decoders_dir())

    def test_frozen_resolves_beside_the_executable(self):
        exe_dir = os.path.join(self.tmp, "resources")
        os.makedirs(os.path.join(exe_dir, "preview-decoders"))
        with mock.patch.dict(os.environ, {}, clear=False), \
                mock.patch.object(sys, "frozen", True, create=True), \
                mock.patch.object(sys, "executable", os.path.join(exe_dir, "backend.exe")):
            os.environ.pop(decoders.ENV_DECODERS_DIR, None)
            self.assertEqual(
                decoders.resolve_decoders_dir(),
                os.path.join(exe_dir, "preview-decoders"))

    def test_source_run_resolves_repo_resources(self):
        backend_root = os.path.join(self.tmp, "repo", "backend")
        target = os.path.join(self.tmp, "repo", "resources", "preview-decoders")
        os.makedirs(backend_root)
        os.makedirs(target)
        with mock.patch.dict(os.environ, {}, clear=False), \
                mock.patch.object(decoders, "_backend_root", lambda: backend_root):
            os.environ.pop(decoders.ENV_DECODERS_DIR, None)
            self.assertEqual(
                os.path.normpath(decoders.resolve_decoders_dir()),
                os.path.normpath(target))

    def test_packaged_source_fallback_resolves_sibling_dir(self):
        backend_root = os.path.join(self.tmp, "res", "backend-source")
        target = os.path.join(self.tmp, "res", "preview-decoders")
        os.makedirs(backend_root)
        os.makedirs(target)
        with mock.patch.dict(os.environ, {}, clear=False), \
                mock.patch.object(decoders, "_backend_root", lambda: backend_root):
            os.environ.pop(decoders.ENV_DECODERS_DIR, None)
            self.assertEqual(
                os.path.normpath(decoders.resolve_decoders_dir()),
                os.path.normpath(target))

    def test_nothing_installed_returns_none(self):
        backend_root = os.path.join(self.tmp, "empty", "backend")
        os.makedirs(backend_root)
        with mock.patch.dict(os.environ, {}, clear=False), \
                mock.patch.object(decoders, "_backend_root", lambda: backend_root):
            os.environ.pop(decoders.ENV_DECODERS_DIR, None)
            self.assertIsNone(decoders.resolve_decoders_dir())


class DecoderDirForFamilyTests(unittest.TestCase):
    def setUp(self):
        import tempfile
        self.tmp = tempfile.mkdtemp()
        self.addCleanup(lambda: __import__("shutil").rmtree(self.tmp, ignore_errors=True))

    def test_unsupported_family_raises(self):
        with mock.patch.dict(os.environ, {decoders.ENV_DECODERS_DIR: self.tmp}):
            for family in ("svd", "ltx", "animatediff", "unknown", None):
                with self.assertRaises(decoders.PreviewDecoderUnavailable):
                    decoders.decoder_dir_for_family(family)

    def test_missing_weights_dir_raises(self):
        with mock.patch.dict(os.environ, {decoders.ENV_DECODERS_DIR: self.tmp}):
            with self.assertRaises(decoders.PreviewDecoderUnavailable):
                decoders.decoder_dir_for_family("sd15")

    def test_installed_family_resolves(self):
        os.makedirs(os.path.join(self.tmp, "taesd"))
        with mock.patch.dict(os.environ, {decoders.ENV_DECODERS_DIR: self.tmp}):
            self.assertEqual(
                decoders.decoder_dir_for_family("sd15"),
                os.path.join(self.tmp, "taesd"))

    def test_error_messages_carry_no_paths(self):
        with mock.patch.dict(os.environ, {decoders.ENV_DECODERS_DIR: self.tmp}):
            try:
                decoders.decoder_dir_for_family("sd15")
            except decoders.PreviewDecoderUnavailable as exc:
                self.assertNotIn(self.tmp, str(exc))
                self.assertNotIn("\\", str(exc))


def test_flux_unpack_shape_and_patch_placement():
    torch = pytest.importorskip("torch")

    # width=64, height=32 -> lat 8x4 -> patch grid 4x2 -> 8 packed patches of 64.
    packed = torch.zeros(1, 8, 64)
    packed[0, 0, :] = 1.0  # only patch (0, 0) carries signal

    unpacked = decoders._unpack_flux_latents(packed, width=64, height=32)

    assert tuple(unpacked.shape) == (1, 16, 4, 8)
    # Patch (0, 0) covers the 2x2 top-left spatial block on every channel...
    assert torch.all(unpacked[0, :, 0:2, 0:2] == 1.0)
    # ...and nothing else.
    assert float(unpacked.abs().sum()) == float(unpacked[0, :, 0:2, 0:2].sum())


def test_flux_unpack_constant_stays_constant():
    torch = pytest.importorskip("torch")
    packed = torch.full((1, 8, 64), 3.5)
    unpacked = decoders._unpack_flux_latents(packed, width=64, height=32)
    assert torch.all(unpacked == 3.5)


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run tests, verify they fail**

Run (from `backend/`): `venv/Scripts/python.exe -m pytest tests/test_preview_decoders.py -v`
Expected: FAIL / collection error - `ModuleNotFoundError: No module named 'preview'`.

- [ ] **Step 3: Implement**

`backend/preview/__init__.py`:

```python
"""Studio live step preview (#33): tiny-VAE decoders + throttled service."""
```

`backend/preview/decoders.py`:

```python
"""Tiny-VAE (taesd) preview decoders (#33).

Maps checkpoint families to the shipped AutoencoderTiny decoder weights and
turns in-flight diffusion latents into small JPEG data URIs for the live
step preview. Every failure path degrades to "no preview" - never into a
generation failure. Error strings stay path-free (they can reach the UI).
"""

import base64
import io
import os
import sys
import threading
from typing import Any, Dict, Optional

# base_architecture (verified catalog) -> decoder weights dir name.
FAMILY_DECODERS: Dict[str, str] = {
    "sd15": "taesd",
    "sdxl": "taesdxl",
    "sd35": "taesd3",
    "flux": "taef1",
}

ENV_DECODERS_DIR = "VISION_STUDIO_PREVIEW_DECODERS_DIR"

MAX_PREVIEW_EDGE = 512
JPEG_QUALITY = 70


class PreviewDecoderUnavailable(Exception):
    """No decoder can serve this family (unsupported, or weights missing)."""


def _backend_root() -> str:
    return os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def resolve_decoders_dir() -> Optional[str]:
    """Locate the preview-decoders root, or None when previews are disabled.

    Precedence: explicit env override (an override pointing nowhere disables
    previews rather than silently falling through), the PyInstaller bundle's
    sibling dir, the dev checkout's resources/, then the packaged
    backend-source fallback's sibling dir.
    """
    env_dir = os.environ.get(ENV_DECODERS_DIR, "").strip()
    if env_dir:
        return env_dir if os.path.isdir(env_dir) else None

    candidates = []
    if getattr(sys, "frozen", False):
        candidates.append(
            os.path.join(os.path.dirname(sys.executable), "preview-decoders"))
    backend_root = _backend_root()
    candidates.append(os.path.normpath(
        os.path.join(backend_root, "..", "resources", "preview-decoders")))
    candidates.append(os.path.normpath(
        os.path.join(backend_root, "..", "preview-decoders")))

    for candidate in candidates:
        if os.path.isdir(candidate):
            return candidate
    return None


def decoder_dir_for_family(family: Optional[str]) -> str:
    name = FAMILY_DECODERS.get(family or "")
    if not name:
        raise PreviewDecoderUnavailable(
            f"No step-preview decoder exists for the '{family or 'unknown'}' family.")
    root = resolve_decoders_dir()
    if not root:
        raise PreviewDecoderUnavailable(
            "Step-preview decoder weights are not installed.")
    path = os.path.join(root, name)
    if not os.path.isdir(path):
        raise PreviewDecoderUnavailable(
            f"The step-preview decoder '{name}' is not installed.")
    return path


_decoder_cache: Dict[str, Any] = {}
_cache_lock = threading.Lock()


def _clear_decoder_cache() -> None:
    with _cache_lock:
        _decoder_cache.clear()


def load_decoder(family: Optional[str], device: str = "cpu"):
    """Cached AutoencoderTiny for the family, eval-mode, float32, on device."""
    path = decoder_dir_for_family(family)
    key = f"{family}::{device}"
    with _cache_lock:
        cached = _decoder_cache.get(key)
    if cached is not None:
        return cached

    try:
        import torch
        from diffusers import AutoencoderTiny
    except ImportError as exc:
        raise PreviewDecoderUnavailable(
            "torch/diffusers are not available for step previews.") from exc

    try:
        decoder = AutoencoderTiny.from_pretrained(path, torch_dtype=torch.float32)
        decoder = decoder.to(device)
        decoder.eval()
    except Exception as exc:
        raise PreviewDecoderUnavailable(
            f"The step-preview decoder '{FAMILY_DECODERS[family]}' failed to load."
        ) from exc

    with _cache_lock:
        _decoder_cache[key] = decoder
    return decoder


def _unpack_flux_latents(latents, width: int, height: int):
    """Packed FLUX latents [B, (H/16)(W/16), 64] -> [B, 16, H/8, W/8].

    Mirrors FluxPipeline._unpack_latents with vae_scale_factor=8 (kept local:
    the pipeline helper is private API).
    """
    batch_size, _, channels = latents.shape
    lat_h = 2 * (int(height) // 16)
    lat_w = 2 * (int(width) // 16)
    latents = latents.view(batch_size, lat_h // 2, lat_w // 2, channels // 4, 2, 2)
    latents = latents.permute(0, 3, 1, 4, 2, 5)
    return latents.reshape(batch_size, channels // 4, lat_h, lat_w)


def decode_latents_to_data_uri(
    latents, family: Optional[str], width: int, height: int
) -> str:
    """Decode one latent batch into a JPEG data URI (longest edge <= 512).

    Raises PreviewDecoderUnavailable (or any decode error) - the calling
    service converts every exception into "preview disabled for this job".
    """
    import torch
    from PIL import Image

    decoder = load_decoder(family)
    with torch.no_grad():
        lat = latents.detach()
        if family == "flux" and lat.dim() == 3:
            lat = _unpack_flux_latents(lat, width, height)
        lat = lat[:1].to(device=decoder.device, dtype=decoder.dtype)
        config = decoder.config
        scaling = float(getattr(config, "scaling_factor", 1.0) or 1.0)
        shift = float(getattr(config, "shift_factor", 0.0) or 0.0)
        lat = lat / scaling + shift
        image = decoder.decode(lat).sample[0]
        image = (image / 2 + 0.5).clamp(0, 1)
        array = (image.permute(1, 2, 0).cpu().float().numpy() * 255).round().astype("uint8")

    pil = Image.fromarray(array)
    longest = max(pil.size)
    if longest > MAX_PREVIEW_EDGE:
        scale = MAX_PREVIEW_EDGE / longest
        pil = pil.resize(
            (max(1, round(pil.width * scale)), max(1, round(pil.height * scale))),
            Image.Resampling.LANCZOS)
    buffer = io.BytesIO()
    pil.convert("RGB").save(buffer, format="JPEG", quality=JPEG_QUALITY)
    encoded = base64.b64encode(buffer.getvalue()).decode("ascii")
    return f"data:image/jpeg;base64,{encoded}"
```

- [ ] **Step 4: Run tests, verify they pass**

Run: `venv/Scripts/python.exe -m pytest tests/test_preview_decoders.py -v`
Expected: all PASS (FLUX unpack tests run locally because venv has torch; they skip on stub CI).

- [ ] **Step 5: Commit**

```bash
git add backend/preview/__init__.py backend/preview/decoders.py backend/tests/test_preview_decoders.py
git commit -m "feat(preview): taesd decoder registry - family map, dir resolution, FLUX unpack (#33)"
```

---

### Task 2: Step preview service (`backend/preview/step_preview.py`)

**Files:**
- Create: `backend/preview/step_preview.py`
- Test: `backend/tests/test_step_preview_service.py`

**Interfaces:**
- Consumes: `preview.decoders.decode_latents_to_data_uri` (default decode seam).
- Produces: `StepPreview(revision, step, total_steps, image)` dataclass;
  `StepPreviewService(decode=..., clock=...)` with `.submit(job_id, step,
  total_steps, latents, family, width, height)`, `.latest(job_id)`,
  `.discard(job_id)`; module singleton `step_preview_service`;
  `MIN_DECODE_INTERVAL_S = 0.5`.

- [ ] **Step 1: Write the failing tests**

`backend/tests/test_step_preview_service.py`:

```python
"""#33: StepPreviewService - throttle, revisions, fail-soft, eviction."""

import pathlib
import sys
import unittest

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from preview.step_preview import MIN_DECODE_INTERVAL_S, StepPreviewService  # noqa: E402


class _Clock:
    def __init__(self):
        self.now = 100.0

    def __call__(self):
        return self.now

    def advance(self, seconds):
        self.now += seconds


def _service(decode=None, clock=None):
    calls = []

    def default_decode(latents, family, width, height):
        calls.append((latents, family, width, height))
        return f"data:image/jpeg;base64,frame{len(calls)}"

    service = StepPreviewService(decode=decode or default_decode, clock=clock or _Clock())
    return service, calls


class SubmitTests(unittest.TestCase):
    def test_first_submit_always_decodes(self):
        service, calls = _service()
        service.submit(job_id="j", step=1, total_steps=25,
                       latents="LAT", family="sd15", width=512, height=512)
        self.assertEqual(calls, [("LAT", "sd15", 512, 512)])
        preview = service.latest("j")
        self.assertEqual((preview.revision, preview.step, preview.total_steps),
                         (1, 1, 25))
        self.assertEqual(preview.image, "data:image/jpeg;base64,frame1")

    def test_submits_inside_the_throttle_window_are_skipped(self):
        clock = _Clock()
        service, calls = _service(clock=clock)
        service.submit(job_id="j", step=1, total_steps=25,
                       latents="A", family="sd15", width=64, height=64)
        clock.advance(MIN_DECODE_INTERVAL_S - 0.1)
        service.submit(job_id="j", step=2, total_steps=25,
                       latents="B", family="sd15", width=64, height=64)
        self.assertEqual(len(calls), 1)
        self.assertEqual(service.latest("j").step, 1)

    def test_submit_after_the_window_decodes_and_bumps_revision(self):
        clock = _Clock()
        service, calls = _service(clock=clock)
        service.submit(job_id="j", step=1, total_steps=25,
                       latents="A", family="sd15", width=64, height=64)
        clock.advance(MIN_DECODE_INTERVAL_S + 0.01)
        service.submit(job_id="j", step=7, total_steps=25,
                       latents="B", family="sd15", width=64, height=64)
        self.assertEqual(len(calls), 2)
        preview = service.latest("j")
        self.assertEqual((preview.revision, preview.step), (2, 7))

    def test_none_latents_are_ignored(self):
        service, calls = _service()
        service.submit(job_id="j", step=1, total_steps=25,
                       latents=None, family="sd15", width=64, height=64)
        self.assertEqual(calls, [])
        self.assertIsNone(service.latest("j"))

    def test_decode_failure_disables_the_job_without_raising(self):
        clock = _Clock()

        def broken_decode(latents, family, width, height):
            raise RuntimeError("decoder exploded")

        service, _ = _service(decode=broken_decode, clock=clock)
        service.submit(job_id="j", step=1, total_steps=25,
                       latents="A", family="sd15", width=64, height=64)  # must not raise
        self.assertIsNone(service.latest("j"))

        # A later submit does not retry the broken decoder.
        attempts = []

        def counting_decode(latents, family, width, height):
            attempts.append(1)
            return "data:image/jpeg;base64,x"

        service._decode = counting_decode
        clock.advance(10)
        service.submit(job_id="j", step=2, total_steps=25,
                       latents="B", family="sd15", width=64, height=64)
        self.assertEqual(attempts, [])

    def test_jobs_are_throttled_independently(self):
        service, calls = _service()
        service.submit(job_id="a", step=1, total_steps=10,
                       latents="A", family="sd15", width=64, height=64)
        service.submit(job_id="b", step=1, total_steps=10,
                       latents="B", family="sdxl", width=64, height=64)
        self.assertEqual(len(calls), 2)

    def test_discard_clears_state_and_reenables(self):
        def broken_decode(latents, family, width, height):
            raise RuntimeError("boom")

        service, _ = _service(decode=broken_decode)
        service.submit(job_id="j", step=1, total_steps=10,
                       latents="A", family="sd15", width=64, height=64)
        service.discard("j")
        self.assertIsNone(service.latest("j"))

        recovered = []
        service._decode = lambda latents, family, width, height: (
            recovered.append(1) or "data:image/jpeg;base64,ok")
        service._clock = _Clock()
        service.submit(job_id="j", step=1, total_steps=10,
                       latents="A", family="sd15", width=64, height=64)
        self.assertEqual(recovered, [1])


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `venv/Scripts/python.exe -m pytest tests/test_step_preview_service.py -v`
Expected: FAIL - `ModuleNotFoundError: No module named 'preview.step_preview'`.

- [ ] **Step 3: Implement**

`backend/preview/step_preview.py`:

```python
"""Step preview service (#33): throttled tiny-VAE decode of in-flight latents.

submit() runs inside the generation worker thread. Every failure degrades to
"no preview for this job" - it must never raise into the diffusers step
callback or slow the run beyond the throttled decode itself.
"""

import logging
import threading
import time
from dataclasses import dataclass
from typing import Callable, Dict, Optional, Set

from preview.decoders import decode_latents_to_data_uri

logger = logging.getLogger(__name__)

MIN_DECODE_INTERVAL_S = 0.5


@dataclass(frozen=True)
class StepPreview:
    revision: int
    step: int
    total_steps: int
    image: str


class StepPreviewService:
    """Thread-safe per-job holder of the latest decoded step frame."""

    def __init__(
        self,
        decode: Callable[..., str] = decode_latents_to_data_uri,
        clock: Callable[[], float] = time.monotonic,
    ):
        self._decode = decode
        self._clock = clock
        self._lock = threading.Lock()
        self._latest: Dict[str, StepPreview] = {}
        self._last_decode_at: Dict[str, float] = {}
        self._disabled: Set[str] = set()

    def submit(self, job_id: str, step: int, total_steps: int,
               latents, family: Optional[str], width: int, height: int) -> None:
        if latents is None:
            return
        with self._lock:
            if job_id in self._disabled:
                return
            last = self._last_decode_at.get(job_id)
            now = self._clock()
            if last is not None and (now - last) < MIN_DECODE_INTERVAL_S:
                return
            self._last_decode_at[job_id] = now

        try:
            image = self._decode(latents, family, width, height)
        except Exception as exc:  # noqa: BLE001 - preview must never propagate
            with self._lock:
                self._disabled.add(job_id)
            logger.warning("Step preview disabled for job %s: %s", job_id, exc)
            return

        with self._lock:
            previous = self._latest.get(job_id)
            revision = previous.revision + 1 if previous else 1
            self._latest[job_id] = StepPreview(
                revision=revision, step=step, total_steps=total_steps, image=image)

    def latest(self, job_id: str) -> Optional[StepPreview]:
        with self._lock:
            return self._latest.get(job_id)

    def discard(self, job_id: str) -> None:
        with self._lock:
            self._latest.pop(job_id, None)
            self._last_decode_at.pop(job_id, None)
            self._disabled.discard(job_id)


step_preview_service = StepPreviewService()
```

- [ ] **Step 4: Run tests, verify they pass**

Run: `venv/Scripts/python.exe -m pytest tests/test_step_preview_service.py -v`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/preview/step_preview.py backend/tests/test_step_preview_service.py
git commit -m "feat(preview): throttled step-preview service - fail-soft, per-job revisions (#33)"
```

---

### Task 3: Generator wiring (`backend/utils/direct_generator.py`)

**Files:**
- Modify: `backend/utils/direct_generator.py` (imports + the `progress_callback_fn` closure in `generate_image`, currently around lines 356-366)
- Test: `backend/tests/test_direct_generator_step_preview.py`

**Interfaces:**
- Consumes: `preview.step_preview.step_preview_service`, module-level `_resolve_record` (already in `direct_generator`).
- Produces: every image generation submits `(job_id, step+1, steps, latents, family, width, height)` to the service from the worker thread.

- [ ] **Step 1: Write the failing test**

`backend/tests/test_direct_generator_step_preview.py`:

```python
"""#33: the step callback threads latents into the step-preview service.

Torch-free (patches the torch/diffusers seams) so it runs on stub CI -
mirrors test_direct_generator_progress.py.
"""

import pathlib
import shutil
import sys
import tempfile
import unittest
from unittest import mock

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

import utils.direct_generator as dg  # noqa: E402


class _FakeCuda:
    @staticmethod
    def is_available():
        return False


class _FakeTorch:
    cuda = _FakeCuda()


class StepPreviewWiringTests(unittest.IsolatedAsyncioTestCase):
    def _tmp(self):
        path = tempfile.mkdtemp()
        self.addCleanup(lambda: shutil.rmtree(path, ignore_errors=True))
        return path

    def _generator(self):
        with mock.patch.object(dg, "torch", _FakeTorch()), \
                mock.patch.object(dg, "DIFFUSERS_AVAILABLE", True), \
                mock.patch("foundry.accelerator.configure_inductor_cache",
                           lambda *a, **k: None):
            return dg.DirectGenerator(self._tmp(), self._tmp())

    async def test_step_callback_submits_latents_to_preview_service(self):
        gen = self._generator()
        submits = []

        def fake_sync(*args):
            progress_callback_fn = args[9]
            progress_callback_fn(0, 0, "LATENTS")
            return {
                "images": [], "seed": 1, "width": 8, "height": 8,
                "prompt": "x", "model": "m", "acceleration": None,
            }

        gen._generate_sync = fake_sync

        with mock.patch.object(
                dg, "_resolve_record", lambda name: {"base_architecture": "sd15"}), \
                mock.patch.object(dg.step_preview_service, "submit",
                                  side_effect=lambda **kw: submits.append(kw)):
            await gen.generate_image(
                job_id="prev", prompt="x", steps=4, width=64, height=96,
                model_name="sd-1-5",
            )

        self.assertEqual(len(submits), 1)
        self.assertEqual(submits[0], {
            "job_id": "prev", "step": 1, "total_steps": 4,
            "latents": "LATENTS", "family": "sd15",
            "width": 64, "height": 96,
        })

    async def test_missing_record_submits_none_family(self):
        gen = self._generator()
        submits = []

        def fake_sync(*args):
            args[9](2, 0, "L")
            return {
                "images": [], "seed": 1, "width": 8, "height": 8,
                "prompt": "x", "model": "m", "acceleration": None,
            }

        gen._generate_sync = fake_sync

        with mock.patch.object(dg, "_resolve_record", lambda name: None), \
                mock.patch.object(dg.step_preview_service, "submit",
                                  side_effect=lambda **kw: submits.append(kw)):
            await gen.generate_image(
                job_id="prev2", prompt="x", steps=4, model_name="mystery",
            )

        self.assertEqual(submits[0]["family"], None)
        self.assertEqual(submits[0]["step"], 3)


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run test, verify it fails**

Run: `venv/Scripts/python.exe -m pytest tests/test_direct_generator_step_preview.py -v`
Expected: FAIL - `AttributeError: module ... has no attribute 'step_preview_service'`.

- [ ] **Step 3: Implement**

In `backend/utils/direct_generator.py`, add the import beside the other project imports (near the `guided` imports at the top):

```python
from preview.step_preview import step_preview_service
```

Then extend the closure in `generate_image` (currently):

```python
        loop = asyncio.get_running_loop()

        def progress_callback_fn(step, timestep, latents):
            if progress_callback:
                progress = (step + 1) / steps * 100
                loop.call_soon_threadsafe(progress_callback, progress)
```

becomes:

```python
        loop = asyncio.get_running_loop()

        # #33: family for the step-preview decoder; None disables previews
        # (the service fail-softs on unsupported families).
        preview_family = (_resolve_record(model_name) or {}).get("base_architecture")

        def progress_callback_fn(step, timestep, latents):
            # #33: decode + store the latest step frame (throttled, fail-soft,
            # runs here in the worker thread so it never blocks the loop).
            step_preview_service.submit(
                job_id=job_id, step=step + 1, total_steps=steps,
                latents=latents, family=preview_family,
                width=width, height=height)
            if progress_callback:
                progress = (step + 1) / steps * 100
                loop.call_soon_threadsafe(progress_callback, progress)
```

- [ ] **Step 4: Run tests, verify they pass (including the existing progress regression)**

Run: `venv/Scripts/python.exe -m pytest tests/test_direct_generator_step_preview.py tests/test_direct_generator_progress.py -v`
Expected: all PASS (the existing progress test drives `progress_callback_fn(0, 0, None)` - `submit` ignores `None` latents).

- [ ] **Step 5: Commit**

```bash
git add backend/utils/direct_generator.py backend/tests/test_direct_generator_step_preview.py
git commit -m "feat(preview): submit step latents to the preview service from the generator callback (#33)"
```

---

### Task 4: WebSocket `step_image` + eviction (`backend/main.py`)

**Files:**
- Modify: `backend/main.py` (import; `send_job_updates` around line 2310; `process_image_generation` around line 1354)
- Test: `backend/tests/test_ws_step_images.py`

**Interfaces:**
- Consumes: `step_preview_service.latest/.discard`, `job_manager.list_jobs`.
- Produces: `build_ws_updates(active_jobs, sent_revisions) -> List[Dict[str, Any]]`
  (mutates `sent_revisions`, the per-connection state); `process_image_generation`
  discards previews on every terminal path.

- [ ] **Step 1: Write the failing tests**

`backend/tests/test_ws_step_images.py`:

```python
"""#33: WS tick builder emits step_image once per revision; previews are
evicted on every terminal path of process_image_generation."""

import pathlib
import sys
import unittest
from unittest import mock

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

import main  # noqa: E402
from preview.step_preview import StepPreview  # noqa: E402
from utils.job_manager import GenerationJob, JobStatus  # noqa: E402


def _job(job_id="job-1", progress=40.0):
    return GenerationJob(
        id=job_id, type="image", status=JobStatus.PROCESSING,
        params={}, output_dir="out", progress=progress)


class BuildWsUpdatesTests(unittest.TestCase):
    def test_step_image_sent_once_per_revision(self):
        job = _job()
        preview = StepPreview(revision=3, step=5, total_steps=25,
                              image="data:image/jpeg;base64,AAAA")
        sent = {}
        with mock.patch.object(main.step_preview_service, "latest",
                               return_value=preview):
            first = main.build_ws_updates([job], sent)
            second = main.build_ws_updates([job], sent)

        self.assertEqual([m["type"] for m in first], ["job_update", "step_image"])
        self.assertEqual(first[1], {
            "type": "step_image", "job_id": "job-1", "step": 5,
            "total_steps": 25, "image": "data:image/jpeg;base64,AAAA",
        })
        self.assertEqual([m["type"] for m in second], ["job_update"])

    def test_job_update_shape_is_unchanged(self):
        sent = {}
        with mock.patch.object(main.step_preview_service, "latest",
                               return_value=None):
            messages = main.build_ws_updates([_job(progress=62.5)], sent)
        self.assertEqual(messages, [{
            "type": "job_update", "job_id": "job-1",
            "status": "processing", "progress": 62.5,
        }])

    def test_new_revision_sends_again(self):
        job = _job()
        sent = {}
        with mock.patch.object(main.step_preview_service, "latest",
                               return_value=StepPreview(1, 1, 25, "data:image/jpeg;base64,A")):
            main.build_ws_updates([job], sent)
        with mock.patch.object(main.step_preview_service, "latest",
                               return_value=StepPreview(2, 2, 25, "data:image/jpeg;base64,B")):
            messages = main.build_ws_updates([job], sent)
        self.assertEqual([m["type"] for m in messages], ["job_update", "step_image"])
        self.assertEqual(messages[1]["step"], 2)


class EvictionTests(unittest.IsolatedAsyncioTestCase):
    async def test_discards_preview_on_completion(self):
        discards = []
        request = main.ImageGenerationRequest(prompt="x")

        async def fake_generate_direct(job_id, req):
            return {"images": [], "seed": 1}

        with mock.patch.object(main, "comfy_client", None), \
                mock.patch.object(main, "generate_direct", fake_generate_direct), \
                mock.patch.object(main.step_preview_service, "discard",
                                  side_effect=discards.append):
            await main.process_image_generation("job-evict", request)

        self.assertEqual(discards, ["job-evict"])

    async def test_discards_preview_on_failure(self):
        discards = []
        request = main.ImageGenerationRequest(prompt="x")

        async def failing_generate_direct(job_id, req):
            raise RuntimeError("boom")

        with mock.patch.object(main, "comfy_client", None), \
                mock.patch.object(main, "generate_direct", failing_generate_direct), \
                mock.patch.object(main.step_preview_service, "discard",
                                  side_effect=discards.append):
            await main.process_image_generation("job-evict-f", request)

        self.assertEqual(discards, ["job-evict-f"])


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `venv/Scripts/python.exe -m pytest tests/test_ws_step_images.py -v`
Expected: FAIL - `AttributeError: module 'main' has no attribute 'step_preview_service'` / `'build_ws_updates'`.

- [ ] **Step 3: Implement**

In `backend/main.py`:

1. Add the import beside the other project imports:

```python
from preview.step_preview import step_preview_service
```

2. Replace `send_job_updates` (and add `build_ws_updates` directly above it):

```python
def build_ws_updates(active_jobs, sent_revisions: Dict[str, int]) -> List[Dict[str, Any]]:
    """One WS tick: a job_update per processing job, plus at most one new
    step_image per job whose preview revision this connection has not sent
    yet (#33). Mutates sent_revisions - the per-connection dedup state. The
    500ms tick is what caps the stream at ~2 frames/sec."""
    messages: List[Dict[str, Any]] = []
    for job in active_jobs:
        messages.append({
            "type": "job_update",
            "job_id": job.id,
            "status": job.status.value,
            "progress": job.progress,
        })
        preview = step_preview_service.latest(job.id)
        if preview and sent_revisions.get(job.id) != preview.revision:
            sent_revisions[job.id] = preview.revision
            messages.append({
                "type": "step_image",
                "job_id": job.id,
                "step": preview.step,
                "total_steps": preview.total_steps,
                "image": preview.image,
            })
    return messages


async def send_job_updates(websocket: WebSocket):
    """Send periodic job updates"""
    sent_revisions: Dict[str, int] = {}
    try:
        while True:
            active_jobs = job_manager.list_jobs(status="processing")
            for message in build_ws_updates(active_jobs, sent_revisions):
                await websocket.send_json(message)

            await asyncio.sleep(0.5)  # Update every 500ms

    except asyncio.CancelledError:
        pass
```

3. In `process_image_generation`, append a `finally` after the last `except Exception` block:

```python
    finally:
        # #33: free the stored preview frame on every terminal path.
        step_preview_service.discard(job_id)
```

- [ ] **Step 4: Run tests, verify they pass**

Run: `venv/Scripts/python.exe -m pytest tests/test_ws_step_images.py -v`
Expected: all PASS.

- [ ] **Step 5: Run the full backend suite (wiring touched main.py)**

Run: `venv/Scripts/python.exe -m pytest -q`
Expected: everything green (same pass/skip counts as before plus the new tests).

- [ ] **Step 6: Commit**

```bash
git add backend/main.py backend/tests/test_ws_step_images.py
git commit -m "feat(preview): step_image WS messages per revision + terminal eviction (#33)"
```

---

### Task 5: Electron forwarding (`backendWsRouting` + preload + types)

**Files:**
- Create: `electron/ipc-handlers/backendWsRouting.ts`
- Test: `electron/ipc-handlers/backendWsRouting.test.ts`
- Modify: `electron/ipc-handlers/generation.ts` (ws message handler, lines 166-176)
- Modify: `electron/preload.ts` (generation namespace, after `onProgress`, ~line 419)
- Modify: `src/types/electron.d.ts` (generation interface ~line 383 + new event type near `JobStatus`)

**Interfaces:**
- Produces: `routeBackendWsMessage(raw: string, send: (channel: string, payload: unknown) => void): void`;
  renderer channel `generation:step-image`; preload `generation.onStepImage(cb) => unsubscribe`;
  `StepImageEvent` type.

- [ ] **Step 1: Write the failing test**

`electron/ipc-handlers/backendWsRouting.test.ts`:

```typescript
import { describe, expect, it, vi } from 'vitest';

import { routeBackendWsMessage } from './backendWsRouting';

describe('routeBackendWsMessage', () => {
  it('routes job_update to generation:progress', () => {
    const send = vi.fn();
    const message = { type: 'job_update', job_id: 'j1', status: 'processing', progress: 10 };

    routeBackendWsMessage(JSON.stringify(message), send);

    expect(send).toHaveBeenCalledWith('generation:progress', message);
  });

  it('routes step_image to generation:step-image', () => {
    const send = vi.fn();
    const message = {
      type: 'step_image',
      job_id: 'j1',
      step: 3,
      total_steps: 25,
      image: 'data:image/jpeg;base64,AA',
    };

    routeBackendWsMessage(JSON.stringify(message), send);

    expect(send).toHaveBeenCalledWith('generation:step-image', message);
  });

  it('drops unknown message types', () => {
    const send = vi.fn();
    routeBackendWsMessage(JSON.stringify({ type: 'mystery' }), send);
    expect(send).not.toHaveBeenCalled();
  });

  it('drops malformed JSON without throwing', () => {
    const send = vi.fn();
    expect(() => routeBackendWsMessage('{not json', send)).not.toThrow();
    expect(send).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npx vitest run electron/ipc-handlers/backendWsRouting.test.ts`
Expected: FAIL - cannot resolve `./backendWsRouting`.

- [ ] **Step 3: Implement**

`electron/ipc-handlers/backendWsRouting.ts`:

```typescript
/**
 * Pure routing of backend WebSocket messages to renderer IPC channels (#33).
 * Socket-free so the channel contract stays unit-testable.
 */

type SendToRenderer = (channel: string, payload: unknown) => void;

const CHANNEL_BY_TYPE: Record<string, string> = {
  job_update: 'generation:progress',
  step_image: 'generation:step-image',
};

export function routeBackendWsMessage(raw: string, send: SendToRenderer): void {
  let message: { type?: unknown };
  try {
    message = JSON.parse(raw);
  } catch (e) {
    console.error('Failed to parse WebSocket message:', e);
    return;
  }

  const channel =
    typeof message?.type === 'string' ? CHANNEL_BY_TYPE[message.type] : undefined;
  if (channel) {
    send(channel, message);
  }
}
```

In `electron/ipc-handlers/generation.ts`, add the import beside the other `./` imports:

```typescript
import { routeBackendWsMessage } from './backendWsRouting';
```

and replace the `ws.on('message', ...)` handler:

```typescript
  ws.on('message', (data) => {
    routeBackendWsMessage(data.toString(), (channel, payload) => {
      mainWindow?.webContents.send(channel, payload);
    });
  });
```

In `electron/preload.ts`, directly after the `onProgress` entry in the `generation` namespace:

```typescript
    onStepImage: (callback) => {
      const handler = (_event: any, data: any) => callback(data);
      ipcRenderer.on('generation:step-image', handler);
      return () => ipcRenderer.off('generation:step-image', handler);
    },
```

In `src/types/electron.d.ts`, add next to `JobStatus`:

```typescript
/** #33: one decoded step frame pushed during generation. */
export interface StepImageEvent {
  type: 'step_image';
  job_id: string;
  step: number;
  total_steps: number;
  image: string;
}
```

and in the `generation` interface, after `onProgress`:

```typescript
    onStepImage: (callback: (data: StepImageEvent) => void) => () => void;
```

- [ ] **Step 4: Run tests + typecheck**

Run: `npx vitest run electron/ipc-handlers/backendWsRouting.test.ts && npm run typecheck`
Expected: PASS / clean.

- [ ] **Step 5: Commit**

```bash
git add electron/ipc-handlers/backendWsRouting.ts electron/ipc-handlers/backendWsRouting.test.ts electron/ipc-handlers/generation.ts electron/preload.ts src/types/electron.d.ts
git commit -m "feat(preview): forward backend step_image frames on generation:step-image (#33)"
```

---

### Task 6: Preview slice lifecycle (`generationPreviewSlice`)

**Files:**
- Modify: `src/store/slices/generationPreviewSlice.ts`
- Modify: `src/store/appStore.types.ts` (state block ~line 436, actions block ~line 764)
- Test: `src/store/appStore.test.ts` (extend the existing generation-preview describe, ~line 1892)

**Interfaces:**
- Produces state: `previewJobId: string | null`, `previewError: string | null`.
- Produces actions: `beginPreview(jobId: string, totalSteps: number)`,
  `setPreviewStep(step: number)` (monotonic), `setPreviewError(message: string | null)`;
  `clearPreview()` additionally nulls `previewJobId` but PRESERVES `previewError`;
  `addStepImage` counter becomes monotonic (`Math.max`).

- [ ] **Step 1: Write the failing tests**

Add inside the describe block in `src/store/appStore.test.ts` that holds the existing `addStepImage` tests:

```typescript
    it('beginPreview arms the lifecycle and clears any prior error', () => {
      useAppStore.getState().addStepImage(3, 'stale');
      useAppStore.getState().setPreviewError('old failure');

      useAppStore.getState().beginPreview('job-9', 25);

      const state = useAppStore.getState();
      expect(state.stepImages.size).toBe(0);
      expect(state.currentStep).toBe(0);
      expect(state.totalSteps).toBe(25);
      expect(state.isPreviewActive).toBe(true);
      expect(state.previewJobId).toBe('job-9');
      expect(state.previewError).toBeNull();
    });

    it('setPreviewStep is monotonic', () => {
      useAppStore.getState().beginPreview('job-9', 25);
      useAppStore.getState().setPreviewStep(7);
      useAppStore.getState().setPreviewStep(4);
      expect(useAppStore.getState().currentStep).toBe(7);
    });

    it('addStepImage never steps the counter backwards', () => {
      useAppStore.getState().setPreviewStep(9);
      useAppStore.getState().addStepImage(6, 'late frame');
      const state = useAppStore.getState();
      expect(state.currentStep).toBe(9);
      expect(state.stepImages.get(6)).toBe('late frame');
    });

    it('clearPreview resets tracking but preserves previewError', () => {
      useAppStore.getState().beginPreview('job-9', 25);
      useAppStore.getState().setPreviewError('it failed');
      useAppStore.getState().clearPreview();

      const state = useAppStore.getState();
      expect(state.previewJobId).toBeNull();
      expect(state.isPreviewActive).toBe(false);
      expect(state.previewError).toBe('it failed');
    });
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `npx vitest run src/store/appStore.test.ts`
Expected: the four new tests FAIL (`beginPreview is not a function`).

- [ ] **Step 3: Implement**

Replace `src/store/slices/generationPreviewSlice.ts` with:

```typescript
import type { AppSet, AppGet } from '../appStore.types';

const MAX_STEP_IMAGES = 10;

export const generationPreviewInitialState = {
  stepImages: new Map<number, string>(),
  currentStep: 0,
  totalSteps: 0,
  isPreviewActive: false,
  // #33: the job the preview canvas is tracking + the last Studio run failure
  // (session-only - never persisted).
  previewJobId: null as string | null,
  previewError: null as string | null,
};

export function createGenerationPreviewActions(set: AppSet, _get: AppGet) {
  return {
    addStepImage: (step: number, imageData: string) =>
      set((state) => {
        const next = new Map(state.stepImages);
        next.set(step, imageData);
        // Evict oldest entries when cap exceeded
        if (next.size > MAX_STEP_IMAGES) {
          const sorted = [...next.keys()].sort((a, b) => a - b);
          const evictCount = next.size - MAX_STEP_IMAGES;
          for (let i = 0; i < evictCount; i++) {
            next.delete(sorted[i]);
          }
        }
        return {
          stepImages: next,
          // #33: monotonic - a throttled frame landing after a poll-driven
          // setPreviewStep must not step the counter backwards.
          currentStep: Math.max(state.currentStep, step),
          isPreviewActive: true,
        };
      }),

    setTotalSteps: (total: number) => set({ totalSteps: total }),

    beginPreview: (jobId: string, totalSteps: number) =>
      set({
        stepImages: new Map<number, string>(),
        currentStep: 0,
        totalSteps,
        isPreviewActive: true,
        previewJobId: jobId,
        previewError: null,
      }),

    setPreviewStep: (step: number) =>
      set((state) => (step > state.currentStep ? { currentStep: step } : state)),

    setPreviewError: (message: string | null) => set({ previewError: message }),

    clearPreview: () =>
      set({
        stepImages: new Map<number, string>(),
        currentStep: 0,
        totalSteps: 0,
        isPreviewActive: false,
        previewJobId: null,
        // previewError intentionally survives the teardown so the user can
        // still read why the run ended.
      }),

    setPreviewActive: (active: boolean) => set({ isPreviewActive: active }),
  };
}
```

In `src/store/appStore.types.ts`, extend the Generation Preview state block:

```typescript
  stepImages: Map<number, string>;
  currentStep: number;
  totalSteps: number;
  isPreviewActive: boolean;
  previewJobId: string | null;
  previewError: string | null;
```

and the Generation Preview actions block:

```typescript
  addStepImage: (step: number, imageData: string) => void;
  setTotalSteps: (total: number) => void;
  beginPreview: (jobId: string, totalSteps: number) => void;
  setPreviewStep: (step: number) => void;
  setPreviewError: (message: string | null) => void;
  clearPreview: () => void;
  setPreviewActive: (active: boolean) => void;
```

- [ ] **Step 4: Run tests + typecheck**

Run: `npx vitest run src/store/appStore.test.ts && npm run typecheck`
Expected: PASS / clean.

- [ ] **Step 5: Commit**

```bash
git add src/store/slices/generationPreviewSlice.ts src/store/appStore.types.ts src/store/appStore.test.ts
git commit -m "feat(preview): preview-slice lifecycle - previewJobId, previewError, monotonic counter (#33)"
```

---

### Task 7: ProgressivePreview - frame derive, real cancel, honest degrade

**Files:**
- Modify: `src/components/studio/ProgressivePreview.tsx`
- Test: `src/components/studio/ProgressivePreview.test.tsx`

**Interfaces:**
- Consumes: slice fields from Task 6; `window.electron.generation.cancel`.
- Produces: shown frame = highest-key entry of `stepImages`; cancel calls the
  backend before `clearPreview`; `currentStep >= 2` with an empty map renders
  "Rendering - step preview unavailable on this run."

- [ ] **Step 1: Update/extend the tests**

In `src/components/studio/ProgressivePreview.test.tsx`, REPLACE the test
`'shows spinner when currentStep is greater than 0 but no image for that step'`
(it documents the exact bug being fixed) with:

```typescript
  it('shows the latest available frame when the counter runs ahead of the decoder', () => {
    const images = new Map<number, string>();
    images.set(1, 'data:image/png;base64,step1');

    useAppStore.setState({
      stepImages: images,
      currentStep: 2,
      totalSteps: 10,
      isPreviewActive: true,
    });

    render(<ProgressivePreview />);

    // The step-1 frame stays visible instead of regressing to the spinner.
    expect(screen.getByAltText('Generation step 1')).toBeInTheDocument();
    expect(screen.queryByText('Initializing generation...')).not.toBeInTheDocument();
  });
```

and ADD these tests to the same describe:

```typescript
  it('shows the honest decoder-less state once steps tick with no frames', () => {
    useAppStore.setState({
      currentStep: 3,
      totalSteps: 10,
      isPreviewActive: true,
    });

    render(<ProgressivePreview />);

    expect(
      screen.getByText('Rendering - step preview unavailable on this run.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Initializing generation...')).not.toBeInTheDocument();
  });

  it('keeps the initializing spinner before the first step', () => {
    useAppStore.setState({
      currentStep: 0,
      totalSteps: 10,
      isPreviewActive: true,
    });

    render(<ProgressivePreview />);

    expect(screen.getByText('Initializing generation...')).toBeInTheDocument();
  });

  it('cancel calls the backend for the tracked job before clearing', async () => {
    const { default: userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();
    const cancel = vi.fn().mockResolvedValue({ success: true });
    vi.stubGlobal('window', Object.assign(window, {
      electron: { generation: { cancel } },
    }));

    useAppStore.setState({
      currentStep: 5,
      totalSteps: 20,
      isPreviewActive: true,
      previewJobId: 'job-77',
    });

    render(<ProgressivePreview />);
    await user.click(screen.getByLabelText('Cancel generation'));

    expect(cancel).toHaveBeenCalledWith('job-77');
    expect(useAppStore.getState().isPreviewActive).toBe(false);
    expect(useAppStore.getState().previewJobId).toBeNull();
  });
```

Also add `vi` to the vitest import in this file and, in `afterEach`, call
`vi.unstubAllGlobals()` alongside `cleanup`:

```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
...
  afterEach(() => {
    vi.unstubAllGlobals();
    cleanup();
  });
```

- [ ] **Step 2: Run tests, verify the new/updated ones fail**

Run: `npx vitest run src/components/studio/ProgressivePreview.test.tsx`
Expected: the replaced + new tests FAIL against the current component.

- [ ] **Step 3: Implement**

In `src/components/studio/ProgressivePreview.tsx`:

1. Change the react import to include `useMemo`:

```typescript
import { memo, useState, useCallback, useMemo, useRef } from 'react';
```

2. Replace the `latestStepImage` derivation (`const latestStepImage = currentStep > 0 ? ... : undefined;`) with:

```typescript
  // #33: show the newest decoded frame. The poll-driven counter legitimately
  // runs ahead of the 0.5s-throttled decoder, so an exact-key lookup would
  // blank the image back to the spinner between frames.
  const latestFrame = useMemo(() => {
    let latest: { step: number; image: string } | null = null;
    for (const [step, image] of stepImages) {
      if (!latest || step > latest.step) {
        latest = { step, image };
      }
    }
    return latest;
  }, [stepImages]);
```

3. Replace the cancel handler:

```typescript
  // --- Cancel handler ---
  const handleCancel = useCallback(() => {
    // #33: actually stop the backend job the preview is tracking, then tear
    // the preview down. Cancel errors are non-fatal - the poll loop settles
    // the job record either way.
    const jobId = useAppStore.getState().previewJobId;
    if (jobId) {
      void window.electron?.generation?.cancel(jobId)?.catch?.(() => undefined);
    }
    clearPreview();
  }, [clearPreview]);
```

4. Replace the `{latestStepImage ? (...) : (...)}` JSX with a three-state render:

```tsx
      {latestFrame ? (
        /* ---- Step image ---- */
        <img
          src={latestFrame.image}
          alt={`Generation step ${latestFrame.step}`}
          draggable={false}
          className="max-h-full max-w-full select-none object-contain"
          style={{
            transform: `scale(${zoom})`,
            transformOrigin: 'center center',
            transition: `opacity ${OPACITY_TRANSITION_MS}ms ease-out, transform 150ms ease-out`,
          }}
        />
      ) : currentStep >= 2 ? (
        /* ---- Decoder-less / hosted run: honest counter-only state ---- */
        <div className="flex flex-col items-center gap-3">
          <span className="text-sm text-text-body" role="status">
            Rendering - step preview unavailable on this run.
          </span>
        </div>
      ) : (
        /* ---- Initializing spinner ---- */
        <div className="flex flex-col items-center gap-3">
          <div
            className="
              h-10 w-10 animate-spin rounded-full
              border-3 border-border border-t-accent-primary
            "
            aria-hidden="true"
          />
          <span className="text-sm text-text-body" role="status">
            Initializing generation...
          </span>
        </div>
      )}
```

- [ ] **Step 4: Run tests, verify they pass**

Run: `npx vitest run src/components/studio/ProgressivePreview.test.tsx src/components/studio/CompositionPreview.test.tsx`
Expected: all PASS (CompositionPreview's preview-active tests still hold).

- [ ] **Step 5: Commit**

```bash
git add src/components/studio/ProgressivePreview.tsx src/components/studio/ProgressivePreview.test.tsx
git commit -m "feat(preview): latest-frame derive, real backend cancel, honest degrade copy (#33)"
```

---

### Task 8: `useStepImageSubscription` hook

**Files:**
- Create: `src/features/studio/useStepImageSubscription.ts`
- Test: `src/features/studio/useStepImageSubscription.test.ts`

**Interfaces:**
- Consumes: `window.electron.generation.onStepImage` (Task 5), slice actions (Task 6).
- Produces: `useStepImageSubscription(): void` - mounts the IPC listener; frames
  matching `previewJobId` land via `setTotalSteps` + `addStepImage`.

- [ ] **Step 1: Write the failing tests**

`src/features/studio/useStepImageSubscription.test.ts`:

```typescript
import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAppStore } from '@/store/appStore';
import type { StepImageEvent } from '@/types/electron';

import { useStepImageSubscription } from './useStepImageSubscription';

type StepImageCallback = (data: StepImageEvent) => void;

describe('useStepImageSubscription', () => {
  let capturedCallback: StepImageCallback | null;
  let unsubscribe: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    useAppStore.setState(useAppStore.getInitialState(), true);
    capturedCallback = null;
    unsubscribe = vi.fn();
    vi.stubGlobal('window', Object.assign(window, {
      electron: {
        generation: {
          onStepImage: (callback: StepImageCallback) => {
            capturedCallback = callback;
            return unsubscribe;
          },
        },
      },
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('stores frames for the tracked job', () => {
    useAppStore.getState().beginPreview('job-1', 0);
    renderHook(() => useStepImageSubscription());

    capturedCallback!({
      type: 'step_image', job_id: 'job-1', step: 4, total_steps: 25,
      image: 'data:image/jpeg;base64,AAAA',
    });

    const state = useAppStore.getState();
    expect(state.stepImages.get(4)).toBe('data:image/jpeg;base64,AAAA');
    expect(state.totalSteps).toBe(25);
    expect(state.currentStep).toBe(4);
  });

  it('ignores frames for other jobs', () => {
    useAppStore.getState().beginPreview('job-1', 25);
    renderHook(() => useStepImageSubscription());

    capturedCallback!({
      type: 'step_image', job_id: 'other-job', step: 4, total_steps: 25,
      image: 'data:image/jpeg;base64,BBBB',
    });

    expect(useAppStore.getState().stepImages.size).toBe(0);
  });

  it('ignores frames when no preview is tracking (previewJobId null)', () => {
    renderHook(() => useStepImageSubscription());

    capturedCallback!({
      type: 'step_image', job_id: 'job-1', step: 1, total_steps: 25,
      image: 'data:image/jpeg;base64,CCCC',
    });

    expect(useAppStore.getState().stepImages.size).toBe(0);
  });

  it('unsubscribes on unmount', () => {
    const { unmount } = renderHook(() => useStepImageSubscription());
    unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('is a no-op without the preload bridge', () => {
    vi.stubGlobal('window', Object.assign(window, { electron: undefined }));
    expect(() => renderHook(() => useStepImageSubscription())).not.toThrow();
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `npx vitest run src/features/studio/useStepImageSubscription.test.ts`
Expected: FAIL - cannot resolve `./useStepImageSubscription`.

- [ ] **Step 3: Implement**

`src/features/studio/useStepImageSubscription.ts`:

```typescript
import { useEffect } from 'react';

import { useAppStore } from '@/store/appStore';

/**
 * Subscribes the Studio preview canvas to backend step-image pushes (#33).
 * Frames are keyed to the run the preview is tracking (previewJobId); pushes
 * for any other job are ignored. Safe to mount without the preload bridge
 * (tests, storybook-style rendering) - it just does nothing.
 */
export function useStepImageSubscription(): void {
  useEffect(() => {
    const subscribe = window.electron?.generation?.onStepImage;
    if (!subscribe) {
      return undefined;
    }

    return subscribe((data) => {
      const state = useAppStore.getState();
      if (!data || data.job_id !== state.previewJobId) {
        return;
      }
      if (data.total_steps > 0 && data.total_steps !== state.totalSteps) {
        state.setTotalSteps(data.total_steps);
      }
      state.addStepImage(data.step, data.image);
    });
  }, []);
}
```

- [ ] **Step 4: Run tests, verify they pass**

Run: `npx vitest run src/features/studio/useStepImageSubscription.test.ts`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/studio/useStepImageSubscription.ts src/features/studio/useStepImageSubscription.test.ts
git commit -m "feat(preview): step-image IPC subscription hook keyed to previewJobId (#33)"
```

---

### Task 9: `runStudioGeneration` feature function

**Files:**
- Create: `src/features/studio/runStudioGeneration.ts`
- Test: `src/features/studio/runStudioGeneration.test.ts`

**Interfaces:**
- Consumes: store state/actions (`generationDraft`, `advancedGeneration`,
  `selectedImageModelId`, `systemInfo`, `accelerationSettings`, `beginPreview`,
  `setPreviewStep`, `setPreviewError`, `clearPreview`, `addJob`, `updateJob`,
  `syncAssetsFromJobStatus`, `setCurrentImage`, `assetLibrary`);
  `delay`/`resolveOutputRoot` from `@/features/workflow/runWorkflowExecution`;
  `makePollErrorBudget`/`recordPollError`/`recordPollSuccess`;
  `toAccelerationRequestPayload`; `toPreviewUrl`/`resolveStoredAssetPath`;
  `computeDimensions`.
- Produces: `runStudioGeneration(options?) => Promise<StudioGenerationResult>`
  with `StudioGenerationResult { ok: boolean; jobId?: string; error?: string }`;
  exported message constants `EMPTY_PROMPT_MESSAGE`, `BACKEND_DOWN_MESSAGE`,
  `POLL_LOST_MESSAGE`.

- [ ] **Step 1: Write the failing tests**

`src/features/studio/runStudioGeneration.test.ts`:

```typescript
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAppStore } from '@/store/appStore';
import type { JobStatus } from '@/types/electron';

import {
  BACKEND_DOWN_MESSAGE,
  EMPTY_PROMPT_MESSAGE,
  runStudioGeneration,
} from './runStudioGeneration';

const DRAFT = {
  generationType: 'image' as const,
  prompt: 'a chrome rack unit',
  negativePrompt: 'blurry',
  width: 512,
  height: 512,
  steps: 8,
  cfgScale: 7.5,
  model: 'sd-1-5',
  scheduler: 'Euler a',
  seed: 42,
};

function makeElectronMock({
  submit = { success: true as boolean, jobId: 'job-1' as string | undefined, error: undefined as string | undefined },
  statuses = [] as Array<Partial<JobStatus>>,
} = {}) {
  const statusQueue = [...statuses];
  return {
    app: { getPath: vi.fn().mockResolvedValue('C:/Users/User/AppData/Roaming/vision-studio') },
    settings: { get: vi.fn().mockResolvedValue({ defaultOutputPath: '' }) },
    generation: {
      generateImage: vi.fn().mockResolvedValue(submit),
      getStatus: vi.fn().mockImplementation(() =>
        Promise.resolve(statusQueue.length > 1 ? statusQueue.shift() : statusQueue[0]),
      ),
      cancel: vi.fn().mockResolvedValue({ success: true }),
    },
    notifications: { notify: vi.fn().mockResolvedValue({ success: true }) },
  };
}

function seedReadyStore() {
  useAppStore.setState(useAppStore.getInitialState(), true);
  useAppStore.setState((state) => ({
    systemInfo: { ...state.systemInfo, backendConnected: true },
    generationDraft: { ...DRAFT },
  }));
}

describe('runStudioGeneration', () => {
  beforeEach(seedReadyStore);

  it('refuses an empty prompt with the honest message and no submit', async () => {
    useAppStore.setState((state) => ({
      generationDraft: { ...state.generationDraft!, prompt: '   ' },
    }));
    const electron = makeElectronMock();

    const result = await runStudioGeneration({ electron, store: useAppStore, pollIntervalMs: 0 });

    expect(result).toEqual({ ok: false, error: EMPTY_PROMPT_MESSAGE });
    expect(useAppStore.getState().previewError).toBe(EMPTY_PROMPT_MESSAGE);
    expect(electron.generation.generateImage).not.toHaveBeenCalled();
  });

  it('refuses when the backend is down', async () => {
    useAppStore.setState((state) => ({
      systemInfo: { ...state.systemInfo, backendConnected: false },
    }));
    const electron = makeElectronMock();

    const result = await runStudioGeneration({ electron, store: useAppStore, pollIntervalMs: 0 });

    expect(result.error).toBe(BACKEND_DOWN_MESSAGE);
    expect(electron.generation.generateImage).not.toHaveBeenCalled();
  });

  it('is a silent no-op while a preview run is already active', async () => {
    useAppStore.getState().beginPreview('running-job', 8);
    const electron = makeElectronMock();

    const result = await runStudioGeneration({ electron, store: useAppStore, pollIntervalMs: 0 });

    expect(result).toEqual({ ok: false });
    expect(electron.generation.generateImage).not.toHaveBeenCalled();
  });

  it('submits the draft config, arms the preview, and hands off on completion', async () => {
    const electron = makeElectronMock({
      statuses: [
        { job_id: 'job-1', status: 'processing', type: 'image', created_at: 'x', progress: 50 },
        {
          job_id: 'job-1', status: 'completed', type: 'image', created_at: 'x',
          completed_at: '2026-07-05T10:00:00.000Z', progress: 100,
          result: { images: ['/outputs/job-1/generated.png'], seed: 42 },
        },
      ],
    });

    const armed: Array<{ jobId: string | null; active: boolean }> = [];
    const unsubscribe = useAppStore.subscribe((state) => {
      armed.push({ jobId: state.previewJobId, active: state.isPreviewActive });
    });

    const result = await runStudioGeneration({ electron, store: useAppStore, pollIntervalMs: 0 });
    unsubscribe();

    expect(result).toEqual({ ok: true, jobId: 'job-1' });
    expect(electron.generation.generateImage).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: 'a chrome rack unit',
        negative_prompt: 'blurry',
        width: 512,
        height: 512,
        steps: 8,
        cfg_scale: 7.5,
        seed: 42,
        model: 'sd-1-5',
        scheduler: 'Euler a',
        acceleration_settings: expect.any(Object),
      }),
    );
    // Preview was armed for job-1 at some point...
    expect(armed.some((entry) => entry.jobId === 'job-1' && entry.active)).toBe(true);

    const state = useAppStore.getState();
    // ...and torn down after handoff.
    expect(state.isPreviewActive).toBe(false);
    expect(state.previewJobId).toBeNull();
    expect(state.previewError).toBeNull();
    // Handoff: the finished image became the composition reference.
    expect(state.currentImage).toBe('http://localhost:8000/outputs/job-1/generated.png');
    // The job landed in history and the asset library synced.
    expect(state.completedJobs.some((job) => job.id === 'job-1')).toBe(true);
    expect(state.assetLibrary.some((asset) => asset.id === 'job-1::/outputs/job-1/generated.png')).toBe(true);
    expect(electron.notifications.notify).toHaveBeenCalledWith(
      'generation_complete', expect.any(Object));
  });

  it('drives the counter from poll progress', async () => {
    const electron = makeElectronMock({
      statuses: [
        { job_id: 'job-1', status: 'processing', type: 'image', created_at: 'x', progress: 50 },
        {
          job_id: 'job-1', status: 'completed', type: 'image', created_at: 'x',
          progress: 100, result: { images: [] },
        },
      ],
    });

    let sawStep = 0;
    const unsubscribe = useAppStore.subscribe((state) => {
      sawStep = Math.max(sawStep, state.currentStep);
    });
    await runStudioGeneration({ electron, store: useAppStore, pollIntervalMs: 0 });
    unsubscribe();

    // 50% of 8 steps -> step 4.
    expect(sawStep).toBe(4);
  });

  it('surfaces a failed job through previewError and clears the preview', async () => {
    const electron = makeElectronMock({
      statuses: [
        {
          job_id: 'job-1', status: 'failed', type: 'image', created_at: 'x',
          progress: 30, error: 'The model refused to load.',
        },
      ],
    });

    const result = await runStudioGeneration({ electron, store: useAppStore, pollIntervalMs: 0 });

    expect(result.ok).toBe(false);
    const state = useAppStore.getState();
    expect(state.previewError).toBe('The model refused to load.');
    expect(state.isPreviewActive).toBe(false);
    expect(electron.notifications.notify).toHaveBeenCalledWith(
      'generation_failed', expect.any(Object));
  });

  it('treats a cancelled job as a silent teardown', async () => {
    const electron = makeElectronMock({
      statuses: [
        { job_id: 'job-1', status: 'cancelled', type: 'image', created_at: 'x', progress: 30 },
      ],
    });

    const result = await runStudioGeneration({ electron, store: useAppStore, pollIntervalMs: 0 });

    expect(result.ok).toBe(false);
    expect(useAppStore.getState().previewError).toBeNull();
    expect(electron.notifications.notify).not.toHaveBeenCalled();
  });

  it('stops touching the preview once another run took it over', async () => {
    let polls = 0;
    const electron = makeElectronMock();
    electron.generation.getStatus = vi.fn().mockImplementation(() => {
      polls += 1;
      if (polls === 1) {
        // Simulate the user cancelling + a NEW run arming the preview mid-poll.
        useAppStore.getState().clearPreview();
        useAppStore.getState().beginPreview('job-2', 8);
        return Promise.resolve({
          job_id: 'job-1', status: 'processing', type: 'image', created_at: 'x', progress: 75,
        });
      }
      return Promise.resolve({
        job_id: 'job-1', status: 'completed', type: 'image', created_at: 'x',
        progress: 100, result: { images: [] },
      });
    });

    await runStudioGeneration({ electron, store: useAppStore, pollIntervalMs: 0 });

    const state = useAppStore.getState();
    // The stale run must not clear or advance job-2's preview.
    expect(state.previewJobId).toBe('job-2');
    expect(state.isPreviewActive).toBe(true);
    expect(state.currentStep).toBe(0);
  });

  it('fails the run after five consecutive poll errors', async () => {
    const electron = makeElectronMock();
    electron.generation.getStatus = vi.fn().mockRejectedValue(new Error('socket dead'));

    const result = await runStudioGeneration({
      electron, store: useAppStore, pollIntervalMs: 0, pollRetryMs: 0,
    });

    expect(result.ok).toBe(false);
    expect(useAppStore.getState().previewError).toMatch(/Lost connection/);
    expect(electron.generation.getStatus).toHaveBeenCalledTimes(5);
  });

  it('sets previewError when the submit itself fails', async () => {
    const electron = makeElectronMock({
      submit: { success: false, jobId: undefined, error: 'Model not installed.' },
    });

    const result = await runStudioGeneration({ electron, store: useAppStore, pollIntervalMs: 0 });

    expect(result).toEqual({ ok: false, error: 'Model not installed.' });
    expect(useAppStore.getState().previewError).toBe('Model not installed.');
    expect(useAppStore.getState().isPreviewActive).toBe(false);
  });

  it('falls back to selectedImageModelId when no draft exists', async () => {
    useAppStore.setState({ generationDraft: null, selectedImageModelId: 'sdxl-base' });
    const electron = makeElectronMock({
      statuses: [{
        job_id: 'job-1', status: 'completed', type: 'image', created_at: 'x',
        progress: 100, result: { images: [] },
      }],
    });

    const result = await runStudioGeneration({ electron, store: useAppStore, pollIntervalMs: 0 });

    // No draft -> empty prompt -> refused before submit.
    expect(result.error).toBe(EMPTY_PROMPT_MESSAGE);

    // With a draft that has no model, the store mirror wins.
    seedReadyStore();
    useAppStore.setState((state) => ({
      generationDraft: { ...state.generationDraft!, model: '  ' },
      selectedImageModelId: 'sdxl-base',
    }));
    await runStudioGeneration({ electron, store: useAppStore, pollIntervalMs: 0 });
    expect(electron.generation.generateImage).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'sdxl-base' }),
    );
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `npx vitest run src/features/studio/runStudioGeneration.test.ts`
Expected: FAIL - cannot resolve `./runStudioGeneration`.

- [ ] **Step 3: Implement**

`src/features/studio/runStudioGeneration.ts`:

```typescript
import type { StoreApi, UseBoundStore } from 'zustand';

import { useAppStore } from '@/store/appStore';
import type { AppState } from '@/store/appStore.types';
import { toPreviewUrl, resolveStoredAssetPath } from '@/features/assets/assetRecords';
import { toAccelerationRequestPayload } from '@/features/generation/accelerationRequest';
import {
  makePollErrorBudget,
  recordPollError,
  recordPollSuccess,
} from '@/features/generation/pollErrorBudget';
import { delay, resolveOutputRoot } from '@/features/workflow/runWorkflowExecution';
import type { JobStatus } from '@/types/electron';
import type { ImageGenerationRequestPayload } from '@/types/generation';
import { computeDimensions } from '@/types/resolution';

type StudioStore = UseBoundStore<StoreApi<AppState>>;

const POLL_INTERVAL_MS = 500;
const POLL_RETRY_MS = 2000;
const POLL_ERROR_CAP = 5;

export const EMPTY_PROMPT_MESSAGE = 'Enter a prompt in Prompt Studio before generating.';
export const BACKEND_DOWN_MESSAGE =
  'The AI backend is not running. Please restart the app or start the backend from Settings.';
export const POLL_LOST_MESSAGE =
  'Lost connection to the AI backend while polling for job status. Please retry.';
const CANCELLED_MESSAGE = 'Studio generation was cancelled.';

interface StudioGenerationElectronApi {
  app: { getPath: (name: 'userData') => Promise<string> };
  settings: { get: () => Promise<{ defaultOutputPath: string }> };
  generation: {
    generateImage: (
      params: ImageGenerationRequestPayload,
    ) => Promise<{ success: boolean; jobId?: string; error?: string }>;
    getStatus: (jobId: string) => Promise<JobStatus>;
    cancel: (jobId: string) => Promise<{ success: boolean; error?: string }>;
  };
  notifications: {
    notify: (
      type: 'generation_complete' | 'generation_failed',
      payload: { title: string; body: string },
    ) => Promise<{ success: boolean; skipped?: boolean }>;
  };
}

interface RunStudioGenerationOptions {
  electron?: StudioGenerationElectronApi;
  store?: StudioStore;
  pollIntervalMs?: number;
  pollRetryMs?: number;
  signal?: AbortSignal;
}

export interface StudioGenerationResult {
  ok: boolean;
  jobId?: string;
  error?: string;
}

/**
 * Studio Generate (#33): submits the GeneratePanel config - the pending
 * generationDraft when one exists (the exact object GeneratePanel would
 * consume on next mount), otherwise the store generation settings - as a
 * real local image job, and drives the progressive-preview lifecycle:
 * beginPreview on submit, poll-driven counter, handoff of the finished image
 * to the composition canvas, previewError on failure, silent clear on cancel.
 */
export async function runStudioGeneration({
  electron = window.electron,
  store = useAppStore,
  pollIntervalMs = POLL_INTERVAL_MS,
  pollRetryMs = POLL_RETRY_MS,
  signal,
}: RunStudioGenerationOptions = {}): Promise<StudioGenerationResult> {
  const state = store.getState();

  // Re-entrancy: the Generate button is a no-op while a run is tracked.
  if (state.isPreviewActive) {
    return { ok: false };
  }

  const draft = state.generationDraft;
  const dimensions = draft
    ? { width: draft.width, height: draft.height }
    : computeDimensions(state.aspectRatio, state.resolutionTier, state.customWidth, state.customHeight);
  const prompt = (draft?.prompt ?? '').trim();
  const negativePrompt = (draft?.negativePrompt ?? '').trim();
  const model = draft?.model?.trim() || state.selectedImageModelId;
  const steps = draft?.steps ?? state.advancedGeneration.steps;
  const cfgScale = draft?.cfgScale ?? state.advancedGeneration.cfgScale;
  const scheduler = draft?.scheduler ?? state.advancedGeneration.scheduler;
  const seed = draft?.seed ?? state.advancedGeneration.seed;

  if (!prompt) {
    state.setPreviewError(EMPTY_PROMPT_MESSAGE);
    return { ok: false, error: EMPTY_PROMPT_MESSAGE };
  }
  if (!state.systemInfo.backendConnected) {
    state.setPreviewError(BACKEND_DOWN_MESSAGE);
    return { ok: false, error: BACKEND_DOWN_MESSAGE };
  }

  const request: ImageGenerationRequestPayload = {
    prompt,
    negative_prompt: negativePrompt,
    width: dimensions.width,
    height: dimensions.height,
    steps,
    cfg_scale: cfgScale,
    seed: seed === -1 ? undefined : seed,
    model,
    scheduler,
    acceleration_settings: toAccelerationRequestPayload(state.accelerationSettings),
  };

  let jobId: string;
  let outputRoot: string;
  try {
    const appSettings = await electron.settings.get();
    const userDataPath = await electron.app.getPath('userData');
    outputRoot = resolveOutputRoot(appSettings.defaultOutputPath, userDataPath);

    const submitResult = await electron.generation.generateImage(request);
    if (!submitResult.success || !submitResult.jobId) {
      throw new Error(submitResult.error || 'Generation failed');
    }
    jobId = submitResult.jobId;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Generation failed';
    state.setPreviewError(message);
    return { ok: false, error: message };
  }

  state.beginPreview(jobId, steps);
  state.addJob({
    id: jobId,
    type: 'image',
    status: 'pending',
    progress: 0,
    params: { ...request, seed, output_root: outputRoot, source: 'studio' },
    createdAt: new Date(),
  });

  return pollStudioJob({
    electron,
    store,
    jobId,
    steps,
    prompt,
    outputRoot,
    pollIntervalMs,
    pollRetryMs,
    signal,
  });
}

async function pollStudioJob({
  electron,
  store,
  jobId,
  steps,
  prompt,
  outputRoot,
  pollIntervalMs,
  pollRetryMs,
  signal,
}: {
  electron: StudioGenerationElectronApi;
  store: StudioStore;
  jobId: string;
  steps: number;
  prompt: string;
  outputRoot: string;
  pollIntervalMs: number;
  pollRetryMs: number;
  signal?: AbortSignal;
}): Promise<StudioGenerationResult> {
  let budget = makePollErrorBudget(POLL_ERROR_CAP);

  // Stale-run guard: preview-slice writes stay scoped to the run the canvas
  // is tracking; job-slice bookkeeping always lands.
  const previewTracksThisRun = () => store.getState().previewJobId === jobId;

  for (;;) {
    if (signal?.aborted) {
      await electron.generation.cancel(jobId).catch(() => undefined);
      store.getState().updateJob(jobId, {
        status: 'failed',
        error: CANCELLED_MESSAGE,
        completedAt: new Date(),
      });
      if (previewTracksThisRun()) {
        store.getState().clearPreview();
      }
      return { ok: false, jobId, error: CANCELLED_MESSAGE };
    }

    let status: JobStatus;
    try {
      status = await electron.generation.getStatus(jobId);
      if (typeof status?.status !== 'string') {
        throw new Error('Job status unavailable');
      }
      budget = recordPollSuccess(budget);
    } catch {
      const outcome = recordPollError(budget);
      budget = outcome.budget;
      if (outcome.exhausted) {
        store.getState().updateJob(jobId, {
          status: 'failed',
          error: POLL_LOST_MESSAGE,
          completedAt: new Date(),
        });
        if (previewTracksThisRun()) {
          store.getState().clearPreview();
        }
        store.getState().setPreviewError(POLL_LOST_MESSAGE);
        return { ok: false, jobId, error: POLL_LOST_MESSAGE };
      }
      await delay(pollRetryMs, signal).catch(() => undefined);
      continue;
    }

    if (status.status === 'completed') {
      const existingJob = store.getState().activeJobs.find((job) => job.id === jobId);
      store.getState().updateJob(jobId, {
        status: 'completed',
        progress: status.progress ?? 100,
        result: status.result,
        error: status.error,
        completedAt: status.completed_at ? new Date(status.completed_at) : new Date(),
      });
      store.getState().syncAssetsFromJobStatus({
        ...status,
        params: { ...(existingJob?.params ?? {}), output_root: outputRoot },
      });

      // Handoff BEFORE teardown so the canvas swaps from the last step frame
      // straight to the finished image.
      const outputPath = status.result?.images?.[0];
      if (outputPath && previewTracksThisRun()) {
        const asset = store
          .getState()
          .assetLibrary.find((entry) => entry.id === `${jobId}::${outputPath}`);
        store.getState().setCurrentImage(
          asset?.previewUrl ?? toPreviewUrl(outputPath),
          asset?.path ?? resolveStoredAssetPath(outputPath, { output_root: outputRoot }),
        );
      }
      if (previewTracksThisRun()) {
        store.getState().clearPreview();
      }

      await electron.notifications
        .notify('generation_complete', {
          title: 'Image Ready',
          body: prompt.slice(0, 120) || 'Generation completed successfully.',
        })
        .catch(() => undefined);
      return { ok: true, jobId };
    }

    if (status.status === 'failed' || status.status === 'cancelled') {
      store.getState().updateJob(jobId, {
        status: status.status,
        progress: status.progress ?? 0,
        error: status.error,
        completedAt: status.completed_at ? new Date(status.completed_at) : new Date(),
      });
      if (previewTracksThisRun()) {
        store.getState().clearPreview();
      }
      if (status.status === 'failed') {
        const message = status.error || 'Generation failed';
        store.getState().setPreviewError(message);
        await electron.notifications
          .notify('generation_failed', { title: 'Image Failed', body: message })
          .catch(() => undefined);
        return { ok: false, jobId, error: message };
      }
      return { ok: false, jobId };
    }

    store.getState().updateJob(jobId, {
      status: status.status === 'pending' ? 'pending' : 'processing',
      progress: status.progress ?? 0,
    });
    if (previewTracksThisRun() && typeof status.progress === 'number' && steps > 0) {
      store.getState().setPreviewStep(
        Math.min(steps, Math.round((status.progress / 100) * steps)),
      );
    }

    await delay(pollIntervalMs, signal).catch(() => undefined);
  }
}
```

- [ ] **Step 4: Run tests, verify they pass**

Run: `npx vitest run src/features/studio/runStudioGeneration.test.ts && npm run typecheck`
Expected: all PASS / clean.

Note: `delay(0)` resolves through a `setTimeout(0)` macrotask, so the
zero-interval loop still yields; if the poll-error test times out, confirm
`pollRetryMs: 0` is threaded (it is an option specifically for tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/studio/runStudioGeneration.ts src/features/studio/runStudioGeneration.test.ts
git commit -m "feat(preview): runStudioGeneration - draft submit, poll lifecycle, handoff (#33)"
```

---

### Task 10: CompositionPreview wiring + PromptStudioPanel default-model fix

**Files:**
- Modify: `src/components/studio/CompositionPreview.tsx`
- Modify: `src/components/studio/CompositionPreview.test.tsx`
- Modify: `src/components/studio/PromptStudioPanel.tsx` (buildDefaultGenerationDraft, ~line 477)
- Modify: `src/components/studio/PromptStudioPanel.test.tsx`

**Interfaces:**
- Consumes: `runStudioGeneration` (Task 9), `useStepImageSubscription` (Task 8),
  slice fields (Task 6).
- Produces: Generate button triggers the real run; dismissible
  `data-testid="studio-preview-error"` strip; `buildDefaultGenerationDraft`
  exported and using `selectedImageModelId`.

- [ ] **Step 1: Write the failing tests**

Add to `src/components/studio/CompositionPreview.test.tsx` (and extend the
vitest import with `vi`):

```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/features/studio/runStudioGeneration', () => ({
  runStudioGeneration: vi.fn().mockResolvedValue({ ok: true, jobId: 'job-1' }),
}));

import { runStudioGeneration } from '@/features/studio/runStudioGeneration';
```

(the `vi.mock` call goes above the component import; keep the existing imports otherwise) and add these tests to the describe:

```typescript
  it('Generate triggers the studio generation feature function', async () => {
    const user = userEvent.setup();
    render(<CompositionPreview />);

    await user.click(screen.getByRole('button', { name: /generate/i }));

    expect(runStudioGeneration).toHaveBeenCalledTimes(1);
  });

  it('renders the dismissible error strip when previewError is set', async () => {
    const user = userEvent.setup();
    useAppStore.setState({ previewError: 'The model refused to load.' });

    render(<CompositionPreview />);

    const strip = screen.getByTestId('studio-preview-error');
    expect(strip).toHaveTextContent('The model refused to load.');

    await user.click(screen.getByLabelText('Dismiss generation error'));
    expect(useAppStore.getState().previewError).toBeNull();
  });

  it('does not render the error strip by default', () => {
    render(<CompositionPreview />);
    expect(screen.queryByTestId('studio-preview-error')).not.toBeInTheDocument();
  });
```

Also add `vi.clearAllMocks()` in `beforeEach` (after `resetStore()`).

Add to `src/components/studio/PromptStudioPanel.test.tsx` (import
`buildDefaultGenerationDraft` from `./PromptStudioPanel`):

```typescript
  it('buildDefaultGenerationDraft carries the selected image model, not a hardcoded id', () => {
    const draft = buildDefaultGenerationDraft({
      advancedGeneration: {
        generationType: 'image',
        steps: 25,
        cfgScale: 7.5,
        scheduler: 'Euler a',
        clipSkip: 1,
        seed: -1,
        duration: 5,
        fps: 24,
      },
      aspectRatio: '1:1',
      resolutionTier: 'standard',
      customWidth: 1024,
      customHeight: 1024,
      selectedImageModelId: 'sd-1-5',
    });

    expect(draft.model).toBe('sd-1-5');
  });
```

(If the existing test file's store fixtures already build these fields, reuse
them; the values above are the store defaults. If `resolutionTier`'s literal
type differs (`'standard'` vs another union member), copy the initial value
from `useAppStore.getInitialState().resolutionTier`.)

- [ ] **Step 2: Run tests, verify they fail**

Run: `npx vitest run src/components/studio/CompositionPreview.test.tsx src/components/studio/PromptStudioPanel.test.tsx`
Expected: new tests FAIL (stub Generate; `buildDefaultGenerationDraft` not exported / wrong model).

- [ ] **Step 3: Implement**

In `src/components/studio/CompositionPreview.tsx`:

1. Extend imports:

```typescript
import { AlertCircle, ImagePlus, X } from 'lucide-react';
import { runStudioGeneration } from '@/features/studio/runStudioGeneration';
import { useStepImageSubscription } from '@/features/studio/useStepImageSubscription';
```

2. Add selectors beside the existing ones and mount the subscription:

```typescript
  const previewError = useAppStore((s) => s.previewError);
  const setPreviewError = useAppStore((s) => s.setPreviewError);

  // #33: receive decoded step frames for the tracked run.
  useStepImageSubscription();
```

3. Replace the stub `handleGenerate`:

```typescript
  const handleGenerate = useCallback(() => {
    void runStudioGeneration();
  }, []);
```

4. Render the error strip between the layer bar block and the canvas area
   (inside the main column, after the layer-bar `<div>`):

```tsx
      {/* #33: last run failure - dismissible, survives preview teardown */}
      {previewError ? (
        <div
          role="alert"
          data-testid="studio-preview-error"
          className="mx-3 mt-2 flex items-start gap-2 rounded-sm border border-status-error-border bg-status-error-muted px-3 py-2"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-status-error" aria-hidden="true" />
          <p className="flex-1 type-caption text-status-error">{previewError}</p>
          <button
            type="button"
            aria-label="Dismiss generation error"
            onClick={() => setPreviewError(null)}
            className="raised-control p-1 text-status-error hover:text-text-primary"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      ) : null}
```

In `src/components/studio/PromptStudioPanel.tsx`:

1. Export the helper and add the model source:

```typescript
export function buildDefaultGenerationDraft(
  state: Pick<
    AppState,
    | 'advancedGeneration'
    | 'aspectRatio'
    | 'resolutionTier'
    | 'customWidth'
    | 'customHeight'
    | 'selectedImageModelId'
  >,
): GenerationDraft {
  const dimensions = computeDimensions(
    state.aspectRatio,
    state.resolutionTier,
    state.customWidth,
    state.customHeight,
  );

  return {
    generationType: 'image',
    prompt: '',
    negativePrompt: '',
    width: dimensions.width,
    height: dimensions.height,
    steps: state.advancedGeneration.steps,
    cfgScale: state.advancedGeneration.cfgScale,
    // #33: carry the actually-selected checkpoint - a hardcoded id here made
    // Studio drafts silently retarget flux-dev.
    model: state.selectedImageModelId,
    scheduler: state.advancedGeneration.scheduler,
    seed: state.advancedGeneration.seed,
  };
}
```

2. Thread `selectedImageModelId` through the component: add
   `selectedImageModelId: state.selectedImageModelId` to the `useShallow`
   selector (and destructure it), and pass it in the `buildDefaultGenerationDraft`
   call inside the `draft` memo (add it to the memo dependency array).

- [ ] **Step 4: Run the studio component tests**

Run: `npx vitest run src/components/studio/ && npm run typecheck`
Expected: all PASS / clean.

- [ ] **Step 5: Commit**

```bash
git add src/components/studio/CompositionPreview.tsx src/components/studio/CompositionPreview.test.tsx src/components/studio/PromptStudioPanel.tsx src/components/studio/PromptStudioPanel.test.tsx
git commit -m "feat(preview): real Studio Generate, error strip, draft model fix (#33)"
```

---

### Task 11: Packaging - fetch script, gate, build wiring

**Files:**
- Create: `scripts/fetch-preview-decoders.cjs`
- Modify: `scripts/assert-native-backend.cjs`
- Modify: `scripts/build-windows.cjs`
- Modify: `.gitignore`

**Interfaces:**
- Produces: `resources/preview-decoders/{taesd,taesdxl,taesd3,taef1}/{config.json,diffusion_pytorch_model.safetensors}` + `ATTRIBUTION.txt`; `assertNativeBackend` also asserts the decoders.

- [ ] **Step 1: Write the fetch script**

`scripts/fetch-preview-decoders.cjs`:

```javascript
#!/usr/bin/env node
/**
 * Fetches the four MIT-licensed Tiny-VAE (taesd) preview decoders (#33) into
 * resources/preview-decoders/. Heavy-by-design: these SHIP IN THE INSTALLER
 * (MIT allows redistribution), unlike checkpoint weights which stay per-user
 * behind the consent-gated Foundry.
 *
 * Idempotent: files already present with plausible sizes are kept.
 */

const fs = require('fs');
const path = require('path');

const DECODERS = ['taesd', 'taesdxl', 'taesd3', 'taef1'];
const FILES = [
  { name: 'config.json', minBytes: 100 },
  { name: 'diffusion_pytorch_model.safetensors', minBytes: 1024 * 1024 },
];
const TARGET_ROOT = path.join(__dirname, '..', 'resources', 'preview-decoders');

function hasPlausibleFile(filePath, minBytes) {
  try {
    return fs.statSync(filePath).size >= minBytes;
  } catch {
    return false;
  }
}

async function download(url, destination) {
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok) {
    throw new Error(`Download failed (HTTP ${response.status}) for ${url}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(destination, buffer);
  return buffer.length;
}

async function fetchDecoder(name) {
  const dir = path.join(TARGET_ROOT, name);
  fs.mkdirSync(dir, { recursive: true });
  for (const file of FILES) {
    const destination = path.join(dir, file.name);
    if (hasPlausibleFile(destination, file.minBytes)) {
      console.log(`  ${name}/${file.name} already present, skipping`);
      continue;
    }
    const url = `https://huggingface.co/madebyollin/${name}/resolve/main/${file.name}`;
    console.log(`  downloading ${name}/${file.name} ...`);
    const bytes = await download(url, destination);
    if (bytes < file.minBytes) {
      fs.rmSync(destination, { force: true });
      throw new Error(`${name}/${file.name} downloaded truncated (${bytes} bytes)`);
    }
    console.log(`  ${name}/${file.name} done (${(bytes / 1024 / 1024).toFixed(2)} MB)`);
  }
}

async function main() {
  console.log('Fetching Tiny-VAE preview decoders into resources/preview-decoders ...');
  fs.mkdirSync(TARGET_ROOT, { recursive: true });
  for (const name of DECODERS) {
    await fetchDecoder(name);
  }
  fs.writeFileSync(
    path.join(TARGET_ROOT, 'ATTRIBUTION.txt'),
    [
      'Tiny AutoEncoder preview decoders (taesd family)',
      'Source: https://huggingface.co/madebyollin (taesd, taesdxl, taesd3, taef1)',
      'License: MIT (c) Ollin Boer Bohan',
      'Fetched by scripts/fetch-preview-decoders.cjs for the Studio live step preview (#33).',
      '',
    ].join('\n'),
  );
  console.log('Preview decoders ready.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
```

- [ ] **Step 2: Extend the packaging gate**

In `scripts/assert-native-backend.cjs`, add below `assertNativeBackend`
(before the `module.exports`):

```javascript
const PREVIEW_DECODERS = ['taesd', 'taesdxl', 'taesd3', 'taef1'];
const PREVIEW_DECODER_FILES = ['config.json', 'diffusion_pytorch_model.safetensors'];

function assertPreviewDecoders() {
  const root = path.join(__dirname, '..', 'resources', 'preview-decoders');
  for (const name of PREVIEW_DECODERS) {
    for (const file of PREVIEW_DECODER_FILES) {
      const filePath = path.join(root, name, file);
      if (!fs.existsSync(filePath)) {
        throw new Error(
          `Preview decoder missing: ${name}/${file}\n` +
            'The installer always ships the Studio step-preview decoders ' +
            '(heavy-by-design). Run `node scripts/fetch-preview-decoders.cjs`.'
        );
      }
    }
  }
  console.log('[assert-native-backend] OK: preview decoders (taesd family) are in resources/');
}
```

call it at the end of `assertNativeBackend` (before the `console.log`/`return`):

```javascript
  assertPreviewDecoders();
```

and export it alongside the existing named export:

```javascript
module.exports.assertPreviewDecoders = assertPreviewDecoders;
```

- [ ] **Step 3: Wire the fetch into build-windows**

In `scripts/build-windows.cjs`, locate `prepareResources()` and add at its
start (before the LICENSE handling):

```javascript
  // #33: the installer always ships the Tiny-VAE step-preview decoders.
  execSync('node scripts/fetch-preview-decoders.cjs', { stdio: 'inherit', cwd: path.join(__dirname, '..') });
```

(match the file's existing `execSync`/`exec` helper convention - if the file
uses a local `exec(command)` helper, use that instead.)

- [ ] **Step 4: Gitignore**

Add to `.gitignore` under the existing `resources/VisionStudio-Backend.exe` line:

```
resources/preview-decoders/
```

- [ ] **Step 5: Run the fetch for real + verify the gate both ways**

```bash
node scripts/fetch-preview-decoders.cjs
node scripts/fetch-preview-decoders.cjs   # second run must skip everything (idempotent)
node -e "require('./scripts/assert-native-backend.cjs').assertPreviewDecoders()"
mv resources/preview-decoders/taesd resources/preview-decoders/taesd.bak
node -e "require('./scripts/assert-native-backend.cjs').assertPreviewDecoders()" # must THROW
mv resources/preview-decoders/taesd.bak resources/preview-decoders/taesd
node -e "require('./scripts/assert-native-backend.cjs').assertPreviewDecoders()" # must pass again
git status --short  # resources/preview-decoders must NOT appear (gitignored)
```

- [ ] **Step 6: Commit**

```bash
git add scripts/fetch-preview-decoders.cjs scripts/assert-native-backend.cjs scripts/build-windows.cjs .gitignore
git commit -m "build(preview): fetch + gate taesd decoders in the installer (heavy-by-design) (#33)"
```

---

### Task 12: Local real smoke + full gates

**Files:**
- Create: `backend/tests/test_step_preview_smoke_local.py`

- [ ] **Step 1: Write the smoke (VS_REAL_SMOKE-gated, like the #34 smokes)**

```python
"""#33 local acceptance smoke: a real SD1.5 run produces decoded step frames.

Runs ONLY with VS_REAL_SMOKE=1, the full backend, the locally installed
sd-1-5 weights, and fetched preview decoders. Maintainer gate for #33.
"""
import asyncio
import base64
import io
import os
import pathlib
import sys

import pytest

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

RUN = os.getenv("VS_REAL_SMOKE") == "1"
HAS_DEPS = False
try:
    import torch  # noqa: F401
    import diffusers  # noqa: F401

    HAS_DEPS = True
except Exception:
    pass

pytestmark = pytest.mark.skipif(
    not (RUN and HAS_DEPS), reason="set VS_REAL_SMOKE=1 with the full backend to run"
)

MODELS_DIR = os.environ.get("VS_MODELS_DIR", "models")
DECODERS_DIR = str(BACKEND_ROOT.parent / "resources" / "preview-decoders")


def test_sd15_run_streams_decoded_step_frames(tmp_path, monkeypatch):
    import numpy as np
    from PIL import Image

    if not os.path.isfile(os.path.join(
            MODELS_DIR, "checkpoints", "v1-5-pruned-emaonly.safetensors")):
        pytest.skip("install sd-1-5 from the Foundry to run this smoke")
    if not os.path.isfile(os.path.join(
            DECODERS_DIR, "taesd", "diffusion_pytorch_model.safetensors")):
        pytest.skip("run scripts/fetch-preview-decoders.cjs to run this smoke")

    monkeypatch.setenv("VISION_STUDIO_PREVIEW_DECODERS_DIR", DECODERS_DIR)

    import preview.decoders as decoders
    import utils.direct_generator as dg
    from preview.step_preview import StepPreviewService

    decoders._clear_decoder_cache()
    service = StepPreviewService()
    monkeypatch.setattr(dg, "step_preview_service", service)

    generator = dg.DirectGenerator(models_dir=MODELS_DIR, output_dir=str(tmp_path))
    result = asyncio.run(generator.generate_image(
        job_id="preview-smoke",
        prompt="a red apple on a white table, studio photo",
        width=256, height=256, steps=4, cfg_scale=7.0, seed=1234,
        model_name="sd-1-5", scheduler="Euler a",
    ))
    assert result["images"], "the run itself must produce an image"

    latest = service.latest("preview-smoke")
    assert latest is not None, "no step frame was decoded during the run"
    assert latest.step == 4 and latest.total_steps == 4
    assert latest.revision >= 2, "throttle should still allow multiple CPU-step decodes"

    prefix = "data:image/jpeg;base64,"
    assert latest.image.startswith(prefix)
    frame = Image.open(io.BytesIO(base64.b64decode(latest.image[len(prefix):])))
    assert max(frame.size) <= 512
    pixels = np.asarray(frame, dtype="float32")
    assert float(pixels.std()) > 5.0, "decoded frame is degenerate (flat image)"
```

- [ ] **Step 2: Run the smoke for real**

Run (from `backend/`, Bash):
`VS_REAL_SMOKE=1 venv/Scripts/python.exe -m pytest tests/test_step_preview_smoke_local.py -v -s; echo "EXIT:$?"`
Expected: `1 passed` (several minutes on CPU). This is the #33 acceptance evidence.

- [ ] **Step 3: Full gates**

```bash
cd backend && venv/Scripts/python.exe -m pytest -q          # full backend suite green
cd .. && npm run typecheck && npm test && npm run build      # frontend gates green
```

- [ ] **Step 4: Commit**

```bash
git add backend/tests/test_step_preview_smoke_local.py
git commit -m "test(preview): #33 local acceptance smoke - real SD1.5 step frames (#33)"
```

---

### Task 13: PR

- [ ] Push the branch, open the PR against `main` with the evidence-first body
  (companion smoke output, WS contract, degrade matrix, gate output), watch
  `gh pr checks --watch`, report, and PAUSE for the merge decision.
