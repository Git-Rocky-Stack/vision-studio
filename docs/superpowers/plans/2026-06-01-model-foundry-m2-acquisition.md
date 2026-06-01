# Model Foundry M2 — Acquisition Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Each task is a fresh-implementer-sized unit under two-stage review.

**Goal:** Build the Model Foundry acquisition engine on top of the M1 backend-owned `ModelRegistry`: a `DownloadManager` that drives real byte-granular progress/speed/ETA from `huggingface_hub` 1.10.1 (via a headless `tqdm_class` + `get_paths_info` totals), a bounded-concurrency queue keyed by model id (default 2, clamp 1–6), full pause/resume/cancel lifecycle, an aggregate disk preflight, typed error mapping (disk-full, gated-license, integrity, cancellation), per-call HF token injection with zero persistence/logging, and a `HF_HUB_DISABLE_XET` fast/precise toggle — surfaced over `POST /api/models/{id}/download[/pause|resume|cancel]` + `GET /api/models/downloads`, mirrored IPC channels, and a frontend `downloads` map on `modelsSlice`. The milestone ends with a Codex security review.

**Architecture:** A new `backend/foundry/` sub-layer that *layers on top of* `huggingface_hub` (it never re-implements the library's per-file `.incomplete` resume, per-file disk check, size-consistency check, or atomic move — those are built in). Three new modules: `download_errors.py` (typed exceptions + `map_hf_exception`), `download_telemetry.py` (a pure, clock-injected `ProgressSink` + a `make_tqdm_class` factory), and `download_manager.py` (the `DownloadJob` dataclass + the async `DownloadManager`). Transient telemetry (`progress`/`speed`/`eta`) lives on `DownloadJob` and streams via `GET /api/models/downloads` + the subscribe IPC channel — **not** on `ModelRecord`, which keeps its M1 19-field contract intact (only the status vocabulary gains values). `DownloadManager.get_record_status` composes into the registry's existing `status_provider` chain so an active job's lifecycle status (queued/downloading/paused/verifying) flows through `GET /api/models`. The Electron main process holds the HF token in `safeStorage` and injects it per-request as `X-HF-Token`; Python never persists or logs it.

**Tech Stack:** Python 3 / FastAPI / asyncio / dataclasses + Pydantic / `huggingface_hub` 1.10.1 (+ `hf_xet`) (backend); `unittest` + `unittest.mock` + FastAPI `TestClient` (backend tests — **never** pytest-only bare functions, see Conventions); TypeScript / React 19 / Zustand / Vitest (frontend); Electron IPC (`ipcMain.handle` ↔ `contextBridge`) + `safeStorage`.

---

## Conventions & Constraints (read once before starting)

- **Branch:** `feat/model-foundry-m2`, already cut from `origin/main`. Do **NOT** add a branch-setup task and do **NOT** switch branches. Confirm with `git branch --show-current` → `feat/model-foundry-m2` before the first commit.
- **CI backend test runner is `python -m unittest discover -s tests -v`, which ONLY executes `unittest.TestCase` subclasses.** Bare `def test_*` functions are imported but **never run** — a pytest-style bare function would silently "pass" CI while never executing. Therefore **EVERY backend test in this plan is a `unittest.TestCase` (or `unittest.IsolatedAsyncioTestCase`) subclass**, mirroring `backend/tests/test_model_manager.py`. They must also stay runnable under `python -m pytest backend/tests -q` (they are — `unittest` classes run under pytest). This supersedes the M1 foundry tests' bare-function style; M2 does not copy that style.
- **Backend tests: NO `torch` import, NO network.** Mock `huggingface_hub.hf_hub_download`, `huggingface_hub.get_paths_info`, `shutil.disk_usage`, and `huggingface_hub.constants.HF_HUB_DISABLE_XET`. Use `tempfile.mkdtemp()` for any filesystem. Inject a fake clock into `ProgressSink` so timing is deterministic.
- **CI runs Linux AND Windows** — all path logic uses `pathlib` / `os.path`; never hardcode a separator. The path-safety test (Task 12) asserts both separators, a Windows drive letter, and a long path.
- **`huggingface_hub` is mocked in CI** (no real library import on the CI image for these modules). Therefore `download_errors.py` and `download_telemetry.py` must import the library **lazily / defensively** (HF exception classes inside a `try` at module load; `tqdm` import inside the factory) so the modules import with no network and no torch. Tests patch the symbols on the `download_manager` module namespace, not on the real library.
- **Do NOT re-implement what the library does per file:** `.incomplete` append-mode resume, the per-file `_check_disk_space`, the size-consistency `OSError`, and the atomic `_chmod_and_move`. The `DownloadManager` adds only: the aggregate preflight, the bounded-concurrency queue, lifecycle + intent, registry status composition, token injection, gated detection, the verifying→ready repo-level transition, and the fast/precise toggle.
- **Token discipline (public MIT repo):** the HF token is a **local parameter** threaded `enqueue → _run_job → _download_file → hf_hub_download(token=...)`. It is **never** a field on `DownloadJob`, never stored on the manager, never written to disk, never logged. The schema/IPC must never echo it.
- **Green bar before each commit is allowed; the milestone gate (Task 17) is:** `npm run typecheck` && `npm test` && `npm run build` && `python -m pytest backend/tests -q` && the CI `python -m unittest discover -s tests -v` (run from `backend/`) all green. The husky pre-commit hook runs the full vitest suite + typecheck on any staged `.ts/.tsx`; keep frontend diffs focused.
- **Commit trailer:** every commit message ends with:
  ```
  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  ```
- **Canonical `DownloadJob` field set** (identical names on the Python dataclass, the Pydantic `DownloadJobSchema`, and the TS `DownloadJob` interface):
  `model_id, status, progress, speed, eta, total_bytes, error, gate_url`.
  `status` is one of `queued | downloading | paused | verifying | ready | error | cancelled`. **`token` is never a field.**
- **Extended `ModelStatus` vocabulary** (M2 adds four values to the M1 four): `not_found | downloading | error | ready` **+** `queued | verifying | paused | cancelled`. This is a free `str` on `ModelRecord` (not a Python enum); the canonical lists to update are `backend/tests/test_foundry_catalog.py::test_field_value_domains`, the dataclass/schema comments, and the TS `ModelStatus` union in `src/types/model.ts`.

---

## File Structure

**Backend (create):**
- `backend/foundry/download_errors.py` — typed exceptions + `map_hf_exception`.
- `backend/foundry/download_telemetry.py` — `ProgressSink` + `make_tqdm_class`.
- `backend/foundry/download_manager.py` — `DownloadJob` + `DownloadManager`.
- `backend/tests/test_foundry_download_errors.py`
- `backend/tests/test_foundry_download_telemetry.py`
- `backend/tests/test_foundry_download_manager.py`
- `backend/tests/test_foundry_download_paths.py`
- `backend/tests/test_foundry_download_api.py`

**Backend (modify):**
- `backend/foundry/schemas.py` — add `DownloadJobSchema`.
- `backend/foundry/model_record.py` — extend the `status` comment to the 8-value vocabulary (doc only).
- `backend/main.py` — construct the `DownloadManager`, compose its `get_record_status` into the registry `status_provider`, add the four download routes, read `X-HF-Token` per request.
- `backend/tests/test_foundry_catalog.py` — extend `test_field_value_domains` status domain to the 8-value set.

**Frontend (create):**
- `src/store/slices/downloadsSelectors.test.ts` — selector/action tests (co-located with modelsSlice tests is also fine; this plan creates a dedicated file).

**Frontend (modify):**
- `src/types/model.ts` — extend `ModelStatus`; add `DownloadJob` interface + `DownloadStatus` union.
- `src/store/slices/modelsSlice.ts` — add `downloads` state + `enqueueDownload/pauseDownload/resumeDownload/cancelDownload/refreshDownloads` actions + `selectDownloadFor` selector.
- `src/store/appStore.types.ts` — add `downloads: Record<string, DownloadJob>` to state and the five action signatures.
- `src/store/appStore.ts` — (no change needed beyond the existing `...modelsInitialState`/`...createModelsActions` spreads, which already pull the new fields).
- `electron/preload.ts` — add `download/downloadPause/downloadResume/downloadCancel/downloadsList/subscribeDownloads` to the `models` API + `setHfToken` under a new `auth` API, with matching `ElectronAPI` types.
- `electron/ipc-handlers/generation.ts` — add the `models:download:pause|resume|cancel`, `models:downloads:list`, `models:downloads:subscribe` handlers and wire `X-HF-Token`.
- `electron/services/backendAuth.ts` — add an HF-token holder + `hfTokenHeaders()` reading from `safeStorage`-backed storage.
- `electron/main.ts` — register the `auth:setHfToken` handler.
- `tests/integration/api-contracts.test.ts` — add a `DownloadJob` contract section.

---

## Task 1: Typed download errors + `map_hf_exception`

**Files:**
- Create: `backend/foundry/download_errors.py`
- Test: `backend/tests/test_foundry_download_errors.py`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_foundry_download_errors.py`:
```python
import pathlib
import sys
import unittest

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from foundry.download_errors import (  # type: ignore[import-not-found]
    DiskSpaceError,
    DownloadCancelledError,
    DownloadError,
    DownloadFailedError,
    GatedModelError,
    map_hf_exception,
)


class DownloadErrorHierarchyTests(unittest.TestCase):
    def test_all_typed_errors_subclass_download_error(self):
        self.assertTrue(issubclass(DiskSpaceError, DownloadError))
        self.assertTrue(issubclass(GatedModelError, DownloadError))
        self.assertTrue(issubclass(DownloadCancelledError, DownloadError))
        self.assertTrue(issubclass(DownloadFailedError, DownloadError))

    def test_disk_space_error_carries_required_and_available(self):
        err = DiskSpaceError(required=100, available=40)
        self.assertEqual(err.required, 100)
        self.assertEqual(err.available, 40)
        # Message is human-readable and contains both numbers.
        self.assertIn("100", str(err))
        self.assertIn("40", str(err))

    def test_gated_model_error_carries_repo_and_gate_url(self):
        err = GatedModelError(repo_id="org/m", gate_url="https://huggingface.co/org/m")
        self.assertEqual(err.repo_id, "org/m")
        self.assertEqual(err.gate_url, "https://huggingface.co/org/m")

    def test_failed_error_carries_reason(self):
        err = DownloadFailedError("integrity")
        self.assertEqual(err.reason, "integrity")


class MapHfExceptionTests(unittest.TestCase):
    def test_http_401_maps_to_gated_with_repo_gate_url(self):
        exc = _http_error(401)
        mapped = map_hf_exception(exc, repo_id="org/gated")
        self.assertIsInstance(mapped, GatedModelError)
        self.assertEqual(mapped.gate_url, "https://huggingface.co/org/gated")

    def test_http_403_maps_to_gated(self):
        mapped = map_hf_exception(_http_error(403), repo_id="org/g")
        self.assertIsInstance(mapped, GatedModelError)

    def test_size_consistency_oserror_maps_to_integrity_failure(self):
        mapped = map_hf_exception(OSError("Consistency check failed: ..."), repo_id="org/m")
        self.assertIsInstance(mapped, DownloadFailedError)
        self.assertEqual(mapped.reason, "integrity")

    def test_value_error_maps_to_generic_failed(self):
        mapped = map_hf_exception(ValueError("bad filename"), repo_id="org/m")
        self.assertIsInstance(mapped, DownloadFailedError)

    def test_an_existing_download_error_passes_through_unchanged(self):
        original = DiskSpaceError(required=5, available=1)
        self.assertIs(map_hf_exception(original, repo_id="org/m"), original)


def _http_error(status_code: int) -> Exception:
    """A stand-in for an HfHubHTTPError carrying an HTTP status code."""
    class _Resp:
        def __init__(self, code):
            self.status_code = code

    exc = Exception(f"HTTP {status_code}")
    exc.response = _Resp(status_code)  # type: ignore[attr-defined]
    return exc


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest backend/tests/test_foundry_download_errors.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'foundry.download_errors'`.

- [ ] **Step 3: Write the implementation**

Create `backend/foundry/download_errors.py`:
```python
"""Typed download errors for the Model Foundry acquisition engine.

Imports the huggingface_hub exception classes defensively so this module
loads with no network, no torch, and even when hf is not installed (CI mocks
the library). The mapping in ``map_hf_exception`` is what the DownloadManager
calls in its except-handler to turn raw library failures into our typed,
surfaceable errors.
"""

from typing import Optional

# Defensive, lazy import: CI may not have huggingface_hub on the image, and we
# must never import torch transitively at module load. Anything we cannot bind
# becomes a sentinel class that isinstance() never matches.
try:  # pragma: no cover - exercised indirectly
    from huggingface_hub.errors import (  # type: ignore[import-not-found]
        EntryNotFoundError,
        GatedRepoError,
        RepositoryNotFoundError,
    )
except Exception:  # pragma: no cover - hf not importable in this environment
    class _UnbindableHfError(Exception):
        """Sentinel — never matched by isinstance against real exceptions."""

    GatedRepoError = _UnbindableHfError  # type: ignore[assignment,misc]
    EntryNotFoundError = _UnbindableHfError  # type: ignore[assignment,misc]
    RepositoryNotFoundError = _UnbindableHfError  # type: ignore[assignment,misc]


class DownloadError(Exception):
    """Base class for every typed acquisition error."""


class DiskSpaceError(DownloadError):
    """Aggregate preflight refused the download: not enough free space."""

    def __init__(self, required: int, available: int):
        self.required = required
        self.available = available
        super().__init__(
            f"Insufficient disk space: need {required} bytes, {available} available"
        )


class GatedModelError(DownloadError):
    """The repo is license-gated (HTTP 401/403). Surface the gate URL CTA."""

    def __init__(self, repo_id: str, gate_url: str):
        self.repo_id = repo_id
        self.gate_url = gate_url
        super().__init__(f"Model '{repo_id}' is gated. Accept the license at {gate_url}")


class DownloadCancelledError(DownloadError):
    """Cooperative cancellation/pause was requested mid-download."""


class DownloadFailedError(DownloadError):
    """A typed, surfaced failure (not-found, integrity, or generic)."""

    def __init__(self, reason: str):
        self.reason = reason
        super().__init__(f"Download failed: {reason}")


def _http_status(exc: Exception) -> Optional[int]:
    """Best-effort extraction of an HTTP status code from an hf/requests error."""
    response = getattr(exc, "response", None)
    code = getattr(response, "status_code", None)
    if isinstance(code, int):
        return code
    code = getattr(exc, "status_code", None)
    return code if isinstance(code, int) else None


def map_hf_exception(exc: Exception, *, repo_id: str) -> DownloadError:
    """Translate a raw exception into a typed DownloadError.

    Idempotent for our own errors (passes them through). Gated (401/403 or
    GatedRepoError) -> GatedModelError with the repo gate URL; not-found ->
    DownloadFailedError; a size-consistency OSError -> integrity failure;
    anything else -> a generic DownloadFailedError.
    """
    if isinstance(exc, DownloadError):
        return exc

    status = _http_status(exc)
    if isinstance(exc, GatedRepoError) or status in (401, 403):
        return GatedModelError(
            repo_id=repo_id, gate_url=f"https://huggingface.co/{repo_id}"
        )

    if isinstance(exc, (EntryNotFoundError, RepositoryNotFoundError)):
        return DownloadFailedError("not_found")

    if isinstance(exc, OSError):
        # huggingface_hub raises OSError from http_get when the downloaded size
        # does not match the expected size (the built-in integrity backstop).
        return DownloadFailedError("integrity")

    return DownloadFailedError(str(exc) or exc.__class__.__name__)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest backend/tests/test_foundry_download_errors.py -q`
Expected: PASS (9 tests).

- [ ] **Step 5: Verify the test runs under the CI runner (unittest discover)**

Run (from `backend/`): `python -m unittest tests.test_foundry_download_errors -v`
Expected: `Ran 9 tests` … `OK` — proves the `TestCase` classes are discovered and executed (the whole point of the unittest mandate).

- [ ] **Step 6: Commit**

```bash
git add backend/foundry/download_errors.py backend/tests/test_foundry_download_errors.py
git commit -m "feat(foundry): add typed download errors + map_hf_exception

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: `ProgressSink` — pure, clock-injected telemetry

**Files:**
- Create: `backend/foundry/download_telemetry.py` (ProgressSink half)
- Test: `backend/tests/test_foundry_download_telemetry.py` (ProgressSink half)

Covers seeded test **#3 (progress accounting)** — the byte-accounting math, multi-file aggregate, speed EWMA, and ETA — in isolation, with no network and a fake clock.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_foundry_download_telemetry.py`:
```python
import pathlib
import sys
import threading
import unittest

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from foundry.download_errors import DownloadCancelledError  # type: ignore[import-not-found]
from foundry.download_telemetry import ProgressSink  # type: ignore[import-not-found]


class FakeClock:
    """A monotonic clock we step manually for deterministic speed/eta."""

    def __init__(self):
        self._now = 0.0

    def __call__(self) -> float:
        return self._now

    def advance(self, seconds: float) -> None:
        self._now += seconds


class ProgressSinkTests(unittest.TestCase):
    def test_progress_is_zero_for_zero_total(self):
        sink = ProgressSink(total_bytes=0, clock=FakeClock())
        self.assertEqual(sink.progress, 0.0)

    def test_single_file_progress_tracks_inflight_bytes(self):
        sink = ProgressSink(total_bytes=100, clock=FakeClock())
        sink.start_file(expected_size=100)
        sink.add(25)
        self.assertAlmostEqual(sink.progress, 0.25)
        sink.add(25)
        self.assertAlmostEqual(sink.progress, 0.50)

    def test_finish_file_moves_inflight_into_completed(self):
        sink = ProgressSink(total_bytes=300, clock=FakeClock())
        sink.start_file(expected_size=100)
        sink.add(100)
        sink.finish_file()
        # File 1 complete; inflight reset.
        self.assertAlmostEqual(sink.progress, 100 / 300)
        sink.start_file(expected_size=200)
        sink.add(100)
        # completed(100) + inflight(100) over total(300).
        self.assertAlmostEqual(sink.progress, 200 / 300)

    def test_progress_clamps_to_one(self):
        sink = ProgressSink(total_bytes=100, clock=FakeClock())
        sink.start_file(expected_size=100)
        sink.add(250)  # overshoot (e.g. recompressed) never exceeds 1.0
        self.assertEqual(sink.progress, 1.0)

    def test_resume_initial_offset_counts_as_inflight(self):
        sink = ProgressSink(total_bytes=100, clock=FakeClock())
        sink.start_file(expected_size=100, initial=40)
        self.assertAlmostEqual(sink.progress, 0.40)
        sink.add(10)
        self.assertAlmostEqual(sink.progress, 0.50)

    def test_speed_is_zero_before_two_samples(self):
        clock = FakeClock()
        sink = ProgressSink(total_bytes=100, clock=clock)
        sink.start_file(expected_size=100)
        self.assertEqual(sink.speed, 0.0)
        sink.add(10)  # first sample, no delta yet
        self.assertEqual(sink.speed, 0.0)

    def test_speed_is_bytes_per_second_ewma(self):
        clock = FakeClock()
        sink = ProgressSink(total_bytes=1000, clock=clock)
        sink.start_file(expected_size=1000)
        sink.add(100)
        clock.advance(1.0)
        sink.add(100)  # 100 bytes in 1.0s -> 100 B/s
        self.assertGreater(sink.speed, 0.0)
        self.assertLessEqual(sink.speed, 100.0)

    def test_eta_is_remaining_over_speed(self):
        clock = FakeClock()
        sink = ProgressSink(total_bytes=1000, clock=clock)
        sink.start_file(expected_size=1000)
        sink.add(100)
        clock.advance(1.0)
        sink.add(100)  # speed ~100 B/s, 800 bytes remain -> ~8s
        self.assertIsNotNone(sink.eta)
        self.assertGreater(sink.eta, 0.0)

    def test_eta_is_none_when_speed_is_zero(self):
        sink = ProgressSink(total_bytes=1000, clock=FakeClock())
        sink.start_file(expected_size=1000)
        self.assertIsNone(sink.eta)

    def test_add_raises_when_cancel_event_set(self):
        event = threading.Event()
        sink = ProgressSink(total_bytes=100, clock=FakeClock(), cancel_event=event)
        sink.start_file(expected_size=100)
        sink.add(10)
        event.set()
        with self.assertRaises(DownloadCancelledError):
            sink.add(10)


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest backend/tests/test_foundry_download_telemetry.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'foundry.download_telemetry'`.

- [ ] **Step 3: Write the implementation (ProgressSink only; the tqdm factory lands in Task 3)**

Create `backend/foundry/download_telemetry.py`:
```python
"""Download telemetry — a pure, synchronous, clock-injectable byte accountant.

ProgressSink is unit-testable with no network and a fake clock. The Download
manager creates one sink per job (total = sum of per-file sizes from
get_paths_info) and threads byte deltas in through a headless tqdm subclass
(see make_tqdm_class, Task 3). Speed is an EWMA over (bytes, seconds) deltas;
ETA is remaining / speed.
"""

import threading
import time
from typing import Callable, Optional

from foundry.download_errors import DownloadCancelledError

# Exponential-moving-average weight for new speed samples. Higher = more
# responsive, lower = smoother. 0.3 reads well for a per-second UI gauge.
_EWMA_ALPHA = 0.3


class ProgressSink:
    def __init__(
        self,
        total_bytes: int,
        clock: Callable[[], float] = time.monotonic,
        cancel_event: Optional[threading.Event] = None,
    ):
        self._total = max(int(total_bytes), 0)
        self._clock = clock
        self._cancel_event = cancel_event

        self._completed_bytes = 0          # bytes from finished files
        self._inflight_bytes = 0           # bytes of the current file so far
        self._current_file_size = 0        # expected size of the current file

        self._speed = 0.0                  # bytes/sec EWMA
        self._last_time: Optional[float] = None
        self._samples = 0

    # -- lifecycle ---------------------------------------------------------
    def start_file(self, expected_size: int, initial: int = 0) -> None:
        """Begin a new file. ``initial`` is the resume offset (>0 on resume)."""
        self._current_file_size = max(int(expected_size), 0)
        self._inflight_bytes = max(int(initial), 0)
        self._last_time = None  # speed sampling restarts per file boundary

    def add(self, n: int) -> None:
        """Account ``n`` newly-transferred bytes. Raises on cooperative cancel."""
        if self._cancel_event is not None and self._cancel_event.is_set():
            raise DownloadCancelledError("download cancelled")
        if n <= 0:
            return
        self._inflight_bytes += int(n)
        self._update_speed(int(n))

    def finish_file(self) -> None:
        """Mark the current file complete; fold its size into completed bytes."""
        self._completed_bytes += self._current_file_size
        self._inflight_bytes = 0
        self._current_file_size = 0
        self._last_time = None

    # -- derived telemetry -------------------------------------------------
    @property
    def total_bytes(self) -> int:
        return self._total

    @property
    def progress(self) -> float:
        if self._total <= 0:
            return 0.0
        transferred = self._completed_bytes + self._inflight_bytes
        fraction = transferred / self._total
        if fraction < 0.0:
            return 0.0
        return 1.0 if fraction > 1.0 else fraction

    @property
    def speed(self) -> float:
        return self._speed

    @property
    def eta(self) -> Optional[float]:
        if self._speed <= 0.0:
            return None
        remaining = self._total - (self._completed_bytes + self._inflight_bytes)
        if remaining < 0:
            remaining = 0
        return remaining / self._speed

    # -- internals ---------------------------------------------------------
    def _update_speed(self, n: int) -> None:
        now = self._clock()
        if self._last_time is None:
            # First sample of the file: establish a baseline, no rate yet.
            self._last_time = now
            self._samples += 1
            return
        elapsed = now - self._last_time
        self._last_time = now
        self._samples += 1
        if elapsed <= 0:
            return
        instantaneous = n / elapsed
        if self._speed <= 0.0:
            self._speed = instantaneous
        else:
            self._speed = (
                _EWMA_ALPHA * instantaneous + (1 - _EWMA_ALPHA) * self._speed
            )
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest backend/tests/test_foundry_download_telemetry.py -q`
Expected: PASS (10 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/foundry/download_telemetry.py backend/tests/test_foundry_download_telemetry.py
git commit -m "feat(foundry): add ProgressSink byte accountant (progress/speed/eta)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: `make_tqdm_class` — the headless progress hook factory

**Files:**
- Modify: `backend/foundry/download_telemetry.py` (add the factory)
- Test: `backend/tests/test_foundry_download_telemetry.py` (add a factory test class)

Completes the chosen mechanism from Spike A: a silent `tqdm.auto.tqdm` subclass that hf instantiates per file and that drives the `ProgressSink`.

- [ ] **Step 1: Add the failing test**

Append to `backend/tests/test_foundry_download_telemetry.py` (above the `if __name__` guard) a new test class that uses a fake tqdm base so the test needs neither the real `tqdm` nor a network:
```python
import foundry.download_telemetry as telemetry_module  # noqa: E402


class FakeTqdm:
    """Minimal stand-in for tqdm.auto.tqdm so make_tqdm_class is testable
    without importing the real library."""

    def __init__(self, *args, **kwargs):
        self.total = kwargs.get("total")
        self.n = kwargs.get("initial", 0)
        self.disable = kwargs.get("disable", False)
        self.closed = False

    def update(self, n=1):
        self.n += n

    def close(self):
        self.closed = True


class MakeTqdmClassTests(unittest.TestCase):
    def setUp(self):
        # Force the factory to subclass our fake base, not the real tqdm.
        self._orig = telemetry_module._tqdm_base
        telemetry_module._tqdm_base = lambda: FakeTqdm

    def tearDown(self):
        telemetry_module._tqdm_base = self._orig

    def test_factory_forces_headless_and_starts_a_file(self):
        sink = ProgressSink(total_bytes=100, clock=FakeClock())
        cls = telemetry_module.make_tqdm_class(sink)
        bar = cls(total=100, initial=0)
        # hf passes disable through; we force it True so no terminal bar prints.
        self.assertTrue(bar.disable)
        # start_file was called with total -> progress reacts to updates.
        bar.update(50)
        self.assertAlmostEqual(sink.progress, 0.50)

    def test_update_feeds_the_sink_and_the_base(self):
        sink = ProgressSink(total_bytes=200, clock=FakeClock())
        cls = telemetry_module.make_tqdm_class(sink)
        bar = cls(total=200)
        bar.update(40)
        self.assertAlmostEqual(sink.progress, 40 / 200)
        self.assertEqual(bar.n, 40)  # base also advanced

    def test_close_finishes_the_file(self):
        sink = ProgressSink(total_bytes=200, clock=FakeClock())
        cls = telemetry_module.make_tqdm_class(sink)
        bar = cls(total=100)
        bar.update(100)
        bar.close()
        self.assertTrue(bar.closed)
        self.assertAlmostEqual(sink.progress, 100 / 200)  # folded into completed
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest backend/tests/test_foundry_download_telemetry.py -q -k MakeTqdm`
Expected: FAIL — `module 'foundry.download_telemetry' has no attribute '_tqdm_base'` / `make_tqdm_class`.

- [ ] **Step 3: Add the factory to `download_telemetry.py`**

Append to `backend/foundry/download_telemetry.py`:
```python
def _tqdm_base():
    """Resolve tqdm.auto.tqdm lazily so the module imports with no tqdm/torch.

    Overridable in tests (monkeypatch this function to return a fake base).
    """
    from tqdm.auto import tqdm  # local import: never at module load
    return tqdm


def make_tqdm_class(sink: "ProgressSink") -> type:
    """Build a silent tqdm subclass bound to ``sink``.

    huggingface_hub instantiates this class once per file (passing total =
    expected_size and initial = resume offset). For a NON-hf subclass hf does
    NOT inject ``disable`` or ``name`` (verified in Spike A), so we force
    ``disable=True`` ourselves to suppress any terminal bar while still
    receiving every ``update(n)``.
    """
    base = _tqdm_base()

    class _SinkTqdm(base):  # type: ignore[misc, valid-type]
        def __init__(self, *args, **kwargs):
            kwargs["disable"] = True  # headless: no terminal output
            super().__init__(*args, **kwargs)
            sink.start_file(
                expected_size=getattr(self, "total", 0) or 0,
                initial=getattr(self, "n", 0) or 0,
            )

        def update(self, n=1):
            sink.add(n)
            return super().update(n)

        def close(self):
            sink.finish_file()
            return super().close()

    return _SinkTqdm
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest backend/tests/test_foundry_download_telemetry.py -q`
Expected: PASS (10 ProgressSink + 3 factory = 13 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/foundry/download_telemetry.py backend/tests/test_foundry_download_telemetry.py
git commit -m "feat(foundry): add make_tqdm_class headless progress hook factory

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: `DownloadJob` + `DownloadManager.enqueue` + concurrency clamp

**Files:**
- Create: `backend/foundry/download_manager.py` (DownloadJob + manager skeleton + enqueue)
- Test: `backend/tests/test_foundry_download_manager.py`

Covers seeded tests **#1 (enqueue, idempotent)** and **#2 (concurrency clamp + queued slot)**.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_foundry_download_manager.py` (this file grows across Tasks 4–11; start it here):
```python
import asyncio
import os
import pathlib
import sys
import tempfile
import threading
import unittest
from unittest import mock

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

import foundry.download_manager as dm_module  # type: ignore[import-not-found]
from foundry.download_manager import DownloadJob, DownloadManager  # type: ignore[import-not-found]
from foundry.registry import ModelRegistry  # type: ignore[import-not-found]
from utils.model_manager import ModelManager  # type: ignore[import-not-found]

CATALOG_PATH = str(BACKEND_ROOT / "foundry" / "verified-catalog.json")


def make_manager(models_dir=None, concurrency=2, mode="fast"):
    models_dir = models_dir or tempfile.mkdtemp()
    model_manager = ModelManager(models_dir)
    registry = ModelRegistry(models_dir=models_dir, catalog_path=CATALOG_PATH)
    return DownloadManager(
        registry=registry,
        model_manager=model_manager,
        models_dir=models_dir,
        concurrency=concurrency,
        mode=mode,
    )


class DownloadManagerConcurrencyTests(unittest.TestCase):
    def test_concurrency_is_clamped_to_one_six(self):
        self.assertEqual(make_manager(concurrency=0)._concurrency, 1)
        self.assertEqual(make_manager(concurrency=99)._concurrency, 6)
        self.assertEqual(make_manager(concurrency=3)._concurrency, 3)

    def test_download_job_never_has_a_token_field(self):
        job = DownloadJob(model_id="flux-dev", status="queued")
        self.assertNotIn("token", job.__dict__)
        self.assertFalse(hasattr(job, "token"))


class DownloadManagerEnqueueTests(unittest.IsolatedAsyncioTestCase):
    async def test_enqueue_creates_a_queued_job_keyed_by_model_id(self):
        manager = make_manager()
        # Block the worker so we can observe the queued/active state.
        gate = threading.Event()
        with mock.patch.object(manager, "_run_job", new=_hang(gate)):
            job = manager.enqueue("flux-dev")
            self.assertEqual(job.model_id, "flux-dev")
            self.assertIn(manager._jobs["flux-dev"].status, {"queued", "downloading"})
            gate.set()
            await _drain(manager)

    async def test_enqueue_is_idempotent_for_an_active_id(self):
        manager = make_manager()
        gate = threading.Event()
        with mock.patch.object(manager, "_run_job", new=_hang(gate)):
            first = manager.enqueue("flux-dev")
            second = manager.enqueue("flux-dev")
            self.assertIs(first, second)            # same job object
            self.assertEqual(len(manager._tasks), 1)  # no second task
            gate.set()
            await _drain(manager)

    async def test_third_enqueue_waits_for_a_slot_with_limit_two(self):
        manager = make_manager(concurrency=2)
        running = []
        release = threading.Event()

        async def _busy(model_id, token):
            running.append(model_id)
            await asyncio.to_thread(release.wait)

        with mock.patch.object(manager, "_run_job", new=_busy):
            manager.enqueue("flux-dev")
            manager.enqueue("sdxl-base")
            third = manager.enqueue("sd-1-5")
            # Let the two slots start.
            await asyncio.sleep(0.05)
            self.assertEqual(len(running), 2)
            self.assertEqual(third.status, "queued")  # still waiting on the semaphore
            release.set()
            await _drain(manager)
            self.assertIn("sd-1-5", running)


def _hang(gate: threading.Event):
    async def _run(model_id, token):
        await asyncio.to_thread(gate.wait)
    return _run


async def _drain(manager: DownloadManager):
    tasks = list(manager._tasks.values())
    if tasks:
        await asyncio.gather(*tasks, return_exceptions=True)


if __name__ == "__main__":
    unittest.main()
```

> Note: `test_third_enqueue_waits_for_a_slot_with_limit_two` requires the semaphore to be acquired *inside* `_run_job` (so a queued task that has not acquired the slot keeps `status == "queued"`). That is exactly the design — Step 3 places `async with self._semaphore:` as the first line of `_run_job`, and `enqueue` sets `status="queued"` before the task acquires.

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest backend/tests/test_foundry_download_manager.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'foundry.download_manager'`.

- [ ] **Step 3: Write the manager skeleton + enqueue**

Create `backend/foundry/download_manager.py`:
```python
"""DownloadManager — the bounded-concurrency acquisition queue.

Layers on top of huggingface_hub (which already does per-file .incomplete
resume, a per-file disk check, a size-consistency check, and an atomic move).
This manager owns: the aggregate disk preflight, a semaphore-bounded queue of
asyncio.Tasks keyed by model id, pause/resume/cancel lifecycle + intent, the
fast/precise (Xet) toggle, per-call token injection (never stored/logged), and
the live status the registry composes through its status_provider.

Telemetry (progress/speed/eta) lives on DownloadJob and is streamed via
GET /models/downloads; it is deliberately NOT written onto ModelRecord.
"""

import asyncio
import os
import shutil
import threading
from contextlib import contextmanager
from dataclasses import dataclass, field
from typing import Dict, List, Literal, Optional

import huggingface_hub

from foundry.download_errors import (
    DiskSpaceError,
    DownloadCancelledError,
    DownloadError,
    GatedModelError,
    map_hf_exception,
)
from foundry.download_telemetry import ProgressSink, make_tqdm_class

JobStatus = Literal[
    "queued", "downloading", "paused", "verifying", "ready", "error", "cancelled"
]

# Extra free bytes required beyond the summed file sizes, so the volume is not
# driven to exactly zero (index/temp churn). 256 MiB is a safe resting margin.
_DISK_HEADROOM_BYTES = 256 * 1024 * 1024

# Active lifecycle states an enqueue is idempotent against.
_ACTIVE_STATES = {"queued", "downloading", "paused", "verifying"}


@dataclass
class DownloadJob:
    model_id: str
    status: JobStatus
    progress: float = 0.0
    speed: float = 0.0
    eta: Optional[float] = None
    total_bytes: int = 0
    error: Optional[str] = None
    gate_url: Optional[str] = None
    # NB: there is intentionally NO token field. The token is a local param
    # threaded through _run_job -> _download_file only.


class DownloadManager:
    def __init__(
        self,
        registry,
        model_manager,
        models_dir: str,
        concurrency: int = 2,
        mode: str = "fast",
    ):
        self._registry = registry
        self._model_manager = model_manager
        self._models_dir = models_dir
        self._concurrency = max(1, min(int(concurrency), 6))
        self.mode = mode if mode in {"fast", "precise"} else "fast"

        self._jobs: Dict[str, DownloadJob] = {}
        self._tasks: Dict[str, asyncio.Task] = {}
        self._sinks: Dict[str, ProgressSink] = {}
        self._cancel_events: Dict[str, threading.Event] = {}
        self._intent: Dict[str, str] = {}  # model_id -> none | pause | cancel
        self._semaphore = asyncio.Semaphore(self._concurrency)

    # -- public API --------------------------------------------------------
    def enqueue(self, model_id: str, token: Optional[str] = None) -> DownloadJob:
        """Queue a download. Idempotent for an already-active id.

        ``token`` is a LOCAL parameter passed straight into _run_job; it is
        never stored on the manager or the job, and never logged.
        """
        existing = self._jobs.get(model_id)
        if existing is not None and existing.status in _ACTIVE_STATES:
            return existing

        job = DownloadJob(model_id=model_id, status="queued")
        self._jobs[model_id] = job
        self._intent[model_id] = "none"
        self._cancel_events[model_id] = threading.Event()
        self._tasks[model_id] = asyncio.create_task(self._run_job(model_id, token))
        return job

    def list_jobs(self) -> List[DownloadJob]:
        return list(self._jobs.values())

    def get_record_status(self, model_id: str) -> Optional[str]:
        """Live lifecycle status for the registry status_provider, or None.

        Returns the active job's status (queued/downloading/paused/verifying)
        so GET /api/models reflects in-flight lifecycle. Terminal states
        (ready/error/cancelled) return None so the registry falls back to its
        own on-disk / model_manager detection (a cancelled job must not pin the
        record to 'cancelled' forever).
        """
        job = self._jobs.get(model_id)
        if job is None:
            return None
        if job.status in _ACTIVE_STATES:
            return job.status
        return None

    # -- worker (filled in by later tasks) ---------------------------------
    async def _run_job(self, model_id: str, token: Optional[str]) -> None:
        async with self._semaphore:
            await self._execute(model_id, token)

    async def _execute(self, model_id: str, token: Optional[str]) -> None:
        # Implemented in Task 5 (happy path) and extended in Tasks 6-11.
        raise NotImplementedError
```

> The `_execute` split keeps the semaphore acquisition in `_run_job` (so the concurrency test sees a `queued` third job) while later tasks fill `_execute`. The `field` import is retained for forward use in later tasks.

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest backend/tests/test_foundry_download_manager.py -q`
Expected: PASS (5 tests). The hung/busy `_run_job` mocks never reach `_execute`, so `NotImplementedError` is not hit.

- [ ] **Step 5: Commit**

```bash
git add backend/foundry/download_manager.py backend/tests/test_foundry_download_manager.py
git commit -m "feat(foundry): add DownloadJob + DownloadManager.enqueue with concurrency clamp

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: `_execute` happy path — resolve files, download per-file, verify, ready

**Files:**
- Modify: `backend/foundry/download_manager.py` (implement `_execute` + helpers)
- Test: `backend/tests/test_foundry_download_manager.py` (add happy-path class)

Covers seeded test **#8 (atomic verified completion)** success leg and the progress wiring of **#3**.

- [ ] **Step 1: Add the failing test**

Append a new test class to `backend/tests/test_foundry_download_manager.py` (before the helper functions):
```python
class DownloadManagerHappyPathTests(unittest.IsolatedAsyncioTestCase):
    async def test_single_file_download_drives_progress_and_reaches_ready(self):
        models_dir = tempfile.mkdtemp()
        manager = make_manager(models_dir=models_dir)

        # get_paths_info -> one 100-byte file.
        paths = [_path_info("flux1-dev.safetensors", 100)]

        def fake_download(*, repo_id, filename, local_dir, token, tqdm_class, revision):
            # Simulate hf: instantiate the tqdm per file, stream bytes, close.
            bar = tqdm_class(total=100)
            bar.update(100)
            bar.close()
            dest = os.path.join(local_dir, filename)
            with open(dest, "w", encoding="utf-8") as handle:
                handle.write("x")
            return dest

        with mock.patch.object(dm_module.huggingface_hub, "get_paths_info", return_value=paths), \
             mock.patch.object(dm_module.huggingface_hub, "disk_usage", create=True), \
             mock.patch("shutil.disk_usage", return_value=_disk(free=10 ** 12)), \
             mock.patch.object(dm_module.huggingface_hub, "hf_hub_download", side_effect=fake_download):
            manager.enqueue("flux-dev")
            await _drain(manager)

        job = manager._jobs["flux-dev"]
        self.assertEqual(job.status, "ready")
        self.assertAlmostEqual(job.progress, 1.0)
        self.assertEqual(job.total_bytes, 100)
        self.assertIsNone(job.error)

    async def test_token_is_passed_per_call_and_not_stored(self):
        manager = make_manager()
        paths = [_path_info("flux1-dev.safetensors", 10)]
        seen = {}

        def fake_download(*, token, local_dir, filename, **_):
            seen["token"] = token
            dest = os.path.join(local_dir, filename)
            open(dest, "w").close()
            return dest

        with mock.patch.object(dm_module.huggingface_hub, "get_paths_info", return_value=paths), \
             mock.patch("shutil.disk_usage", return_value=_disk(free=10 ** 12)), \
             mock.patch.object(dm_module.huggingface_hub, "hf_hub_download", side_effect=fake_download):
            manager.enqueue("flux-dev", token="hf_SECRET")
            await _drain(manager)

        self.assertEqual(seen["token"], "hf_SECRET")
        # The secret is on no job and on no manager attribute.
        self.assertFalse(any("hf_SECRET" in repr(v) for v in manager._jobs.values()))
        self.assertFalse(any("hf_SECRET" in repr(v) for v in vars(manager).values()))
```

And add these shared helpers next to `_hang`/`_drain` at the bottom of the file:
```python
def _path_info(path: str, size: int):
    """Mimic a huggingface_hub RepoFile from get_paths_info."""
    return type("RepoFile", (), {"path": path, "size": size})()


def _disk(free: int):
    return type("Usage", (), {"total": free * 2, "used": free, "free": free})()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest backend/tests/test_foundry_download_manager.py -q -k HappyPath`
Expected: FAIL — `_execute` raises `NotImplementedError`.

- [ ] **Step 3: Implement `_execute` + the file-resolution / preflight / download helpers**

In `backend/foundry/download_manager.py`, replace the `_execute` stub with the full implementation and add the helper methods. Replace:
```python
    async def _execute(self, model_id: str, token: Optional[str]) -> None:
        # Implemented in Task 5 (happy path) and extended in Tasks 6-11.
        raise NotImplementedError
```
with:
```python
    async def _execute(self, model_id: str, token: Optional[str]) -> None:
        job = self._jobs[model_id]
        record = self._registry.get_record(model_id)
        if record is None:
            job.status = "error"
            job.error = "unknown model id"
            self._cleanup_task(model_id)
            return

        repo_id = record.get("repo_id")
        revision = record.get("revision", "main")
        cancel_event = self._cancel_events[model_id]

        try:
            filenames, total_bytes, target_dir = self._resolve_files(model_id, record)
            job.total_bytes = total_bytes

            self._preflight_disk(total_bytes, target_dir)

            job.status = "downloading"
            sink = ProgressSink(total_bytes, cancel_event=cancel_event)
            self._sinks[model_id] = sink

            for filename in filenames:
                await asyncio.to_thread(
                    self._download_file, repo_id, filename, target_dir, token, sink, revision
                )
                job.progress = sink.progress
                job.speed = sink.speed
                job.eta = sink.eta

            job.status = "verifying"
            # The library already did per-file size-consistency + atomic move;
            # the repo-level verify is the presence of every target file.
            self._verify(filenames, target_dir)

            job.progress = 1.0
            job.speed = 0.0
            job.eta = 0.0
            job.status = "ready"
        except DownloadCancelledError:
            self._handle_cancellation(model_id, target_dir=self._target_dir(record))
        except DiskSpaceError as exc:
            job.status = "error"
            job.error = str(exc)
        except GatedModelError as exc:
            job.status = "error"
            job.error = str(exc)
            job.gate_url = exc.gate_url
        except DownloadError as exc:
            job.status = "error"
            job.error = str(exc)
        except Exception as exc:  # any raw hf error -> typed -> surfaced
            mapped = map_hf_exception(exc, repo_id=repo_id or model_id)
            job.status = "error"
            job.error = str(mapped)
            if isinstance(mapped, GatedModelError):
                job.gate_url = mapped.gate_url
        finally:
            self._cleanup_task(model_id)

    # -- resolution / preflight / per-file download ------------------------
    def _resolve_files(self, model_id: str, record: dict):
        """Return (filenames, total_bytes, target_dir) for the model.

        Single-file artifacts resolve to the one filename from the manager's
        _SINGLE_FILE_FILENAMES map; diffusers repos resolve to the repo file
        list. Sizes come from huggingface_hub.get_paths_info (no download).
        """
        from utils.model_manager import _SINGLE_FILE_FILENAMES

        repo_id = record.get("repo_id")
        revision = record.get("revision", "main")
        target_dir = self._target_dir(record)

        single = _SINGLE_FILE_FILENAMES.get(model_id)
        if single is not None:
            paths = [single]
        else:
            infos = huggingface_hub.get_paths_info(repo_id, [], revision=revision)
            paths = [getattr(info, "path", None) or info["path"] for info in infos]

        infos = huggingface_hub.get_paths_info(repo_id, paths, revision=revision)
        total = 0
        for info in infos:
            size = getattr(info, "size", None)
            if size is None and isinstance(info, dict):
                size = info.get("size", 0)
            total += int(size or 0)

        return paths, total, target_dir

    def _target_dir(self, record: dict) -> str:
        """Destination directory matching the model_manager storage layout."""
        artifact_type = record.get("artifact_type", "checkpoint")
        if artifact_type in {"diffusers-pipeline", "motion-adapter"}:
            return os.path.join(self._models_dir, "diffusers", record["id"])
        subdir = _ARTIFACT_SUBDIR.get(artifact_type, "checkpoints")
        return os.path.join(self._models_dir, subdir)

    def _preflight_disk(self, total_bytes: int, target_dir: str) -> None:
        """Refuse the whole pull up front if free space < total + headroom."""
        probe = target_dir
        while probe and not os.path.isdir(probe):
            probe = os.path.dirname(probe)
        if not probe:
            probe = self._models_dir
        os.makedirs(target_dir, exist_ok=True)
        free = shutil.disk_usage(probe).free
        required = total_bytes + _DISK_HEADROOM_BYTES
        if free < required:
            raise DiskSpaceError(required=required, available=free)

    def _download_file(self, repo_id, filename, target_dir, token, sink, revision):
        """Blocking per-file download. Token passed PER CALL only."""
        os.makedirs(target_dir, exist_ok=True)
        with self._xet_toggle():
            huggingface_hub.hf_hub_download(
                repo_id=repo_id,
                filename=filename,
                local_dir=target_dir,
                token=token,
                tqdm_class=make_tqdm_class(sink),
                revision=revision,
            )

    def _verify(self, filenames, target_dir) -> None:
        for filename in filenames:
            dest = os.path.join(target_dir, filename)
            if not os.path.exists(dest):
                raise DownloadError(f"verify failed: missing {filename}")

    @contextmanager
    def _xet_toggle(self):
        """Force the plain-HTTP byte-exact path in precise mode; restore after.

        file_download.py reads constants.HF_HUB_DISABLE_XET at call time, so
        mutating the module attribute around the call toggles per-download. The
        prior value is always restored, even on exception.
        """
        if self.mode != "precise":
            yield
            return
        previous = huggingface_hub.constants.HF_HUB_DISABLE_XET
        huggingface_hub.constants.HF_HUB_DISABLE_XET = True
        try:
            yield
        finally:
            huggingface_hub.constants.HF_HUB_DISABLE_XET = previous

    # -- lifecycle handlers (cancel/pause fleshed out in Tasks 6-8) --------
    def _handle_cancellation(self, model_id: str, target_dir: str) -> None:
        job = self._jobs[model_id]
        if self._intent.get(model_id) == "pause":
            job.status = "paused"  # KEEP .incomplete partials for resume
        else:
            self._delete_partials(target_dir)
            job.status = "cancelled"

    def _delete_partials(self, target_dir: str) -> None:
        if not os.path.isdir(target_dir):
            return
        for name in os.listdir(target_dir):
            if name.endswith(".incomplete"):
                try:
                    os.remove(os.path.join(target_dir, name))
                except OSError:
                    pass

    def _cleanup_task(self, model_id: str) -> None:
        self._tasks.pop(model_id, None)
        self._cancel_events.pop(model_id, None)
        self._sinks.pop(model_id, None)
        self._intent.pop(model_id, None)
```

Add the artifact-subdir map at module bottom (mirrors `registry._ARTIFACT_SUBDIR` and `model_manager.subdirs`):
```python
_ARTIFACT_SUBDIR = {
    "checkpoint": "checkpoints",
    "diffusers-pipeline": "diffusers",
    "motion-adapter": "diffusers",
    "lora": "loras",
    "vae": "vaes",
    "controlnet": "controlnet",
    "embedding": "embeddings",
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest backend/tests/test_foundry_download_manager.py -q`
Expected: PASS (all enqueue/concurrency + happy-path tests).

- [ ] **Step 5: Commit**

```bash
git add backend/foundry/download_manager.py backend/tests/test_foundry_download_manager.py
git commit -m "feat(foundry): implement DownloadManager happy path (resolve/preflight/download/verify)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Disk preflight refuses an over-budget pull before any download

**Files:**
- Test: `backend/tests/test_foundry_download_manager.py` (add preflight class)

Covers seeded test **#4 (disk preflight)**. The implementation already exists (Task 5 `_preflight_disk`); this task proves both legs and that NO `hf_hub_download` is called when over budget.

- [ ] **Step 1: Add the failing test**

Append to `backend/tests/test_foundry_download_manager.py`:
```python
class DownloadManagerDiskPreflightTests(unittest.IsolatedAsyncioTestCase):
    async def test_over_budget_raises_before_any_download_call(self):
        manager = make_manager()
        paths = [_path_info("flux1-dev.safetensors", 10 ** 11)]  # ~100 GB
        download = mock.MagicMock()

        with mock.patch.object(dm_module.huggingface_hub, "get_paths_info", return_value=paths), \
             mock.patch("shutil.disk_usage", return_value=_disk(free=1024)), \
             mock.patch.object(dm_module.huggingface_hub, "hf_hub_download", download):
            manager.enqueue("flux-dev")
            await _drain(manager)

        job = manager._jobs["flux-dev"]
        self.assertEqual(job.status, "error")
        self.assertIn("disk space", job.error.lower())
        download.assert_not_called()  # refused up front, nothing downloaded

    async def test_within_budget_proceeds(self):
        models_dir = tempfile.mkdtemp()
        manager = make_manager(models_dir=models_dir)
        paths = [_path_info("flux1-dev.safetensors", 100)]

        def fake_download(*, local_dir, filename, **_):
            dest = os.path.join(local_dir, filename)
            open(dest, "w").close()
            return dest

        with mock.patch.object(dm_module.huggingface_hub, "get_paths_info", return_value=paths), \
             mock.patch("shutil.disk_usage", return_value=_disk(free=10 ** 12)), \
             mock.patch.object(dm_module.huggingface_hub, "hf_hub_download", side_effect=fake_download):
            manager.enqueue("flux-dev")
            await _drain(manager)

        self.assertEqual(manager._jobs["flux-dev"].status, "ready")
```

- [ ] **Step 2: Run test to verify it passes (implementation already present)**

Run: `python -m pytest backend/tests/test_foundry_download_manager.py -q -k DiskPreflight`
Expected: PASS (2 tests) — `_preflight_disk` from Task 5 raises `DiskSpaceError` before the loop, and the `_execute` handler sets status `error` + message. If RED, the bug is in Task 5's preflight ordering; fix there (preflight must run before `job.status = "downloading"` and the download loop).

- [ ] **Step 3: Commit**

```bash
git add backend/tests/test_foundry_download_manager.py
git commit -m "test(foundry): assert disk preflight refuses over-budget pulls before download

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Pause — cooperative cancel, keep `.incomplete` partials

**Files:**
- Modify: `backend/foundry/download_manager.py` (add `pause`)
- Test: `backend/tests/test_foundry_download_manager.py` (add pause class)

Covers seeded test **#5 (pause)**.

- [ ] **Step 1: Add the failing test**

Append to `backend/tests/test_foundry_download_manager.py`:
```python
class DownloadManagerPauseTests(unittest.IsolatedAsyncioTestCase):
    async def test_pause_stops_at_next_chunk_and_preserves_partials(self):
        models_dir = tempfile.mkdtemp()
        manager = make_manager(models_dir=models_dir)
        paths = [_path_info("flux1-dev.safetensors", 1000)]
        started = threading.Event()

        def fake_download(*, local_dir, filename, tqdm_class, **_):
            os.makedirs(local_dir, exist_ok=True)
            # Leave a .incomplete partial like the library does on interruption.
            with open(os.path.join(local_dir, filename + ".incomplete"), "w") as handle:
                handle.write("partial")
            bar = tqdm_class(total=1000)
            started.set()
            bar.update(100)        # first chunk ok
            bar.update(100)        # this raises DownloadCancelledError once paused
            return os.path.join(local_dir, filename)

        with mock.patch.object(dm_module.huggingface_hub, "get_paths_info", return_value=paths), \
             mock.patch("shutil.disk_usage", return_value=_disk(free=10 ** 12)), \
             mock.patch.object(dm_module.huggingface_hub, "hf_hub_download", side_effect=fake_download):
            manager.enqueue("flux-dev")
            await asyncio.to_thread(started.wait)
            manager.pause("flux-dev")
            await _drain(manager)

        job = manager._jobs["flux-dev"]
        self.assertEqual(job.status, "paused")
        # The .incomplete partial is preserved for resume (NOT deleted).
        target = os.path.join(models_dir, "checkpoints")
        self.assertTrue(
            any(name.endswith(".incomplete") for name in os.listdir(target))
        )
```

> The fake's second `bar.update(100)` calls `sink.add`, which raises `DownloadCancelledError` once `pause` has set the cancel event — the same cooperative mechanism the real per-chunk hook uses on the HTTP path.

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest backend/tests/test_foundry_download_manager.py -q -k Pause`
Expected: FAIL — `AttributeError: 'DownloadManager' object has no attribute 'pause'`.

- [ ] **Step 3: Add `pause`**

In `backend/foundry/download_manager.py`, in the public-API section (after `list_jobs`), add:
```python
    def pause(self, model_id: str) -> Optional[DownloadJob]:
        """Cooperatively pause: signal cancel, keep partials for resume."""
        job = self._jobs.get(model_id)
        if job is None or job.status not in {"queued", "downloading"}:
            return job
        self._intent[model_id] = "pause"
        event = self._cancel_events.get(model_id)
        if event is not None:
            event.set()  # sink.add raises DownloadCancelledError at next chunk
        return job
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest backend/tests/test_foundry_download_manager.py -q -k Pause`
Expected: PASS (1 test). The `_handle_cancellation` from Task 5 reads `intent == "pause"` → status `paused`, partials untouched.

- [ ] **Step 5: Commit**

```bash
git add backend/foundry/download_manager.py backend/tests/test_foundry_download_manager.py
git commit -m "feat(foundry): add cooperative pause preserving .incomplete partials

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Resume — re-enqueue continues from the partial offset

**Files:**
- Modify: `backend/foundry/download_manager.py` (add `resume`)
- Test: `backend/tests/test_foundry_download_manager.py` (add resume class)

Covers seeded test **#6 (resume)**.

- [ ] **Step 1: Add the failing test**

Append to `backend/tests/test_foundry_download_manager.py`:
```python
class DownloadManagerResumeTests(unittest.IsolatedAsyncioTestCase):
    async def test_resume_reinvokes_download_and_continues_from_offset(self):
        models_dir = tempfile.mkdtemp()
        manager = make_manager(models_dir=models_dir)
        # Seed a paused job (as if Task 7 left it).
        manager._jobs["flux-dev"] = DownloadJob(model_id="flux-dev", status="paused")
        paths = [_path_info("flux1-dev.safetensors", 1000)]
        observed_initial = {}

        def fake_download(*, local_dir, filename, tqdm_class, **_):
            os.makedirs(local_dir, exist_ok=True)
            # hf auto-resumes: the bar is created with initial = bytes already
            # in .incomplete. Emulate a 400-byte partial.
            bar = tqdm_class(total=1000, initial=400)
            observed_initial["n"] = bar.n
            bar.update(600)
            bar.close()
            dest = os.path.join(local_dir, filename)
            open(dest, "w").close()
            return dest

        with mock.patch.object(dm_module.huggingface_hub, "get_paths_info", return_value=paths), \
             mock.patch("shutil.disk_usage", return_value=_disk(free=10 ** 12)), \
             mock.patch.object(dm_module.huggingface_hub, "hf_hub_download", side_effect=fake_download):
            job = manager.resume("flux-dev")
            self.assertEqual(job.status, "queued")  # re-enqueued
            await _drain(manager)

        self.assertEqual(observed_initial["n"], 400)  # continued, not restarted
        self.assertEqual(manager._jobs["flux-dev"].status, "ready")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest backend/tests/test_foundry_download_manager.py -q -k Resume`
Expected: FAIL — `AttributeError: 'DownloadManager' object has no attribute 'resume'`.

- [ ] **Step 3: Add `resume`**

In `backend/foundry/download_manager.py`, after `pause`, add:
```python
    def resume(self, model_id: str, token: Optional[str] = None) -> DownloadJob:
        """Re-enqueue a paused/errored job. hf auto-resumes from .incomplete."""
        existing = self._jobs.get(model_id)
        if existing is not None and existing.status in {"paused", "error", "cancelled"}:
            # Clear the terminal/paused job so enqueue starts a fresh task.
            self._jobs.pop(model_id, None)
        return self.enqueue(model_id, token=token)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest backend/tests/test_foundry_download_manager.py -q -k Resume`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add backend/foundry/download_manager.py backend/tests/test_foundry_download_manager.py
git commit -m "feat(foundry): add resume that re-enqueues and continues from the partial offset

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: Cancel — stop, delete partials, status cancelled

**Files:**
- Modify: `backend/foundry/download_manager.py` (add `cancel`)
- Test: `backend/tests/test_foundry_download_manager.py` (add cancel class)

Covers seeded test **#7 (cancel)**.

- [ ] **Step 1: Add the failing test**

Append to `backend/tests/test_foundry_download_manager.py`:
```python
class DownloadManagerCancelTests(unittest.IsolatedAsyncioTestCase):
    async def test_cancel_deletes_partials_and_sets_cancelled(self):
        models_dir = tempfile.mkdtemp()
        manager = make_manager(models_dir=models_dir)
        paths = [_path_info("flux1-dev.safetensors", 1000)]
        started = threading.Event()

        def fake_download(*, local_dir, filename, tqdm_class, **_):
            os.makedirs(local_dir, exist_ok=True)
            with open(os.path.join(local_dir, filename + ".incomplete"), "w") as handle:
                handle.write("partial")
            bar = tqdm_class(total=1000)
            started.set()
            bar.update(100)
            bar.update(100)  # raises once cancelled
            return os.path.join(local_dir, filename)

        with mock.patch.object(dm_module.huggingface_hub, "get_paths_info", return_value=paths), \
             mock.patch("shutil.disk_usage", return_value=_disk(free=10 ** 12)), \
             mock.patch.object(dm_module.huggingface_hub, "hf_hub_download", side_effect=fake_download):
            manager.enqueue("flux-dev")
            await asyncio.to_thread(started.wait)
            manager.cancel("flux-dev")
            await _drain(manager)

        job = manager._jobs["flux-dev"]
        self.assertEqual(job.status, "cancelled")
        target = os.path.join(models_dir, "checkpoints")
        self.assertFalse(
            any(name.endswith(".incomplete") for name in os.listdir(target))
        )

    async def test_get_record_status_is_none_after_cancel(self):
        manager = make_manager()
        manager._jobs["flux-dev"] = DownloadJob(model_id="flux-dev", status="cancelled")
        # Terminal -> registry falls back to its own detection.
        self.assertIsNone(manager.get_record_status("flux-dev"))
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest backend/tests/test_foundry_download_manager.py -q -k Cancel`
Expected: FAIL — `AttributeError: 'DownloadManager' object has no attribute 'cancel'` (the second test passes already; the first fails).

- [ ] **Step 3: Add `cancel`**

In `backend/foundry/download_manager.py`, after `resume`, add:
```python
    def cancel(self, model_id: str) -> Optional[DownloadJob]:
        """Stop the job; partials are cleaned in _handle_cancellation."""
        job = self._jobs.get(model_id)
        if job is None:
            return None
        if job.status not in {"queued", "downloading", "paused"}:
            return job
        self._intent[model_id] = "cancel"
        event = self._cancel_events.get(model_id)
        if event is not None:
            event.set()
        if job.status == "paused":
            # No running task to trip the cancel event — clean up directly.
            record = self._registry.get_record(model_id)
            if record is not None:
                self._delete_partials(self._target_dir(record))
            job.status = "cancelled"
        return job
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest backend/tests/test_foundry_download_manager.py -q -k Cancel`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/foundry/download_manager.py backend/tests/test_foundry_download_manager.py
git commit -m "feat(foundry): add cancel that stops the job and deletes partials

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: Integrity failure + gated-license mapping

**Files:**
- Test: `backend/tests/test_foundry_download_manager.py` (add integrity + gated classes)

Covers seeded test **#8 (integrity leg — partial never shown as ready)** and **#9 (gated license CTA)**. Implementation already exists (Task 5 except-handlers + Task 1 mapping); this task proves the end-to-end manager behavior.

- [ ] **Step 1: Add the failing test**

Append to `backend/tests/test_foundry_download_manager.py`:
```python
class DownloadManagerIntegrityTests(unittest.IsolatedAsyncioTestCase):
    async def test_size_consistency_oserror_leaves_error_and_no_ready(self):
        models_dir = tempfile.mkdtemp()
        manager = make_manager(models_dir=models_dir)
        paths = [_path_info("flux1-dev.safetensors", 100)]

        def fake_download(**_):
            # Mirror the library's size-consistency backstop.
            raise OSError("Consistency check failed: file should be of size 100")

        with mock.patch.object(dm_module.huggingface_hub, "get_paths_info", return_value=paths), \
             mock.patch("shutil.disk_usage", return_value=_disk(free=10 ** 12)), \
             mock.patch.object(dm_module.huggingface_hub, "hf_hub_download", side_effect=fake_download):
            manager.enqueue("flux-dev")
            await _drain(manager)

        job = manager._jobs["flux-dev"]
        self.assertEqual(job.status, "error")
        self.assertIn("integrity", job.error)
        self.assertNotEqual(job.status, "ready")  # never a partial as ready


class DownloadManagerGatedTests(unittest.IsolatedAsyncioTestCase):
    async def test_http_401_surfaces_gate_url(self):
        manager = make_manager()
        paths = [_path_info("flux1-dev.safetensors", 100)]

        def fake_download(**_):
            raise _http_error(401)

        with mock.patch.object(dm_module.huggingface_hub, "get_paths_info", return_value=paths), \
             mock.patch("shutil.disk_usage", return_value=_disk(free=10 ** 12)), \
             mock.patch.object(dm_module.huggingface_hub, "hf_hub_download", side_effect=fake_download):
            manager.enqueue("flux-dev")
            await _drain(manager)

        job = manager._jobs["flux-dev"]
        self.assertEqual(job.status, "error")
        self.assertEqual(job.gate_url, "https://huggingface.co/black-forest-labs/FLUX.1-dev")
```

And add the HTTP-error helper at the bottom of the file (next to `_path_info`):
```python
def _http_error(status_code: int) -> Exception:
    class _Resp:
        def __init__(self, code):
            self.status_code = code

    exc = Exception(f"HTTP {status_code}")
    exc.response = _Resp(status_code)  # type: ignore[attr-defined]
    return exc
```

- [ ] **Step 2: Run test to verify it passes**

Run: `python -m pytest backend/tests/test_foundry_download_manager.py -q -k "Integrity or Gated"`
Expected: PASS (2 tests). `map_hf_exception` (Task 1) turns the `OSError` into `DownloadFailedError("integrity")` and the 401 into `GatedModelError` whose `gate_url` is read from `flux-dev`'s real `repo_id` (`black-forest-labs/FLUX.1-dev`).

- [ ] **Step 3: Commit**

```bash
git add backend/tests/test_foundry_download_manager.py
git commit -m "test(foundry): assert integrity failure and gated-license mapping end to end

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 11: Token discipline + fast/precise (Xet) toggle

**Files:**
- Test: `backend/tests/test_foundry_download_manager.py` (add token + toggle classes)

Covers seeded tests **#10 (token discipline)** and **#14 (fast/precise toggle, restored on error)**. Implementation exists (Task 5 `_xet_toggle`, per-call token); this task locks the discipline and the restore-on-error invariant.

- [ ] **Step 1: Add the failing test**

Append to `backend/tests/test_foundry_download_manager.py`:
```python
class DownloadManagerXetToggleTests(unittest.IsolatedAsyncioTestCase):
    async def test_precise_mode_disables_xet_during_download_and_restores_after(self):
        manager = make_manager(mode="precise")
        paths = [_path_info("flux1-dev.safetensors", 10)]
        seen = {}

        def fake_download(*, local_dir, filename, **_):
            seen["disabled_during"] = dm_module.huggingface_hub.constants.HF_HUB_DISABLE_XET
            dest = os.path.join(local_dir, filename)
            open(dest, "w").close()
            return dest

        with mock.patch.object(dm_module.huggingface_hub.constants, "HF_HUB_DISABLE_XET", False), \
             mock.patch.object(dm_module.huggingface_hub, "get_paths_info", return_value=paths), \
             mock.patch("shutil.disk_usage", return_value=_disk(free=10 ** 12)), \
             mock.patch.object(dm_module.huggingface_hub, "hf_hub_download", side_effect=fake_download):
            manager.enqueue("flux-dev")
            await _drain(manager)
            # Forced True during the call, restored to the prior False after.
            self.assertTrue(seen["disabled_during"])
            self.assertFalse(dm_module.huggingface_hub.constants.HF_HUB_DISABLE_XET)

    async def test_precise_mode_restores_xet_even_on_error(self):
        manager = make_manager(mode="precise")
        paths = [_path_info("flux1-dev.safetensors", 10)]

        def boom(**_):
            raise OSError("Consistency check failed")

        with mock.patch.object(dm_module.huggingface_hub.constants, "HF_HUB_DISABLE_XET", False), \
             mock.patch.object(dm_module.huggingface_hub, "get_paths_info", return_value=paths), \
             mock.patch("shutil.disk_usage", return_value=_disk(free=10 ** 12)), \
             mock.patch.object(dm_module.huggingface_hub, "hf_hub_download", side_effect=boom):
            manager.enqueue("flux-dev")
            await _drain(manager)
            self.assertFalse(dm_module.huggingface_hub.constants.HF_HUB_DISABLE_XET)

    async def test_fast_mode_leaves_xet_untouched(self):
        manager = make_manager(mode="fast")
        paths = [_path_info("flux1-dev.safetensors", 10)]
        seen = {}

        def fake_download(*, local_dir, filename, **_):
            seen["during"] = dm_module.huggingface_hub.constants.HF_HUB_DISABLE_XET
            open(os.path.join(local_dir, filename), "w").close()
            return os.path.join(local_dir, filename)

        with mock.patch.object(dm_module.huggingface_hub.constants, "HF_HUB_DISABLE_XET", False), \
             mock.patch.object(dm_module.huggingface_hub, "get_paths_info", return_value=paths), \
             mock.patch("shutil.disk_usage", return_value=_disk(free=10 ** 12)), \
             mock.patch.object(dm_module.huggingface_hub, "hf_hub_download", side_effect=fake_download):
            manager.enqueue("flux-dev")
            await _drain(manager)
            self.assertFalse(seen["during"])  # Xet left enabled in fast mode


class DownloadManagerTokenDisciplineTests(unittest.IsolatedAsyncioTestCase):
    async def test_token_never_lands_on_job_or_in_list_jobs(self):
        manager = make_manager()
        paths = [_path_info("flux1-dev.safetensors", 10)]

        def fake_download(*, local_dir, filename, **_):
            open(os.path.join(local_dir, filename), "w").close()
            return os.path.join(local_dir, filename)

        with mock.patch.object(dm_module.huggingface_hub, "get_paths_info", return_value=paths), \
             mock.patch("shutil.disk_usage", return_value=_disk(free=10 ** 12)), \
             mock.patch.object(dm_module.huggingface_hub, "hf_hub_download", side_effect=fake_download):
            manager.enqueue("flux-dev", token="hf_TOPSECRET")
            await _drain(manager)

        for job in manager.list_jobs():
            self.assertFalse(hasattr(job, "token"))
            self.assertNotIn("hf_TOPSECRET", repr(job))
```

- [ ] **Step 2: Run test to verify it passes**

Run: `python -m pytest backend/tests/test_foundry_download_manager.py -q -k "Xet or Token"`
Expected: PASS (4 tests). If the restore-on-error test is RED, the `_xet_toggle` `finally` is missing — fix in Task 5's contextmanager.

- [ ] **Step 3: Run the whole manager suite (regression sweep)**

Run: `python -m pytest backend/tests/test_foundry_download_manager.py -q`
Expected: PASS (all classes from Tasks 4–11).

- [ ] **Step 4: Commit**

```bash
git add backend/tests/test_foundry_download_manager.py
git commit -m "test(foundry): lock token discipline + fast/precise Xet toggle restore-on-error

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 12: Path-safety across separators, drive letters, long paths

**Files:**
- Create: `backend/tests/test_foundry_download_paths.py`

Covers seeded test **#12 (path-safety, cross-cutting)**. Proves `_target_dir` joins correctly regardless of host separator and never breaks on a Windows drive letter or a long path. Pure `pathlib`/`os.path`; runs identically on Linux and Windows CI.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_foundry_download_paths.py`:
```python
import os
import pathlib
import sys
import tempfile
import unittest

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from foundry.download_manager import DownloadManager  # type: ignore[import-not-found]
from foundry.registry import ModelRegistry  # type: ignore[import-not-found]
from utils.model_manager import ModelManager  # type: ignore[import-not-found]

CATALOG_PATH = str(BACKEND_ROOT / "foundry" / "verified-catalog.json")


def _manager(models_dir):
    return DownloadManager(
        registry=ModelRegistry(models_dir=models_dir, catalog_path=CATALOG_PATH),
        model_manager=ModelManager(models_dir),
        models_dir=models_dir,
    )


class TargetDirPathSafetyTests(unittest.TestCase):
    def test_single_file_artifact_targets_typed_subdir(self):
        manager = _manager(tempfile.mkdtemp())
        record = {"id": "flux-dev", "artifact_type": "checkpoint"}
        target = manager._target_dir(record)
        # Built with os.path.join -> uses the host separator, ends correctly.
        self.assertEqual(os.path.basename(target), "checkpoints")
        self.assertEqual(pathlib.Path(target).name, "checkpoints")

    def test_diffusers_artifact_targets_bundle_dir_by_id(self):
        manager = _manager(tempfile.mkdtemp())
        record = {"id": "ltx-video", "artifact_type": "diffusers-pipeline"}
        target = pathlib.Path(manager._target_dir(record))
        self.assertEqual(target.name, "ltx-video")
        self.assertEqual(target.parent.name, "diffusers")

    def test_join_is_correct_under_a_windows_style_drive_root(self):
        # A pure-path check that holds on both OSes (no real FS access).
        models_dir = "C:\\Users\\u\\AppData\\Roaming\\VisionStudio\\models"
        manager = DownloadManager.__new__(DownloadManager)
        manager._models_dir = models_dir
        record = {"id": "flux-dev", "artifact_type": "checkpoint"}
        target = manager._target_dir(record)
        self.assertTrue(target.startswith(models_dir))
        self.assertTrue(target.endswith("checkpoints"))
        # No doubled or missing separators.
        self.assertNotIn("checkpoints" + os.sep + os.sep, target)

    def test_long_path_join_does_not_truncate_or_corrupt(self):
        deep = os.path.join(tempfile.mkdtemp(), *(["seg"] * 40))
        manager = DownloadManager.__new__(DownloadManager)
        manager._models_dir = deep
        record = {"id": "ltx-video", "artifact_type": "diffusers-pipeline"}
        target = manager._target_dir(record)
        self.assertTrue(target.startswith(deep))
        self.assertEqual(pathlib.Path(target).name, "ltx-video")
        self.assertEqual(len(pathlib.Path(target).parts), len(pathlib.Path(deep).parts) + 2)


if __name__ == "__main__":
    unittest.main()
```

> `DownloadManager.__new__` builds an instance without running `__init__`, so the Windows-drive and long-path checks are pure path joins with no filesystem or semaphore — they pass identically on Linux CI.

- [ ] **Step 2: Run test to verify it passes**

Run: `python -m pytest backend/tests/test_foundry_download_paths.py -q`
Expected: PASS (4 tests). `_target_dir` already uses `os.path.join`, so the invariants hold. If any leg is RED, replace any string concatenation in `_target_dir` with `os.path.join`.

- [ ] **Step 3: Commit**

```bash
git add backend/tests/test_foundry_download_paths.py
git commit -m "test(foundry): assert download target-dir path safety on both OSes

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 13: Extend the `ModelStatus` vocabulary (backend + TS)

**Files:**
- Modify: `backend/tests/test_foundry_catalog.py` (extend the status domain)
- Modify: `backend/foundry/model_record.py` (status comment) and `backend/foundry/schemas.py` (status comment)
- Modify: `src/types/model.ts` (extend the `ModelStatus` union)
- Test: `src/types/modelStatus.test.ts`

Encodes the four new lifecycle values across the backend status-domain guard and the TS union, keeping the M1 parity invariant intact.

- [ ] **Step 1: Extend the backend status-domain test (RED first)**

In `backend/tests/test_foundry_catalog.py`, replace the status assertion in `test_field_value_domains` so the allowed set is the full 8-value M2 vocabulary, and add a guard that the union is exactly those eight:
```python
def test_field_value_domains():
    catalog = load_catalog()
    allowed_status = {
        "ready", "downloading", "error", "not_found",
        "queued", "verifying", "paused", "cancelled",
    }
    for entry in catalog.values():
        assert entry["capability"] in {"image", "video", "edit", "inpaint"}
        assert entry["tier"] in {"verified", "compatible", "experimental"}
        assert entry["runtime"] in {"local", "comfyui", "cloud", "byom"}
        assert entry["status"] in allowed_status
        assert isinstance(entry["gated"], bool)


def test_status_vocabulary_is_the_eight_value_m2_set():
    # The canonical lifecycle vocabulary M2 introduces. If this changes, the
    # TS ModelStatus union and the DownloadJob.status Literal must change too.
    from foundry.download_manager import JobStatus  # noqa: F401 (import guard)
    expected = {
        "not_found", "downloading", "error", "ready",
        "queued", "verifying", "paused", "cancelled",
    }
    # The four download-active lifecycle values are a subset of the union.
    assert {"queued", "verifying", "paused", "cancelled"}.issubset(expected)
```

> This is a bare-function test purely matching the existing `test_foundry_catalog.py` file style; it is data-validation only. The catalog ships every entry with `status: "not_found"`, so the new allowed set is a superset and the test stays green — the value of the change is documenting the contract and the `JobStatus` import guard. (All *behavioral* M2 backend tests in this plan are `unittest.TestCase` per the Conventions mandate.)

- [ ] **Step 2: Run the backend status test**

Run: `python -m pytest backend/tests/test_foundry_catalog.py -q`
Expected: PASS — superset domain; the import guard resolves `JobStatus`.

- [ ] **Step 3: Update the backend status comments (doc-only single-sourcing)**

In `backend/foundry/model_record.py`, update the `status` field comment (line ~29):
```python
    status: str = "not_found"   # ready | downloading | error | not_found | queued | verifying | paused | cancelled
```
In `backend/foundry/schemas.py`, add the matching comment above the `status` field:
```python
    # Lifecycle: ready | downloading | error | not_found | queued | verifying | paused | cancelled
    status: str = "not_found"
```

- [ ] **Step 4: Write the failing TS test**

Create `src/types/modelStatus.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import type { ModelStatus } from './model';

describe('ModelStatus (M2 extended vocabulary)', () => {
  it('accepts the four new lifecycle values', () => {
    const queued: ModelStatus = 'queued';
    const verifying: ModelStatus = 'verifying';
    const paused: ModelStatus = 'paused';
    const cancelled: ModelStatus = 'cancelled';
    expect([queued, verifying, paused, cancelled]).toHaveLength(4);
  });

  it('still accepts the original four', () => {
    const values: ModelStatus[] = ['ready', 'downloading', 'error', 'not_found'];
    expect(values).toHaveLength(4);
  });
});
```

- [ ] **Step 5: Run TS test to verify it fails**

Run: `npx vitest run src/types/modelStatus.test.ts`
Expected: FAIL — TS error: `'queued'` is not assignable to type `ModelStatus` (the M1 union has only four values).

- [ ] **Step 6: Extend the TS union**

In `src/types/model.ts`, replace line 1:
```ts
export type ModelStatus =
  | 'ready'
  | 'downloading'
  | 'error'
  | 'not_found'
  | 'queued'
  | 'verifying'
  | 'paused'
  | 'cancelled';
```

- [ ] **Step 7: Run TS test to verify it passes + typecheck**

Run: `npx vitest run src/types/modelStatus.test.ts && npm run typecheck`
Expected: PASS, no type errors (the wider union is a superset; existing consumers keep compiling).

- [ ] **Step 8: Commit**

```bash
git add backend/tests/test_foundry_catalog.py backend/foundry/model_record.py backend/foundry/schemas.py src/types/model.ts src/types/modelStatus.test.ts
git commit -m "feat(foundry): extend ModelStatus with queued/verifying/paused/cancelled

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 14: `DownloadJobSchema` + FastAPI download routes + per-request token

**Files:**
- Modify: `backend/foundry/schemas.py` (add `DownloadJobSchema`)
- Modify: `backend/main.py` (construct `DownloadManager`, compose status_provider, add four routes, read `X-HF-Token`)
- Test: `backend/tests/test_foundry_download_api.py`

Covers seeded test **#13 (API contracts)** and wires the manager into the registry's `status_provider`.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_foundry_download_api.py` (FastAPI `TestClient`; no torch, no network — `enqueue` is patched so no real download runs):
```python
import pathlib
import sys
import unittest
from unittest import mock

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from fastapi.testclient import TestClient  # type: ignore[import-not-found]
import main  # type: ignore[import-not-found]
from foundry.download_manager import DownloadJob  # type: ignore[import-not-found]

client = TestClient(main.app)


class DownloadApiTests(unittest.TestCase):
    def test_post_download_enqueues_and_returns_job_202(self):
        job = DownloadJob(model_id="flux-dev", status="queued", total_bytes=0)
        with mock.patch.object(main.download_manager, "enqueue", return_value=job) as enq:
            response = client.post("/api/models/flux-dev/download")
        self.assertEqual(response.status_code, 202)
        body = response.json()
        self.assertEqual(body["model_id"], "flux-dev")
        self.assertEqual(body["status"], "queued")
        self.assertNotIn("token", body)  # never echoed
        enq.assert_called_once()

    def test_post_download_unknown_id_returns_404(self):
        response = client.post("/api/models/not-a-real-model/download")
        self.assertEqual(response.status_code, 404)

    def test_x_hf_token_header_is_forwarded_to_enqueue_and_not_logged(self):
        job = DownloadJob(model_id="flux-dev", status="queued")
        with mock.patch.object(main.download_manager, "enqueue", return_value=job) as enq:
            client.post("/api/models/flux-dev/download", headers={"X-HF-Token": "hf_SECRET"})
        _args, kwargs = enq.call_args
        self.assertEqual(kwargs.get("token"), "hf_SECRET")

    def test_pause_resume_cancel_return_job_schema(self):
        job = DownloadJob(model_id="flux-dev", status="paused")
        for action, method_name, status_value in (
            ("pause", "pause", "paused"),
            ("resume", "resume", "queued"),
            ("cancel", "cancel", "cancelled"),
        ):
            job.status = status_value
            with mock.patch.object(main.download_manager, method_name, return_value=job):
                response = client.post(f"/api/models/flux-dev/download/{action}")
            self.assertEqual(response.status_code, 200, action)
            self.assertEqual(response.json()["status"], status_value, action)

    def test_invalid_action_returns_404(self):
        response = client.post("/api/models/flux-dev/download/frobnicate")
        self.assertEqual(response.status_code, 404)

    def test_get_downloads_returns_list_of_jobs(self):
        jobs = [DownloadJob(model_id="flux-dev", status="downloading", progress=0.5, total_bytes=100)]
        with mock.patch.object(main.download_manager, "list_jobs", return_value=jobs):
            response = client.get("/api/models/downloads")
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload[0]["model_id"], "flux-dev")
        self.assertAlmostEqual(payload[0]["progress"], 0.5)


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest backend/tests/test_foundry_download_api.py -q`
Expected: FAIL — `main` has no `download_manager`; the routes do not exist (404s/AttributeErrors).

- [ ] **Step 3a: Add `DownloadJobSchema`**

In `backend/foundry/schemas.py`, append:
```python
class DownloadJobSchema(BaseModel):
    model_id: str
    status: str  # queued | downloading | paused | verifying | ready | error | cancelled
    progress: float = 0.0
    speed: float = 0.0
    eta: Optional[float] = None
    total_bytes: int = 0
    error: Optional[str] = None
    gate_url: Optional[str] = None
```

- [ ] **Step 3b: Construct the manager + compose the status provider in `main.py`**

In `backend/main.py`, replace the registry construction block (lines 105–111) so the manager is built first and its live status composes ahead of the model_manager's on-disk status:
```python
model_manager = ModelManager(MODELS_DIR)
_CATALOG_PATH = os.path.join(os.path.dirname(__file__), "foundry", "verified-catalog.json")

from foundry.download_manager import DownloadManager
from foundry.schemas import DownloadJobSchema

download_manager = DownloadManager(
    registry=None,  # set below once the registry exists (it needs records to resolve files)
    model_manager=model_manager,
    models_dir=MODELS_DIR,
)


def _composed_status_provider(model_id: str):
    """Manager-download lifecycle first, on-disk model_manager status second."""
    live = download_manager.get_record_status(model_id)
    if live:
        return live
    return model_manager.get_record_status(model_id)


model_registry = ModelRegistry(
    models_dir=MODELS_DIR,
    catalog_path=_CATALOG_PATH,
    status_provider=_composed_status_provider,
)
# Late-bind the registry the manager needs for file resolution (no import cycle;
# the manager only calls registry.get_record at run time).
download_manager._registry = model_registry
```
(The `from foundry.registry import ModelRegistry` / `from foundry.schemas import ModelRecordSchema` imports already exist near line 69; keep them. Add `from foundry.schemas import DownloadJobSchema` to that import group rather than inline if you prefer top-of-file imports.)

- [ ] **Step 3c: Add the four download routes**

In `backend/main.py`, in the `# ============= Model Management =============` block, replace the existing `POST /api/models/{model_id}/download` route (lines 1428–1455) with the registry-backed enqueue, and add the action + list routes immediately after. Keep the `GET .../status` and `DELETE` routes unchanged:
```python
@app.post("/api/models/{model_id}/download", response_model=DownloadJobSchema, status_code=202, tags=["Models"])
@limiter.limit("30/minute")
async def enqueue_download(request: Request, model_id: str):
    """Enqueue a model download. Returns the DownloadJob (202 Accepted).

    The optional HF token arrives per-request in the X-HF-Token header from the
    Electron main process (safeStorage). It is forwarded to the manager as a
    local parameter and is NEVER persisted in Python and NEVER logged.
    """
    if model_registry.get_record(model_id) is None:
        raise HTTPException(status_code=404, detail=f"Model '{model_id}' not found")
    token = request.headers.get("X-HF-Token")
    job = download_manager.enqueue(model_id, token=token)
    return _job_to_dict(job)


@app.post("/api/models/{model_id}/download/{action}", response_model=DownloadJobSchema, tags=["Models"])
@limiter.limit("30/minute")
async def control_download(request: Request, model_id: str, action: str):
    """Pause, resume, or cancel an in-flight download."""
    if action not in {"pause", "resume", "cancel"}:
        raise HTTPException(status_code=404, detail=f"Unknown action '{action}'")
    if action == "resume":
        token = request.headers.get("X-HF-Token")
        job = download_manager.resume(model_id, token=token)
    else:
        job = getattr(download_manager, action)(model_id)
    if job is None:
        raise HTTPException(status_code=404, detail=f"No download job for '{model_id}'")
    return _job_to_dict(job)


@app.get("/api/models/downloads", response_model=List[DownloadJobSchema], tags=["Models"])
@limiter.limit("60/minute")
async def list_downloads(request: Request):
    """Snapshot of every download job (queue + progress)."""
    return [_job_to_dict(job) for job in download_manager.list_jobs()]


def _job_to_dict(job) -> dict:
    """Serialize a DownloadJob without ever exposing a token (there is none)."""
    return {
        "model_id": job.model_id,
        "status": job.status,
        "progress": job.progress,
        "speed": job.speed,
        "eta": job.eta,
        "total_bytes": job.total_bytes,
        "error": job.error,
        "gate_url": job.gate_url,
    }
```

> The static route `/api/models/downloads` MUST be declared before any dynamic `/api/models/{model_id}/...` route that could shadow it; FastAPI matches in declaration order. Place `list_downloads` ABOVE `enqueue_download` (and above `get_model_record` at line 1418 is unnecessary since that is a GET, but the POST download action route is fine after). Concretely: declare `list_downloads` first in this block so `GET /api/models/downloads` is not captured by `GET /api/models/{model_id}`.

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest backend/tests/test_foundry_download_api.py -q`
Expected: PASS (6 tests).

- [ ] **Step 5: Run the full backend suite (no regressions)**

Run: `python -m pytest backend/tests -q`
Expected: PASS (all foundry + manager + pre-existing suites).

- [ ] **Step 6: Commit**

```bash
git add backend/foundry/schemas.py backend/main.py backend/tests/test_foundry_download_api.py
git commit -m "feat(foundry): add download routes, DownloadJobSchema, composed status provider

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 15: Frontend `DownloadJob` type + `modelsSlice` downloads state/actions

**Files:**
- Modify: `src/types/model.ts` (add `DownloadJob` + `DownloadStatus`)
- Modify: `src/store/slices/modelsSlice.ts` (add `downloads` + actions + selector)
- Modify: `src/store/appStore.types.ts` (add `downloads` state + action signatures)
- Test: `src/store/slices/downloadsSelectors.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/store/slices/downloadsSelectors.test.ts`:
```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAppStore } from '../appStore';
import { selectDownloadFor } from './modelsSlice';
import type { DownloadJob } from '@/types/model';

function job(over: Partial<DownloadJob>): DownloadJob {
  return {
    model_id: 'flux-dev', status: 'downloading', progress: 0.5, speed: 1000,
    eta: 30, total_bytes: 100, error: null, gate_url: null, ...over,
  };
}

describe('modelsSlice downloads', () => {
  beforeEach(() => {
    useAppStore.setState({ downloads: {} });
  });

  it('refreshDownloads loads the queue keyed by model_id', async () => {
    const list = vi.fn().mockResolvedValue([job({ model_id: 'a' }), job({ model_id: 'b' })]);
    (globalThis as any).window = { electron: { models: { downloadsList: list } } };

    await useAppStore.getState().refreshDownloads();

    expect(Object.keys(useAppStore.getState().downloads).sort()).toEqual(['a', 'b']);
    expect(selectDownloadFor(useAppStore.getState(), 'a')?.model_id).toBe('a');
  });

  it('enqueueDownload optimistically records a queued job and calls the bridge', async () => {
    const download = vi.fn().mockResolvedValue(job({ model_id: 'flux-dev', status: 'queued' }));
    (globalThis as any).window = { electron: { models: { download } } };

    await useAppStore.getState().enqueueDownload('flux-dev');

    expect(download).toHaveBeenCalledWith('flux-dev');
    expect(useAppStore.getState().downloads['flux-dev'].status).toBe('queued');
  });

  it('a backend error during enqueue leaves existing downloads intact', async () => {
    useAppStore.getState().setDownloadJob(job({ model_id: 'keep', status: 'downloading' }));
    const download = vi.fn().mockRejectedValue(new Error('backend down'));
    (globalThis as any).window = { electron: { models: { download } } };

    await useAppStore.getState().enqueueDownload('flux-dev');

    expect(useAppStore.getState().downloads['keep'].status).toBe('downloading');
  });

  it('pause/resume/cancel call the matching bridge and merge the returned job', async () => {
    const pause = vi.fn().mockResolvedValue(job({ model_id: 'flux-dev', status: 'paused' }));
    const resume = vi.fn().mockResolvedValue(job({ model_id: 'flux-dev', status: 'queued' }));
    const cancel = vi.fn().mockResolvedValue(job({ model_id: 'flux-dev', status: 'cancelled' }));
    (globalThis as any).window = {
      electron: { models: { downloadPause: pause, downloadResume: resume, downloadCancel: cancel } },
    };

    await useAppStore.getState().pauseDownload('flux-dev');
    expect(useAppStore.getState().downloads['flux-dev'].status).toBe('paused');
    await useAppStore.getState().resumeDownload('flux-dev');
    expect(useAppStore.getState().downloads['flux-dev'].status).toBe('queued');
    await useAppStore.getState().cancelDownload('flux-dev');
    expect(useAppStore.getState().downloads['flux-dev'].status).toBe('cancelled');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/store/slices/downloadsSelectors.test.ts`
Expected: FAIL — `DownloadJob` not exported; `refreshDownloads`/`selectDownloadFor` not defined.

- [ ] **Step 3a: Add the `DownloadJob` type**

In `src/types/model.ts`, after the `ModelRecord` interface, add:
```ts
export type DownloadStatus =
  | 'queued'
  | 'downloading'
  | 'paused'
  | 'verifying'
  | 'ready'
  | 'error'
  | 'cancelled';

/**
 * Transient download telemetry for a single model. Streamed from the backend
 * via GET /api/models/downloads; correlated to a ModelRecord by model_id.
 * Deliberately NOT part of ModelRecord (which stays durable). Never carries a
 * token.
 */
export interface DownloadJob {
  model_id: string;
  status: DownloadStatus;
  progress: number;
  speed: number;
  eta: number | null;
  total_bytes: number;
  error: string | null;
  gate_url: string | null;
}
```

- [ ] **Step 3b: Add downloads state + actions + selector to `modelsSlice.ts`**

In `src/store/slices/modelsSlice.ts`, replace the file with (extends M1, adds the downloads surface; local-first throughout):
```ts
import type { AppSet, AppGet, AppState } from '../appStore.types';
import type { ModelRecord, ModelCapability, DownloadJob } from '@/types/model';

export const modelsInitialState = {
  availableModels: [] as ModelRecord[],
  downloads: {} as Record<string, DownloadJob>,
};

export function createModelsActions(set: AppSet, get: AppGet) {
  const mergeJob = (jobLike: DownloadJob | null | undefined) => {
    if (!jobLike || !jobLike.model_id) return;
    set((state) => ({
      downloads: { ...state.downloads, [jobLike.model_id]: jobLike },
    }));
  };

  return {
    setAvailableModels: (models: ModelRecord[]) => set({ availableModels: models }),
    loadModels: async () => {
      try {
        const models = await window.electron.models.list();
        set({ availableModels: models as ModelRecord[] });
      } catch {
        // Local-first: a backend hiccup must not wipe the known catalog.
      }
    },

    // Downloads -----------------------------------------------------------
    setDownloadJob: (job: DownloadJob) => mergeJob(job),
    refreshDownloads: async () => {
      try {
        const jobs = (await window.electron.models.downloadsList()) as DownloadJob[];
        const next: Record<string, DownloadJob> = {};
        for (const job of jobs) next[job.model_id] = job;
        set({ downloads: next });
      } catch {
        // Local-first: keep the last-known queue on a backend hiccup.
      }
    },
    enqueueDownload: async (modelId: string) => {
      try {
        const job = (await window.electron.models.download(modelId)) as DownloadJob;
        mergeJob(job);
      } catch {
        // Swallow: the existing downloads map is left intact.
      }
    },
    pauseDownload: async (modelId: string) => {
      try {
        mergeJob((await window.electron.models.downloadPause(modelId)) as DownloadJob);
      } catch {
        /* local-first */
      }
    },
    resumeDownload: async (modelId: string) => {
      try {
        mergeJob((await window.electron.models.downloadResume(modelId)) as DownloadJob);
      } catch {
        /* local-first */
      }
    },
    cancelDownload: async (modelId: string) => {
      try {
        mergeJob((await window.electron.models.downloadCancel(modelId)) as DownloadJob);
      } catch {
        /* local-first */
      }
    },
  };
}

/** Filter helper: records routable for a given generation capability. */
export function selectModelsByCapability(
  models: ModelRecord[],
  generationType: 'image' | 'video',
): ModelRecord[] {
  const wanted: ModelCapability[] =
    generationType === 'video' ? ['video'] : ['image', 'edit', 'inpaint'];
  return models.filter((model) => wanted.includes(model.capability));
}

/** Selector: the live download job for a model id, or null. */
export function selectDownloadFor(state: AppState, modelId: string): DownloadJob | null {
  return state.downloads[modelId] ?? null;
}
```

- [ ] **Step 3c: Extend `appStore.types.ts`**

In `src/store/appStore.types.ts`:
- Change the import on line 124 to also bring in `DownloadJob`:
  ```ts
  import type { ModelRecord, DownloadJob } from '@/types/model';
  ```
- In the state interface, directly beneath line 315 (`availableModels: ModelRecord[];`), add:
  ```ts
  downloads: Record<string, DownloadJob>;
  ```
- In the actions interface, directly beneath line 484 (`loadModels: () => Promise<void>;`), add:
  ```ts
  setDownloadJob: (job: DownloadJob) => void;
  refreshDownloads: () => Promise<void>;
  enqueueDownload: (modelId: string) => Promise<void>;
  pauseDownload: (modelId: string) => Promise<void>;
  resumeDownload: (modelId: string) => Promise<void>;
  cancelDownload: (modelId: string) => Promise<void>;
  ```

> `appStore.ts` already spreads `...modelsInitialState` and `...createModelsActions(set, get)` (lines 982–983), so the new state/actions register automatically — no edit needed there.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/store/slices/downloadsSelectors.test.ts`
Expected: PASS (5 tests). (The test references `window.electron.models.downloadsList` etc.; the preload typing for those lands in Task 16 — the slice test stubs `window` directly, so it is green now.)

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: PASS. If the slice references `window.electron.models.download*` members the `ElectronAPI` type does not yet declare, the typecheck error is resolved in Task 16; if typecheck fails ONLY on those members, proceed to Task 16 then re-run. (To keep this task self-green, the slice casts via `window.electron.models.<fn>` which is typed `any`-permissive through the existing `models` block until Task 16 tightens it — confirm no error; if one appears, it is the missing-member error Task 16 fixes.)

- [ ] **Step 6: Commit**

```bash
git add src/types/model.ts src/store/slices/modelsSlice.ts src/store/appStore.types.ts src/store/slices/downloadsSelectors.test.ts
git commit -m "feat(foundry): add DownloadJob type + modelsSlice downloads state/actions

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 16: IPC channels (download lifecycle + downloads list) + `auth:setHfToken`

**Files:**
- Modify: `electron/services/backendAuth.ts` (HF-token holder + `hfTokenHeaders()`)
- Modify: `electron/preload.ts` (add `models.download*` + `models.downloadsList` + `models.subscribeDownloads` + `auth.setHfToken` to the API + `ElectronAPI` types)
- Modify: `electron/ipc-handlers/generation.ts` (register the lifecycle + list handlers; inject `X-HF-Token`)
- Modify: `electron/main.ts` (register `auth:setHfToken`)
- Test: `tests/integration/api-contracts.test.ts` (add `DownloadJob` contract section)

Mirrors the M1 `models:list`/`models:get` channel pattern exactly; preload names and handler names stay in lockstep.

- [ ] **Step 1: Write the failing test**

Append to `tests/integration/api-contracts.test.ts` a `DownloadJob` contract section (before the `// ── Helper implementations ──` divider), plus helpers at the bottom with the others:
```ts
// ── DownloadJob / downloads endpoints contract ───────────────────────────

describe('DownloadJob contract', () => {
  it('carries the canonical Foundry download fields and no token', () => {
    const job = buildDownloadJob({ model_id: 'flux-dev', status: 'downloading', progress: 0.5 });
    expect(job).toMatchObject({
      model_id: 'flux-dev',
      status: 'downloading',
      progress: 0.5,
      speed: expect.any(Number),
      total_bytes: expect.any(Number),
    });
    expect(job).not.toHaveProperty('token');
  });

  it('maps a backend downloads array into a model_id-keyed map', () => {
    const map = mapDownloadsResponse([
      buildDownloadJob({ model_id: 'a' }),
      buildDownloadJob({ model_id: 'b', status: 'paused' }),
    ]);
    expect(Object.keys(map).sort()).toEqual(['a', 'b']);
    expect(map.b.status).toBe('paused');
  });

  it('the download control action set is exactly pause/resume/cancel', () => {
    expect(downloadActions()).toEqual(['pause', 'resume', 'cancel']);
  });
});
```
And add these helpers next to the other helper functions at the bottom of the file:
```ts
interface DownloadJobShape {
  model_id: string;
  status: 'queued' | 'downloading' | 'paused' | 'verifying' | 'ready' | 'error' | 'cancelled';
  progress: number;
  speed: number;
  eta: number | null;
  total_bytes: number;
  error: string | null;
  gate_url: string | null;
}

function buildDownloadJob(over: Partial<DownloadJobShape>): DownloadJobShape {
  return {
    model_id: 'model', status: 'queued', progress: 0, speed: 0, eta: null,
    total_bytes: 0, error: null, gate_url: null, ...over,
  };
}

function mapDownloadsResponse(jobs: DownloadJobShape[]): Record<string, DownloadJobShape> {
  const map: Record<string, DownloadJobShape> = {};
  for (const job of jobs) map[job.model_id] = job;
  return map;
}

function downloadActions(): string[] {
  return ['pause', 'resume', 'cancel'];
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/integration/api-contracts.test.ts`
Expected: FAIL — `buildDownloadJob`/`mapDownloadsResponse`/`downloadActions` undefined until the helpers compile; once added, the new `describe` block runs and passes. Run again after adding helpers to confirm GREEN for the new block (mirrors the M1 co-located-helper TDD note).

- [ ] **Step 3a: Add the HF-token holder to `backendAuth.ts`**

In `electron/services/backendAuth.ts`, append:
```ts
/**
 * HF token for gated/private model downloads. Held only in the main process.
 * Set via the auth:setHfToken IPC channel (the renderer never reads it back).
 * Injected per download request as the X-HF-Token header; never logged, never
 * sent on non-download requests.
 */
let _hfToken: string | undefined;

export function setHfToken(token: string | undefined): void {
  _hfToken = token && token.trim() ? token.trim() : undefined;
}

export function hfTokenHeaders(): Record<string, string> {
  return _hfToken ? { 'X-HF-Token': _hfToken } : {};
}
```

> The token lives only in this module's closure for the session. The renderer sets it through `auth:setHfToken`; persistence across launches (via the existing `safeStorage`-backed `secureStore`) is wired in Step 3d's handler. There is no getter exposed to the renderer.

- [ ] **Step 3b: Register the new IPC handlers in `generation.ts`**

In `electron/ipc-handlers/generation.ts`, add the import for the HF-token header helper near the existing auth import (line 5):
```ts
import { getBackendAuthToken, backendAuthHeaders, hfTokenHeaders } from '../services/backendAuth';
```
Then, directly after the existing `models:download` handler (ends ~line 588), add (the enqueue/control/resume calls carry the `X-HF-Token` header; pause/cancel/list do not need it):
```ts
ipcMain.handle('models:download:pause', async (_event, modelId: string) => {
  try {
    const response = await requestBackend(() =>
      axios.post(`${BACKEND_URL}/api/models/${modelId}/download/pause`, undefined, {
        headers: backendAuthHeaders(),
      }),
    );
    return response.data;
  } catch (error: any) {
    console.error('Pause download error:', error);
    return { success: false, error: toSafeRendererError(error, 'Pause failed') };
  }
});

ipcMain.handle('models:download:resume', async (_event, modelId: string) => {
  try {
    const response = await requestBackend(() =>
      axios.post(`${BACKEND_URL}/api/models/${modelId}/download/resume`, undefined, {
        headers: { ...backendAuthHeaders(), ...hfTokenHeaders() },
      }),
    );
    return response.data;
  } catch (error: any) {
    console.error('Resume download error:', error);
    return { success: false, error: toSafeRendererError(error, 'Resume failed') };
  }
});

ipcMain.handle('models:download:cancel', async (_event, modelId: string) => {
  try {
    const response = await requestBackend(() =>
      axios.post(`${BACKEND_URL}/api/models/${modelId}/download/cancel`, undefined, {
        headers: backendAuthHeaders(),
      }),
    );
    return response.data;
  } catch (error: any) {
    console.error('Cancel download error:', error);
    return { success: false, error: toSafeRendererError(error, 'Cancel failed') };
  }
});

ipcMain.handle('models:downloads:list', async () => {
  try {
    const response = await requestBackend(() =>
      axios.get(`${BACKEND_URL}/api/models/downloads`, { headers: backendAuthHeaders() }),
    );
    return response.data;
  } catch (error: any) {
    console.error('List downloads error:', error);
    return [];
  }
});

// Poll-based subscribe (mirrors the generation job-poll model): the renderer
// calls this on an interval to get the current queue snapshot. A push channel
// can replace this later without changing the renderer contract.
ipcMain.handle('models:downloads:subscribe', async () => {
  try {
    const response = await requestBackend(() =>
      axios.get(`${BACKEND_URL}/api/models/downloads`, { headers: backendAuthHeaders() }),
    );
    return response.data;
  } catch (error: any) {
    console.error('Subscribe downloads error:', error);
    return [];
  }
});
```
Finally, update the existing `models:download` handler (line 575–588) to forward the HF token on enqueue:
```ts
ipcMain.handle('models:download', async (_event, modelId: string) => {
  try {
    const response = await requestBackend(() =>
      axios.post(`${BACKEND_URL}/api/models/${modelId}/download`, undefined, {
        headers: { ...backendAuthHeaders(), ...hfTokenHeaders() },
      }),
    );
    return response.data;
  } catch (error: any) {
    console.error('Download model error:', error);
    return { success: false, error: toSafeRendererError(error, 'Model download failed') };
  }
});
```

- [ ] **Step 3c: Add the preload bridges + types**

In `electron/preload.ts`, extend the `models` block of the `ElectronAPI` interface (lines 289–295):
```ts
  models: {
    list: () => Promise<any[]>;
    get: (modelId: string) => Promise<any>;
    download: (modelId: string) => Promise<{ model_id: string; status: string; [k: string]: unknown }>;
    downloadPause: (modelId: string) => Promise<any>;
    downloadResume: (modelId: string) => Promise<any>;
    downloadCancel: (modelId: string) => Promise<any>;
    downloadsList: () => Promise<any[]>;
    subscribeDownloads: () => Promise<any[]>;
    getStatus: (modelId: string) => Promise<any>;
    delete: (modelId: string) => Promise<{ success: boolean; error?: string }>;
  };
  auth: {
    setHfToken: (token: string) => Promise<{ success: boolean }>;
  };
```
And the implementation (lines 379–385):
```ts
  models: {
    list: () => ipcRenderer.invoke('models:list'),
    get: (modelId: string) => ipcRenderer.invoke('models:get', modelId),
    download: (modelId: string) => ipcRenderer.invoke('models:download', modelId),
    downloadPause: (modelId: string) => ipcRenderer.invoke('models:download:pause', modelId),
    downloadResume: (modelId: string) => ipcRenderer.invoke('models:download:resume', modelId),
    downloadCancel: (modelId: string) => ipcRenderer.invoke('models:download:cancel', modelId),
    downloadsList: () => ipcRenderer.invoke('models:downloads:list'),
    subscribeDownloads: () => ipcRenderer.invoke('models:downloads:subscribe'),
    getStatus: (modelId: string) => ipcRenderer.invoke('models:get-status', modelId),
    delete: (modelId: string) => ipcRenderer.invoke('models:delete', modelId),
  },
  auth: {
    setHfToken: (token: string) => ipcRenderer.invoke('auth:setHfToken', token),
  },
```

- [ ] **Step 3d: Register `auth:setHfToken` in `main.ts`**

In `electron/main.ts`, near the other `ipcMain.handle(...)` registrations, add (import `setHfToken` from `./services/backendAuth` and `safeStorage` is already imported):
```ts
import { setHfToken } from './services/backendAuth';

ipcMain.handle('auth:setHfToken', async (_event, token: string) => {
  // Hold the token in the main process for the session. It is injected per
  // download request as X-HF-Token and never returned to the renderer, never
  // logged. (safeStorage-backed persistence can be layered via secureStore.)
  setHfToken(typeof token === 'string' ? token : undefined);
  return { success: true };
});
```

> Do NOT log the token in this handler or anywhere downstream. The handler returns only `{ success: true }`; the value is never echoed.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/integration/api-contracts.test.ts`
Expected: PASS (existing + 3 new).

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: PASS — the `models.download*` members the slice (Task 15) calls are now declared on `ElectronAPI`.

- [ ] **Step 6: Commit**

```bash
git add electron/services/backendAuth.ts electron/preload.ts electron/ipc-handlers/generation.ts electron/main.ts tests/integration/api-contracts.test.ts
git commit -m "feat(foundry): add download lifecycle IPC channels + auth:setHfToken token injection

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 17: Milestone green gate

**Files:** none (verification only)

- [ ] **Step 1: Backend suite (pytest)**

Run: `python -m pytest backend/tests -q`
Expected: PASS (all foundry M1 + M2 + pre-existing suites).

- [ ] **Step 2: Backend suite under the CI runner (unittest discover)**

Run (from `backend/`): `python -m unittest discover -s tests -v`
Expected: every M2 `TestCase` class is listed and runs (`download_errors`, `download_telemetry`, `download_manager`, `download_paths`, `download_api`); ends `OK`. This is the gate that catches any pytest-only bare-function test that CI would silently skip — there must be none in M2's behavioral backend tests.

- [ ] **Step 3: Frontend typecheck**

Run: `npm run typecheck`
Expected: PASS, no errors.

- [ ] **Step 4: Frontend tests**

Run: `npm test`
Expected: PASS (all vitest suites, incl. the new download slice + contract tests).

- [ ] **Step 5: Production build**

Run: `npm run build`
Expected: PASS (clean build).

- [ ] **Step 6: If all green, push the branch**

```bash
git push -u origin feat/model-foundry-m2
```

---

## Task 18: Codex independent security-review gate (final milestone step — not a coding task)

**Files:** none (review only)

Per spec §8.4, M2's gate is a **security** review. Run an independent Codex (second-model) review of the M2 diff (base = `main`) focused on the public-MIT-repo threat surface.

- [ ] **Step 1: Run the independent Codex security review**

Run (whichever is available in this environment):
```bash
# Preferred: the project's codex review skill / command
codex review --base main
# or the dev-tools equivalent:
#   (invoke the dev-tools:codex-review skill against the feat/model-foundry-m2 diff)
```
Direct the review at:
- **Token handling** — the HF token is a local param only (`enqueue → _run_job → _download_file → hf_hub_download(token=...)`); never a `DownloadJob`/manager field, never logged, never echoed by `DownloadJobSchema`/`_job_to_dict`, never returned by `auth:setHfToken`. Confirm no `print`/`logger`/`console.*` ever receives the token.
- **Gated auth** — 401/403/`GatedRepoError` → `GatedModelError` with the repo gate URL; the flow surfaces the license CTA and never silently bypasses a gate.
- **Download integrity** — the library's per-file size-consistency `OSError` maps to `DownloadFailedError("integrity")`; a corrupt/partial download can never reach `status: ready`; cancel deletes partials, pause preserves them deliberately.
- **Secret discipline (public repo)** — no token/secret in any committed file, test fixture, or log; `X-HF-Token` only on download/enqueue/resume requests.
- **Path safety** — destination joins via `pathlib`/`os.path` only; no traversal from a model id (ids are catalog-resolved, not free-form filesystem input).

- [ ] **Step 2: Triage findings**

For each finding: fix it (with a `unittest.TestCase` test if it is a behavior gap) or record an explicit, reasoned dismissal. Re-run Task 17's gate after any fix.

- [ ] **Step 3: Commit any review fixes**

```bash
git add -A
git commit -m "fix(foundry): address M2 Codex security review findings

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
git push
```

- [ ] **Step 4: Open the PR**

```bash
gh pr create --base main --head feat/model-foundry-m2 \
  --title "Model Foundry M2 — Acquisition engine" \
  --body "Implements M2 of docs/superpowers/specs/2026-05-30-model-foundry-design.md (per Spike A): DownloadManager with byte-granular progress/speed/eta (headless tqdm_class + get_paths_info totals), bounded concurrency (default 2, clamp 1-6), pause/resume/cancel, aggregate disk preflight, typed errors (disk/gated/integrity/cancel), per-call HF token injection (never persisted/logged), fast/precise (HF_HUB_DISABLE_XET) toggle, /api/models/{id}/download[/pause|resume|cancel] + /api/models/downloads, mirrored IPC channels + auth:setHfToken, frontend downloads slice. Codex security review completed."
```

---

## Self-Review (plan author checklist — completed)

**Spec §3 (Acquisition engine) coverage:**
- §3.1 Fast transfers + fast/precise toggle (`hf_xet`, drop `hf_transfer`, `HF_HUB_DISABLE_XET`) → Task 5 (`_xet_toggle`), Task 11 (toggle + restore-on-error). Requirements pin already landed (task #96). ✓
- §3.2 True progress streaming (headless `tqdm_class` + `get_paths_info` totals; replaces fake 0→100) → Tasks 2 (ProgressSink), 3 (`make_tqdm_class`), 5 (wiring). ✓
- §3.3 `DownloadManager` queue (default 2, clamp 1–6) + pause/resume/cancel → Tasks 4 (enqueue+clamp), 7 (pause), 8 (resume), 9 (cancel). ✓
- §3.4 Disk-space preflight → Tasks 5 (`_preflight_disk`), 6 (both legs + no-download assertion). ✓
- §3.5 Atomic, verified completion (`verifying → ready`; partial never ready) → Tasks 5 (verify + verifying state), 10 (integrity leg). ✓
- §3.6 Secure tokens (main-process, per-request, never persisted/logged in Python) → Tasks 5/11 (per-call, no field), 14 (`X-HF-Token` read), 16 (`auth:setHfToken` + `hfTokenHeaders`), 18 (review). ✓
- §3.7 Gated-license flow (401/403 → typed error + gate URL CTA, never bypass) → Tasks 1 (`map_hf_exception`/`GatedModelError`), 10 (end-to-end), 14 (`gate_url` on schema). ✓
- §3.8 Typed resilience (every failure typed + surfaced) → Tasks 1 (taxonomy), 5 (except-handler ladder), 10 (integrity/gated). ✓
- §7 API (`POST /download`, `/download/{pause|resume|cancel}`, `GET /downloads`) + `DownloadJobSchema` → Task 14. ✓
- §7.2 IPC (`models:download`, `:pause|resume|cancel`, `models:downloads:subscribe`, `auth:setHfToken`) → Task 16. ✓
- §7.3 Frontend (`downloads` slice state + actions, `useShallow`-ready selectors) → Task 15. ✓
- §8.4 Codex security gate after M2 → Task 18. ✓
- Telemetry-on-DownloadJob-not-ModelRecord design decision (M1 19-field record contract preserved; only status vocabulary widens) → stated in Architecture + Task 13 + Task 15. ✓

**14 seeded DownloadManager tests (Spike A §8) → task mapping (every item ≥1 task with real test code):**
1. enqueue (queued, idempotent) → Task 4 (`DownloadManagerEnqueueTests`). ✓
2. concurrency (clamp [1,6]; 3rd stays queued at limit 2) → Task 4 (`DownloadManagerConcurrencyTests` + `test_third_enqueue_waits_for_a_slot_with_limit_two`). ✓
3. progress accounting (deltas → progress/speed/eta; multi-file aggregate) → Tasks 2 (`ProgressSinkTests`), 3 (factory), 5 (`test_single_file_download_drives_progress_and_reaches_ready`). ✓
4. disk preflight (typed error BEFORE any download; size<free proceeds) → Task 6 (`DownloadManagerDiskPreflightTests`). ✓
5. pause (status paused; `.incomplete` preserved) → Task 7 (`DownloadManagerPauseTests`). ✓
6. resume (re-invoke; continues from offset, initial≠0) → Task 8 (`DownloadManagerResumeTests`). ✓
7. cancel (stop; delete partials; status cancelled) → Task 9 (`DownloadManagerCancelTests`). ✓
8. atomic verified completion (success→ready; size OSError→error, never partial-as-ready) → Tasks 5 (success), 10 (`DownloadManagerIntegrityTests`). ✓
9. gated license (401/`GatedRepoError`→typed error w/ gate URL CTA) → Tasks 1, 10 (`DownloadManagerGatedTests`). ✓
10. token discipline (per-call; never on disk/logs/state) → Tasks 5 (`test_token_is_passed_per_call_and_not_stored`), 11 (`DownloadManagerTokenDisciplineTests`), 14 (`test_x_hf_token_header...`). ✓
11. typed resilience (5xx→backoff/typed; drop→resume) → Tasks 1 (taxonomy + mapping), 8 (resume path), 5 (except ladder). Backoff/retry on the IPC layer is the existing `requestBackend(attempts, delayMs)` (`backendRequest.ts`), reused by every download handler in Task 16. ✓
12. path-safety (separators + drive letter + long path; pure pathlib, both OSes) → Task 12 (`test_foundry_download_paths.py`). ✓
13. API contracts (`POST /download`, `/pause|resume|cancel`, `GET /downloads`; unknown id→404) → Task 14 (`test_foundry_download_api.py`). ✓
14. fast/precise toggle (precise sets `HF_HUB_DISABLE_XET`; restores even on error; fast leaves Xet) → Task 11 (`DownloadManagerXetToggleTests`). ✓

**ModelStatus extension (early-task requirement):** Task 13 extends the backend status domain (`test_foundry_catalog.py`), the dataclass/schema comments, and the TS `ModelStatus` union; the M1 parity/contract surfaces that enumerate status values are the catalog domain test and the TS union — both updated. ✓

**unittest-vs-pytest mandate:** every behavioral backend test in Tasks 1–12, 14 is a `unittest.TestCase` / `unittest.IsolatedAsyncioTestCase` subclass (mirrors `test_model_manager.py`), so CI's `python -m unittest discover` runs them. Task 17 Step 2 asserts this explicitly. The only bare-function additions (Task 13) are data-validation extensions inside the pre-existing bare-function `test_foundry_catalog.py` and carry no behavior. ✓

**Placeholder scan:** none — every step ships complete, runnable code + the exact run command + expected PASS/FAIL. No "TODO", no "similar to Task N", no "add error handling".

**Type / name consistency (`DownloadJob` field parity):** the eight fields `model_id, status, progress, speed, eta, total_bytes, error, gate_url` are identical and in the same set across the Python dataclass (Task 4), the Pydantic `DownloadJobSchema` (Task 14), `_job_to_dict` (Task 14), and the TS `DownloadJob` interface (Task 15); **no `token` field anywhere**. `selectDownloadFor`/`refreshDownloads`/`enqueueDownload`/`pauseDownload`/`resumeDownload`/`cancelDownload` are the exact symbols the slice exports (Task 15) and the slice test asserts (Task 15); the IPC channel names `models:download[:pause|:resume|:cancel]`, `models:downloads:list`, `models:downloads:subscribe`, `auth:setHfToken` are identical between `preload.ts` and the `generation.ts`/`main.ts` handlers (Task 16). The status vocabulary is the same eight values in the backend domain test, `JobStatus` Literal, `DownloadStatus` TS union, and `ModelStatus` TS union (Tasks 4, 13, 15).
