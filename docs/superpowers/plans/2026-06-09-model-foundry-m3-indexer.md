# Model Foundry M3 — Library Indexer + Import/Link Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Each task is a fresh-implementer-sized unit under two-stage review.

**Goal:** Build the Model Foundry library indexer on top of the M1 `ModelRegistry` + M2 `DownloadManager`: three index feeds (app-managed tree, real HF cache via `scan_cache_dir`, user-linked external roots with ComfyUI/A1111/generic layout hints) merged into the registry by cheap identity; safetensors-header type detection; reference-never-copy import with a junction/hardlink/copy-fallback linker (validated by Spike B, `docs/superpowers/spikes/2026-06-09-windows-linking.md`); incremental `(mtime_ns, size)` re-scans; safe removal that never touches user bytes; and first-run detection of existing installs — surfaced over `POST /api/models/import`, `POST /api/models/scan`, `GET /api/models/libraries`, `DELETE /api/models/libraries/{root_id}`, `GET /api/models/libraries/detect`, mirrored IPC channels, and `libraryRoots`/`detectedRoots` state on `modelsSlice`.

**Architecture:** Six new `backend/foundry/` modules layered under the existing registry: `safetensors_header.py` (8-byte-length + JSON header read, key-pattern classification, diffusers-folder detection), `identity.py` (quick identity = `size + head/tail-64KB sha256`; full sha256 lazy), `linker.py` (predicate-first/fallback-always materialization ladder + a JSON `LinkLedger` so "is this our link?" is answered from records, not `islink`), `library_roots.py` (persisted roots + layout-hint maps), `hf_cache.py` (defensive `scan_cache_dir` adapter that consumes `.warnings`), and `indexer.py` + `index_service.py` (tree walker with incremental signatures; orchestrating service that merges the three feeds and applies them to the registry). `ModelRecord` gains four optional fields (`locations`, `identity`, `availability`, `library_root_id`); the registry gains `apply_index()` and consults indexed locations between the M2 `status_provider` and the M1 dir-check, which also closes the M1 TODO (filename-aware presence for flat single-file artifacts like `flux1-dev.safetensors`). Foundry metadata persists in `<models_dir>/.foundry/` (`library_roots.json`, `links.json`, `index_state.json`) — no DB migration. Frontend is data-contract only (types, slice, preload, IPC, contract tests); the browse/library panel is styled by the design agent per spec §7.3.

**Tech Stack:** Python 3 / FastAPI / dataclasses + Pydantic / `huggingface_hub` 1.10.1 `scan_cache_dir` / `_winapi.CreateJunction` (CPython built-in, Windows) (backend); `unittest` + `unittest.mock` + FastAPI `TestClient` (backend tests); TypeScript / React 19 / Zustand / Vitest (frontend); Electron IPC (`ipcMain.handle` ↔ `contextBridge`).

---

## Conventions & Constraints (read once before starting)

- **Branch:** `feat/model-foundry-m3`, cut from `origin/main`. Confirm with `git branch --show-current` → `feat/model-foundry-m3` before the first commit. Do NOT switch branches mid-plan.
- **CI backend test runner is `python -m unittest discover -s tests -v`, which ONLY executes `unittest.TestCase` subclasses.** Bare `def test_*` functions are imported but never run. **EVERY backend test in this plan is a `unittest.TestCase` subclass.** They must also stay runnable under `python -m pytest backend/tests -q`. `conftest.py` auto-tags `test_*_api.py` → `integration`, everything else → `unit`; name files accordingly (Task 10's API tests live in `test_foundry_library_api.py` so they tier as integration).
- **Backend tests: NO `torch` import, NO network, NO real HF cache.** Mock `huggingface_hub.scan_cache_dir` on the `foundry.hf_cache` module namespace. All filesystem work in `tempfile.mkdtemp()` / `tmp` dirs cleaned in `tearDown`.
- **CI runs Linux AND Windows.** All path logic via `os.path` / `pathlib` — never hardcode a separator. Windows-only behaviors (junction, reparse attributes) are `@unittest.skipUnless(sys.platform == "win32", "Windows-only")`; the POSIX leg (symlink for dirs) is `@unittest.skipUnless(sys.platform != "win32", "POSIX-only")`. Both legs execute in CI.
- **Spike B adjustments are LAW in this plan** (`docs/superpowers/spikes/2026-06-09-windows-linking.md`):
  1. Junction detection NEVER uses `os.path.islink()` (measured `False` for junctions). Use `st_file_attributes & 0x400` + the `LinkLedger`.
  2. A *source file* carrying `FILE_ATTRIBUTE_REPARSE_POINT` (OneDrive placeholder) routes to **copy**, never `os.link`.
  3. Link attempts are predicate-first (`os.stat().st_dev` equality), fallback-always (ANY `OSError` from a link attempt → copy). Cross-volume failure (WinError 17) is exercised via a mocked `os.link`.
  4. `shutil.rmtree` does not recurse through junctions (proven) — Task 4 turns the spike probe into a regression test.
  5. The M3 indexer MUST consume `scan_cache_dir().warnings` (two real broken cache entries exist on the dev machine) — degraded state, never an exception.
- **No elevation, ever.** Directory links: junction on Windows (`_winapi.CreateJunction`), `os.symlink` on POSIX only. NEVER `os.symlink` on Windows (privilege trap).
- **Never touch user bytes.** Removing a root drops referenced-only records and deletes nothing on disk. `DELETE /api/models/{id}` refuses records whose `source == "linked"` (409). `safe_remove` deletes only paths under the app `models_dir` or paths recorded in the `LinkLedger`.
- **Single-file reconciliation map:** loose files are reconciled against the verified catalog by filename via `utils.model_manager._SINGLE_FILE_FILENAMES` (e.g. `flux1-dev.safetensors` → `flux-dev`). Import it lazily inside the function (mirrors `download_manager._resolve_files`).
- **`base_architecture` for loose files stays `"unknown"` in M3** — tensor-shape architecture detection is Spike C / M4 territory. The header classifier only assigns `artifact_type`.
- **Green bar before each commit; the milestone gate (Task 12) is:** `npm run typecheck` && `npm test` && `npm run build` && `python -m pytest backend/tests -q` && (from `backend/`) `python -m unittest discover -s tests -v` all green. Husky runs the full vitest suite + typecheck on any staged `.ts/.tsx`; keep frontend diffs focused.
- **Commit trailer:** every commit message ends with:
  ```
  Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
  ```
- **Canonical new `ModelRecord` fields** (identical names on the Python dataclass, `ModelRecordSchema`, and the TS `ModelRecord`): `locations: list[str] = []`, `identity: str | None = None`, `availability: "available" | "unavailable" = "available"`, `library_root_id: str | None = None`. `availability` is a separate axis from the 8-value `status` vocabulary (an unmounted NAS is not a download error).
- **Canonical `LibraryRoot` field set:** `id, path, layout_hint, added_at`. `layout_hint` is `comfyui | a1111 | generic`.
- **Unknown-local id scheme:** `local-<first 16 hex of quick-identity hash>` — stable across scans AND across roots, so identical bytes in two roots collapse to one record with two `locations`.

---

## File Structure

**Backend (create):**
- `backend/foundry/safetensors_header.py` — header read + key-pattern classification + diffusers-folder detection.
- `backend/foundry/identity.py` — quick identity + lazy full sha256.
- `backend/foundry/linker.py` — `LinkLedger`, volume/reparse predicates, materialization ladder, `safe_remove`.
- `backend/foundry/library_roots.py` — `LibraryRoot` + `RootsStore` + layout-hint subdir maps.
- `backend/foundry/hf_cache.py` — `scan_cache_dir` adapter (defensive import, consumes warnings).
- `backend/foundry/indexer.py` — `IndexedArtifact`, tree walker, incremental signatures, record conversion.
- `backend/foundry/index_service.py` — `IndexService`: merges feeds, applies to registry, persists state, detects installs.
- `backend/tests/foundry_fixtures.py` — shared `make_safetensors` fixture builder (NOT `test_`-prefixed: not collected).
- `backend/tests/test_foundry_safetensors_header.py`
- `backend/tests/test_foundry_identity.py`
- `backend/tests/test_foundry_linker.py`
- `backend/tests/test_foundry_library_roots.py`
- `backend/tests/test_foundry_indexer.py`
- `backend/tests/test_foundry_hf_cache.py`
- `backend/tests/test_foundry_index_service.py`
- `backend/tests/test_foundry_library_api.py` (integration tier)

**Backend (modify):**
- `backend/foundry/model_record.py` — add the four optional fields.
- `backend/foundry/registry.py` — add `apply_index()` + indexed-presence in `_live_status`; indexed-only records in `list_records()`.
- `backend/foundry/schemas.py` — extend `ModelRecordSchema`; add `LibraryRootSchema`, `DetectedRootSchema`, `ScanResultSchema`.
- `backend/main.py` — construct `RootsStore` + `IndexService`; add the five library routes; guard `DELETE /api/models/{model_id}`.
- `backend/tests/test_foundry_registry.py` — no changes required (Task 8 adds a NEW file-scoped test class file instead; keep history clean).

**Frontend (create):**
- `src/store/slices/librarySelectors.test.ts` — slice action/selector tests.

**Frontend (modify):**
- `src/types/model.ts` — add `LayoutHint`, `LibraryRoot`, `DetectedRoot`, `ScanResult`; extend `ModelRecord` with the four optional fields.
- `src/store/slices/modelsSlice.ts` — add `libraryRoots`/`detectedRoots` state + `loadLibraryRoots/addLibraryRoot/removeLibraryRoot/scanLibraries/detectLibraries` actions.
- `src/store/appStore.types.ts` — add the two state fields + five action signatures.
- `electron/preload.ts` — add `importRoot/scan/librariesList/librariesRemove/librariesDetect` to the `models` API + `ElectronAPI` types.
- `electron/ipc-handlers/generation.ts` — add `models:import`, `models:scan`, `models:libraries:list`, `models:libraries:remove`, `models:libraries:detect` handlers.
- `tests/integration/api-contracts.test.ts` — add `LibraryRoot`/`ScanResult` contract section.

---

## Task 1: safetensors header reader + classifier

**Files:**
- Create: `backend/tests/foundry_fixtures.py`
- Create: `backend/foundry/safetensors_header.py`
- Test: `backend/tests/test_foundry_safetensors_header.py`

- [ ] **Step 1: Create the shared fixture builder**

Create `backend/tests/foundry_fixtures.py`:
```python
"""Shared fixture builders for foundry indexer tests (from Spike B's probe)."""

import json
import os
import struct
from typing import Dict, List, Optional


def make_safetensors(
    path: str,
    tensors: Dict[str, List[int]],
    metadata: Optional[Dict[str, str]] = None,
) -> str:
    """Write a tiny VALID safetensors file: 8-byte LE header length + JSON + zero data."""
    header: Dict[str, object] = {}
    offset = 0
    for name, shape in tensors.items():
        size = 2  # bytes per F16 element
        for dim in shape:
            size *= dim
        header[name] = {"dtype": "F16", "shape": shape, "data_offsets": [offset, offset + size]}
        offset += size
    if metadata:
        header["__metadata__"] = metadata
    encoded = json.dumps(header).encode("utf-8")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as handle:
        handle.write(struct.pack("<Q", len(encoded)))
        handle.write(encoded)
        handle.write(b"\x00" * offset)
    return path


CHECKPOINT_TENSORS = {
    "model.diffusion_model.input_blocks.0.0.weight": [4, 4],
    "model.diffusion_model.out.2.bias": [4],
}
LORA_TENSORS = {"lora_unet_down_blocks_0_attentions_0.lora_down.weight": [4, 4]}
VAE_TENSORS = {"encoder.conv_in.weight": [4, 4], "decoder.conv_out.bias": [4]}
CONTROLNET_TENSORS = {"control_model.input_blocks.0.0.weight": [4, 4]}
```

- [ ] **Step 2: Write the failing test**

Create `backend/tests/test_foundry_safetensors_header.py`:
```python
import json
import os
import pathlib
import sys
import tempfile
import unittest

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from foundry.safetensors_header import (  # type: ignore[import-not-found]
    HeaderError,
    classify_safetensors,
    detect_diffusers_dir,
    read_safetensors_header,
)
from tests.foundry_fixtures import (
    CHECKPOINT_TENSORS,
    CONTROLNET_TENSORS,
    LORA_TENSORS,
    VAE_TENSORS,
    make_safetensors,
)


class HeaderReadTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix="foundry-header-")

    def tearDown(self):
        import shutil

        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_reads_header_of_crafted_file(self):
        path = make_safetensors(os.path.join(self.tmp, "a.safetensors"), LORA_TENSORS)
        header = read_safetensors_header(path)
        self.assertIn("lora_unet_down_blocks_0_attentions_0.lora_down.weight", header)

    def test_metadata_block_preserved(self):
        path = make_safetensors(
            os.path.join(self.tmp, "b.safetensors"), CHECKPOINT_TENSORS, {"format": "pt"}
        )
        self.assertEqual(read_safetensors_header(path)["__metadata__"], {"format": "pt"})

    def test_implausible_header_length_raises_typed_error(self):
        path = os.path.join(self.tmp, "not-safetensors.safetensors")
        with open(path, "wb") as handle:
            handle.write(b"\xff" * 64)  # length prefix decodes to an absurd number
        with self.assertRaises(HeaderError):
            read_safetensors_header(path)

    def test_truncated_file_raises_typed_error(self):
        path = os.path.join(self.tmp, "tiny.safetensors")
        with open(path, "wb") as handle:
            handle.write(b"\x01")
        with self.assertRaises(HeaderError):
            read_safetensors_header(path)


class ClassifyTests(unittest.TestCase):
    def _header(self, tensors):
        return {name: {"dtype": "F16", "shape": s, "data_offsets": [0, 2]} for name, s in tensors.items()}

    def test_table_driven_classification(self):
        cases = [
            (CHECKPOINT_TENSORS, "checkpoint"),
            (LORA_TENSORS, "lora"),
            ({"lora_te_text_model_encoder_layers_0.lora_up.weight": [4, 4]}, "lora"),
            (VAE_TENSORS, "vae"),
            (CONTROLNET_TENSORS, "controlnet"),
            ({"some.unrecognized.tensor": [4]}, "unknown"),
        ]
        for tensors, expected in cases:
            with self.subTest(expected=expected):
                self.assertEqual(classify_safetensors(self._header(tensors)), expected)

    def test_header_trumps_folder_metadata_key_ignored(self):
        header = self._header(LORA_TENSORS)
        header["__metadata__"] = {"format": "pt"}
        self.assertEqual(classify_safetensors(header), "lora")


class DiffusersDirTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix="foundry-diffusers-")

    def tearDown(self):
        import shutil

        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_model_index_json_marks_diffusers_dir(self):
        with open(os.path.join(self.tmp, "model_index.json"), "w", encoding="utf-8") as handle:
            json.dump({"_class_name": "StableDiffusionPipeline"}, handle)
        self.assertTrue(detect_diffusers_dir(self.tmp))

    def test_plain_dir_is_not_diffusers(self):
        self.assertFalse(detect_diffusers_dir(self.tmp))


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 3: Run test to verify it fails**

Run: `python -m pytest backend/tests/test_foundry_safetensors_header.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'foundry.safetensors_header'`.

- [ ] **Step 4: Write the implementation**

Create `backend/foundry/safetensors_header.py`:
```python
"""safetensors header reading + artifact-type classification (Model Foundry M3).

Replaces substring-guessing with the real 8-byte-LE-length + JSON header block
(spec section 4.4). Tensor-shape ARCHITECTURE detection is deliberately out of
scope until Spike C / M4 — this module only assigns artifact_type.
"""

import json
import os
import struct
from typing import Any, Dict

# A real safetensors header is small JSON; anything claiming >100 MB is not one.
_MAX_HEADER_BYTES = 100_000_000


class HeaderError(ValueError):
    """The file is not a readable safetensors artifact."""


def read_safetensors_header(path: str) -> Dict[str, Any]:
    try:
        with open(path, "rb") as handle:
            prefix = handle.read(8)
            if len(prefix) != 8:
                raise HeaderError(f"truncated safetensors prefix: {path}")
            (length,) = struct.unpack("<Q", prefix)
            if length > _MAX_HEADER_BYTES:
                raise HeaderError(f"implausible header length {length}: {path}")
            raw = handle.read(length)
            if len(raw) != length:
                raise HeaderError(f"truncated safetensors header: {path}")
            return json.loads(raw)
    except (OSError, json.JSONDecodeError) as exc:
        raise HeaderError(f"unreadable safetensors header: {path}: {exc}") from exc


def classify_safetensors(header: Dict[str, Any]) -> str:
    """checkpoint | lora | vae | controlnet | unknown — from tensor-key patterns."""
    keys = [key for key in header if key != "__metadata__"]
    if any(
        key.startswith(("lora_unet_", "lora_te_")) or ".lora_down." in key or ".lora_up." in key
        for key in keys
    ):
        return "lora"
    if any(key.startswith("model.diffusion_model.") for key in keys):
        return "checkpoint"
    if any(key.startswith(("control_model.", "input_hint_block.")) for key in keys):
        return "controlnet"
    if any(key.startswith(("encoder.", "decoder.")) for key in keys):
        return "vae"
    return "unknown"


def detect_diffusers_dir(path: str) -> bool:
    return os.path.isfile(os.path.join(path, "model_index.json"))
```

- [ ] **Step 5: Run test to verify it passes**

Run: `python -m pytest backend/tests/test_foundry_safetensors_header.py -q`
Expected: PASS (10 tests).

- [ ] **Step 6: Commit**

```bash
git add backend/tests/foundry_fixtures.py backend/foundry/safetensors_header.py backend/tests/test_foundry_safetensors_header.py
git commit -m "feat(foundry): safetensors header reader + artifact-type classifier"
```

---

## Task 2: Quick identity + lazy full hash

**Files:**
- Create: `backend/foundry/identity.py`
- Test: `backend/tests/test_foundry_identity.py`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_foundry_identity.py`:
```python
import os
import pathlib
import shutil
import sys
import tempfile
import unittest

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from foundry.identity import full_sha256, quick_identity  # type: ignore[import-not-found]


class QuickIdentityTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix="foundry-identity-")

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def _write(self, name, payload):
        path = os.path.join(self.tmp, name)
        with open(path, "wb") as handle:
            handle.write(payload)
        return path

    def test_same_bytes_in_two_paths_share_identity(self):
        payload = os.urandom(1024) * 200  # ~200 KB > 2x64 KB head/tail window
        a = self._write("a.safetensors", payload)
        b = self._write("b.safetensors", payload)
        self.assertEqual(quick_identity(a), quick_identity(b))

    def test_different_bytes_differ(self):
        a = self._write("a.bin", b"A" * 200_000)
        b = self._write("b.bin", b"A" * 199_999 + b"B")  # same size, tail differs
        self.assertNotEqual(quick_identity(a), quick_identity(b))

    def test_identity_format_is_size_colon_hex16(self):
        path = self._write("c.bin", b"hello")
        size, digest = quick_identity(path).split(":")
        self.assertEqual(size, "5")
        self.assertEqual(len(digest), 16)

    def test_small_file_hashed_once_not_doubled(self):
        # A file smaller than the 64 KB window must not hash its bytes twice.
        a = self._write("small.bin", b"xyz")
        b = self._write("small2.bin", b"xyz")
        self.assertEqual(quick_identity(a), quick_identity(b))

    def test_full_sha256_matches_hashlib(self):
        import hashlib

        path = self._write("d.bin", b"payload")
        self.assertEqual(full_sha256(path), hashlib.sha256(b"payload").hexdigest())


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest backend/tests/test_foundry_identity.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'foundry.identity'`.

- [ ] **Step 3: Write the implementation**

Create `backend/foundry/identity.py`:
```python
"""Cheap artifact identity (spec section 4.3): size + head/tail-64KB sha256.

Full sha256 is computed lazily (background, post-scan) for verification and
provenance — never during a scan.
"""

import hashlib
import os

_WINDOW = 65536


def quick_identity(path: str) -> str:
    """'<size>:<first 16 hex of sha256(head||tail)>' — stable, collision-cheap."""
    size = os.path.getsize(path)
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        digest.update(handle.read(_WINDOW))
        if size > 2 * _WINDOW:
            handle.seek(-_WINDOW, os.SEEK_END)
            digest.update(handle.read(_WINDOW))
    return f"{size}:{digest.hexdigest()[:16]}"


def full_sha256(path: str) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest backend/tests/test_foundry_identity.py -q`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/foundry/identity.py backend/tests/test_foundry_identity.py
git commit -m "feat(foundry): quick identity (size + head/tail hash) + lazy full sha256"
```

---

## Task 3: LinkLedger + volume/reparse predicates

**Files:**
- Create: `backend/foundry/linker.py` (predicates + ledger in this task; the ladder lands in Task 4)
- Test: `backend/tests/test_foundry_linker.py`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_foundry_linker.py`:
```python
import os
import pathlib
import shutil
import sys
import tempfile
import unittest

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from foundry.linker import (  # type: ignore[import-not-found]
    LinkLedger,
    is_reparse_point,
    same_volume,
)


class PredicateTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix="foundry-linker-")

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_same_volume_true_for_sibling_paths(self):
        a = os.path.join(self.tmp, "a")
        b = os.path.join(self.tmp, "b")
        os.makedirs(a)
        os.makedirs(b)
        self.assertTrue(same_volume(a, b))

    def test_plain_file_is_not_reparse_point(self):
        path = os.path.join(self.tmp, "f.bin")
        with open(path, "wb") as handle:
            handle.write(b"x")
        self.assertFalse(is_reparse_point(path))


class LinkLedgerTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix="foundry-ledger-")
        self.ledger_path = os.path.join(self.tmp, "links.json")

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_add_then_is_foundry_link(self):
        ledger = LinkLedger(self.ledger_path)
        dest = os.path.join(self.tmp, "app", "model.safetensors")
        ledger.add(mechanism="hardlink", source=os.path.join(self.tmp, "src.safetensors"), dest=dest)
        self.assertTrue(ledger.is_foundry_link(dest))
        self.assertFalse(ledger.is_foundry_link(os.path.join(self.tmp, "unrelated.bin")))

    def test_persists_across_instances(self):
        LinkLedger(self.ledger_path).add(mechanism="copy", source="s", dest=os.path.join(self.tmp, "d"))
        reloaded = LinkLedger(self.ledger_path)
        self.assertTrue(reloaded.is_foundry_link(os.path.join(self.tmp, "d")))
        self.assertEqual(reloaded.entries()[0]["mechanism"], "copy")

    def test_remove_drops_entry(self):
        ledger = LinkLedger(self.ledger_path)
        dest = os.path.join(self.tmp, "d2")
        ledger.add(mechanism="junction", source="s", dest=dest)
        self.assertTrue(ledger.remove(dest))
        self.assertFalse(ledger.is_foundry_link(dest))
        self.assertFalse(ledger.remove(dest))  # second remove is a no-op False

    def test_path_comparison_is_normalized(self):
        ledger = LinkLedger(self.ledger_path)
        dest = os.path.join(self.tmp, "Sub", "d3.bin")
        ledger.add(mechanism="hardlink", source="s", dest=dest)
        # Differently-cased / differently-separated spelling of the same path.
        alt = dest.replace(os.sep, "/").upper() if sys.platform == "win32" else dest
        self.assertTrue(ledger.is_foundry_link(alt))


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest backend/tests/test_foundry_linker.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'foundry.linker'`.

- [ ] **Step 3: Write the implementation (predicates + ledger only)**

Create `backend/foundry/linker.py`:
```python
"""Reference-never-copy link materialization (Model Foundry M3, Spike B).

Spike-B law (docs/superpowers/spikes/2026-06-09-windows-linking.md):
- junction detection NEVER uses os.path.islink (False for junctions);
  "is this our link?" is answered by the LinkLedger first, reparse attrs second.
- reparse-point SOURCE files (OneDrive placeholders) are copy-only.
- predicate-first (st_dev), fallback-always (any OSError -> copy).
- no elevation, ever: junction/hardlink/copy on Windows; symlink only on POSIX.
"""

import json
import os
import shutil
import sys
from dataclasses import dataclass
from typing import Dict, List

_FILE_ATTRIBUTE_REPARSE_POINT = 0x400


def same_volume(path_a: str, path_b: str) -> bool:
    """Cheap same-volume predicate via st_dev (volume serial on Windows)."""
    return os.stat(path_a).st_dev == os.stat(path_b).st_dev


def is_reparse_point(path: str) -> bool:
    """True for junctions/symlinks/OneDrive placeholders. NOT os.path.islink."""
    if sys.platform != "win32":
        return os.path.islink(path)
    try:
        return bool(os.lstat(path).st_file_attributes & _FILE_ATTRIBUTE_REPARSE_POINT)
    except OSError:
        return False


def _normalize(path: str) -> str:
    return os.path.normcase(os.path.normpath(os.path.abspath(path)))


class LinkLedger:
    """JSON-persisted record of every link/copy the Foundry materializes."""

    def __init__(self, path: str):
        self._path = path
        self._entries: List[Dict[str, str]] = []
        if os.path.isfile(path):
            with open(path, "r", encoding="utf-8") as handle:
                self._entries = json.load(handle)

    def _save(self) -> None:
        os.makedirs(os.path.dirname(self._path), exist_ok=True)
        with open(self._path, "w", encoding="utf-8") as handle:
            json.dump(self._entries, handle, indent=2)

    def add(self, mechanism: str, source: str, dest: str) -> None:
        self._entries.append(
            {"mechanism": mechanism, "source": source, "dest": _normalize(dest)}
        )
        self._save()

    def remove(self, dest: str) -> bool:
        needle = _normalize(dest)
        before = len(self._entries)
        self._entries = [entry for entry in self._entries if entry["dest"] != needle]
        if len(self._entries) != before:
            self._save()
            return True
        return False

    def is_foundry_link(self, path: str) -> bool:
        needle = _normalize(path)
        return any(entry["dest"] == needle for entry in self._entries)

    def entries(self) -> List[Dict[str, str]]:
        return list(self._entries)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest backend/tests/test_foundry_linker.py -q`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/foundry/linker.py backend/tests/test_foundry_linker.py
git commit -m "feat(foundry): LinkLedger + same-volume/reparse predicates (Spike B rules)"
```

---

## Task 4: Materialization ladder + safe_remove

**Files:**
- Modify: `backend/foundry/linker.py` (append)
- Test: `backend/tests/test_foundry_linker.py` (append)

- [ ] **Step 1: Write the failing tests**

Append to `backend/tests/test_foundry_linker.py` (before the `if __name__` guard):
```python
from unittest import mock

from foundry.linker import materialize_link, safe_remove  # type: ignore[import-not-found]


class MaterializeLadderTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix="foundry-ladder-")
        self.ledger = LinkLedger(os.path.join(self.tmp, ".foundry", "links.json"))

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def _src_file(self, payload=b"W" * 4096):
        path = os.path.join(self.tmp, "user", "weights.safetensors")
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "wb") as handle:
            handle.write(payload)
        return path

    def test_same_volume_file_hardlinks(self):
        src = self._src_file()
        dest = os.path.join(self.tmp, "app", "weights.safetensors")
        result = materialize_link(src, dest, self.ledger)
        self.assertEqual(result.mechanism, "hardlink")
        self.assertEqual(os.stat(dest).st_nlink, 2)
        self.assertTrue(self.ledger.is_foundry_link(dest))

    def test_cross_volume_copies_without_link_attempt(self):
        src = self._src_file()
        dest = os.path.join(self.tmp, "app2", "w.safetensors")
        with mock.patch("foundry.linker.same_volume", return_value=False), mock.patch(
            "foundry.linker.os.link"
        ) as link_spy:
            result = materialize_link(src, dest, self.ledger)
        link_spy.assert_not_called()
        self.assertEqual(result.mechanism, "copy")
        self.assertTrue(os.path.isfile(dest))

    def test_oserror_from_link_falls_back_to_copy(self):
        src = self._src_file()
        dest = os.path.join(self.tmp, "app3", "w.safetensors")
        winerror17 = OSError(17, "The system cannot move the file to a different disk drive")
        with mock.patch("foundry.linker.os.link", side_effect=winerror17):
            result = materialize_link(src, dest, self.ledger)
        self.assertEqual(result.mechanism, "copy")
        self.assertTrue(os.path.isfile(dest))

    def test_reparse_point_source_is_copy_only(self):
        src = self._src_file()
        dest = os.path.join(self.tmp, "app4", "w.safetensors")
        with mock.patch("foundry.linker.is_reparse_point", return_value=True), mock.patch(
            "foundry.linker.os.link"
        ) as link_spy:
            result = materialize_link(src, dest, self.ledger)
        link_spy.assert_not_called()
        self.assertEqual(result.mechanism, "copy")

    @unittest.skipUnless(sys.platform == "win32", "Windows-only")
    def test_directory_links_as_junction_on_windows(self):
        srcdir = os.path.join(self.tmp, "user", "diffusers-model")
        os.makedirs(srcdir)
        with open(os.path.join(srcdir, "model_index.json"), "w", encoding="utf-8") as handle:
            handle.write("{}")
        dest = os.path.join(self.tmp, "app5", "diffusers-model")
        result = materialize_link(srcdir, dest, self.ledger)
        self.assertEqual(result.mechanism, "junction")
        self.assertTrue(os.path.isfile(os.path.join(dest, "model_index.json")))
        # Spike-B rule: islink is False for junctions; the ledger is the authority.
        self.assertFalse(os.path.islink(dest))
        self.assertTrue(self.ledger.is_foundry_link(dest))

    @unittest.skipUnless(sys.platform != "win32", "POSIX-only")
    def test_directory_links_as_symlink_on_posix(self):
        srcdir = os.path.join(self.tmp, "user", "diffusers-model")
        os.makedirs(srcdir)
        dest = os.path.join(self.tmp, "app5", "diffusers-model")
        result = materialize_link(srcdir, dest, self.ledger)
        self.assertEqual(result.mechanism, "symlink")

    @unittest.skipUnless(sys.platform == "win32", "Windows-only")
    def test_never_symlinks_on_windows(self):
        src = self._src_file()
        dest = os.path.join(self.tmp, "app6", "w.safetensors")
        with mock.patch("foundry.linker.os.symlink") as symlink_spy:
            materialize_link(src, dest, self.ledger)
        symlink_spy.assert_not_called()


class SafeRemoveTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix="foundry-remove-")
        self.app_root = os.path.join(self.tmp, "models")
        os.makedirs(self.app_root)
        self.ledger = LinkLedger(os.path.join(self.app_root, ".foundry", "links.json"))

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_removes_app_managed_path(self):
        path = os.path.join(self.app_root, "checkpoints", "m.safetensors")
        os.makedirs(os.path.dirname(path))
        with open(path, "wb") as handle:
            handle.write(b"x")
        self.assertTrue(safe_remove(path, self.ledger, self.app_root))
        self.assertFalse(os.path.exists(path))

    def test_refuses_user_path_not_in_ledger(self):
        user_file = os.path.join(self.tmp, "user", "precious.safetensors")
        os.makedirs(os.path.dirname(user_file))
        with open(user_file, "wb") as handle:
            handle.write(b"x")
        self.assertFalse(safe_remove(user_file, self.ledger, self.app_root))
        self.assertTrue(os.path.exists(user_file))  # bytes untouched

    def test_removes_recorded_foundry_link_outside_app_root(self):
        src = os.path.join(self.tmp, "user", "w.safetensors")
        os.makedirs(os.path.dirname(src), exist_ok=True)
        with open(src, "wb") as handle:
            handle.write(b"x" * 64)
        dest = os.path.join(self.tmp, "elsewhere", "w.safetensors")
        materialize_link(src, dest, self.ledger)
        self.assertTrue(safe_remove(dest, self.ledger, self.app_root))
        self.assertFalse(os.path.exists(dest))
        self.assertTrue(os.path.exists(src))  # source NEVER touched
        self.assertFalse(self.ledger.is_foundry_link(dest))  # ledger entry dropped

    @unittest.skipUnless(sys.platform == "win32", "Windows-only")
    def test_rmtree_through_junction_spares_user_bytes(self):
        # Spike-B E5 regression: rmtree on a tree CONTAINING a junction must not
        # recurse into the junction target.
        user_dir = os.path.join(self.tmp, "user", "lib")
        os.makedirs(user_dir)
        keep = os.path.join(user_dir, "precious.safetensors")
        with open(keep, "wb") as handle:
            handle.write(b"P" * 8192)
        app_tree = os.path.join(self.app_root, "linked")
        os.makedirs(app_tree)
        materialize_link(user_dir, os.path.join(app_tree, "lib"), self.ledger)
        shutil.rmtree(app_tree)
        self.assertTrue(os.path.exists(keep))
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest backend/tests/test_foundry_linker.py -q`
Expected: FAIL — `ImportError: cannot import name 'materialize_link'`.

- [ ] **Step 3: Append the implementation**

Append to `backend/foundry/linker.py`:
```python
@dataclass
class LinkResult:
    mechanism: str  # hardlink | junction | symlink | copy
    source: str
    dest: str


def _copy(source: str, dest: str) -> str:
    if os.path.isdir(source):
        shutil.copytree(source, dest)
    else:
        shutil.copy2(source, dest)
    return "copy"


def materialize_link(source: str, dest: str, ledger: LinkLedger) -> LinkResult:
    """Materialize a concrete path for a referenced artifact.

    Ladder (Spike B): reparse-point source -> copy; cross-volume -> copy
    (no link attempt); same-volume dir -> junction (win) / symlink (posix);
    same-volume file -> hardlink; ANY OSError from a link attempt -> copy.
    """
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    mechanism = "copy"
    if is_reparse_point(source) or not same_volume(source, os.path.dirname(dest)):
        mechanism = _copy(source, dest)
    elif os.path.isdir(source):
        try:
            if sys.platform == "win32":
                import _winapi

                _winapi.CreateJunction(source, dest)
                mechanism = "junction"
            else:
                os.symlink(source, dest, target_is_directory=True)
                mechanism = "symlink"
        except OSError:
            mechanism = _copy(source, dest)
    else:
        try:
            os.link(source, dest)
            mechanism = "hardlink"
        except OSError:
            mechanism = _copy(source, dest)
    ledger.add(mechanism=mechanism, source=source, dest=dest)
    return LinkResult(mechanism=mechanism, source=source, dest=dest)


def safe_remove(path: str, ledger: LinkLedger, app_root: str) -> bool:
    """Delete ONLY app-managed paths or recorded Foundry links. Never user bytes.

    Returns False (and deletes nothing) for any other path.
    """
    normalized = _normalize(path)
    app = _normalize(app_root)
    is_ours = ledger.is_foundry_link(path)
    inside_app = normalized.startswith(app + os.sep) or normalized == app
    if not (is_ours or inside_app):
        return False
    if os.path.isdir(path) and not os.path.islink(path):
        if sys.platform == "win32" and is_reparse_point(path):
            os.rmdir(path)  # remove the junction itself, never its target's content
        else:
            shutil.rmtree(path)
    elif os.path.exists(path) or os.path.islink(path):
        os.remove(path)
    else:
        return False
    if is_ours:
        ledger.remove(path)
    return True
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest backend/tests/test_foundry_linker.py -q`
Expected: PASS (Windows: 18 tests, 1 POSIX skip; Linux: 16 tests run, Windows-only skipped).

- [ ] **Step 5: Commit**

```bash
git add backend/foundry/linker.py backend/tests/test_foundry_linker.py
git commit -m "feat(foundry): junction/hardlink/copy materialization ladder + safe_remove"
```

---

## Task 5: Library roots store + layout hints

**Files:**
- Create: `backend/foundry/library_roots.py`
- Test: `backend/tests/test_foundry_library_roots.py`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_foundry_library_roots.py`:
```python
import os
import pathlib
import shutil
import sys
import tempfile
import unittest

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from foundry.library_roots import (  # type: ignore[import-not-found]
    LAYOUT_SUBDIR_TYPES,
    LibraryRoot,
    RootsStore,
    layout_type_for,
)


class RootsStoreTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix="foundry-roots-")
        self.store = RootsStore(os.path.join(self.tmp, ".foundry", "library_roots.json"))
        self.root_dir = os.path.join(self.tmp, "comfy")
        os.makedirs(self.root_dir)

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_add_returns_root_with_stable_id(self):
        root = self.store.add(self.root_dir, "comfyui")
        self.assertIsInstance(root, LibraryRoot)
        self.assertEqual(root.layout_hint, "comfyui")
        self.assertTrue(root.id)
        self.assertTrue(root.added_at)

    def test_add_missing_path_raises_value_error(self):
        with self.assertRaises(ValueError):
            self.store.add(os.path.join(self.tmp, "nope"), "generic")

    def test_add_bad_hint_raises_value_error(self):
        with self.assertRaises(ValueError):
            self.store.add(self.root_dir, "sketchy")

    def test_add_same_path_is_idempotent(self):
        first = self.store.add(self.root_dir, "comfyui")
        second = self.store.add(self.root_dir, "comfyui")
        self.assertEqual(first.id, second.id)
        self.assertEqual(len(self.store.list()), 1)

    def test_persists_across_instances(self):
        added = self.store.add(self.root_dir, "a1111")
        reloaded = RootsStore(os.path.join(self.tmp, ".foundry", "library_roots.json"))
        self.assertEqual([r.id for r in reloaded.list()], [added.id])

    def test_remove(self):
        added = self.store.add(self.root_dir, "generic")
        self.assertTrue(self.store.remove(added.id))
        self.assertEqual(self.store.list(), [])
        self.assertFalse(self.store.remove(added.id))


class LayoutHintTests(unittest.TestCase):
    def test_comfyui_map_types_known_subdirs(self):
        self.assertEqual(LAYOUT_SUBDIR_TYPES["comfyui"]["checkpoints"], "checkpoint")
        self.assertEqual(LAYOUT_SUBDIR_TYPES["comfyui"]["loras"], "lora")
        self.assertEqual(LAYOUT_SUBDIR_TYPES["comfyui"]["vae"], "vae")
        self.assertEqual(LAYOUT_SUBDIR_TYPES["comfyui"]["controlnet"], "controlnet")

    def test_a1111_map_types_known_subdirs(self):
        self.assertEqual(LAYOUT_SUBDIR_TYPES["a1111"]["Stable-diffusion"], "checkpoint")
        self.assertEqual(LAYOUT_SUBDIR_TYPES["a1111"]["Lora"], "lora")
        self.assertEqual(LAYOUT_SUBDIR_TYPES["a1111"]["VAE"], "vae")
        self.assertEqual(LAYOUT_SUBDIR_TYPES["a1111"]["embeddings"], "embedding")

    def test_layout_type_for_resolves_first_matching_segment(self):
        rel = os.path.join("models", "Stable-diffusion", "ckpt.safetensors")
        self.assertEqual(layout_type_for("a1111", rel), "checkpoint")

    def test_generic_hint_has_no_opinion(self):
        self.assertIsNone(layout_type_for("generic", os.path.join("anything", "f.safetensors")))


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest backend/tests/test_foundry_library_roots.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'foundry.library_roots'`.

- [ ] **Step 3: Write the implementation**

Create `backend/foundry/library_roots.py`:
```python
"""Persisted user library roots + layout hints (Model Foundry M3, spec 4.2)."""

import json
import os
import uuid
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from typing import Dict, List, Optional

VALID_HINTS = {"comfyui", "a1111", "generic"}

# Known-layout subdir name -> artifact_type. Header detection (Task 6) trumps
# these when they disagree — the hint is a fast default, not an authority.
LAYOUT_SUBDIR_TYPES: Dict[str, Dict[str, str]] = {
    "comfyui": {
        "checkpoints": "checkpoint",
        "diffusers": "diffusers-pipeline",
        "loras": "lora",
        "vae": "vae",
        "vaes": "vae",  # the app-managed tree uses 'vaes'; harmless comfy alias
        "controlnet": "controlnet",
        "embeddings": "embedding",
    },
    "a1111": {
        "Stable-diffusion": "checkpoint",
        "Lora": "lora",
        "VAE": "vae",
        "ControlNet": "controlnet",
        "embeddings": "embedding",
    },
}


def layout_type_for(layout_hint: str, relative_path: str) -> Optional[str]:
    """artifact_type implied by the layout hint for a path inside the root."""
    mapping = LAYOUT_SUBDIR_TYPES.get(layout_hint)
    if not mapping:
        return None
    for segment in relative_path.replace("\\", "/").split("/"):
        if segment in mapping:
            return mapping[segment]
    return None


@dataclass
class LibraryRoot:
    id: str
    path: str
    layout_hint: str
    added_at: str

    def to_dict(self) -> Dict[str, str]:
        return asdict(self)


class RootsStore:
    def __init__(self, path: str):
        self._path = path
        self._roots: List[LibraryRoot] = []
        if os.path.isfile(path):
            with open(path, "r", encoding="utf-8") as handle:
                self._roots = [LibraryRoot(**entry) for entry in json.load(handle)]

    def _save(self) -> None:
        os.makedirs(os.path.dirname(self._path), exist_ok=True)
        with open(self._path, "w", encoding="utf-8") as handle:
            json.dump([root.to_dict() for root in self._roots], handle, indent=2)

    def add(self, path: str, layout_hint: str) -> LibraryRoot:
        if layout_hint not in VALID_HINTS:
            raise ValueError(f"unknown layout hint: {layout_hint}")
        if not os.path.isdir(path):
            raise ValueError(f"library root does not exist: {path}")
        normalized = os.path.normcase(os.path.normpath(os.path.abspath(path)))
        for root in self._roots:
            if os.path.normcase(os.path.normpath(os.path.abspath(root.path))) == normalized:
                return root  # idempotent
        root = LibraryRoot(
            id=uuid.uuid4().hex[:12],
            path=os.path.abspath(path),
            layout_hint=layout_hint,
            added_at=datetime.now(timezone.utc).isoformat(),
        )
        self._roots.append(root)
        self._save()
        return root

    def remove(self, root_id: str) -> bool:
        before = len(self._roots)
        self._roots = [root for root in self._roots if root.id != root_id]
        if len(self._roots) != before:
            self._save()
            return True
        return False

    def list(self) -> List[LibraryRoot]:
        return list(self._roots)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest backend/tests/test_foundry_library_roots.py -q`
Expected: PASS (10 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/foundry/library_roots.py backend/tests/test_foundry_library_roots.py
git commit -m "feat(foundry): persisted library roots store + comfyui/a1111 layout hints"
```

---

## Task 6: Tree indexer with incremental signatures

**Files:**
- Create: `backend/foundry/indexer.py`
- Test: `backend/tests/test_foundry_indexer.py`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_foundry_indexer.py`:
```python
import os
import pathlib
import shutil
import sys
import tempfile
import unittest
from unittest import mock

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from foundry.indexer import (  # type: ignore[import-not-found]
    IndexedArtifact,
    artifact_to_record,
    scan_tree,
)
from tests.foundry_fixtures import CHECKPOINT_TENSORS, LORA_TENSORS, make_safetensors


class ScanTreeTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix="foundry-indexer-")
        self.root = os.path.join(self.tmp, "comfy")
        make_safetensors(
            os.path.join(self.root, "checkpoints", "dream.safetensors"), CHECKPOINT_TENSORS
        )
        make_safetensors(os.path.join(self.root, "loras", "style.safetensors"), LORA_TENSORS)

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_indexes_safetensors_with_types_from_headers(self):
        artifacts, signatures = scan_tree(self.root, "comfyui", "root1", {})
        by_name = {os.path.basename(a.path): a for a in artifacts}
        self.assertEqual(by_name["dream.safetensors"].artifact_type, "checkpoint")
        self.assertEqual(by_name["style.safetensors"].artifact_type, "lora")
        self.assertEqual(len(signatures), 2)

    def test_header_trumps_layout_hint_on_mismatch(self):
        # LoRA keys inside checkpoints/: the header wins (spec 4.4 / seed test 11).
        make_safetensors(
            os.path.join(self.root, "checkpoints", "actually-a-lora.safetensors"), LORA_TENSORS
        )
        artifacts, _ = scan_tree(self.root, "comfyui", "root1", {})
        target = next(a for a in artifacts if "actually-a-lora" in a.path)
        self.assertEqual(target.artifact_type, "lora")

    def test_unreadable_header_falls_back_to_layout_hint(self):
        bad = os.path.join(self.root, "loras", "corrupt.safetensors")
        with open(bad, "wb") as handle:
            handle.write(b"\xff" * 32)
        artifacts, _ = scan_tree(self.root, "comfyui", "root1", {})
        target = next(a for a in artifacts if "corrupt" in a.path)
        self.assertEqual(target.artifact_type, "lora")

    def test_incremental_skips_unchanged_files(self):
        _, signatures = scan_tree(self.root, "comfyui", "root1", {})
        with mock.patch("foundry.indexer.read_safetensors_header") as header_spy:
            artifacts, _ = scan_tree(self.root, "comfyui", "root1", signatures)
        header_spy.assert_not_called()  # nothing re-read
        self.assertEqual(len(artifacts), 2)  # records still emitted from signatures

    def test_touched_file_is_reindexed(self):
        _, signatures = scan_tree(self.root, "comfyui", "root1", {})
        make_safetensors(
            os.path.join(self.root, "loras", "style.safetensors"),
            {"lora_unet_other.lora_down.weight": [8, 8]},
        )
        from foundry.safetensors_header import read_safetensors_header as real_read_header

        with mock.patch(
            "foundry.indexer.read_safetensors_header", wraps=real_read_header
        ) as header_spy:
            scan_tree(self.root, "comfyui", "root1", signatures)
        self.assertEqual(header_spy.call_count, 1)  # ONLY the touched file

    def test_diffusers_folder_indexed_as_pipeline_dir(self):
        ddir = os.path.join(self.root, "diffusers", "some-pipeline")
        os.makedirs(ddir)
        with open(os.path.join(ddir, "model_index.json"), "w", encoding="utf-8") as handle:
            handle.write("{}")
        artifacts, _ = scan_tree(self.root, "comfyui", "root1", {})
        target = next(a for a in artifacts if a.path == ddir)
        self.assertEqual(target.artifact_type, "diffusers-pipeline")


class ArtifactToRecordTests(unittest.TestCase):
    def _artifact(self, **overrides):
        base = dict(
            path=os.path.join("C:" + os.sep, "lib", "style.safetensors"),
            artifact_type="lora",
            identity="4096:aabbccddeeff0011",
            size_bytes=4096,
            mtime_ns=1,
            root_id="root1",
        )
        base.update(overrides)
        return IndexedArtifact(**base)

    def test_unknown_local_record_shape(self):
        record = artifact_to_record(self._artifact(), {})
        self.assertEqual(record.id, "local-aabbccddeeff0011")
        self.assertEqual(record.source, "linked")
        self.assertEqual(record.tier, "experimental")
        self.assertEqual(record.quality, "local")
        self.assertEqual(record.status, "ready")
        self.assertEqual(record.base_architecture, "unknown")
        self.assertEqual(record.locations, [self._artifact().path])
        self.assertEqual(record.library_root_id, "root1")
        self.assertEqual(record.name, "style")

    def test_known_filename_reconciles_to_catalog_id(self):
        artifact = self._artifact(
            path=os.path.join("C:" + os.sep, "lib", "flux1-dev.safetensors")
        )
        record = artifact_to_record(artifact, {"flux1-dev.safetensors": "flux-dev"})
        self.assertEqual(record.id, "flux-dev")
        self.assertEqual(record.status, "ready")


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest backend/tests/test_foundry_indexer.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'foundry.indexer'`.

- [ ] **Step 3: Write the implementation**

Create `backend/foundry/indexer.py`:
```python
"""Library tree indexer (Model Foundry M3, spec 4.1/4.3/4.5).

Walks one root, types artifacts (header trumps layout hint), computes quick
identity, and keeps (mtime_ns, size) signatures so unchanged files are never
re-read on subsequent scans.
"""

import os
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple

from foundry.identity import quick_identity
from foundry.library_roots import layout_type_for
from foundry.model_record import ModelRecord
from foundry.safetensors_header import (
    HeaderError,
    classify_safetensors,
    detect_diffusers_dir,
    read_safetensors_header,
)

# signature dict: normalized path -> [mtime_ns, size, artifact_type, identity]
Signatures = Dict[str, List]


@dataclass
class IndexedArtifact:
    path: str
    artifact_type: str
    identity: str
    size_bytes: int
    mtime_ns: int
    root_id: str
    base_architecture: str = "unknown"


def _classify_file(path: str, layout_hint: str, relative: str) -> str:
    try:
        header_type = classify_safetensors(read_safetensors_header(path))
    except HeaderError:
        header_type = "unknown"
    if header_type != "unknown":
        return header_type  # the header is the authority (seed test 11)
    return layout_type_for(layout_hint, relative) or "unknown"


def scan_tree(
    root_path: str,
    layout_hint: str,
    root_id: str,
    signatures: Signatures,
) -> Tuple[List[IndexedArtifact], Signatures]:
    """Index one root. Returns (artifacts, next_signatures)."""
    artifacts: List[IndexedArtifact] = []
    next_signatures: Signatures = {}
    if not os.path.isdir(root_path):
        return artifacts, next_signatures

    for dirpath, dirnames, filenames in os.walk(root_path):
        if detect_diffusers_dir(dirpath):
            stat = os.stat(dirpath)
            artifacts.append(
                IndexedArtifact(
                    path=dirpath,
                    artifact_type="diffusers-pipeline",
                    identity=f"dir:{os.path.basename(dirpath)}",
                    size_bytes=0,
                    mtime_ns=stat.st_mtime_ns,
                    root_id=root_id,
                )
            )
            dirnames[:] = []  # do not descend into pipeline component folders
            continue
        for filename in filenames:
            if not filename.endswith(".safetensors"):
                continue
            path = os.path.join(dirpath, filename)
            key = os.path.normcase(os.path.normpath(path))
            stat = os.stat(path)
            cached = signatures.get(key)
            if cached and cached[0] == stat.st_mtime_ns and cached[1] == stat.st_size:
                artifact_type, identity = cached[2], cached[3]
            else:
                relative = os.path.relpath(path, root_path)
                artifact_type = _classify_file(path, layout_hint, relative)
                identity = quick_identity(path)
            next_signatures[key] = [stat.st_mtime_ns, stat.st_size, artifact_type, identity]
            artifacts.append(
                IndexedArtifact(
                    path=path,
                    artifact_type=artifact_type,
                    identity=identity,
                    size_bytes=stat.st_size,
                    mtime_ns=stat.st_mtime_ns,
                    root_id=root_id,
                )
            )
    return artifacts, next_signatures


def artifact_to_record(
    artifact: IndexedArtifact,
    filename_reconciliation: Dict[str, str],
) -> ModelRecord:
    """IndexedArtifact -> ModelRecord (spec 4.6 reconciliation rules).

    A filename matching a verified single-file artifact reconciles to that
    catalog id (closing the M1 flat-file presence TODO); anything else becomes
    a stable `local-<hash16>` experimental record.
    """
    filename = os.path.basename(artifact.path)
    catalog_id = filename_reconciliation.get(filename)
    if catalog_id is not None:
        record_id = catalog_id
    else:
        digest = artifact.identity.split(":")[-1]
        record_id = f"local-{digest}"
    return ModelRecord(
        id=record_id,
        name=os.path.splitext(filename)[0],
        artifact_type=artifact.artifact_type,
        capability="image",
        base_architecture=artifact.base_architecture,
        source="linked",
        size=_human_size(artifact.size_bytes),
        status="ready",
        tier="experimental",
        quality="local",
        description="Indexed from a linked library root.",
        locations=[artifact.path],
        identity=artifact.identity,
        library_root_id=artifact.root_id,
    )


def _human_size(size_bytes: int) -> str:
    if size_bytes <= 0:
        return "Unknown"
    value = float(size_bytes)
    for unit in ("B", "KB", "MB", "GB", "TB"):
        if value < 1024 or unit == "TB":
            return f"{value:.1f} {unit}" if unit != "B" else f"{int(value)} B"
        value /= 1024
    return "Unknown"
```

Note: `ModelRecord(...)` above uses the four new fields (`locations`, `identity`, `library_root_id`) — they do not exist yet. **Task 7 adds them**; until then this module imports but `artifact_to_record` would raise `TypeError`. The test for Task 6 therefore runs AFTER Task 7 in CI order — to keep each task independently green, do Task 7's `model_record.py` change FIRST if executing strictly sequentially, or accept that Task 6 Step 4 runs the scan tests only:

Run: `python -m pytest backend/tests/test_foundry_indexer.py -q -k "ScanTree"`
Expected: PASS (6 tests). The `ArtifactToRecord` tests go green at the end of Task 7.

- [ ] **Step 4: Run the scan-tree tests**

Run: `python -m pytest backend/tests/test_foundry_indexer.py -q -k "ScanTree"`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/foundry/indexer.py backend/tests/test_foundry_indexer.py
git commit -m "feat(foundry): incremental tree indexer with header-first typing"
```

---

## Task 7: ModelRecord location fields + registry index merge

**Files:**
- Modify: `backend/foundry/model_record.py`
- Modify: `backend/foundry/registry.py`
- Modify: `backend/foundry/schemas.py`
- Test: `backend/tests/test_foundry_index_service.py` (registry-merge tests live here; the service itself arrives in Task 9 and extends this file)

- [ ] **Step 1: Add the four fields to `ModelRecord`**

In `backend/foundry/model_record.py`, add `field` to the dataclasses import and append after the `gated: bool = False` line (keeping all existing fields untouched):
```python
    # Location / index (M3)
    locations: List[str] = field(default_factory=list)
    identity: Optional[str] = None
    availability: str = "available"   # available | unavailable (separate axis from status)
    library_root_id: Optional[str] = None
```
and update the imports line to:
```python
from dataclasses import asdict, dataclass, field
from typing import Any, Dict, List, Optional
```

- [ ] **Step 2: Extend `ModelRecordSchema`**

In `backend/foundry/schemas.py`, add to the imports `from typing import List, Optional` (replacing the bare `Optional` import) and append to `ModelRecordSchema` after `gated: bool = False`:
```python
    locations: List[str] = []
    identity: Optional[str] = None
    availability: str = "available"
    library_root_id: Optional[str] = None
```

- [ ] **Step 3: Write the failing registry-merge tests**

Create `backend/tests/test_foundry_index_service.py`:
```python
import os
import pathlib
import shutil
import sys
import tempfile
import unittest

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

import json

from foundry.model_record import ModelRecord  # type: ignore[import-not-found]
from foundry.registry import ModelRegistry  # type: ignore[import-not-found]


def _write_catalog(path, entries):
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(entries, handle)


_CATALOG = {
    "flux-dev": {
        "id": "flux-dev",
        "name": "FLUX.1 dev",
        "artifact_type": "checkpoint",
        "capability": "image",
        "base_architecture": "flux",
        "source": "huggingface",
        "repo_id": "black-forest-labs/FLUX.1-dev",
    }
}


class RegistryIndexMergeTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix="foundry-regidx-")
        self.catalog_path = os.path.join(self.tmp, "catalog.json")
        _write_catalog(self.catalog_path, _CATALOG)
        self.registry = ModelRegistry(
            models_dir=os.path.join(self.tmp, "models"), catalog_path=self.catalog_path
        )

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def _indexed(self, record_id, location, identity="1:aa"):
        return ModelRecord(
            id=record_id,
            name=record_id,
            artifact_type="checkpoint",
            capability="image",
            base_architecture="unknown",
            source="linked",
            status="ready",
            tier="experimental",
            quality="local",
            locations=[location],
            identity=identity,
        )

    def test_catalog_record_with_indexed_location_reports_ready(self):
        self.registry.apply_index([self._indexed("flux-dev", os.path.join(self.tmp, "f.st"))])
        record = self.registry.get_record("flux-dev")
        self.assertEqual(record["status"], "ready")
        self.assertEqual(record["locations"], [os.path.join(self.tmp, "f.st")])
        # Curated catalog metadata is preserved on reconciliation:
        self.assertEqual(record["name"], "FLUX.1 dev")
        self.assertEqual(record["tier"], "verified")

    def test_unknown_indexed_record_appears_in_list(self):
        self.registry.apply_index([self._indexed("local-aa", os.path.join(self.tmp, "x.st"))])
        ids = [record["id"] for record in self.registry.list_records()]
        self.assertIn("local-aa", ids)
        self.assertIn("flux-dev", ids)

    def test_same_identity_across_roots_collapses_to_one_record(self):
        first = self._indexed("local-aa", os.path.join(self.tmp, "rootA", "x.st"))
        second = self._indexed("local-aa", os.path.join(self.tmp, "rootB", "x.st"))
        self.registry.apply_index([first, second])
        record = self.registry.get_record("local-aa")
        self.assertEqual(len(record["locations"]), 2)

    def test_reapply_replaces_previous_index(self):
        self.registry.apply_index([self._indexed("local-aa", os.path.join(self.tmp, "x.st"))])
        self.registry.apply_index([])  # e.g. the root was removed
        self.assertIsNone(self.registry.get_record("local-aa"))
        self.assertEqual(self.registry.get_record("flux-dev")["status"], "not_found")

    def test_status_provider_still_wins_over_index(self):
        registry = ModelRegistry(
            models_dir=os.path.join(self.tmp, "models"),
            catalog_path=self.catalog_path,
            status_provider=lambda model_id: "downloading",
        )
        registry.apply_index([self._indexed("flux-dev", os.path.join(self.tmp, "f.st"))])
        self.assertEqual(registry.get_record("flux-dev")["status"], "downloading")

    def test_unavailable_indexed_record_keeps_records_but_flags_availability(self):
        record = self._indexed("local-aa", os.path.join(self.tmp, "gone", "x.st"))
        record.availability = "unavailable"
        self.registry.apply_index([record])
        listed = self.registry.get_record("local-aa")
        self.assertEqual(listed["availability"], "unavailable")
        self.assertEqual(listed["status"], "not_found")  # unavailable never reports ready


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `python -m pytest backend/tests/test_foundry_index_service.py -q`
Expected: FAIL — `AttributeError: 'ModelRegistry' object has no attribute 'apply_index'`.

- [ ] **Step 5: Implement `apply_index` on the registry**

In `backend/foundry/registry.py`:

1. In `__init__`, after `self._status_provider = status_provider`, add:
```python
        # M3: indexed records (HF cache / linked roots / app tree), applied by
        # the IndexService. Keyed by canonical id; replaced wholesale per scan.
        self._indexed: Dict[str, ModelRecord] = {}
```

2. Add the public method after `get_record`:
```python
    def apply_index(self, indexed: List[ModelRecord]) -> None:
        """Replace the indexed layer (spec 4.6 reconciliation).

        Catalog ids gain locations/identity and report ready while available;
        unknown ids become first-class records; duplicate ids merge locations.
        """
        merged: Dict[str, ModelRecord] = {}
        for record in indexed:
            existing = merged.get(record.id)
            if existing is None:
                merged[record.id] = record
            else:
                for location in record.locations:
                    if location not in existing.locations:
                        existing.locations.append(location)
                if existing.availability == "unavailable" and record.availability == "available":
                    existing.availability = "available"
        self._indexed = merged
```

3. Replace `list_records` with:
```python
    def list_records(self) -> List[Dict[str, Any]]:
        records = [self._reconciled(record) for record in self.records.values()]
        known = set(self.records.keys())
        records.extend(
            self._reconciled(record)
            for record_id, record in self._indexed.items()
            if record_id not in known
        )
        return records
```

4. Replace `get_record` with:
```python
    def get_record(self, model_id: str) -> Optional[Dict[str, Any]]:
        canonical = self.legacy_aliases.get(model_id, model_id)
        record = self.records.get(canonical) or self._indexed.get(canonical)
        if record is None:
            return None
        return self._reconciled(record)
```

5. Replace `_reconciled` with:
```python
    def _reconciled(self, record: ModelRecord) -> Dict[str, Any]:
        data = record.to_dict()
        indexed = self._indexed.get(record.id)
        if indexed is not None and indexed is not record:
            data["locations"] = list(indexed.locations)
            data["identity"] = indexed.identity
            data["availability"] = indexed.availability
            data["library_root_id"] = indexed.library_root_id
        data["status"] = self._live_status(record)
        return data
```

6. Replace `_live_status` with (provider first, then AVAILABLE indexed presence, then dir check):
```python
    def _live_status(self, record: ModelRecord) -> str:
        if self._status_provider is not None:
            provided = self._status_provider(record.id)
            if provided:
                return provided
        indexed = self._indexed.get(record.id)
        if indexed is not None and indexed.locations and indexed.availability == "available":
            return "ready"
        if self._is_present(record):
            return "ready"
        if indexed is not None:
            return "not_found"
        return record.status
```

- [ ] **Step 6: Run tests to verify they pass (plus the deferred Task 6 record tests and the existing suites)**

Run: `python -m pytest backend/tests/test_foundry_index_service.py backend/tests/test_foundry_indexer.py backend/tests/test_foundry_registry.py backend/tests/test_foundry_catalog.py backend/tests/test_foundry_api.py -q`
Expected: ALL PASS (including `ArtifactToRecordTests` deferred from Task 6; the M1 registry/API tests must not regress).

- [ ] **Step 7: Commit**

```bash
git add backend/foundry/model_record.py backend/foundry/registry.py backend/foundry/schemas.py backend/tests/test_foundry_index_service.py
git commit -m "feat(foundry): ModelRecord location fields + registry index merge layer"
```

---

## Task 8: HF cache adapter

**Files:**
- Create: `backend/foundry/hf_cache.py`
- Test: `backend/tests/test_foundry_hf_cache.py`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_foundry_hf_cache.py`:
```python
import pathlib
import sys
import unittest
from types import SimpleNamespace
from unittest import mock

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from foundry.hf_cache import scan_hf_cache  # type: ignore[import-not-found]


def _fake_cache_info():
    revision = SimpleNamespace(
        commit_hash="cb7296e6587a1234",
        nb_files=2,
        snapshot_path="C:\\cache\\models--org--m\\snapshots\\cb7296e6587a1234",
        size_on_disk=1_450_000_000,
    )
    repo = SimpleNamespace(
        repo_id="org/m",
        repo_type="model",
        size_on_disk=1_450_000_000,
        revisions={revision},
    )
    dataset = SimpleNamespace(repo_id="org/data", repo_type="dataset", size_on_disk=1, revisions=set())
    return SimpleNamespace(
        repos={repo, dataset},
        warnings=[Exception("Snapshots dir doesn't exist in cached repo: ...Qwen-Image-2512")],
    )


_CATALOG_BY_REPO = {("org/m", "main"): "catalog-id-m"}


class ScanHfCacheTests(unittest.TestCase):
    def test_model_repos_become_records_and_datasets_are_skipped(self):
        with mock.patch("foundry.hf_cache._scan", return_value=_fake_cache_info()):
            result = scan_hf_cache(_CATALOG_BY_REPO)
        self.assertEqual(len(result.records), 1)
        record = result.records[0]
        self.assertEqual(record.id, "catalog-id-m")  # reconciled by repo_id
        self.assertEqual(record.source, "huggingface")
        self.assertEqual(record.status, "ready")
        self.assertEqual(
            record.locations,
            ["C:\\cache\\models--org--m\\snapshots\\cb7296e6587a1234"],
        )

    def test_unknown_repo_gets_hf_cache_id(self):
        with mock.patch("foundry.hf_cache._scan", return_value=_fake_cache_info()):
            result = scan_hf_cache({})
        self.assertEqual(result.records[0].id, "hf-org--m")
        self.assertEqual(result.records[0].tier, "experimental")

    def test_warnings_surface_as_strings_not_exceptions(self):
        with mock.patch("foundry.hf_cache._scan", return_value=_fake_cache_info()):
            result = scan_hf_cache({})
        self.assertEqual(len(result.warnings), 1)
        self.assertIn("Qwen-Image-2512", result.warnings[0])

    def test_absent_library_or_cache_returns_empty_result(self):
        with mock.patch("foundry.hf_cache._scan", side_effect=ImportError("no hub")):
            result = scan_hf_cache({})
        self.assertEqual(result.records, [])
        self.assertEqual(result.warnings, ["huggingface_hub unavailable: no hub"])


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest backend/tests/test_foundry_hf_cache.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'foundry.hf_cache'`.

- [ ] **Step 3: Write the implementation**

Create `backend/foundry/hf_cache.py`:
```python
"""huggingface_hub scan_cache_dir adapter (Model Foundry M3, spec 4.1 feed 2).

Defensive: the library is mocked/absent on CI, and real caches contain broken
entries (Spike B found two) — warnings are surfaced as degraded state, never
raised. Dedup is by repo_id + revision against the verified catalog.
"""

from dataclasses import dataclass, field
from typing import Dict, List, Tuple

from foundry.model_record import ModelRecord


def _scan():
    """Isolated for testability; raises ImportError when the hub is absent."""
    from huggingface_hub import scan_cache_dir

    return scan_cache_dir()


@dataclass
class HfCacheScan:
    records: List[ModelRecord] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)


def scan_hf_cache(catalog_by_repo: Dict[Tuple[str, str], str]) -> HfCacheScan:
    """Scan the local HF cache into ModelRecords.

    ``catalog_by_repo`` maps (repo_id, revision) -> catalog id; a cache repo
    matching a verified entry reconciles to that id (curated metadata wins at
    the registry merge); unknown repos become `hf-<org>--<name>` records.
    """
    result = HfCacheScan()
    try:
        info = _scan()
    except Exception as exc:  # ImportError, CacheNotFound, permission issues
        result.warnings.append(f"huggingface_hub unavailable: {exc}")
        return result

    for warning in getattr(info, "warnings", []) or []:
        result.warnings.append(str(warning))

    for repo in getattr(info, "repos", []) or []:
        if getattr(repo, "repo_type", "model") != "model":
            continue
        for revision in getattr(repo, "revisions", []) or []:
            catalog_id = (
                catalog_by_repo.get((repo.repo_id, revision.commit_hash))
                or catalog_by_repo.get((repo.repo_id, "main"))
            )
            record_id = catalog_id or f"hf-{repo.repo_id.replace('/', '--')}"
            result.records.append(
                ModelRecord(
                    id=record_id,
                    name=repo.repo_id,
                    artifact_type="diffusers-pipeline",
                    capability="image",
                    base_architecture="unknown",
                    source="huggingface",
                    repo_id=repo.repo_id,
                    revision=revision.commit_hash,
                    size=f"{repo.size_on_disk / 1e9:.2f} GB",
                    status="ready",
                    tier="verified" if catalog_id else "experimental",
                    quality="balanced" if catalog_id else "local",
                    description="Indexed from the local Hugging Face cache.",
                    locations=[str(revision.snapshot_path)],
                    identity=f"hf:{repo.repo_id}@{revision.commit_hash}",
                )
            )
    return result
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest backend/tests/test_foundry_hf_cache.py -q`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/foundry/hf_cache.py backend/tests/test_foundry_hf_cache.py
git commit -m "feat(foundry): defensive scan_cache_dir adapter with warning surfacing"
```

---

## Task 9: IndexService — merge feeds, persist state, detect installs

**Files:**
- Create: `backend/foundry/index_service.py`
- Test: `backend/tests/test_foundry_index_service.py` (append)

- [ ] **Step 1: Write the failing tests**

Append to `backend/tests/test_foundry_index_service.py` (before the `if __name__` guard):
```python
from unittest import mock

from foundry.hf_cache import HfCacheScan  # type: ignore[import-not-found]
from foundry.index_service import IndexService  # type: ignore[import-not-found]
from foundry.library_roots import RootsStore  # type: ignore[import-not-found]
from tests.foundry_fixtures import LORA_TENSORS, make_safetensors


class IndexServiceTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix="foundry-svc-")
        self.models_dir = os.path.join(self.tmp, "models")
        os.makedirs(self.models_dir)
        catalog_path = os.path.join(self.tmp, "catalog.json")
        _write_catalog(catalog_path, _CATALOG)
        self.registry = ModelRegistry(models_dir=self.models_dir, catalog_path=catalog_path)
        self.roots = RootsStore(os.path.join(self.models_dir, ".foundry", "library_roots.json"))
        self.service = IndexService(
            registry=self.registry,
            roots_store=self.roots,
            models_dir=self.models_dir,
            state_path=os.path.join(self.models_dir, ".foundry", "index_state.json"),
        )

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def _scan(self):
        with mock.patch("foundry.index_service.scan_hf_cache", return_value=HfCacheScan()):
            return self.service.scan()

    def test_scan_indexes_linked_root_into_registry(self):
        lib = os.path.join(self.tmp, "lib")
        make_safetensors(os.path.join(lib, "loras", "style.safetensors"), LORA_TENSORS)
        self.roots.add(lib, "comfyui")
        snapshot = self._scan()
        self.assertGreaterEqual(snapshot.records_indexed, 1)
        local_ids = [
            record["id"] for record in self.registry.list_records() if record["id"].startswith("local-")
        ]
        self.assertEqual(len(local_ids), 1)

    def test_scan_indexes_app_managed_tree(self):
        # flux1-dev.safetensors in the app tree reconciles to flux-dev (M1 TODO).
        from tests.foundry_fixtures import CHECKPOINT_TENSORS

        make_safetensors(
            os.path.join(self.models_dir, "checkpoints", "flux1-dev.safetensors"),
            CHECKPOINT_TENSORS,
        )
        self._scan()
        self.assertEqual(self.registry.get_record("flux-dev")["status"], "ready")

    def test_missing_root_marks_records_unavailable_not_error(self):
        lib = os.path.join(self.tmp, "nas")
        make_safetensors(os.path.join(lib, "loras", "style.safetensors"), LORA_TENSORS)
        root = self.roots.add(lib, "comfyui")
        self._scan()
        shutil.rmtree(lib)  # the NAS unmounts
        snapshot = self._scan()
        record = next(
            r for r in self.registry.list_records() if r.get("library_root_id") == root.id
        )
        self.assertEqual(record["availability"], "unavailable")
        self.assertEqual(record["status"], "not_found")
        self.assertEqual(snapshot.warnings, [])  # no error storm

    def test_remove_root_drops_its_records_and_touches_no_bytes(self):
        lib = os.path.join(self.tmp, "lib2")
        path = make_safetensors(os.path.join(lib, "loras", "style.safetensors"), LORA_TENSORS)
        root = self.roots.add(lib, "comfyui")
        self._scan()
        dropped = self.service.remove_root(root.id)
        self.assertEqual(dropped, 1)
        self.assertTrue(os.path.exists(path))  # bytes untouched
        with mock.patch("foundry.index_service.scan_hf_cache", return_value=HfCacheScan()):
            remaining = [
                record
                for record in self.registry.list_records()
                if record.get("library_root_id") == root.id
            ]
        self.assertEqual(remaining, [])

    def test_signatures_persist_across_service_instances(self):
        lib = os.path.join(self.tmp, "lib3")
        make_safetensors(os.path.join(lib, "loras", "style.safetensors"), LORA_TENSORS)
        self.roots.add(lib, "comfyui")
        self._scan()
        fresh = IndexService(
            registry=self.registry,
            roots_store=self.roots,
            models_dir=self.models_dir,
            state_path=os.path.join(self.models_dir, ".foundry", "index_state.json"),
        )
        with mock.patch("foundry.index_service.scan_hf_cache", return_value=HfCacheScan()), mock.patch(
            "foundry.indexer.read_safetensors_header"
        ) as header_spy:
            fresh.scan()
        header_spy.assert_not_called()  # signatures loaded from disk; nothing re-read

    def test_detect_candidates_reports_existing_known_paths(self):
        comfy = os.path.join(self.tmp, "ComfyUI", "models")
        os.makedirs(comfy)
        with mock.patch("foundry.index_service._WELL_KNOWN_CANDIDATES", [(comfy, "comfyui")]):
            offers = self.service.detect_candidates()
        self.assertEqual(offers, [{"path": comfy, "layout_hint": "comfyui"}])
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest backend/tests/test_foundry_index_service.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'foundry.index_service'` (the Task 7 classes still pass).

- [ ] **Step 3: Write the implementation**

Create `backend/foundry/index_service.py`:
```python
"""IndexService — merges the three index feeds into the registry (spec 4.1).

Feeds: app-managed tree (models_dir), the local HF cache, and user library
roots. State (incremental signatures) persists at <models_dir>/.foundry/.
Scans are synchronous functions; main.py wraps them in asyncio.to_thread.
"""

import json
import os
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple

from foundry.hf_cache import scan_hf_cache
from foundry.indexer import artifact_to_record, scan_tree
from foundry.library_roots import RootsStore
from foundry.model_record import ModelRecord
from foundry.registry import ModelRegistry

_APP_ROOT_ID = "__app__"

# (path, layout_hint) candidates probed by first-run detection. Patched in tests.
_WELL_KNOWN_CANDIDATES: List[Tuple[str, str]] = [
    (os.path.expanduser(os.path.join("~", "ComfyUI", "models")), "comfyui"),
    (os.path.join("C:", os.sep, "ComfyUI", "models"), "comfyui"),
    (os.path.expanduser(os.path.join("~", "stable-diffusion-webui", "models")), "a1111"),
    (os.path.join("C:", os.sep, "stable-diffusion-webui", "models"), "a1111"),
]


@dataclass
class IndexSnapshot:
    records_indexed: int = 0
    warnings: List[str] = field(default_factory=list)


class IndexService:
    def __init__(
        self,
        registry: ModelRegistry,
        roots_store: RootsStore,
        models_dir: str,
        state_path: str,
    ):
        self._registry = registry
        self._roots = roots_store
        self._models_dir = models_dir
        self._state_path = state_path
        # signatures: root_id -> {normalized path: [mtime_ns, size, type, identity]}
        self._signatures: Dict[str, Dict] = {}
        # last good artifacts per root, kept so an unmounted root degrades
        # to 'unavailable' records instead of vanishing (spec 4.6).
        self._last_records: Dict[str, List[ModelRecord]] = {}
        self._load_state()

    # -- persistence --------------------------------------------------------
    def _load_state(self) -> None:
        if os.path.isfile(self._state_path):
            with open(self._state_path, "r", encoding="utf-8") as handle:
                self._signatures = json.load(handle)

    def _save_state(self) -> None:
        os.makedirs(os.path.dirname(self._state_path), exist_ok=True)
        with open(self._state_path, "w", encoding="utf-8") as handle:
            json.dump(self._signatures, handle)

    # -- public API ----------------------------------------------------------
    def scan(self) -> IndexSnapshot:
        snapshot = IndexSnapshot()
        reconciliation = self._filename_reconciliation()
        indexed: List[ModelRecord] = []

        # Feed 1: the app-managed tree (closes the M1 flat-file presence TODO).
        indexed.extend(self._scan_root(_APP_ROOT_ID, self._models_dir, "comfyui", reconciliation))

        # Feed 2: the HF cache, reconciled by repo_id+revision.
        cache = scan_hf_cache(self._catalog_by_repo())
        indexed.extend(cache.records)
        snapshot.warnings.extend(cache.warnings)

        # Feed 3: user library roots; a missing root degrades, never errors.
        for root in self._roots.list():
            if os.path.isdir(root.path):
                indexed.extend(
                    self._scan_root(root.id, root.path, root.layout_hint, reconciliation)
                )
            else:
                for record in self._last_records.get(root.id, []):
                    record.availability = "unavailable"
                    indexed.append(record)

        self._registry.apply_index(indexed)
        self._save_state()
        snapshot.records_indexed = len(indexed)
        return snapshot

    def remove_root(self, root_id: str) -> int:
        """Drop a root + its referenced-only records. Touches zero bytes."""
        dropped = len(self._last_records.pop(root_id, []))
        self._signatures.pop(root_id, None)
        self._roots.remove(root_id)
        self.scan()
        return dropped

    def detect_candidates(self) -> List[Dict[str, str]]:
        """First-run detection (spec 4.7): offers only; adding is the user's call."""
        known = {
            os.path.normcase(os.path.normpath(root.path)) for root in self._roots.list()
        }
        offers = []
        for path, hint in _WELL_KNOWN_CANDIDATES:
            if os.path.isdir(path) and os.path.normcase(os.path.normpath(path)) not in known:
                offers.append({"path": path, "layout_hint": hint})
        return offers

    # -- internals ------------------------------------------------------------
    def _scan_root(
        self, root_id: str, path: str, layout_hint: str, reconciliation: Dict[str, str]
    ) -> List[ModelRecord]:
        artifacts, next_signatures = scan_tree(
            path, layout_hint, root_id, self._signatures.get(root_id, {})
        )
        self._signatures[root_id] = next_signatures
        records = [artifact_to_record(artifact, reconciliation) for artifact in artifacts]
        if root_id != _APP_ROOT_ID:
            self._last_records[root_id] = records
        return records

    def _filename_reconciliation(self) -> Dict[str, str]:
        from utils.model_manager import _SINGLE_FILE_FILENAMES

        return {filename: model_id for model_id, filename in _SINGLE_FILE_FILENAMES.items()}

    def _catalog_by_repo(self) -> Dict[Tuple[str, str], str]:
        return {
            (record.repo_id, record.revision): record_id
            for record_id, record in self._registry.records.items()
            if record.repo_id
        }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest backend/tests/test_foundry_index_service.py -q`
Expected: PASS (12 tests: 6 registry-merge + 6 service).

- [ ] **Step 5: Commit**

```bash
git add backend/foundry/index_service.py backend/tests/test_foundry_index_service.py
git commit -m "feat(foundry): IndexService merging app-tree/HF-cache/linked-root feeds"
```

---

## Task 10: Library REST routes + delete guard

**Files:**
- Modify: `backend/foundry/schemas.py`
- Modify: `backend/main.py`
- Test: `backend/tests/test_foundry_library_api.py` (integration tier via filename)

- [ ] **Step 1: Add the schemas**

Append to `backend/foundry/schemas.py`:
```python
class LibraryRootSchema(BaseModel):
    id: str
    path: str
    layout_hint: str
    added_at: str


class DetectedRootSchema(BaseModel):
    path: str
    layout_hint: str


class ScanResultSchema(BaseModel):
    records_indexed: int
    warnings: List[str] = []
```

- [ ] **Step 2: Write the failing integration tests**

Create `backend/tests/test_foundry_library_api.py`:
```python
import os
import pathlib
import shutil
import sys
import tempfile
import unittest
from unittest import mock

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from fastapi.testclient import TestClient

import main  # type: ignore[import-not-found]
from tests.foundry_fixtures import LORA_TENSORS, make_safetensors


class LibraryApiTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(main.app)
        self.tmp = tempfile.mkdtemp(prefix="foundry-libapi-")

    def tearDown(self):
        # Keep scan_hf_cache mocked here too: remove triggers a rescan, and an
        # unmocked scan would index the dev machine's REAL HF cache into the
        # module-level registry, polluting sibling API tests.
        with mock.patch("foundry.index_service.scan_hf_cache") as cache:
            cache.return_value.records, cache.return_value.warnings = [], []
            for root in self.client.get("/api/models/libraries").json():
                if root["path"].startswith(self.tmp):
                    self.client.delete(f"/api/models/libraries/{root['id']}")
        shutil.rmtree(self.tmp, ignore_errors=True)

    def _lib(self):
        lib = os.path.join(self.tmp, "lib")
        make_safetensors(os.path.join(lib, "loras", "style.safetensors"), LORA_TENSORS)
        return lib

    def test_import_root_then_list_then_remove(self):
        with mock.patch("foundry.index_service.scan_hf_cache") as cache:
            cache.return_value.records, cache.return_value.warnings = [], []
            created = self.client.post(
                "/api/models/import", json={"path": self._lib(), "layout_hint": "comfyui"}
            )
            self.assertEqual(created.status_code, 201)
            root = created.json()
            self.assertEqual(root["layout_hint"], "comfyui")

            listed = self.client.get("/api/models/libraries").json()
            self.assertIn(root["id"], [entry["id"] for entry in listed])

            removed = self.client.delete(f"/api/models/libraries/{root['id']}")
            self.assertEqual(removed.status_code, 200)
            self.assertEqual(removed.json()["removed"], True)

    def test_import_missing_path_is_400(self):
        response = self.client.post(
            "/api/models/import", json={"path": os.path.join(self.tmp, "nope"), "layout_hint": "generic"}
        )
        self.assertEqual(response.status_code, 400)

    def test_remove_unknown_root_is_404(self):
        self.assertEqual(self.client.delete("/api/models/libraries/doesnotexist").status_code, 404)

    def test_scan_returns_counts_and_warnings(self):
        with mock.patch("foundry.index_service.scan_hf_cache") as cache:
            cache.return_value.records, cache.return_value.warnings = [], ["broken entry"]
            response = self.client.post("/api/models/scan")
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertIn("records_indexed", body)
        self.assertIn("broken entry", body["warnings"])

    def test_detect_returns_offers_shape(self):
        comfy = os.path.join(self.tmp, "ComfyUI", "models")
        os.makedirs(comfy)
        with mock.patch("foundry.index_service._WELL_KNOWN_CANDIDATES", [(comfy, "comfyui")]):
            response = self.client.get("/api/models/libraries/detect")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), [{"path": comfy, "layout_hint": "comfyui"}])

    def test_delete_linked_record_is_409(self):
        with mock.patch("foundry.index_service.scan_hf_cache") as cache:
            cache.return_value.records, cache.return_value.warnings = [], []
            self.client.post(
                "/api/models/import", json={"path": self._lib(), "layout_hint": "comfyui"}
            )
        linked = [
            record
            for record in self.client.get("/api/models").json()
            if record["id"].startswith("local-")
        ]
        self.assertTrue(linked)
        response = self.client.delete(f"/api/models/{linked[0]['id']}")
        self.assertEqual(response.status_code, 409)


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `python -m pytest backend/tests/test_foundry_library_api.py -q`
Expected: FAIL — 404/405 responses (routes do not exist yet).

- [ ] **Step 4: Wire the service + routes in `main.py`**

1. Extend the foundry imports near line 69:
```python
from foundry.registry import ModelRegistry
from foundry.schemas import (
    DetectedRootSchema,
    DownloadJobSchema,
    LibraryRootSchema,
    ModelRecordSchema,
    ScanResultSchema,
)
from foundry.download_manager import DownloadManager
from foundry.library_roots import RootsStore
from foundry.index_service import IndexService
```

2. After the `download_manager._registry = model_registry` late-bind, construct the stores (module scope, mirrors the existing wiring style):
```python
_FOUNDRY_STATE_DIR = os.path.join(MODELS_DIR, ".foundry")
roots_store = RootsStore(os.path.join(_FOUNDRY_STATE_DIR, "library_roots.json"))
index_service = IndexService(
    registry=model_registry,
    roots_store=roots_store,
    models_dir=MODELS_DIR,
    state_path=os.path.join(_FOUNDRY_STATE_DIR, "index_state.json"),
)
```

3. Add a request body model next to the other Pydantic request models (search for the `# ============= Pydantic Models =============` banner):
```python
class ImportRootRequest(BaseModel):
    path: str
    layout_hint: str = "generic"
```

4. Add the routes ABOVE the dynamic `GET /api/models/{model_id}` route (same reason `downloads` sits there — the literal paths must not be captured as a model id):
```python
@app.post("/api/models/import", response_model=LibraryRootSchema, status_code=201, tags=["Models"])
async def import_library_root(request: Request, body: ImportRootRequest):
    """Register a user library root by reference (never copies bytes)."""
    try:
        root = roots_store.add(body.path, body.layout_hint)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    await asyncio.to_thread(index_service.scan)
    return root.to_dict()


@app.post("/api/models/scan", response_model=ScanResultSchema, tags=["Models"])
async def scan_libraries(request: Request):
    """Re-index every feed (app tree, HF cache, linked roots)."""
    snapshot = await asyncio.to_thread(index_service.scan)
    return {"records_indexed": snapshot.records_indexed, "warnings": snapshot.warnings}


@app.get("/api/models/libraries", response_model=List[LibraryRootSchema], tags=["Models"])
async def list_library_roots(request: Request):
    return [root.to_dict() for root in roots_store.list()]


@app.get("/api/models/libraries/detect", response_model=List[DetectedRootSchema], tags=["Models"])
async def detect_library_roots(request: Request):
    """First-run detection: existing ComfyUI/A1111 installs, offers only."""
    return await asyncio.to_thread(index_service.detect_candidates)


@app.delete("/api/models/libraries/{root_id}", tags=["Models"])
async def remove_library_root(request: Request, root_id: str):
    """Remove a root: referenced-only records dropped, zero bytes touched."""
    if root_id not in {root.id for root in roots_store.list()}:
        raise HTTPException(status_code=404, detail=f"No library root '{root_id}'")
    dropped = await asyncio.to_thread(index_service.remove_root, root_id)
    return {"removed": True, "records_dropped": dropped}
```
(`GET /api/models/libraries/detect` is a deliberate, minimal addition to the spec's §7.1 route list — the offers need a transport; flagged here so the spec can be annotated.)

Two wiring notes: (a) ensure `import asyncio` is present at the top of `main.py` (it almost certainly already is — verify, don't assume); (b) M3 deliberately does NOT auto-scan in the lifespan startup block — a startup scan would index the dev machine's real HF cache into module-level state during every API test run. The frontend triggers `scanLibraries()` explicitly; startup auto-scan can be revisited in M5 when `resolve_model_runtime` needs warm indexes.

5. Guard the existing `DELETE /api/models/{model_id}` route — at the top of its handler body, before any deletion logic, add:
```python
    record = model_registry.get_record(model_id)
    if record is not None and record.get("source") == "linked":
        raise HTTPException(
            status_code=409,
            detail="This model is a linked library reference - remove its library root instead.",
        )
```

- [ ] **Step 5: Run tests to verify they pass (plus the neighbours)**

Run: `python -m pytest backend/tests/test_foundry_library_api.py backend/tests/test_foundry_api.py backend/tests/test_foundry_download_api.py -q`
Expected: ALL PASS (existing API tests must not regress).

- [ ] **Step 6: Run the CI-runner check**

Run (from `backend/`): `python -m unittest discover -s tests -v 2>&1 | tail -5`
Expected: `OK` with the new tests listed (proves they are TestCase subclasses the CI runner executes).

- [ ] **Step 7: Commit**

```bash
git add backend/foundry/schemas.py backend/main.py backend/tests/test_foundry_library_api.py
git commit -m "feat(foundry): library import/scan/list/remove/detect routes + linked-delete guard"
```

---

## Task 11: Frontend types, slice, preload, IPC

**Files:**
- Modify: `src/types/model.ts`
- Modify: `src/store/slices/modelsSlice.ts`
- Modify: `src/store/appStore.types.ts`
- Modify: `electron/preload.ts`
- Modify: `electron/ipc-handlers/generation.ts`
- Create: `src/store/slices/librarySelectors.test.ts`

- [ ] **Step 1: Extend `src/types/model.ts`**

Append after the `DownloadJob` interface:
```typescript
export type LayoutHint = 'comfyui' | 'a1111' | 'generic';

/** A user library root indexed in place — bytes are referenced, never copied. */
export interface LibraryRoot {
  id: string;
  path: string;
  layout_hint: LayoutHint;
  added_at: string;
}

/** First-run detection offer (existing ComfyUI/A1111 install). Opt-in only. */
export interface DetectedRoot {
  path: string;
  layout_hint: LayoutHint;
}

export interface ScanResult {
  records_indexed: number;
  warnings: string[];
}
```
and extend `ModelRecord` (after `gated: boolean;`):
```typescript
  // M3 location/index fields (absent on older payloads):
  locations?: string[];
  identity?: string | null;
  availability?: 'available' | 'unavailable';
  library_root_id?: string | null;
```

- [ ] **Step 2: Write the failing slice tests**

Create `src/store/slices/librarySelectors.test.ts`:
```typescript
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAppStore } from '@/store/appStore';
import type { LibraryRoot } from '@/types/model';

const ROOT: LibraryRoot = {
  id: 'r1',
  path: 'C:\\ComfyUI\\models',
  layout_hint: 'comfyui',
  added_at: '2026-06-09T00:00:00Z',
};

function mockModelsApi(overrides: Record<string, unknown> = {}) {
  (window as unknown as { electron: unknown }).electron = {
    models: {
      list: vi.fn().mockResolvedValue([]),
      librariesList: vi.fn().mockResolvedValue([ROOT]),
      librariesRemove: vi.fn().mockResolvedValue({ removed: true, records_dropped: 1 }),
      librariesDetect: vi.fn().mockResolvedValue([{ path: ROOT.path, layout_hint: 'comfyui' }]),
      importRoot: vi.fn().mockResolvedValue(ROOT),
      scan: vi.fn().mockResolvedValue({ records_indexed: 3, warnings: [] }),
      ...overrides,
    },
  };
}

describe('modelsSlice library actions', () => {
  beforeEach(() => {
    useAppStore.setState({ libraryRoots: [], detectedRoots: [] });
  });

  it('loadLibraryRoots populates state', async () => {
    mockModelsApi();
    await useAppStore.getState().loadLibraryRoots();
    expect(useAppStore.getState().libraryRoots).toEqual([ROOT]);
  });

  it('addLibraryRoot imports then refreshes roots and models', async () => {
    mockModelsApi();
    await useAppStore.getState().addLibraryRoot(ROOT.path, 'comfyui');
    const api = (window as unknown as { electron: { models: Record<string, ReturnType<typeof vi.fn>> } })
      .electron.models;
    expect(api.importRoot).toHaveBeenCalledWith(ROOT.path, 'comfyui');
    expect(api.list).toHaveBeenCalled();
    expect(useAppStore.getState().libraryRoots).toEqual([ROOT]);
  });

  it('removeLibraryRoot refreshes roots and models', async () => {
    mockModelsApi({ librariesList: vi.fn().mockResolvedValue([]) });
    await useAppStore.getState().removeLibraryRoot(ROOT.id);
    expect(useAppStore.getState().libraryRoots).toEqual([]);
  });

  it('detectLibraries stores offers', async () => {
    mockModelsApi();
    await useAppStore.getState().detectLibraries();
    expect(useAppStore.getState().detectedRoots).toEqual([
      { path: ROOT.path, layout_hint: 'comfyui' },
    ]);
  });

  it('scanLibraries refreshes the model list', async () => {
    mockModelsApi();
    await useAppStore.getState().scanLibraries();
    const api = (window as unknown as { electron: { models: Record<string, ReturnType<typeof vi.fn>> } })
      .electron.models;
    expect(api.scan).toHaveBeenCalled();
    expect(api.list).toHaveBeenCalled();
  });

  it('backend hiccup leaves existing state intact (local-first)', async () => {
    mockModelsApi({ librariesList: vi.fn().mockRejectedValue(new Error('down')) });
    useAppStore.setState({ libraryRoots: [ROOT] });
    await useAppStore.getState().loadLibraryRoots();
    expect(useAppStore.getState().libraryRoots).toEqual([ROOT]);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/store/slices/librarySelectors.test.ts`
Expected: FAIL — `loadLibraryRoots is not a function`.

- [ ] **Step 4: Implement slice + types + preload + IPC**

In `src/store/slices/modelsSlice.ts`:
1. Extend the type import: `import type { ModelRecord, ModelCapability, DownloadJob, LibraryRoot, DetectedRoot, LayoutHint } from '@/types/model';`
2. Add to `modelsInitialState`:
```typescript
  libraryRoots: [] as LibraryRoot[],
  detectedRoots: [] as DetectedRoot[],
```
3. Add to the returned actions object (after `cancelDownload`), matching the existing local-first style:
```typescript
    // Library roots ---------------------------------------------------------
    loadLibraryRoots: async () => {
      try {
        const roots = (await window.electron.models.librariesList()) as LibraryRoot[];
        set({ libraryRoots: roots });
      } catch {
        // Local-first: keep last-known roots on a backend hiccup.
      }
    },
    addLibraryRoot: async (path: string, layoutHint: LayoutHint) => {
      try {
        await window.electron.models.importRoot(path, layoutHint);
        const roots = (await window.electron.models.librariesList()) as LibraryRoot[];
        const models = await window.electron.models.list();
        set({ libraryRoots: roots, availableModels: models });
      } catch {
        /* local-first */
      }
    },
    removeLibraryRoot: async (rootId: string) => {
      try {
        await window.electron.models.librariesRemove(rootId);
        const roots = (await window.electron.models.librariesList()) as LibraryRoot[];
        const models = await window.electron.models.list();
        set({ libraryRoots: roots, availableModels: models });
      } catch {
        /* local-first */
      }
    },
    scanLibraries: async () => {
      try {
        await window.electron.models.scan();
        const models = await window.electron.models.list();
        set({ availableModels: models });
      } catch {
        /* local-first */
      }
    },
    detectLibraries: async () => {
      try {
        const offers = (await window.electron.models.librariesDetect()) as DetectedRoot[];
        set({ detectedRoots: offers });
      } catch {
        /* local-first */
      }
    },
```

In `src/store/appStore.types.ts`: add to the state section
```typescript
  libraryRoots: LibraryRoot[];
  detectedRoots: DetectedRoot[];
```
and to the actions section
```typescript
  loadLibraryRoots: () => Promise<void>;
  addLibraryRoot: (path: string, layoutHint: LayoutHint) => Promise<void>;
  removeLibraryRoot: (rootId: string) => Promise<void>;
  scanLibraries: () => Promise<void>;
  detectLibraries: () => Promise<void>;
```
with `LibraryRoot`, `DetectedRoot`, `LayoutHint` added to the `@/types/model` type import in that file.

In `electron/preload.ts`: extend the `models` section of the `ElectronAPI` type (after `delete`):
```typescript
    importRoot: (path: string, layoutHint: string) => Promise<{ id: string; path: string; layout_hint: string; added_at: string }>;
    scan: () => Promise<{ records_indexed: number; warnings: string[] }>;
    librariesList: () => Promise<any[]>;
    librariesRemove: (rootId: string) => Promise<{ removed: boolean; records_dropped: number }>;
    librariesDetect: () => Promise<any[]>;
```
and the implementation object (after `delete: ...`):
```typescript
    importRoot: (path: string, layoutHint: string) => ipcRenderer.invoke('models:import', path, layoutHint),
    scan: () => ipcRenderer.invoke('models:scan'),
    librariesList: () => ipcRenderer.invoke('models:libraries:list'),
    librariesRemove: (rootId: string) => ipcRenderer.invoke('models:libraries:remove', rootId),
    librariesDetect: () => ipcRenderer.invoke('models:libraries:detect'),
```

In `electron/ipc-handlers/generation.ts`, alongside the existing `models:*` handlers (matching their fetch-proxy style and the module's backend base-URL helper):
```typescript
  ipcMain.handle('models:import', async (_event, path: string, layoutHint: string) => {
    const response = await fetch(`${backendBaseUrl()}/api/models/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, layout_hint: layoutHint }),
    });
    if (!response.ok) throw new Error(`models:import failed (${response.status})`);
    return response.json();
  });

  ipcMain.handle('models:scan', async () => {
    const response = await fetch(`${backendBaseUrl()}/api/models/scan`, { method: 'POST' });
    if (!response.ok) throw new Error(`models:scan failed (${response.status})`);
    return response.json();
  });

  ipcMain.handle('models:libraries:list', async () => {
    const response = await fetch(`${backendBaseUrl()}/api/models/libraries`);
    if (!response.ok) throw new Error(`models:libraries:list failed (${response.status})`);
    return response.json();
  });

  ipcMain.handle('models:libraries:remove', async (_event, rootId: string) => {
    const response = await fetch(
      `${backendBaseUrl()}/api/models/libraries/${encodeURIComponent(rootId)}`,
      { method: 'DELETE' },
    );
    if (!response.ok) throw new Error(`models:libraries:remove failed (${response.status})`);
    return response.json();
  });

  ipcMain.handle('models:libraries:detect', async () => {
    const response = await fetch(`${backendBaseUrl()}/api/models/libraries/detect`);
    if (!response.ok) throw new Error(`models:libraries:detect failed (${response.status})`);
    return response.json();
  });
```
(Use the exact base-URL helper name already present in `generation.ts` — if the existing handlers build URLs differently, e.g. a `BACKEND_URL` constant or a `getBackendUrl()` function, mirror that exact pattern instead of `backendBaseUrl()`.)

- [ ] **Step 5: Run the slice tests + typecheck**

Run: `npx vitest run src/store/slices/librarySelectors.test.ts && npm run typecheck`
Expected: PASS / no type errors.

- [ ] **Step 6: Add the API contract section**

In `tests/integration/api-contracts.test.ts`, mirror the existing `DownloadJob` contract block with:
```typescript
describe('LibraryRoot contract', () => {
  it('matches the backend LibraryRootSchema field set', () => {
    const root: import('@/types/model').LibraryRoot = {
      id: 'r1',
      path: '/some/path',
      layout_hint: 'comfyui',
      added_at: '2026-06-09T00:00:00Z',
    };
    expect(Object.keys(root).sort()).toEqual(['added_at', 'id', 'layout_hint', 'path']);
  });

  it('ScanResult matches ScanResultSchema', () => {
    const result: import('@/types/model').ScanResult = { records_indexed: 0, warnings: [] };
    expect(Object.keys(result).sort()).toEqual(['records_indexed', 'warnings']);
  });
});
```

- [ ] **Step 7: Run the full frontend suite**

Run: `npm run typecheck && npm test`
Expected: green (the husky hook will re-run this on commit anyway).

- [ ] **Step 8: Commit**

```bash
git add src/types/model.ts src/store/slices/modelsSlice.ts src/store/appStore.types.ts src/store/slices/librarySelectors.test.ts electron/preload.ts electron/ipc-handlers/generation.ts tests/integration/api-contracts.test.ts
git commit -m "feat(foundry): library roots frontend slice + mirrored IPC channels"
```

---

## Task 12: Milestone gate

**Files:** none created — verification + docs only.

- [ ] **Step 1: Full green bar**

Run, in order (NOT in parallel — CPU contention):
```bash
npm run typecheck
npm test
npm run build
python -m pytest backend/tests -q
cd backend && python -m unittest discover -s tests -v && cd ..
```
Expected: all green. Fix anything red before proceeding.

- [ ] **Step 2: Update the registry TODO comment**

In `backend/foundry/registry.py`, the `_is_present` docstring says "Filename-aware indexing for flat single-file artifacts arrives with the M3 indexer". Replace that sentence with: "Flat single-file artifacts are reconciled by the M3 indexer's filename map; this dir check remains as the no-index fallback."

- [ ] **Step 3: Update `docs/INDEX.md`**

Add the M3 plan and Spike B doc to the appropriate section (mirror how existing plan docs are listed).

- [ ] **Step 4: Commit, push, PR**

```bash
git add backend/foundry/registry.py docs/INDEX.md
git commit -m "docs(foundry): close M1 flat-file TODO note + index M3 docs"
git push -u origin feat/model-foundry-m3
gh pr create --title "feat(foundry): M3 - library indexer + import/link" --body "Implements the M3 milestone per docs/superpowers/plans/2026-06-09-model-foundry-m3-indexer.md (design spec section 4; Spike B validated). Three index feeds (app tree, HF cache, linked roots), junction/hardlink/copy-fallback linker with ledger bookkeeping, incremental scans, safe removal, first-run detection, five new REST routes + mirrored IPC, libraryRoots on modelsSlice."
gh pr checks --watch
```
Merge per repo convention (`gh pr merge --squash --delete-branch`) once CI is green.

---

## Self-Review Notes (kept for the executing agent)

- **Spec §4 coverage:** feeds 1-3 → Tasks 6/8/9; reference-never-copy + materialization → Tasks 3/4 (the linker's pipeline consumer arrives in M5 `resolve_model_runtime` — M3 ships the validated mechanism + ledger); identity/dedup → Tasks 2/7; header detection → Task 1; incremental scans → Tasks 6/9; reconciliation + safe removal → Tasks 7/9/10; first-run → Tasks 9/10. Spike-B seeded tests 1-14 all land (1-6 → Tasks 3/4, 7 → Task 1, 8 → Tasks 2/7, 9 → Task 6, 10 → Task 8, 11 → Tasks 5/6, 12 → Task 9, 13 → Tasks 9/10, 14 → spread across Tasks 4/6/9 path handling).
- **Deliberate scope cuts (NOT corners — design decisions):** background full-sha256 worker is deferred to the milestone that consumes it for provenance (Pillar 5) — `identity.full_sha256` exists and is tested; nothing schedules it yet (YAGNI). `POST /models/{id}/convert-safetensors` is M4 (classifier/security milestone). The Foundry browse/library panel UI is the design agent's (spec §7.3 coordination note).
- **Sequencing note:** Task 6's `ArtifactToRecordTests` require Task 7's `ModelRecord` fields; the plan calls this out inline — run Task 6 Step 4 with `-k "ScanTree"`, full file goes green in Task 7 Step 6.
- **`local-` id prefix is load-bearing** (Task 10's delete-guard test filters on it); do not rename casually.
